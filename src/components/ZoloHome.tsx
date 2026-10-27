import React from 'react';
import {
  ShieldCheck,
  Lock,
  QrCode,
  FolderLock,
  Clock,
  Calendar,
  MessageSquarePlus,
  Files,
  Laptop,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { ZoloLogo } from './ZoloLogo';
import type { UserProfile } from '../types/chat';

interface ZoloHomeProps {
  userProfile: UserProfile;
  theme: 'dark' | 'light';
  onNewChat: () => void;
  onOpenQR: () => void;
  onOpenVault: () => void;
  onOpenReminders: () => void;
  onOpenScheduled: () => void;
  onOpenSecurity: () => void;
  onOpenSharedFiles: () => void;
}

export const ZoloHome: React.FC<ZoloHomeProps> = ({
  userProfile,
  theme,
  onNewChat,
  onOpenQR,
  onOpenVault,
  onOpenReminders,
  onOpenScheduled,
  onOpenSecurity,
  onOpenSharedFiles,
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      className={`flex-1 h-full flex flex-col items-center justify-between p-6 sm:p-10 overflow-y-auto ${
        isDark ? 'bg-[#111b21] text-white' : 'bg-[#f0f2f5] text-slate-900'
      }`}
    >
      {/* Decorative top ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-[#00a884]/10 blur-3xl pointer-events-none rounded-full" />

      {/* Header Section */}
      <div className="w-full max-w-2xl flex flex-col items-center text-center mt-4 sm:mt-8 space-y-4 relative z-10">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#008069] via-[#00a884] to-[#25d366] flex items-center justify-center shadow-xl shadow-[#00a884]/20 ring-4 ring-[#00a884]/20 animate-in zoom-in-95 duration-300">
            <ZoloLogo className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[#00a884] text-white shadow">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Privacy-First Communications</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome to ZOLO
          </h1>
          <p
            className={`text-sm sm:text-base max-w-md mx-auto ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            Encrypted messaging, personal Vault storage, distinct Personal &amp; Work inboxes, and seamless file sharing.
          </p>
        </div>
      </div>

      {/* Quick Launch Action Cards Grid */}
      <div className="w-full max-w-2xl my-6 sm:my-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 relative z-10">
        {/* New Conversation */}
        <button
          type="button"
          onClick={onNewChat}
          className={`p-4 rounded-2xl border text-left flex flex-col justify-between group transition-all duration-200 hover:-translate-y-0.5 shadow-sm ${
            isDark
              ? 'bg-[#202c33]/80 border-slate-700/70 hover:border-[#00a884] hover:bg-[#202c33]'
              : 'bg-white border-slate-200/90 hover:border-[#00a884] hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center group-hover:scale-110 transition-transform">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-[#00a884] uppercase tracking-wider">
              Start
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">New Conversation</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Direct chat, group, or mobile contact
            </p>
          </div>
        </button>

        {/* QR Profile & Contact Discovery */}
        <button
          type="button"
          onClick={onOpenQR}
          className={`p-4 rounded-2xl border text-left flex flex-col justify-between group transition-all duration-200 hover:-translate-y-0.5 shadow-sm ${
            isDark
              ? 'bg-[#202c33]/80 border-slate-700/70 hover:border-[#00a884] hover:bg-[#202c33]'
              : 'bg-white border-slate-200/90 hover:border-[#00a884] hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <QrCode className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
              Share
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">QR Code Profile</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Scan or share your private contact QR
            </p>
          </div>
        </button>

        {/* ZOLO Vault */}
        <button
          type="button"
          onClick={onOpenVault}
          className={`p-4 rounded-2xl border text-left flex flex-col justify-between group transition-all duration-200 hover:-translate-y-0.5 shadow-sm ${
            isDark
              ? 'bg-[#202c33]/80 border-slate-700/70 hover:border-[#00a884] hover:bg-[#202c33]'
              : 'bg-white border-slate-200/90 hover:border-[#00a884] hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FolderLock className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Vault
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">ZOLO Vault</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Private personal files &amp; encrypted storage
            </p>
          </div>
        </button>

        {/* Message Reminders */}
        <button
          type="button"
          onClick={onOpenReminders}
          className={`p-4 rounded-2xl border text-left flex flex-col justify-between group transition-all duration-200 hover:-translate-y-0.5 shadow-sm ${
            isDark
              ? 'bg-[#202c33]/80 border-slate-700/70 hover:border-[#00a884] hover:bg-[#202c33]'
              : 'bg-white border-slate-200/90 hover:border-[#00a884] hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              Focus
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Reminders</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Never miss important follow-ups
            </p>
          </div>
        </button>

        {/* Scheduled Messages */}
        <button
          type="button"
          onClick={onOpenScheduled}
          className={`p-4 rounded-2xl border text-left flex flex-col justify-between group transition-all duration-200 hover:-translate-y-0.5 shadow-sm ${
            isDark
              ? 'bg-[#202c33]/80 border-slate-700/70 hover:border-[#00a884] hover:bg-[#202c33]'
              : 'bg-white border-slate-200/90 hover:border-[#00a884] hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
              Timed
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Scheduled Messages</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Plan messages across time zones
            </p>
          </div>
        </button>

        {/* Linked Devices & Security */}
        <button
          type="button"
          onClick={onOpenSecurity}
          className={`p-4 rounded-2xl border text-left flex flex-col justify-between group transition-all duration-200 hover:-translate-y-0.5 shadow-sm ${
            isDark
              ? 'bg-[#202c33]/80 border-slate-700/70 hover:border-[#00a884] hover:bg-[#202c33]'
              : 'bg-white border-slate-200/90 hover:border-[#00a884] hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Laptop className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
              Shield
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">Security &amp; Devices</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Manage sessions &amp; privacy controls
            </p>
          </div>
        </button>
      </div>

      {/* Security & Encryption Bottom Footer */}
      <div
        className={`w-full max-w-xl py-3 px-4 rounded-2xl border flex items-center justify-center gap-2 text-xs font-medium text-center ${
          isDark
            ? 'bg-[#182229]/60 border-slate-800 text-slate-400'
            : 'bg-slate-200/50 border-slate-300/80 text-slate-600'
        }`}
      >
        <Lock className="w-3.5 h-3.5 text-[#00a884] shrink-0" />
        <span>
          End-to-end encrypted. Messages, calls, and Vault files stay between you and your recipients.
        </span>
      </div>
    </div>
  );
};
