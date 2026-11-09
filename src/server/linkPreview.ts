import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { LookupOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';

const MAX_HTML_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 4500;

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  domain: string;
}

function isPublicAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [a, b, c] = octets;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  const firstHextet = parseInt(normalized.split(':')[0] || '0', 16);
  return firstHextet >= 0x2000 && firstHextet <= 0x3fff &&
    !normalized.startsWith('2001:db8:') &&
    !normalized.startsWith('2001:10:') &&
    !normalized.startsWith('2001:20:') &&
    !normalized.startsWith('2002:');
}

async function resolvePublicAddresses(hostname: string): Promise<Array<{ address: string; family: number }>> {
  const rawHost = hostname.replace(/^\[|\]$/g, '');
  const ipVersion = net.isIP(rawHost);
  const addresses = ipVersion
    ? [{ address: rawHost, family: ipVersion }]
    : await dns.lookup(rawHost, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Link host resolves to a non-public network address.');
  }
  return addresses;
}

export async function validatePublicWebUrl(input: unknown, httpsOnly = false): Promise<URL> {
  if (typeof input !== 'string' || input.length > 2048) {
    throw new Error('A valid web URL is required.');
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('A valid web URL is required.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (httpsOnly && url.protocol !== 'https:') ||
    (url.port && !((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80'))) ||
    url.username ||
    url.password
  ) {
    throw new Error(httpsOnly
      ? 'The destination must be a secure HTTPS website without embedded credentials.'
      : 'Only public HTTP and HTTPS links can be previewed.');
  }
  await resolvePublicAddresses(url.hostname);
  return url;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const point = parseInt(code, 16);
      return point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMeta(html: string, property: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== property.toLowerCase()) continue;
    return decodeHtml(tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] || '');
  }
  return '';
}

function requestHtml(url: URL, addresses: Array<{ address: string; family: number }>): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const pinnedLookup = ((_hostname: string, options: number | LookupOptions, callback: (...args: unknown[]) => void) => {
      const selected = addresses[0];
      if (typeof options === 'object' && options.all) {
        callback(null, addresses);
      } else {
        callback(null, selected.address, selected.family);
      }
    }) as LookupFunction;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const requestOptions = {
      protocol: url.protocol,
      hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'ZOLO-LinkPreview/1.0',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'identity',
      },
      lookup: pinnedLookup,
      servername: net.isIP(hostname) ? undefined : hostname,
    };
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(requestOptions, (response) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_HTML_BYTES) {
          response.destroy(new Error('Preview page is too large.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
      response.on('error', finishError);
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('Preview request timed out.')));
    request.on('error', finishError);
    request.end();
  });
}

export async function fetchSafeLinkPreview(input: unknown): Promise<LinkPreview> {
  let url = await validatePublicWebUrl(input);

  let response: Awaited<ReturnType<typeof requestHtml>> | null = null;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const addresses = await resolvePublicAddresses(url.hostname);
    response = await requestHtml(url, addresses);
    if (![301, 302, 303, 307, 308].includes(response.statusCode)) break;
    const location = response.headers.location;
    if (!location || redirect === 3) throw new Error('The preview link redirected too many times.');
    url = await validatePublicWebUrl(new URL(location, url).href);
  }

  const contentType = String(response?.headers['content-type'] || '').toLowerCase();
  const contentEncoding = String(response?.headers['content-encoding'] || 'identity').toLowerCase();
  if (
    !response ||
    response.statusCode < 200 ||
    response.statusCode >= 300 ||
    !contentType.includes('text/html') ||
    !['identity', ''].includes(contentEncoding)
  ) {
    throw new Error('This website does not provide an HTML preview.');
  }
  const title = decodeHtml(response.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || url.hostname;
  const description = getMeta(response.body, 'description') || getMeta(response.body, 'og:description');
  const imageValue = getMeta(response.body, 'og:image') || getMeta(response.body, 'twitter:image');
  let image: string | null = null;
  if (imageValue) {
    try {
      const imageUrl = new URL(imageValue, url);
      if (imageUrl.hostname === url.hostname && ['http:', 'https:'].includes(imageUrl.protocol)) {
        image = imageUrl.href;
      }
    } catch {
      image = null;
    }
  }

  return {
    url: url.href,
    title: title.slice(0, 180),
    description: description.slice(0, 300),
    image,
    domain: url.hostname,
  };
}
