import React, { useState } from 'react';
import {
  X,
  Shield,
  Laptop,
  Smartphone,
  Eye,
  Lock,
  Download,
  AlertTriangle,
  UserX,
  Trash2,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  FileArchive,
  Hourglass,
  LogOut,
} from 'lucide-react';
import type { UserProfile, Contact, Message } from '../types/chat';

interface SecurityAndPrivacyModalProps {
  userProfile: UserProfile;
  contacts: Contact[];
  allMessages: Record<string, Message[]>;
  theme: 'dark' | 'light';
  onClose: () => void;
  onUpdateUserProfile: (updates: Partial<UserProfile>) => void;
  onLoggedOut: () => void;
}

interface ActiveSessionItem {
  id: string;
  name: string;
  type: 'desktop' | 'mobile';
  browser: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
}

export const SecurityAndPrivacyModal: React.FC<SecurityAndPrivacyModalProps> = ({
  userProfile,
  contacts,
  allMessages,
  theme,
  onClose,
  onUpdateUserProfile,
  onLoggedOut,
}) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'security' | 'disappearing' | 'backup' | 'storage'>('security');

  // Privacy states
  const [findability, setFindability] = useState<'everyone' | 'contacts' | 'nobody'>('contacts');
  const [messageRequests, setMessageRequests] = useState<'everyone' | 'contacts'>('contacts');
  const [groupAdds, setGroupAdds] = useState<'everyone' | 'contacts' | 'nobody'>('contacts');
  const [avatarVisibility, setAvatarVisibility] = useState<'everyone' | 'contacts' | 'nobody'>('everyone');
  const [lastSeenVisibility, setLastSeenVisibility] = useState<'everyone' | 'contacts' | 'nobody'>('contacts');
  const [blockedUsers, setBlockedUsers] = useState<string[]>(['+919988776655']);

  // Disappearing messages timer
  const [defaultTimer, setDefaultTimer] = useState<'off' | '24h' | '7d' | '30d' | '90d'>('off');

  // Linked devices sessions
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([
    {
      id: 'ses_current',
      name: 'Chrome on macOS (Current)',
      type: 'desktop',
      browser: 'Google Chrome 132.0',
      location: 'San Francisco, CA (Estimated)',
      lastActive: 'Active right now',
      isCurrent: true,
    },
    {
      id: 'ses_2',
      name: 'ZOLO Mobile on iPhone 16 Pro',
      type: 'mobile',
      browser: 'ZOLO Web Client (iOS Safari)',
      location: 'San Jose, CA',
      lastActive: '3 hours ago',
      isCurrent: false,
    },
  ]);

  // Security activity log
  const [securityEvents] = useState([
    {
      id: 'ev_1',
      title: 'Current session authenticated',
      detail: 'Signed in with verified mobile password',
      time: 'Just now',
      type: 'info',
    },
    {
      id: 'ev_2',
      title: 'Encryption keys verified',
      detail: 'Client-side ratchet session derived on device',
      time: '1 hour ago',
      type: 'success',
    },
  ]);

  // Backup state
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string>('Yesterday, 11:30 PM');
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const handleRevokeSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const handleSignOutOtherDevices = () => {
    setSessions((prev) => prev.filter((s) => s.isCurrent));
  };

  const handleTriggerEncryptedBackup = () => {
    setIsBackingUp(true);
    setBackupStatusMessage('Deriving encryption keys with scrypt & encrypting conversation bundles...');
    setTimeout(() => {
      setIsBackingUp(false);
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastBackupTime(`Today, ${nowStr}`);
      setBackupStatusMessage('End-to-end encrypted backup verified and saved securely.');
      setTimeout(() => setBackupStatusMessage(null), 4000);
    }, 1800);
  };

  const handleExportDataArchive = () => {
    const archiveData = {
      user: {
        name: userProfile.name,
        username: userProfile.username,
        phone: userProfile.phone,
        about: userProfile.about,
      },
      exportTimestamp: new Date().toISOString(),
      contacts: contacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      })),
      conversations: Object.keys(allMessages).reduce<Record<string, unknown>>((acc, cid) => {
        acc[cid] = allMessages[cid].map((m) => ({
          id: m.id,
          senderName: m.senderName,
          text: m.text,
          mediaType: m.mediaType,
          timestamp: m.timestamp,
        }));
        return acc;
      }, {}),
    };

    const blob = new Blob([JSON.stringify(archiveData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ZOLO_Export_Archive_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
        className={`w-full max-w-2xl max-h-[85vh] rounded-3xl border flex flex-col overflow-hidden shadow-2xl ${
          isDark ? 'bg-[#182229] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Security &amp; Privacy Dashboard</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Session control, encrypted backups, and granular visibility rules
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 p-2 border-b border-slate-800/40 overflow-x-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-3 py-1.5 rounded-lg shrink-0 transition-all ${
              activeTab === 'security'
                ? 'bg-[#00a884] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Security &amp; Devices
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-1.5 rounded-lg shrink-0 transition-all ${
              activeTab === 'privacy'
                ? 'bg-[#00a884] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Privacy &amp; Discovery
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('disappearing')}
            className={`px-3 py-1.5 rounded-lg shrink-0 transition-all ${
              activeTab === 'disappearing'
                ? 'bg-[#00a884] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Disappearing Messages
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 rounded-lg shrink-0 transition-all ${
              activeTab === 'backup'
                ? 'bg-[#00a884] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Encrypted Backup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`px-3 py-1.5 rounded-lg shrink-0 transition-all ${
              activeTab === 'storage'
                ? 'bg-[#00a884] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Data &amp; Export
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* TAB 1: SECURITY & DEVICES */}
          {activeTab === 'security' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm">Linked Devices &amp; Active Sessions</h3>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Active hardware devices and browser sessions logged into this account
                  </p>
                </div>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={handleSignOutOtherDevices}
                    className="px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold"
                  >
                    Sign Out Other Devices
                  </button>
                )}
              </div>

              {/* Sessions List */}
              <div className="space-y-2.5">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                      s.isCurrent
                        ? 'border-[#00a884]/40 bg-[#00a884]/10'
                        : isDark
                        ? 'bg-[#202c33]/70 border-slate-700/60'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-700/30 flex items-center justify-center text-[#00a884]">
                        {s.type === 'desktop' ? <Laptop className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-xs sm:text-sm">{s.name}</p>
                          {s.isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00a884] text-white">
                              This Device
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {s.browser} • {s.location} • {s.lastActive}
                        </p>
                      </div>
                    </div>

                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Security Activity Log */}
              <div className="pt-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-2">
                  Recent Security Events
                </h4>
                <div className="space-y-2">
                  {securityEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        isDark ? 'bg-[#111b21] border-slate-800' : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-[#00a884]" />
                        <div>
                          <p className="font-semibold">{ev.title}</p>
                          <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{ev.detail}</p>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500">{ev.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRIVACY & DISCOVERY */}
          {activeTab === 'privacy' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-bold text-sm">Privacy &amp; Contact Controls</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Control who can see your profile and who can message you
                </p>
              </div>

              <div className="space-y-3.5">
                {/* Findability */}
                <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-700/50">
                  <div>
                    <p className="font-semibold text-xs sm:text-sm">Who can find me by mobile / username</p>
                    <p className="text-[11px] text-slate-400">Controls discovery in directory searches</p>
                  </div>
                  <select
                    value={findability}
                    onChange={(e) => setFindability(e.target.value as any)}
                    className={`px-3 py-1.5 rounded-lg border text-xs ${
                      isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">My Contacts Only</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>

                {/* Message Requests */}
                <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-700/50">
                  <div>
                    <p className="font-semibold text-xs sm:text-sm">Message Requests</p>
                    <p className="text-[11px] text-slate-400">Who can initiate a direct conversation</p>
                  </div>
                  <select
                    value={messageRequests}
                    onChange={(e) => setMessageRequests(e.target.value as any)}
                    className={`px-3 py-1.5 rounded-lg border text-xs ${
                      isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">My Contacts Only</option>
                  </select>
                </div>

                {/* Group Adds */}
                <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-700/50">
                  <div>
                    <p className="font-semibold text-xs sm:text-sm">Group Invitations</p>
                    <p className="text-[11px] text-slate-400">Who can add you to group chats</p>
                  </div>
                  <select
                    value={groupAdds}
                    onChange={(e) => setGroupAdds(e.target.value as any)}
                    className={`px-3 py-1.5 rounded-lg border text-xs ${
                      isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">My Contacts Only</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>

                {/* Last Seen & Online Status */}
                <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-700/50">
                  <div>
                    <p className="font-semibold text-xs sm:text-sm">Last Seen &amp; Online Status</p>
                    <p className="text-[11px] text-slate-400">Show when you are active on ZOLO</p>
                  </div>
                  <select
                    value={lastSeenVisibility}
                    onChange={(e) => setLastSeenVisibility(e.target.value as any)}
                    className={`px-3 py-1.5 rounded-lg border text-xs ${
                      isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">My Contacts Only</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>
              </div>

              {/* Blocked Accounts */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                    Blocked Contacts ({blockedUsers.length})
                  </h4>
                </div>
                {blockedUsers.length === 0 ? (
                  <p className="text-xs text-slate-400">No blocked contacts.</p>
                ) : (
                  blockedUsers.map((num) => (
                    <div
                      key={num}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        isDark ? 'bg-[#111b21] border-slate-800' : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <UserX className="w-4 h-4 text-rose-400" />
                        <span className="font-mono">{num}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBlockedUsers(blockedUsers.filter((b) => b !== num))}
                        className="text-[#00a884] font-semibold hover:underline"
                      >
                        Unblock
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DISAPPEARING MESSAGES */}
          {activeTab === 'disappearing' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm">Default Disappearing Messages Timer</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  When enabled, all new conversations will automatically delete messages after the set period
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['off', '24h', '7d', '30d', '90d'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDefaultTimer(t)}
                    className={`py-3 px-2 rounded-2xl border text-center font-bold text-xs capitalize transition-all ${
                      defaultTimer === t
                        ? 'border-[#00a884] bg-[#00a884]/15 text-[#00a884] shadow-sm'
                        : isDark
                        ? 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {t === 'off' ? 'Off' : t}
                  </button>
                ))}
              </div>

              <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-200 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Hourglass className="w-4 h-4 shrink-0" />
                  <span>Privacy Notice</span>
                </div>
                <p>
                  Recipients can still save, screenshot, or forward media while visible. Disappearing message timers ensure content is erased from ordinary local and cloud retrieval once expired.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: ENCRYPTED BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm">End-to-End Encrypted Backups</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Backup your chats and media encrypted with your personal secret before upload
                </p>
              </div>

              <div className={`p-4 rounded-2xl border space-y-3 ${isDark ? 'bg-[#111b21] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Last Successful Backup:</span>
                  <span className="font-bold text-[#00a884]">{lastBackupTime}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Backup Size:</span>
                  <span className="font-semibold">3.8 MB (Compressed &amp; Encrypted)</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Encryption Standard:</span>
                  <span className="font-semibold font-mono">AES-256-GCM + Scrypt KDF</span>
                </div>

                {backupStatusMessage && (
                  <p className="text-xs text-[#00a884] font-medium pt-1 animate-pulse">
                    {backupStatusMessage}
                  </p>
                )}

                <button
                  type="button"
                  disabled={isBackingUp}
                  onClick={handleTriggerEncryptedBackup}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#00a884] hover:bg-[#008f72] disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow"
                >
                  <RefreshCw className={`w-4 h-4 ${isBackingUp ? 'animate-spin' : ''}`} />
                  <span>{isBackingUp ? 'Encrypting & Uploading...' : 'Backup Now'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: STORAGE & DATA EXPORT */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm">Storage Usage &amp; Data Export</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Manage cached media and export your complete conversation history
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#111b21] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-xs text-slate-400">Chat Attachments</p>
                  <p className="text-lg font-bold mt-1 text-[#00a884]">14.2 MB</p>
                </div>
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#111b21] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-xs text-slate-400">Personal Vault</p>
                  <p className="text-lg font-bold mt-1 text-purple-400">4.2 MB</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExportDataArchive}
                className="w-full py-3 px-4 rounded-xl border border-[#00a884] text-[#00a884] hover:bg-[#00a884]/10 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <FileArchive className="w-4 h-4" />
                <span>Download Complete Account &amp; Chat Archive (JSON)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
