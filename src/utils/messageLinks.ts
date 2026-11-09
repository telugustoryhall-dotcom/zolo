export interface MessageLink {
  start: number;
  end: number;
  href: string;
  label: string;
}

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

export function parseMessageLinks(text: string): MessageLink[] {
  const links: MessageLink[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const start = match.index;
    if (start === undefined) continue;
    const label = raw.replace(/[),.!?:;]+$/g, '');
    if (!label) continue;
    const candidate = /^www\./i.test(label) ? `https://${label}` : label;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (!parsed.hostname || parsed.username || parsed.password) continue;
      links.push({
        start,
        end: start + label.length,
        href: parsed.href,
        label,
      });
    } catch {
      continue;
    }
  }
  return links;
}
