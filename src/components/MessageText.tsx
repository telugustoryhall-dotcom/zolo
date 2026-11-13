import React, { useEffect, useState } from 'react';
import { authApi } from '../utils/authApi';
import { parseMessageLinks } from '../utils/messageLinks';
import { ExternalLink } from 'lucide-react';

interface Preview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  domain: string;
}

interface MessageTextProps {
  text: string;
}

const previewCache = new Map<string, Preview | null>();

export const MessageText: React.FC<MessageTextProps> = ({ text }) => {
  const links = parseMessageLinks(text);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const first = links[0];
    setPreview(null);
    if (!first) {
      return;
    }
    let active = true;
    const cached = previewCache.get(first.href);
    if (cached !== undefined) {
      setPreview(cached);
    } else {
      authApi.getLinkPreview(first.href).then((value) => {
        previewCache.set(first.href, value);
        if (active) setPreview(value);
      }).catch(() => {
        previewCache.set(first.href, null);
      });
    }
    return () => {
      active = false;
    };
  }, [text]);

  const content: React.ReactNode[] = [];
  let cursor = 0;
  for (const [index, link] of links.entries()) {
    if (link.start > cursor) content.push(text.slice(cursor, link.start));
    content.push(
      <a
        key={`${link.start}-${index}`}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        referrerPolicy="no-referrer"
        className="text-sky-400 underline underline-offset-2 break-all"
        onClick={(event) => {
          if (!/^https?:$/.test(new URL(link.href).protocol)) event.preventDefault();
        }}
      >
        {link.label}
      </a>
    );
    cursor = link.end;
  }
  if (cursor < text.length) content.push(text.slice(cursor));

  return (
    <>
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</p>
      {preview && (
        <a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          referrerPolicy="no-referrer"
          className="mt-2 block max-w-sm overflow-hidden rounded-lg border border-white/10 bg-black/10"
        >
          {preview.image && (
            <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-40 w-full object-cover" />
          )}
          <div className="p-2.5">
            <div className="flex items-center gap-1 text-[10px] uppercase text-slate-400">
              <ExternalLink className="h-3 w-3" />{preview.domain}
            </div>
            <div className="mt-1 text-xs font-semibold">{preview.title}</div>
            {preview.description && <div className="mt-1 line-clamp-2 text-[11px] text-slate-400">{preview.description}</div>}
          </div>
        </a>
      )}
    </>
  );
};
