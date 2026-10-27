
import React, { useEffect, useState } from 'react';
import type { StatusStory } from '../types/chat';

interface StatusViewerModalProps {
  statuses: StatusStory[];
  initialIndex: number;
  onClose: () => void;
  onReply: (
    contactId: string,
    replyText: string,
    statusInfo: StatusStory
  ) => void;
  onStoryViewed: (storyId: string) => void;
}

export function StatusViewerModal({
  statuses,
  initialIndex,
  onClose,
  onReply,
  onStoryViewed,
}: StatusViewerModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const [replyText, setReplyText] = useState('');

  const status = statuses[index];

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (status && !status.viewed) {
      onStoryViewed(status.id);
    }
  }, [status?.id, status?.viewed, onStoryViewed, status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') {
        setIndex((current) => Math.min(current + 1, statuses.length - 1));
      }
      if (event.key === 'ArrowLeft') {
        setIndex((current) => Math.max(current - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, statuses.length]);

  if (!status) return null;

  const submitReply = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = replyText.trim();
    if (!message || status.contactId === 'user') return;

    onReply(status.contactId, message, status);
    setReplyText('');
  };

  const isTextStatus = status.type === 'text';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3">
      <div className="relative flex h-[min(90vh,760px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-neutral-900 text-white shadow-2xl">
        <div className="flex gap-1 px-3 pt-3">
          {statuses.map((story, storyIndex) => (
            <div
              key={story.id}
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <div
                className={`h-full rounded-full ${
                  storyIndex <= index ? 'bg-white' : 'bg-transparent'
                }`}
              />
            </div>
          ))}
        </div>

        <header className="flex items-center gap-3 px-4 py-4">
          {status.contactAvatar ? (
            <img
              src={status.contactAvatar}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              {status.contactName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{status.contactName}</p>
            <p className="text-xs text-white/60">{status.timestamp}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close status"
            className="rounded-full px-3 py-2 text-xl hover:bg-white/10"
          >
            ×
          </button>
        </header>

        <main
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
          style={{
            background: isTextStatus
              ? status.bgColor || '#374151'
              : '#171717',
          }}
        >
          <button
            type="button"
            aria-label="Previous status"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={index === 0}
            className="absolute left-2 top-1/2 z-10 rounded-full bg-black/30 px-3 py-3 disabled:opacity-20"
          >
            ‹
          </button>

          {isTextStatus ? (
            <div className="max-h-full overflow-auto px-12 py-8 text-center text-2xl font-semibold">
              {status.text || status.caption || ''}
            </div>
          ) : status.mediaUrl ? (
            <img
              src={status.mediaUrl}
              alt={status.caption || 'Status'}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <p className="px-8 text-center text-white/60">
              This status has no media to display.
            </p>
          )}

          <button
            type="button"
            aria-label="Next status"
            onClick={() =>
              setIndex((current) =>
                Math.min(statuses.length - 1, current + 1)
              )
            }
            disabled={index === statuses.length - 1}
            className="absolute right-2 top-1/2 z-10 rounded-full bg-black/30 px-3 py-3 disabled:opacity-20"
          >
            ›
          </button>
        </main>

        {status.caption && !isTextStatus && (
          <p className="px-4 pt-3 text-sm text-white/80">{status.caption}</p>
        )}

        {status.contactId !== 'user' && (
          <form onSubmit={submitReply} className="flex gap-2 p-3">
            <input
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder="Reply to status..."
              aria-label="Reply to status"
              className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm outline-none focus:border-white/50"
            />
            <button
              type="submit"
              disabled={!replyText.trim()}
              className="rounded-full bg-white px-4 py-2 font-semibold text-black disabled:opacity-40"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
