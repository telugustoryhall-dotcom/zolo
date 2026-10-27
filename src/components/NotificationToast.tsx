import React, { useEffect, useState } from 'react';
import { UserAvatar } from './UserAvatar';
import {
  MessageSquare,
  CircleDashed,
  X,
  ArrowRight,
  Eye,
  Camera,
  Mic,
  FileText,
  MapPin,
  BarChart2,
  Sparkles,
} from 'lucide-react';

export interface AppNotificationItem {
  id: string;
  type: 'message' | 'status';
  title: string;
  subtitle: string;
  avatarUrl?: string | null;
  timestamp: string;
  // Payload references for action
  contactId?: string;
  statusIndex?: number;
  storyId?: string;
}

interface NotificationToastContainerProps {
  notifications: AppNotificationItem[];
  theme: 'dark' | 'light';
  onDismiss: (id: string) => void;
  onOpenChat: (contactId: string) => void;
  onOpenStatus: (statusIndex: number) => void;
}

export const NotificationToastContainer: React.FC<NotificationToastContainerProps> = ({
  notifications,
  theme,
  onDismiss,
  onOpenChat,
  onOpenStatus,
}) => {
  const isDark = theme === 'dark';

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 sm:right-6 z-[9999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none">
      {notifications.map((item) => (
        <NotificationToastItem
          key={item.id}
          item={item}
          isDark={isDark}
          onDismiss={() => onDismiss(item.id)}
          onAction={() => {
            if (item.type === 'message' && item.contactId) {
              onOpenChat(item.contactId);
              onDismiss(item.id);
            } else if (item.type === 'status') {
              onOpenStatus(item.statusIndex ?? 0);
              onDismiss(item.id);
            }
          }}
        />
      ))}
    </div>
  );
};

interface NotificationToastItemProps {
  item: AppNotificationItem;
  isDark: boolean;
  onDismiss: () => void;
  onAction: () => void;
}

const NotificationToastItem: React.FC<NotificationToastItemProps> = ({
  item,
  isDark,
  onDismiss,
  onAction,
}) => {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-dismiss countdown
  useEffect(() => {
    if (isPaused) return;
    const totalMs = 6000;
    const intervalMs = 60;
    const step = (intervalMs / totalMs) * 100;

    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev - step <= 0) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - step;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPaused, onDismiss]);

  const isStatus = item.type === 'status';

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onClick={onAction}
      className={`pointer-events-auto relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md cursor-pointer transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] group ${
        isDark
          ? 'bg-[#182229]/95 border-slate-700/80 text-white shadow-black/60'
          : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-400/40'
      }`}
    >
      {/* Top Accent Line */}
      <div
        className={`h-1 w-full transition-all duration-100 ease-linear ${
          isStatus ? 'bg-gradient-to-r from-[#00a884] via-emerald-400 to-[#128c7e]' : 'bg-[#00a884]'
        }`}
        style={{ width: `${progress}%` }}
      />

      <div className="p-3.5 flex items-start gap-3">
        {/* Avatar with Status Ring if story */}
        <div className="relative shrink-0 mt-0.5">
          <div
            className={`rounded-full p-0.5 ${
              isStatus
                ? 'border-2 border-[#00a884] shadow-md shadow-[#00a884]/20'
                : 'border border-transparent'
            }`}
          >
            <UserAvatar
              src={item.avatarUrl}
              name={item.title}
              className="w-10 h-10 shadow-sm"
              textClassName="text-xs font-bold"
            />
          </div>
          {/* Badge Icon */}
          <span
            className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white border-2 ${
              isDark ? 'border-[#182229]' : 'border-white'
            } ${isStatus ? 'bg-[#00a884]' : 'bg-blue-500'}`}
          >
            {isStatus ? (
              <CircleDashed className="w-2.5 h-2.5" />
            ) : (
              <MessageSquare className="w-2.5 h-2.5" />
            )}
          </span>
        </div>

        {/* Text Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 className="text-xs sm:text-sm font-bold truncate leading-tight">
                {item.title}
              </h4>
              {isStatus && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#00a884]/20 text-[#00a884] shrink-0">
                  <Sparkles className="w-2.5 h-2.5" />
                  Status
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 shrink-0 font-medium">
              {item.timestamp}
            </span>
          </div>

          <p
            className={`text-xs line-clamp-2 leading-relaxed ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {item.subtitle}
          </p>

          {/* Quick Action Link */}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction();
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00a884] hover:underline"
            >
              <span>{isStatus ? 'View Status' : 'Reply in Chat'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss notification"
          className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/30 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/**
 * Browser Desktop Notification helper using the HTML5 Notification API.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function showBrowserNotification(params: {
  title: string;
  body: string;
  icon?: string | null;
  tag?: string;
  onClick?: () => void;
}): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(params.title, {
      body: params.body,
      icon: params.icon || '/assets/aistudio/Vibrant_ZOLO_Chat_Logo_d7bbe5fc.png',
      tag: params.tag || `zolo-${Date.now()}`,
      badge: '/assets/aistudio/Vibrant_ZOLO_Chat_Logo_d7bbe5fc.png',
    });

    if (params.onClick) {
      notification.onclick = () => {
        window.focus();
        params.onClick?.();
        notification.close();
      };
    }
  } catch {
    // Non-fatal if browser blocks notification creation
  }
}
