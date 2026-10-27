import React, { useState } from 'react';
import { Contact, StatusStory, CallLog, Message, UserProfile } from '../types/chat';
import {
  MessageSquare, CircleDashed, Phone, Star, Settings, Plus, Search,
  Pin, Bell, BellOff, Archive, Check, CheckCheck, Sun, Moon, Volume2, VolumeX,
  User, Shield, CornerDownRight, RotateCcw, CheckCircle2, ChevronRight,
  Filter, MoreVertical, PhoneCall, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, X, Camera, Loader2, LogOut,
  QrCode, FolderLock, Clock, Calendar, Files, ShieldCheck, Briefcase
} from 'lucide-react';
import { AvatarPickerModal } from './AvatarPickerModal';
import { ZoloLogo } from './ZoloLogo';
import { UserAvatar } from './UserAvatar';
import { AvatarCropperModal } from './AvatarCropperModal';
import { AccountSecurityPanel } from './AccountSecurityPanel';
import { requestBrowserNotificationPermission } from './NotificationToast';
import { authApi, AuthApiClientError } from '../utils/authApi';
import type { AuthenticatedUser } from '../types/auth';

interface SidebarProps {
  contacts: Contact[];
  activeContactId: string | null;
  statuses: StatusStory[];
  callLogs: CallLog[];
  allMessages: Record<string, Message[]>;
  currentUser: UserProfile;
  authUser?: AuthenticatedUser | null;
  theme: 'dark' | 'light';
  typingContactId?: string | null;
  onSelectContact: (id: string) => void;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onOpenStatusViewer: (index: number) => void;
  onOpenStatusCreator: () => void;
  onStartCall: (contactId: string, type: 'audio' | 'video', rawPeerPhone?: string) => void;
  onClearMissedCalls?: () => void;
  onTogglePin: (contactId: string) => void;
  onToggleMute: (contactId: string) => void;
  onToggleArchive: (contactId: string) => void;
  onToggleTheme: () => void;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onResetData: () => void;
  onAuthUserUpdated?: (updated: AuthenticatedUser) => void;
  onLoggedOut?: () => void;
  onOpenQR?: () => void;
  onOpenVault?: () => void;
  onOpenReminders?: () => void;
  onOpenScheduled?: () => void;
  onOpenSecurity?: () => void;
  onOpenGlobalSearch?: () => void;
  onOpenSharedFiles?: () => void;
  onToggleInboxType?: (contactId: string, type: 'personal' | 'work') => void;
}

type TabType = 'chats' | 'status' | 'calls' | 'starred' | 'archived' | 'settings';
type ChatFilterType = 'all' | 'personal' | 'work' | 'unread' | 'groups';
type CallFilterType = 'all' | 'missed';

export const Sidebar: React.FC<SidebarProps> = ({
  contacts,
  activeContactId,
  statuses,
  callLogs,
  allMessages,
  currentUser,
  authUser,
  theme,
  typingContactId,
  onSelectContact,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenStatusViewer,
  onOpenStatusCreator,
  onStartCall,
  onClearMissedCalls,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onToggleTheme,
  onUpdateProfile,
  onResetData,
  onAuthUserUpdated,
  onLoggedOut,
  onOpenQR,
  onOpenVault,
  onOpenReminders,
  onOpenScheduled,
  onOpenSecurity,
  onOpenGlobalSearch,
  onOpenSharedFiles,
  onToggleInboxType,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [chatFilter, setChatFilter] = useState<ChatFilterType>('all');
  const [callFilter, setCallFilter] = useState<CallFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [desktopNotifPermission, setDesktopNotifPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  // Settings editing state
  const [editName, setEditName] = useState(currentUser.name);
  const [editAbout, setEditAbout] = useState(currentUser.about);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [isProfileAvatarPickerOpen, setIsProfileAvatarPickerOpen] = useState(false);
  const [cropProfileFile, setCropProfileFile] = useState<File | null>(null);
  const [uploadingProfileAvatar, setUploadingProfileAvatar] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const settingsFileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setEditName(currentUser.name);
    setEditAbout(currentUser.about);
  }, [currentUser.name, currentUser.about]);

  const isDark = theme === 'dark';

  // Total unread messages, unread statuses, and unseen missed calls counts
  const totalUnreadCount = contacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const unreadStatusesCount = statuses.filter((s) => !s.viewed && s.contactId !== 'user').length;
  const totalMissedCallsCount = callLogs.filter((c) => c.direction === 'missed').length;
  const unseenMissedCallsCount = callLogs.filter(
    (c) => c.direction === 'missed' && c.missedUnseen
  ).length;
  const myStatuses = statuses.filter((s) => s.contactId === 'user');
  const recentContactStatuses = statuses.filter((s) => s.contactId !== 'user' && !s.viewed);
  const viewedContactStatuses = statuses.filter((s) => s.contactId !== 'user' && s.viewed);
  const filteredCallLogs =
    callFilter === 'missed'
      ? callLogs.filter((c) => c.direction === 'missed')
      : callLogs;

  // Helper to highlight matching characters in contact name
  const renderHighlightedName = (name: string, query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return name;
    const index = name.toLowerCase().indexOf(trimmed.toLowerCase());
    if (index === -1) return name;
    const before = name.substring(0, index);
    const match = name.substring(index, index + trimmed.length);
    const after = name.substring(index + trimmed.length);
    return (
      <>
        {before}
        <span className="bg-[#00a884]/25 text-[#00a884] font-bold rounded px-0.5">{match}</span>
        {after}
      </>
    );
  };

  // Filter contacts by name as user types
  const visibleContacts = contacts
    .filter((c) => {
      if (activeTab === 'archived') {
        return c.isArchived;
      }
      return !c.isArchived;
    })
    .filter((c) => {
      if (chatFilter === 'unread') return c.unreadCount > 0;
      if (chatFilter === 'groups') return c.isGroup;
      if (chatFilter === 'work') return c.inboxType === 'work' || (c.isGroup && c.inboxType !== 'personal');
      if (chatFilter === 'personal') return c.inboxType !== 'work' && !c.isGroup;
      return true;
    })
    .filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return c.name.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Pinned contacts first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });

  // Collect all starred messages
  const starredMessagesList: { message: Message; contact: Contact }[] = [];
  Object.entries(allMessages).forEach(([chatId, msgs]) => {
    const contact = contacts.find((c) => c.id === chatId);
    if (contact) {
      msgs.forEach((m) => {
        if (m.isStarred) {
          starredMessagesList.push({ message: m, contact });
        }
      });
    }
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    const nextName = editName.trim() || currentUser.name;
    const nextAbout = editAbout.trim() || currentUser.about;

    if (authUser) {
      setSavingProfile(true);
      try {
        const res = await authApi.updateProfile({
          fullName: nextName,
          about: nextAbout,
        });
        onAuthUserUpdated?.(res.user);
        onUpdateProfile({
          name: res.user.fullName,
          username: res.user.username,
          about: res.user.about,
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (err: unknown) {
        setProfileError(
          err instanceof AuthApiClientError ? err.message : 'Could not save profile changes.'
        );
      } finally {
        setSavingProfile(false);
      }
    } else {
      onUpdateProfile({
        name: nextName,
        about: nextAbout,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleSettingsAvatarChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfileError('Only JPG, PNG, and WebP images are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileError('Profile picture must be 5 MB or smaller.');
      return;
    }
    setCropProfileFile(file);
  };

  const handleConfirmSettingsCrop = async (blob: Blob) => {
    setCropProfileFile(null);
    setUploadingProfileAvatar(true);
    setProfileError(null);
    try {
      const uploaded = await authApi.uploadAvatar(blob, 'avatar.webp');
      if (authUser) {
        const res = await authApi.updateProfile({ avatarUrl: uploaded.url });
        onAuthUserUpdated?.(res.user);
      }
      onUpdateProfile({ avatar: uploaded.url });
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : 'Failed to upload profile photo.');
    } finally {
      setUploadingProfileAvatar(false);
    }
  };

  return (
    <div className="flex h-full w-full md:w-[380px] lg:w-[440px] shrink-0 border-r select-none overflow-hidden transition-colors duration-200">
      {/* 1. Left Icon Navigation Rail */}
      <div
        className={`w-14 sm:w-16 flex flex-col items-center justify-between py-4 border-r shrink-0 z-20 ${
          isDark ? 'bg-[#202c33] border-slate-800 text-slate-300' : 'bg-[#f0f2f5] border-slate-200 text-slate-600'
        }`}
      >
        {/* Top Destination Icons */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* ZOLO Brand Icon Mark */}
          <button
            onClick={() => setActiveTab('chats')}
            className="p-1.5 rounded-xl hover:bg-slate-700/20 transition-transform active:scale-95 flex items-center justify-center"
            title="ZOLO Chat"
          >
            <ZoloLogo variant="icon" theme={theme} className="w-8 h-8" />
          </button>

          {/* Chats Tab */}
          <button
            onClick={() => setActiveTab('chats')}
            className={`relative p-2.5 rounded-xl transition-all ${
              activeTab === 'chats'
                ? isDark
                  ? 'bg-slate-700/60 text-[#00a884]'
                  : 'bg-slate-200 text-[#008069]'
                : 'hover:bg-slate-700/20 text-slate-400'
            }`}
            title="Chats"
          >
            <MessageSquare className="w-5 h-5" />
            {totalUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] text-[10px] font-bold bg-[#00a884] text-white rounded-full flex items-center justify-center">
                {totalUnreadCount}
              </span>
            )}
          </button>

          {/* Status Tab */}
          <button
            onClick={() => setActiveTab('status')}
            className={`relative p-2.5 rounded-xl transition-all ${
              activeTab === 'status'
                ? isDark
                  ? 'bg-slate-700/60 text-[#00a884]'
                  : 'bg-slate-200 text-[#008069]'
                : 'hover:bg-slate-700/20 text-slate-400'
            }`}
            title="Status"
          >
            <CircleDashed className="w-5 h-5" />
            {unreadStatusesCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#00a884]" />
            )}
          </button>

          {/* Calls Tab */}
          <button
            onClick={() => {
              setActiveTab('calls');
              onClearMissedCalls?.();
            }}
            className={`relative p-2.5 rounded-xl transition-all ${
              activeTab === 'calls'
                ? isDark
                  ? 'bg-slate-700/60 text-[#00a884]'
                  : 'bg-slate-200 text-[#008069]'
                : 'hover:bg-slate-700/20 text-slate-400'
            }`}
            title="Calls"
          >
            <Phone className="w-5 h-5" />
            {unseenMissedCallsCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] text-[10px] font-bold bg-rose-500 text-white rounded-full flex items-center justify-center shadow">
                {unseenMissedCallsCount}
              </span>
            )}
          </button>

          {/* Starred Messages Tab */}
          <button
            onClick={() => setActiveTab('starred')}
            className={`relative p-2.5 rounded-xl transition-all ${
              activeTab === 'starred'
                ? isDark
                  ? 'bg-slate-700/60 text-amber-400'
                  : 'bg-slate-200 text-amber-500'
                : 'hover:bg-slate-700/20 text-slate-400'
            }`}
            title="Starred Messages"
          >
            <Star className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom Destination Icons */}
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Theme Switcher */}
          <button
            onClick={onToggleTheme}
            className="p-2.5 rounded-xl hover:bg-slate-700/20 text-slate-400 transition-colors"
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}
          </button>

          {/* Settings Tab */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'settings'
                ? isDark
                  ? 'bg-slate-700/60 text-[#00a884]'
                  : 'bg-slate-200 text-[#008069]'
                : 'hover:bg-slate-700/20 text-slate-400'
            }`}
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* User Profile Avatar */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className="rounded-full cursor-pointer border-2 border-emerald-500 hover:opacity-85 transition-opacity"
            title="My Profile"
          >
            <UserAvatar
              src={currentUser.avatar}
              name={currentUser.name}
              className="w-9 h-9"
              textClassName="text-xs"
            />
          </button>
        </div>
      </div>

      {/* 2. Subpanel View Content */}
      <div
        className={`flex-1 flex flex-col h-full overflow-hidden ${
          isDark ? 'bg-[#111b21] text-white' : 'bg-white text-slate-900'
        }`}
      >
        {/* A. CHATS SUBPANEL */}
        {activeTab === 'chats' && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-3.5 py-3 flex items-center justify-between border-b border-slate-700/20">
              <div className="flex items-center">
                <ZoloLogo variant="full" theme={theme} className="h-8 w-auto" />
              </div>

              <div className="flex items-center gap-1 text-slate-400">
                <button
                  onClick={onOpenNewChat}
                  className="p-2 rounded-full hover:bg-slate-700/20 hover:text-white transition-colors"
                  title="New Chat"
                >
                  <Plus className="w-5 h-5" />
                </button>

                {/* Quick Header Actions */}
                {onOpenGlobalSearch && (
                  <button
                    onClick={onOpenGlobalSearch}
                    className="p-2 rounded-full hover:bg-slate-700/20 hover:text-white transition-colors"
                    title="Global Search (Ctrl+K)"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                )}

                {onOpenQR && (
                  <button
                    onClick={onOpenQR}
                    className="p-2 rounded-full hover:bg-slate-700/20 hover:text-white transition-colors"
                    title="QR Profile & Scanner"
                  >
                    <QrCode className="w-5 h-5" />
                  </button>
                )}

                {onOpenVault && (
                  <button
                    onClick={onOpenVault}
                    className="p-2 rounded-full hover:bg-slate-700/20 hover:text-emerald-400 transition-colors"
                    title="ZOLO Vault"
                  >
                    <FolderLock className="w-5 h-5 text-emerald-400" />
                  </button>
                )}

                <div className="relative">
                  <button
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className="p-2 rounded-full hover:bg-slate-700/20 hover:text-white transition-colors"
                    title="Menu"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {showMoreMenu && (
                    <div
                      className={`absolute right-0 top-10 w-56 py-2 rounded-xl shadow-xl z-50 border ${
                        isDark ? 'bg-[#233138] border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          onOpenNewGroup();
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30"
                      >
                        New Group
                      </button>
                      {onOpenQR && (
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            onOpenQR();
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30 flex items-center gap-2"
                        >
                          <QrCode className="w-3.5 h-3.5 text-purple-400" />
                          <span>QR Profile &amp; Scanner</span>
                        </button>
                      )}
                      {onOpenVault && (
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            onOpenVault();
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30 flex items-center gap-2"
                        >
                          <FolderLock className="w-3.5 h-3.5 text-emerald-400" />
                          <span>ZOLO Vault</span>
                        </button>
                      )}
                      {onOpenReminders && (
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            onOpenReminders();
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30 flex items-center gap-2"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Reminders &amp; Scheduled</span>
                        </button>
                      )}
                      {onOpenSharedFiles && (
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            onOpenSharedFiles();
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30 flex items-center gap-2"
                        >
                          <Files className="w-3.5 h-3.5 text-blue-400" />
                          <span>Shared Media Library</span>
                        </button>
                      )}
                      {onOpenSecurity && (
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            onOpenSecurity();
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30 flex items-center gap-2"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                          <span>Security &amp; Privacy Dashboard</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          setActiveTab('archived');
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30"
                      >
                        Archived Chats
                      </button>
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          setActiveTab('starred');
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30"
                      >
                        Starred Messages
                      </button>
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          setActiveTab('settings');
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-700/30"
                      >
                        Settings
                      </button>
                      {onLoggedOut && (
                        <button
                          onClick={async () => {
                            setShowMoreMenu(false);
                            await authApi.logoutCurrentDevice();
                            onLoggedOut();
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 border-t border-slate-700/40 mt-1 pt-2"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Log Out</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="p-3 flex flex-col gap-2 border-b border-slate-700/20">
              <div
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all border ${
                  isDark
                    ? 'bg-[#202c33] border-transparent focus-within:border-[#00a884]'
                    : 'bg-slate-100 border-transparent focus-within:border-[#008069] focus-within:bg-white focus-within:shadow-sm'
                }`}
              >
                <Search
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    searchQuery.trim() ? 'text-[#00a884]' : 'text-slate-400'
                  }`}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSearchQuery('');
                  }}
                  placeholder="Search contacts by name..."
                  aria-label="Search contacts by name"
                  className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 rounded-full hover:bg-slate-700/30 text-slate-400 hover:text-white transition-colors shrink-0"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Real-time search match feedback */}
              {searchQuery.trim() && (
                <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                  <span>
                    {visibleContacts.length} {visibleContacts.length === 1 ? 'contact' : 'contacts'} matching &ldquo;{searchQuery}&rdquo;
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[#00a884] hover:underline font-semibold"
                  >
                    Clear filter
                  </button>
                </div>
              )}

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 pt-0.5 overflow-x-auto pb-1 no-scrollbar">
                {(['all', 'personal', 'work', 'unread', 'groups'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setChatFilter(filter)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
                      chatFilter === filter
                        ? 'bg-[#00a884] text-white shadow-sm'
                        : isDark
                        ? 'bg-[#202c33] text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter === 'personal' ? 'Personal' : filter === 'work' ? 'Work' : filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Chats List */}
            <div className="flex-1 overflow-y-auto">
              {visibleContacts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Search className="w-8 h-8 text-slate-500/50 mb-1" />
                  <p className="font-semibold text-sm text-slate-300">No contacts found</p>
                  <p className="text-slate-400 max-w-xs">
                    {searchQuery.trim()
                      ? `No contacts match "${searchQuery.trim()}"`
                      : 'No conversations found in this view.'}
                  </p>
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-2 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-[#00a884] text-white hover:bg-[#008f72] transition-colors"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                visibleContacts.map((contact) => {
                  const isActive = activeContactId === contact.id;
                  const chatMsgs = allMessages[contact.id] || [];
                  const lastMsg = chatMsgs[chatMsgs.length - 1];
                  const contactStatusIdx = statuses.findIndex(
                    (s) =>
                      s.contactId === contact.id ||
                      (Boolean(contact.phoneNormalized) &&
                        s.authorPhone === contact.phoneNormalized)
                  );
                  const hasActiveStatus = contactStatusIdx >= 0 && contact.id !== 'self';
                  const isUnviewedStatus =
                    hasActiveStatus && !statuses[contactStatusIdx].viewed;

                  return (
                    <div
                      key={contact.id}
                      onClick={() => onSelectContact(contact.id)}
                      className={`relative flex items-center gap-3 px-3.5 py-3 cursor-pointer border-b transition-colors group ${
                        isActive
                          ? isDark
                            ? 'bg-[#2a3942] border-slate-700/50'
                            : 'bg-slate-100 border-slate-200'
                          : isDark
                          ? 'border-slate-800/40 hover:bg-[#202c33]'
                          : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      {/* Avatar with optional WhatsApp Status Ring */}
                      <div
                        onClick={(e) => {
                          if (hasActiveStatus) {
                            e.stopPropagation();
                            onOpenStatusViewer(contactStatusIdx);
                          }
                        }}
                        className={`relative w-12 h-12 rounded-full shrink-0 transition-all ${
                          hasActiveStatus ? 'p-[2px] cursor-pointer hover:scale-105' : ''
                        } ${
                          isUnviewedStatus
                            ? 'border-2 border-[#00a884] shadow-sm shadow-[#00a884]/30'
                            : hasActiveStatus
                            ? 'border-2 border-slate-500/60'
                            : ''
                        }`}
                        title={
                          hasActiveStatus
                            ? `${contact.name} has a status update - click to view`
                            : undefined
                        }
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-slate-700">
                          {contact.avatar ? (
                            <img
                              src={contact.avatar}
                              alt={contact.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-white bg-emerald-800">
                              {contact.name[0]}
                            </div>
                          )}
                        </div>
                        {contact.online && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#111b21]" />
                        )}
                      </div>

                      {/* Info & Snippet */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h4 className="text-sm font-semibold truncate leading-tight">
                              {renderHighlightedName(contact.name, searchQuery)}
                            </h4>
                            {contact.inboxType === 'work' && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded">
                                Work
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0 ml-2">
                            {lastMsg ? lastMsg.timestamp : ''}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-400 truncate pr-2">
                            {contact.isTyping || typingContactId === contact.id ? (
                              <span className="text-[#00a884] font-medium">typing...</span>
                            ) : lastMsg ? (
                              <span>
                                {lastMsg.senderId === 'user' && (
                                  <span className="mr-1 inline-block align-middle">
                                    {lastMsg.status === 'read' ? (
                                      <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] inline" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5 text-slate-400 inline" />
                                    )}
                                  </span>
                                )}
                                {lastMsg.mediaType === 'audio'
                                  ? '🎤 Voice note'
                                  : lastMsg.mediaType === 'image'
                                  ? '📷 Photo'
                                  : lastMsg.mediaType === 'poll'
                                  ? '📊 Poll'
                                  : lastMsg.mediaType === 'location'
                                  ? '📍 Location'
                                  : lastMsg.mediaType === 'document'
                                  ? '📄 Document'
                                  : lastMsg.text}
                              </span>
                            ) : (
                              contact.about
                            )}
                          </p>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {contact.isMuted && (
                              <BellOff className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            {contact.isPinned && (
                              <Pin className="w-3.5 h-3.5 text-slate-400 rotate-45" />
                            )}
                            {contact.unreadCount > 0 && (
                              <span className="px-1.5 py-0.5 min-w-[18px] text-[10px] font-bold bg-[#00a884] text-white rounded-full flex items-center justify-center">
                                {contact.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Hover action menu pills */}
                      <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-[#202c33] p-1 rounded-lg border border-slate-700/60 shadow-md">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(contact.id);
                          }}
                          className={`p-1 hover:text-[#00a884] transition-colors ${
                            contact.isPinned ? 'text-[#00a884]' : 'text-slate-400'
                          }`}
                          title={contact.isPinned ? 'Unpin chat' : 'Pin chat'}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleMute(contact.id);
                          }}
                          className={`p-1 hover:text-[#00a884] transition-colors ${
                            contact.isMuted ? 'text-amber-400' : 'text-slate-400'
                          }`}
                          title={contact.isMuted ? 'Unmute' : 'Mute'}
                        >
                          <BellOff className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleArchive(contact.id);
                          }}
                          className="p-1 text-slate-400 hover:text-white transition-colors"
                          title="Archive chat"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        {onToggleInboxType && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleInboxType(contact.id, contact.inboxType === 'work' ? 'personal' : 'work');
                            }}
                            className={`p-1 hover:text-blue-400 transition-colors ${
                              contact.inboxType === 'work' ? 'text-blue-400' : 'text-slate-400'
                            }`}
                            title={contact.inboxType === 'work' ? 'Move to Personal inbox' : 'Move to Work inbox'}
                          >
                            <Briefcase className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* B. STATUS SUBPANEL */}
        {activeTab === 'status' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-700/20 flex items-center justify-between">
              <h3 className="text-lg font-bold">Status</h3>
              <button
                onClick={onOpenStatusCreator}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold shadow-md transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Status</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* My Status */}
              <div
                onClick={() => {
                  if (myStatuses.length > 0) {
                    const idx = statuses.findIndex((st) => st.id === myStatuses[0].id);
                    if (idx >= 0) {
                      onOpenStatusViewer(idx);
                      return;
                    }
                  }
                  onOpenStatusCreator();
                }}
                className={`flex items-center justify-between gap-3 p-3 rounded-2xl cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`relative w-12 h-12 shrink-0 rounded-full ${
                      myStatuses.length > 0 ? 'p-0.5 border-2 border-[#00a884]' : ''
                    }`}
                  >
                    <UserAvatar
                      src={currentUser.avatar}
                      name={currentUser.name}
                      className="w-full h-full"
                      textClassName="text-sm"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenStatusCreator();
                      }}
                      title="Add new status"
                      className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#00a884] text-white flex items-center justify-center border-2 border-[#111b21]"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold">My status</h4>
                    <p className="text-xs text-slate-400 truncate">
                      {myStatuses.length > 0
                        ? `${myStatuses[0].timestamp} · ${myStatuses[0].viewerCount ?? 0} ${
                            (myStatuses[0].viewerCount ?? 0) === 1 ? 'view' : 'views'
                          } (tap to view)`
                        : 'Tap to add status update visible to your chats'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent Updates from Contacts in Chats */}
              {recentContactStatuses.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
                    Recent updates
                  </div>
                  <div className="space-y-1">
                    {recentContactStatuses.map((status) => {
                      const trueIdx = statuses.findIndex((st) => st.id === status.id);
                      return (
                        <div
                          key={status.id}
                          onClick={() => {
                            if (trueIdx >= 0) onOpenStatusViewer(trueIdx);
                          }}
                          className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                          }`}
                        >
                          {/* Emerald Ring Avatar */}
                          <div className="w-12 h-12 rounded-full p-0.5 border-2 border-[#00a884] shrink-0 overflow-hidden">
                            {status.contactAvatar ? (
                              <img
                                src={status.contactAvatar}
                                alt={status.contactName}
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                                {status.contactName[0]}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold truncate">{status.contactName}</h4>
                            <p className="text-xs text-slate-400 truncate">
                              {status.timestamp}
                              {status.caption || status.text
                                ? ` · ${status.caption || status.text}`
                                : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Viewed Updates */}
              {viewedContactStatuses.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
                    Viewed updates
                  </div>
                  <div className="space-y-1">
                    {viewedContactStatuses.map((status) => {
                      const trueIdx = statuses.findIndex((st) => st.id === status.id);
                      return (
                        <div
                          key={status.id}
                          onClick={() => {
                            if (trueIdx >= 0) onOpenStatusViewer(trueIdx);
                          }}
                          className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors opacity-75 ${
                            isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-full p-0.5 border-2 border-slate-600 shrink-0 overflow-hidden">
                            {status.contactAvatar ? (
                              <img
                                src={status.contactAvatar}
                                alt={status.contactName}
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                                {status.contactName[0]}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold truncate">{status.contactName}</h4>
                            <p className="text-xs text-slate-400 truncate">{status.timestamp}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {recentContactStatuses.length === 0 && viewedContactStatuses.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">
                  No status updates from your chats yet. When contacts in your chats share a status, it will appear here automatically.
                </div>
              )}
            </div>
          </div>
        )}

        {/* C. CALLS SUBPANEL */}
        {activeTab === 'calls' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 pb-3 border-b border-slate-700/20 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Calls</h3>
                <button
                  onClick={onOpenNewChat}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold shadow-md transition-colors"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>New Call</span>
                </button>
              </div>

              {/* WhatsApp-style All / Missed Filter Tabs */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCallFilter('all')}
                  className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    callFilter === 'all'
                      ? 'bg-[#00a884] text-white shadow-sm'
                      : isDark
                      ? 'bg-[#202c33] text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setCallFilter('missed')}
                  className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    callFilter === 'missed'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : isDark
                      ? 'bg-[#202c33] text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>Missed</span>
                  {totalMissedCallsCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        callFilter === 'missed'
                          ? 'bg-white/25 text-white'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {totalMissedCallsCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {filteredCallLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <PhoneMissed className="w-8 h-8 text-slate-500/50 mb-1" />
                  <p className="font-semibold text-sm text-slate-300">
                    {callFilter === 'missed' ? 'No missed calls' : 'No recent calls'}
                  </p>
                  <p className="text-slate-400 max-w-xs">
                    {callFilter === 'missed'
                      ? 'You have no missed voice or video calls.'
                      : 'Start a voice or video call over the internet with any ZOLO contact.'}
                  </p>
                </div>
              ) : (
                filteredCallLogs.map((log) => {
                  const isMissed = log.direction === 'missed';
                  const statusLabel = isMissed
                    ? log.outcome === 'rejected'
                      ? `Declined ${log.type === 'video' ? 'video' : 'voice'} call`
                      : `Missed ${log.type === 'video' ? 'video' : 'voice'} call`
                    : log.direction === 'incoming'
                    ? `Incoming ${log.type === 'video' ? 'video' : 'voice'} call`
                    : log.outcome && log.outcome !== 'answered'
                    ? `Outgoing (${log.outcome === 'rejected' ? 'Declined' : 'No answer'})`
                    : `Outgoing ${log.type === 'video' ? 'video' : 'voice'} call`;

                  return (
                    <div
                      key={log.id}
                      onClick={() => onStartCall(log.contactId, log.type, log.peerPhone)}
                      className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-colors ${
                        isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-700 shrink-0">
                          {log.contactAvatar ? (
                            <img
                              src={log.contactAvatar}
                              alt={log.contactName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-white bg-emerald-800">
                              {log.contactName[0]}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <h4
                            className={`text-sm font-semibold truncate ${
                              isMissed ? 'text-rose-500' : ''
                            }`}
                          >
                            {log.contactName}
                          </h4>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                            {log.direction === 'incoming' && (
                              <PhoneIncoming className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                            {log.direction === 'outgoing' && (
                              <PhoneOutgoing className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            )}
                            {isMissed && (
                              <PhoneMissed className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            )}
                            <span className={isMissed ? 'text-rose-400/90 font-medium' : ''}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span>{log.timestamp}</span>
                            {log.duration && <span> · {log.duration}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartCall(log.contactId, 'audio', log.peerPhone);
                          }}
                          className="p-2 rounded-full hover:bg-slate-700/20 text-[#00a884]"
                          title={`Voice call ${log.contactName}`}
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartCall(log.contactId, 'video', log.peerPhone);
                          }}
                          className="p-2 rounded-full hover:bg-slate-700/20 text-[#00a884]"
                          title={`Video call ${log.contactName}`}
                        >
                          <Video className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* D. STARRED MESSAGES SUBPANEL */}
        {activeTab === 'starred' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-700/20 flex items-center justify-between">
              <h3 className="text-lg font-bold">Starred Messages</h3>
              <span className="text-xs text-slate-400 font-medium">
                {starredMessagesList.length} starred
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {starredMessagesList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No starred messages yet. Hover over any message and click the star icon to save it here!
                </div>
              ) : (
                starredMessagesList.map(({ message, contact }) => (
                  <div
                    key={message.id}
                    onClick={() => onSelectContact(contact.id)}
                    className={`p-3 rounded-2xl cursor-pointer border transition-colors ${
                      isDark ? 'bg-[#202c33] border-slate-700/40 hover:bg-[#2a3942]' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                      <span className="font-semibold text-[#00a884]">{contact.name}</span>
                      <span>{message.timestamp}</span>
                    </div>
                    <p className="text-sm line-clamp-2">{message.text || `[${message.mediaType}]`}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* E. ARCHIVED CHATS SUBPANEL */}
        {activeTab === 'archived' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-700/20 flex items-center justify-between">
              <h3 className="text-lg font-bold">Archived Chats</h3>
              <button
                onClick={() => setActiveTab('chats')}
                className="text-xs text-[#00a884] font-semibold hover:underline"
              >
                Back to Chats
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {visibleContacts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No archived chats. Hover over any conversation and click the Archive icon to archive it.
                </div>
              ) : (
                visibleContacts.map((contact) => (
                  <div
                    key={contact.id}
                    onClick={() => onSelectContact(contact.id)}
                    className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer ${
                      isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-700">
                        {contact.avatar ? (
                          <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-white bg-emerald-800">
                            {contact.name[0]}
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">{contact.name}</h4>
                        <p className="text-xs text-slate-400">{contact.about}</p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleArchive(contact.id);
                      }}
                      className="p-2 text-xs font-semibold text-[#00a884] hover:underline"
                    >
                      Unarchive
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* F. SETTINGS SUBPANEL */}
        {activeTab === 'settings' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-700/20">
              <h3 className="text-lg font-bold">Settings</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Profile Card Form */}
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative group shrink-0">
                    <button
                      type="button"
                      onClick={() => settingsFileInputRef.current?.click()}
                      className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]"
                      title="Change profile photo"
                    >
                      <UserAvatar
                        src={currentUser.avatar}
                        name={currentUser.name}
                        className="w-16 h-16 border-2 border-[#00a884] shadow-md"
                        textClassName="text-xl"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow">
                        {uploadingProfileAvatar ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Camera className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </button>
                    <input
                      ref={settingsFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleSettingsAvatarChosen}
                      className="hidden"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-base truncate">{currentUser.name}</h4>
                    <p className="text-xs text-[#00a884] font-medium tabular-nums truncate">
                      {currentUser.phone}
                    </p>
                    <p className="text-[11px] text-slate-400">Mobile Username</p>
                    {currentUser.avatar && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (authUser) {
                            const res = await authApi.updateProfile({ avatarUrl: null });
                            onAuthUserUpdated?.(res.user);
                          }
                          onUpdateProfile({ avatar: '' });
                        }}
                        className="text-[11px] text-rose-400 hover:underline mt-0.5"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>

                {profileError && (
                  <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-500/30 rounded-lg px-3 py-2">
                    {profileError}
                  </p>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm outline-none border ${
                      isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
                    } focus:border-[#00a884]`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    About
                  </label>
                  <input
                    type="text"
                    value={editAbout}
                    onChange={(e) => setEditAbout(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm outline-none border ${
                      isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
                    } focus:border-[#00a884]`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : saveSuccess ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Profile Saved!</span>
                    </>
                  ) : (
                    <span>Save Profile Changes</span>
                  )}
                </button>
              </form>

              {/* Toggles */}
              <div className="space-y-3 pt-3 border-t border-slate-700/30">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Preferences
                </div>

                {/* Theme Selector */}
                <div
                  className={`flex items-center justify-between p-3 rounded-xl ${
                    isDark ? 'bg-[#202c33]/60' : 'bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isDark ? (
                      <Moon className="w-5 h-5 text-indigo-400" />
                    ) : (
                      <Sun className="w-5 h-5 text-amber-500" />
                    )}
                    <div>
                      <div className="text-sm font-semibold">Appearance</div>
                      <div className="text-xs text-slate-400">
                        {isDark ? 'Dark mode enabled' : 'Light mode enabled'}
                      </div>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 p-1 rounded-lg ${isDark ? 'bg-black/30' : 'bg-slate-200/70'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isDark) onToggleTheme();
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-all ${
                        !isDark
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5 text-amber-500" />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isDark) onToggleTheme();
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-all ${
                        isDark
                          ? 'bg-[#00a884] text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark</span>
                    </button>
                  </div>
                </div>

                {/* Sound Effects Toggle */}
                <div
                  onClick={() => onUpdateProfile({ soundEnabled: !currentUser.soundEnabled })}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${
                    isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {currentUser.soundEnabled ? (
                      <Volume2 className="w-5 h-5 text-[#00a884]" />
                    ) : (
                      <VolumeX className="w-5 h-5 text-slate-400" />
                    )}
                    <div>
                      <div className="text-sm font-semibold">Message & Call Sounds</div>
                      <div className="text-xs text-slate-400">Synthesized WhatsApp chimes</div>
                    </div>
                  </div>
                  <div
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                      currentUser.soundEnabled ? 'bg-[#00a884]' : 'bg-slate-600'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${
                        currentUser.soundEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* Desktop Notifications Toggle */}
                <div
                  onClick={async () => {
                    if (typeof window !== 'undefined' && 'Notification' in window) {
                      const res = await requestBrowserNotificationPermission();
                      setDesktopNotifPermission(res);
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${
                    isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-[#00a884]" />
                    <div>
                      <div className="text-sm font-semibold">Desktop Notifications</div>
                      <div className="text-xs text-slate-400">
                        {desktopNotifPermission === 'granted'
                          ? 'Real-time alerts for messages & status'
                          : desktopNotifPermission === 'denied'
                          ? 'Blocked in browser permissions'
                          : 'Click to enable real-time notifications'}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      desktopNotifPermission === 'granted'
                        ? 'bg-[#00a884]/20 text-[#00a884]'
                        : desktopNotifPermission === 'denied'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-[#00a884] text-white hover:bg-[#008f72]'
                    }`}
                  >
                    {desktopNotifPermission === 'granted'
                      ? 'Enabled'
                      : desktopNotifPermission === 'denied'
                      ? 'Blocked'
                      : 'Enable'}
                  </div>
                </div>

                {/* Enter is Send Toggle */}
                <div
                  onClick={() => onUpdateProfile({ enterIsSend: !currentUser.enterIsSend })}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${
                    isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CornerDownRight className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="text-sm font-semibold">Enter is Send</div>
                      <div className="text-xs text-slate-400">Pressing Enter sends message</div>
                    </div>
                  </div>
                  <div
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                      currentUser.enterIsSend ? 'bg-[#00a884]' : 'bg-slate-600'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${
                        currentUser.enterIsSend ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* Read Receipts */}
                <div
                  onClick={() => onUpdateProfile({ readReceipts: !currentUser.readReceipts })}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${
                    isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CheckCheck className="w-5 h-5 text-[#53bdeb]" />
                    <div>
                      <div className="text-sm font-semibold">Read Receipts</div>
                      <div className="text-xs text-slate-400">Show blue checkmarks</div>
                    </div>
                  </div>
                  <div
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                      currentUser.readReceipts ? 'bg-[#00a884]' : 'bg-slate-600'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${
                        currentUser.readReceipts ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Account Security, Verified Phone Change, & Session Logout */}
              {authUser && onAuthUserUpdated && onLoggedOut && (
                <AccountSecurityPanel
                  authUser={authUser}
                  isDark={isDark}
                  onUserUpdated={onAuthUserUpdated}
                  onLoggedOut={onLoggedOut}
                />
              )}

              {/* Reset Conversation Demo Data */}
              <div className="pt-4 border-t border-slate-700/30">
                {!confirmingReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-600/40 text-slate-400 hover:bg-slate-700/20 text-xs font-semibold transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reset Starter Conversations</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(false)}
                      className="flex-1 py-2 rounded-xl border border-slate-700 text-xs text-slate-400"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingReset(false);
                        onResetData();
                      }}
                      className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                    >
                      Confirm Reset
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Cropper for Settings Profile Photo */}
      {cropProfileFile && (
        <AvatarCropperModal
          imageFile={cropProfileFile}
          isDark={isDark}
          onCancel={() => setCropProfileFile(null)}
          onConfirmCrop={(blob) => handleConfirmSettingsCrop(blob)}
        />
      )}

      {/* Profile Avatar Picker Modal */}
      {isProfileAvatarPickerOpen && (
        <AvatarPickerModal
          title="Profile Photo"
          currentAvatar={currentUser.avatar}
          initialsFallback={currentUser.name[0]}
          theme={theme}
          onClose={() => setIsProfileAvatarPickerOpen(false)}
          onSaveAvatar={(newAvatar) => {
            onUpdateProfile({ avatar: newAvatar });
          }}
          onRemoveAvatar={() => {
            onUpdateProfile({ avatar: '' });
          }}
        />
      )}
    </div>
  );
};
