import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Send, Trash2, X, Loader2, Plus, CheckCircle2 } from 'lucide-react';
import { authApi } from '../utils/authApi';
import type { Contact } from '../types/chat';

interface ScheduledMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentContact: Contact;
  theme: 'dark' | 'light';
  onMessageScheduled?: () => void;
}

export const ScheduledMessagesModal: React.FC<ScheduledMessagesModalProps> = ({
  isOpen,
  onClose,
  currentContact,
  theme,
  onMessageScheduled,
}) => {
  const isDark = theme === 'dark';
  const [scheduledList, setScheduledList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [targetDateTime, setTargetDateTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadScheduledMessages();
      // Default to 1 hour from now
      const d = new Date(Date.now() + 60 * 60 * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setTargetDateTime(d.toISOString().slice(0, 16));
    }
  }, [isOpen]);

  const loadScheduledMessages = async () => {
    setLoading(true);
    try {
      const res = await authApi.getScheduledMessages();
      setScheduledList(res.scheduledMessages || []);
    } catch (e) {
      console.error('Failed to load scheduled messages:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSetQuickTime = (minutesFromNow: number) => {
    const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setTargetDateTime(d.toISOString().slice(0, 16));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !targetDateTime) return;

    const scheduledDate = new Date(targetDateTime);
    if (scheduledDate.getTime() <= Date.now()) {
      alert('Please choose a time in the future.');
      return;
    }

    setSubmitting(true);
    try {
      const recipientPhone =
        currentContact.phoneNormalized || currentContact.phone || '+910000000000';

      await authApi.scheduleMessage({
        recipientPhone,
        text: messageText.trim(),
        scheduledFor: scheduledDate.toISOString(),
      });

      setSuccessNotice(`Message scheduled for ${scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}!`);
      setMessageText('');
      setTimeout(() => setSuccessNotice(null), 3000);
      loadScheduledMessages();
      onMessageScheduled?.();
    } catch (e) {
      console.error('Schedule error:', e);
      alert('Failed to schedule message.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelScheduled = async (id: string) => {
    try {
      await authApi.cancelScheduledMessage(id);
      setScheduledList((prev) => prev.filter((m) => m.id !== id && m.scheduleId !== id));
    } catch (e) {
      console.error('Cancel error:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] border ${
          isDark ? 'bg-[#111b21] border-[#222e35] text-white' : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        {/* Header */}
        <div className={`p-4 flex items-center justify-between border-b ${isDark ? 'border-[#222e35] bg-[#202c33]' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Schedule Message</h2>
              <p className="text-xs opacity-60">Delivers automatically at your chosen date & time to {currentContact.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {successNotice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {successNotice}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs opacity-70 font-medium block mb-1">Message Text</label>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type the message to be sent later..."
                rows={3}
                required
                className={`w-full p-2.5 rounded-xl text-xs border resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-white border-gray-300'
                }`}
              />
            </div>

            <div>
              <label className="text-xs opacity-70 font-medium block mb-1">Delivery Time</label>
              <input
                type="datetime-local"
                value={targetDateTime}
                onChange={(e) => setTargetDateTime(e.target.value)}
                required
                className={`w-full p-2.5 rounded-xl text-xs border ${
                  isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-white border-gray-300'
                }`}
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="opacity-60 text-[10px] uppercase font-bold mr-1">Quick:</span>
              <button
                type="button"
                onClick={() => handleSetQuickTime(30)}
                className="px-2 py-0.5 rounded border border-white/10 hover:bg-white/10 text-[11px]"
              >
                In 30m
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickTime(60)}
                className="px-2 py-0.5 rounded border border-white/10 hover:bg-white/10 text-[11px]"
              >
                In 1 hour
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickTime(180)}
                className="px-2 py-0.5 rounded border border-white/10 hover:bg-white/10 text-[11px]"
              >
                In 3 hours
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickTime(1440)}
                className="px-2 py-0.5 rounded border border-white/10 hover:bg-white/10 text-[11px]"
              >
                Tomorrow
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting || !messageText.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Schedule Message
              </button>
            </div>
          </form>

          {/* Pending Scheduled Messages List */}
          <div className="pt-3 border-t border-white/10">
            <h4 className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-2">
              Pending Scheduled Messages ({scheduledList.length})
            </h4>

            {loading ? (
              <div className="py-4 flex justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              </div>
            ) : scheduledList.length === 0 ? (
              <p className="text-xs opacity-50 italic">No scheduled messages in the queue.</p>
            ) : (
              <div className="space-y-2">
                {scheduledList.map((m) => (
                  <div
                    key={m.id || m.scheduleId}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                      isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div>
                      <p className="font-medium">{m.text}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] opacity-60">
                        <Clock className="w-3 h-3 text-emerald-400" />
                        <span>Scheduled: {new Date(m.scheduledFor).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>• To: {m.recipientPhone}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelScheduled(m.id || m.scheduleId)}
                      className="p-1.5 rounded text-red-400 hover:bg-red-500/10"
                      title="Cancel schedule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
