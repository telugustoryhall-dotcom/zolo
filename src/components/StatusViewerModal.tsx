import React, { useState, useEffect, useRef } from 'react';
import { StatusStory } from '../types/chat';
import { X, ChevronLeft, ChevronRight, Send, Eye } from 'lucide-react';

interface StatusViewerModalProps {
  statuses: StatusStory[];
  initialIndex?: number;
  onClose: () => void;
  onReply: (contactId: string, replyText: string, statusInfo: StatusStory) => void;
  onStoryViewed?: (storyId: string) => void;
}

export const StatusViewerModal: React.FC<StatusViewerModalProps> = ({
  statuses,
  initialIndex = 0,
  onClose,
  onReply,
  onStoryViewed,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const timerRef = useRef<number | null>(null);
  const onStoryViewedRef = useRef(onStoryViewed);

  useEffect(() => {
    onStoryViewedRef.current = onStoryViewed;
  }, [onStoryViewed]);

  const activeStatus = statuses[currentIndex];

  useEffect(() => {
    setProgress(0);
  }, [currentIndex]);

  useEffect(() => {
    if (!activeStatus) return;
    onStoryViewedRef.current?.(activeStatus.id);
  }, [activeStatus?.id]);

  useEffect(() => {
    if (!activeStatus) return;

    if (isPaused) {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const intervalTime = 50;
    const totalDuration = 5000;
    const step = (intervalTime / totalDuration) * 100;

    timerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          if (currentIndex < statuses.length - 1) {
            setCurrentIndex((i) => i + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return prev + step;
      });
    }, intervalTime);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentIndex, isPaused, activeStatus, statuses.length, onClose]);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setProgress(0);
    }
  };

  const handleNext = () => {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handleSendReply = (text?: string) => {
    const msg = text || replyText.trim();
    if (!msg || !activeStatus) return;
    onReply(activeStatus.contactId, msg, activeStatus);
    setReplyText('');
    onClose();
  };

  if (!activeStatus) return null;

  const isOwnStatus = activeStatus.contactId === 'user';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 select-none">
      {/* Top Header with Progress Bars & Info */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 max-w-xl mx-auto flex flex-col gap-3">
        {/* Progress Bars */}
        <div className="flex items-center gap-1.5 w-full">
          {statuses.map((s, idx) => {
            let fillPct = 0;
            if (idx < currentIndex) fillPct = 100;
            else if (idx === currentIndex) fillPct = progress;
            return (
              <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div
                  style={{ width: `${fillPct}%` }}
                  className="h-full bg-white transition-all duration-75 ease-linear"
                />
              </div>
            );
          })}
        </div>

        {/* Contact info & Close button */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="p-1 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center border-2 border-emerald-500">
              {activeStatus.contactAvatar ? (
                <img
                  src={activeStatus.contactAvatar}
                  alt={activeStatus.contactName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white font-bold">{activeStatus.contactName[0]}</span>
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold leading-tight">{activeStatus.contactName}</h4>
              <p className="text-[11px] text-white/70">{activeStatus.timestamp}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleNext}
              className="p-1 rounded-full hover:bg-white/10"
              title="Next status"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/20 text-white"
              title="Close viewer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Story Stage Container */}
      <div
        className="relative w-full max-w-xl h-full flex items-center justify-center overflow-hidden cursor-pointer"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {activeStatus.type === 'image' && activeStatus.mediaUrl ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            <img
              src={activeStatus.mediaUrl}
              alt="Story"
              className="w-full max-h-[82vh] object-contain"
            />
            {activeStatus.caption && (
              <div className="absolute bottom-24 left-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-2xl text-center text-white text-sm font-medium">
                {activeStatus.caption}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{ backgroundColor: activeStatus.bgColor || '#005c4b' }}
            className="w-full h-full flex items-center justify-center p-8 text-center text-white"
          >
            <p className="text-2xl sm:text-3xl font-bold max-w-md leading-relaxed select-text">
              {activeStatus.text}
            </p>
          </div>
        )}

        {/* Invisible Click Zones for Prev/Next */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
          className="absolute left-0 top-20 bottom-24 w-1/4 z-10"
        />
        <div
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="absolute right-0 top-20 bottom-24 w-1/4 z-10"
        />
      </div>

      {/* Bottom Reply Bar or Own Status Viewer Count */}
      <div className="absolute bottom-4 left-0 right-0 z-30 p-3 max-w-xl mx-auto flex flex-col gap-2">
        {isOwnStatus ? (
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-xs font-medium">
              <Eye className="w-4 h-4 text-[#00a884]" />
              <span>
                Viewed by {activeStatus.viewerCount ?? 0}{' '}
                {(activeStatus.viewerCount ?? 0) === 1 ? 'contact' : 'contacts'}
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Quick Reaction Pills */}
            <div className="flex items-center justify-center gap-2 mb-1">
              {['❤️', '😂', '🔥', '👏', '😮', '🙏'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSendReply(emoji)}
                  className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-lg transition-transform active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendReply();
              }}
              className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-1.5 pl-4 rounded-full border border-white/20"
            >
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => setIsPaused(true)}
                onBlur={() => setIsPaused(false)}
                placeholder={`Reply to ${activeStatus.contactName}...`}
                className="flex-1 bg-transparent text-sm text-white placeholder-white/60 outline-none"
              />
              <button
                type="submit"
                disabled={!replyText.trim()}
                className="w-9 h-9 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f72] disabled:opacity-40 transition-colors"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
