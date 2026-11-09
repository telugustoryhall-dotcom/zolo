import React, { useState } from 'react';
import {
  X,
  Clock,
  Calendar,
  CheckCircle2,
  Trash2,
  Send,
  Plus,
  AlertCircle,
  Bell,
  MessageSquare,
} from 'lucide-react';
import type { Contact } from '../types/chat';

export interface MessageReminderItem {
  id: string;
  messageId?: string;
  contactId: string;
  contactName: string;
  text: string;
  remindAt: number;
  isHandled: boolean;
  createdAt: number;
}

export interface ScheduledMessageItem {
  id: string;
  contactId: string;
  contactName: string;
  text: string;
  scheduledTime: number;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: number;
}

interface RemindersAndScheduledModalProps {
  contacts: Contact[];
  theme: 'dark' | 'light';
  initialTab?: 'reminders' | 'scheduled';
  onClose: () => void;
  onSendScheduledNow?: (contactId: string, text: string) => void;
  onOpenChat: (contactId: string) => void;
}

export const RemindersAndScheduledModal: React.FC<RemindersAndScheduledModalProps> = ({
  contacts,
  theme,
  initialTab = 'reminders',
  onClose,
  onSendScheduledNow,
  onOpenChat,
}) => {
  const [activeTab, setActiveTab] = useState<'reminders' | 'scheduled'>(initialTab);

  // Reminders state
  const [reminders, setReminders] = useState<MessageReminderItem[]>(() => {
    try {
      const saved = localStorage.getItem('zolo_reminders');
      return saved
        ? JSON.parse(saved)
        : [
            {
              id: 'rem_1',
              contactId: 'c1',
              contactName: 'Sarah Miller',
              text: 'Review the design components feedback voice note before 3 PM',
              remindAt: Date.now() + 1000 * 60 * 60 * 2,
              isHandled: false,
              createdAt: Date.now() - 1000 * 60 * 30,
            },
          ];
    } catch {
      return [];
    }
  });

  // Scheduled messages state
  const [scheduled, setScheduled] = useState<ScheduledMessageItem[]>(() => {
    try {
      const saved = localStorage.getItem('zolo_scheduled_messages');
      return saved
        ? JSON.parse(saved)
        : [
            {
              id: 'sch_1',
              contactId: 'c1',
              contactName: 'Sarah Miller',
              text: 'Morning Sarah! Sending the updated design system export as promised.',
              scheduledTime: Date.now() + 1000 * 60 * 60 * 14,
              status: 'pending',
              createdAt: Date.now() - 1000 * 60 * 10,
            },
          ];
    } catch {
      return [];
    }
  });

  // New Reminder form state
  const [isAddingReminder, setIsAddingReminder] = useState(false);
  const [newReminderContactId, setNewReminderContactId] = useState(contacts[0]?.id || '');
  const [newReminderText, setNewReminderText] = useState('');
  const [newReminderHours, setNewReminderHours] = useState('2');

  // New Scheduled message form state
  const [isAddingScheduled, setIsAddingScheduled] = useState(false);
  const [newScheduledContactId, setNewScheduledContactId] = useState(contacts[0]?.id || '');
  const [newScheduledText, setNewScheduledText] = useState('');
  const [newScheduledDate, setNewScheduledDate] = useState('');

  const isDark = theme === 'dark';

  const saveReminders = (next: MessageReminderItem[]) => {
    setReminders(next);
    try {
      localStorage.setItem('zolo_reminders', JSON.stringify(next));
    } catch {}
  };

  const saveScheduled = (next: ScheduledMessageItem[]) => {
    setScheduled(next);
    try {
      localStorage.setItem('zolo_scheduled_messages', JSON.stringify(next));
    } catch {}
  };

  const handleCreateReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderText.trim()) return;
    const targetContact = contacts.find((c) => c.id === newReminderContactId) || contacts[0];
    const remindAt = Date.now() + Number(newReminderHours) * 60 * 60 * 1000;

    const item: MessageReminderItem = {
      id: `rem_${Date.now()}`,
      contactId: targetContact?.id || 'c1',
      contactName: targetContact?.name || 'Contact',
      text: newReminderText.trim(),
      remindAt,
      isHandled: false,
      createdAt: Date.now(),
    };

    saveReminders([item, ...reminders]);
    setNewReminderText('');
    setIsAddingReminder(false);
  };

  const handleCreateScheduled = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduledText.trim()) return;
    const targetContact = contacts.find((c) => c.id === newScheduledContactId) || contacts[0];
    const scheduledTime = newScheduledDate
      ? new Date(newScheduledDate).getTime()
      : Date.now() + 1000 * 60 * 60 * 24;

    const item: ScheduledMessageItem = {
      id: `sch_${Date.now()}`,
      contactId: targetContact?.id || 'c1',
      contactName: targetContact?.name || 'Contact',
      text: newScheduledText.trim(),
      scheduledTime,
      status: 'pending',
      createdAt: Date.now(),
    };

    saveScheduled([item, ...scheduled]);
    setNewScheduledText('');
    setIsAddingScheduled(false);
  };

  const toggleHandleReminder = (id: string) => {
    saveReminders(
      reminders.map((r) => (r.id === id ? { ...r, isHandled: !r.isHandled } : r))
    );
  };

  const deleteReminder = (id: string) => {
    saveReminders(reminders.filter((r) => r.id !== id));
  };

  const cancelScheduled = (id: string) => {
    saveScheduled(scheduled.filter((s) => s.id !== id));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-xl max-h-[85vh] rounded-3xl border flex flex-col overflow-hidden shadow-2xl ${
          isDark ? 'bg-[#182229] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header with Switcher */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800/40">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/20">
            <button
              type="button"
              onClick={() => setActiveTab('reminders')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'reminders'
                  ? 'bg-[#00a884] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Reminders ({reminders.filter((r) => !r.isHandled).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('scheduled')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'scheduled'
                  ? 'bg-[#00a884] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Scheduled ({scheduled.filter((s) => s.status === 'pending').length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 1: Reminders */}
        {activeTab === 'reminders' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Bar */}
            <div className="p-3.5 border-b border-slate-800/40 flex items-center justify-between">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Set reminders for unhandled messages or client follow-ups
              </span>
              <button
                type="button"
                onClick={() => setIsAddingReminder(!isAddingReminder)}
                className="px-3 py-1.5 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Reminder</span>
              </button>
            </div>

            {/* Add Reminder Form */}
            {isAddingReminder && (
              <form onSubmit={handleCreateReminder} className="p-4 border-b border-[#00a884]/40 bg-[#00a884]/10 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Contact</label>
                    <select
                      value={newReminderContactId}
                      onChange={(e) => setNewReminderContactId(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${
                        isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Remind in</label>
                    <select
                      value={newReminderHours}
                      onChange={(e) => setNewReminderHours(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${
                        isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="1">1 hour</option>
                      <option value="2">2 hours</option>
                      <option value="4">4 hours</option>
                      <option value="12">12 hours</option>
                      <option value="24">Tomorrow (24 hours)</option>
                    </select>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="What would you like to be reminded about?"
                  value={newReminderText}
                  onChange={(e) => setNewReminderText(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  } focus:outline-none focus:ring-1 focus:ring-[#00a884]`}
                  required
                />

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingReminder(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-[#00a884] text-white text-xs font-semibold"
                  >
                    Set Reminder
                  </button>
                </div>
              </form>
            )}

            {/* Reminders List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {reminders.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
                  <Bell className="w-10 h-10 text-slate-600 mb-2" />
                  <p className="text-sm font-semibold">No active reminders</p>
                  <p className="text-xs max-w-xs mt-1">Set a reminder on important conversations to follow up on time.</p>
                </div>
              ) : (
                reminders.map((r) => (
                  <div
                    key={r.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                      r.isHandled
                        ? 'opacity-50 border-slate-800'
                        : isDark
                        ? 'bg-[#202c33]/70 border-slate-700/60'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleHandleReminder(r.id)}
                        className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                          r.isHandled
                            ? 'bg-[#00a884] border-[#00a884] text-white'
                            : 'border-slate-500 hover:border-[#00a884]'
                        }`}
                      >
                        {r.isHandled && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#00a884]">{r.contactName}</span>
                          <span className="text-[10px] text-slate-400">
                            Due {new Date(r.remindAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 ${r.isHandled ? 'line-through text-slate-500' : ''}`}>
                          {r.text}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChat(r.contactId);
                          onClose();
                        }}
                        title="Go to chat"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReminder(r.id)}
                        title="Delete reminder"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Scheduled Messages */}
        {activeTab === 'scheduled' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Bar */}
            <div className="p-3.5 border-b border-slate-800/40 flex items-center justify-between">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Queue messages for automatic delivery at future times
              </span>
              <button
                type="button"
                onClick={() => setIsAddingScheduled(!isAddingScheduled)}
                className="px-3 py-1.5 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Message</span>
              </button>
            </div>

            {/* Add Scheduled Form */}
            {isAddingScheduled && (
              <form onSubmit={handleCreateScheduled} className="p-4 border-b border-[#00a884]/40 bg-[#00a884]/10 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Recipient</label>
                    <select
                      value={newScheduledContactId}
                      onChange={(e) => setNewScheduledContactId(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${
                        isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Delivery Time</label>
                    <input
                      type="datetime-local"
                      value={newScheduledDate}
                      onChange={(e) => setNewScheduledDate(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${
                        isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                      required
                    />
                  </div>
                </div>

                <textarea
                  placeholder="Message text to deliver..."
                  value={newScheduledText}
                  onChange={(e) => setNewScheduledText(e.target.value)}
                  rows={2}
                  className={`w-full px-3 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  } focus:outline-none focus:ring-1 focus:ring-[#00a884] resize-none`}
                  required
                />

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingScheduled(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-[#00a884] text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Send className="w-3 h-3" />
                    <span>Queue for Delivery</span>
                  </button>
                </div>
              </form>
            )}

            {/* Scheduled List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {scheduled.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
                  <Calendar className="w-10 h-10 text-slate-600 mb-2" />
                  <p className="text-sm font-semibold">No scheduled messages</p>
                  <p className="text-xs max-w-xs mt-1">Schedule important updates across time zones and business hours.</p>
                </div>
              ) : (
                scheduled.map((s) => (
                  <div
                    key={s.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                      isDark ? 'bg-[#202c33]/70 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#00a884]">To: {s.contactName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                          {new Date(s.scheduledTime).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs mt-1 truncate">{s.text}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onSendScheduledNow && (
                        <button
                          type="button"
                          onClick={() => {
                            onSendScheduledNow(s.contactId, s.text);
                            cancelScheduled(s.id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#00a884] text-white text-[11px] font-semibold hover:bg-[#008f72]"
                        >
                          Send Now
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => cancelScheduled(s.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                        title="Cancel"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
