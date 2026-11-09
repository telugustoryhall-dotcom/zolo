import React, { useEffect, useState } from 'react';
import { Contact } from '../types/chat';
import { X, Users, Check, ArrowRight, Camera, Search, Loader2 } from 'lucide-react';
import { AvatarPickerModal } from './AvatarPickerModal';
import { authApi } from '../utils/authApi';
import type { ZoloPeerProfile } from '../types/auth';

interface NewGroupModalProps {
  contacts: Contact[];
  theme: 'dark' | 'light';
  isAuthenticated?: boolean;
  onClose: () => void;
  onCreateGroup: (groupName: string, selectedContactIds: string[], groupAvatar?: string) => Promise<void>;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({
  contacts,
  theme,
  isAuthenticated = false,
  onClose,
  onCreateGroup,
}) => {
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ZoloPeerProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isAuthenticated || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const result = await authApi.searchZoloDirectory(searchQuery.trim());
        if (active) setSearchResults(result.users);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not search ZOLO users.');
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isAuthenticated, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedIds.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      await onCreateGroup(groupName.trim(), selectedIds, groupAvatar);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the group.');
    } finally {
      setCreating(false);
    }
  };

  const directContacts = contacts.filter(
    (contact) => !contact.isGroup && contact.id !== 'c5' &&
      (!isAuthenticated || (contact.isRegisteredZoloUser && Boolean(contact.phoneNormalized)))
  );
  const directoryContacts: Contact[] = searchResults.map((user) => ({
    id: user.phoneNormalized,
    name: user.fullName,
    phone: user.phoneNormalized,
    phoneNormalized: user.phoneNormalized,
    isRegisteredZoloUser: true,
    avatar: user.avatarUrl || '',
    about: user.about,
    online: Boolean(user.online),
    lastSeen: user.lastSeen || 'recently on ZOLO',
    unreadCount: 0,
  }));
  const listedContacts = [
    ...directContacts,
    ...directoryContacts.filter((directoryContact) =>
      !directContacts.some((contact) => contact.phoneNormalized === directoryContact.phoneNormalized)
    ),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[580px] border ${
          isDark
            ? 'bg-[#111b21] border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isDark ? 'bg-[#202c33] border-slate-700' : 'bg-[#008069] text-white border-emerald-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#00a884] dark:text-[#00a884]" />
            <h3 className="font-semibold text-base">New Group</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Group Name & Avatar input */}
        <div className="p-4 border-b border-slate-700/40 flex items-center gap-4">
          {/* Group Avatar Trigger */}
          <div
            onClick={() => setIsAvatarPickerOpen(true)}
            className="relative w-14 h-14 rounded-full overflow-hidden bg-slate-700 shrink-0 cursor-pointer group border-2 border-dashed border-[#00a884]/60 hover:border-[#00a884] transition-colors"
            title="Click to set group image"
          >
            {groupAvatar ? (
              <img src={groupAvatar} alt="Group avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                <Camera className="w-5 h-5" />
                <span className="text-[8px] uppercase font-bold">Add</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
              <Camera className="w-4 h-4" />
            </div>
          </div>

          <div className="flex-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Group Subject
            </label>
            <input
              type="text"
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Type group subject..."
              className={`w-full px-3 py-2 rounded-lg text-sm outline-none border ${
                isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
              } focus:border-[#00a884]`}
              autoFocus
            />
          </div>
        </div>

        {/* Contacts selector list */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className={`flex items-center gap-2 px-3 py-2 mb-3 rounded-xl border ${
            isDark ? 'bg-[#202c33] border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}>
            {searching ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <Search className="w-4 h-4 text-slate-400" />}
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search registered ZOLO users"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          {isAuthenticated && searchQuery.trim().length < 2 && (
            <p className="mb-3 px-2 text-xs text-slate-400">Type at least 2 characters to search the ZOLO directory.</p>
          )}
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-2 mb-2">
            <span>SELECT PARTICIPANTS</span>
            <span>{selectedIds.length} selected</span>
          </div>

          <div className="flex flex-col gap-1">
            {listedContacts.map((contact) => {
              const phone = contact.phoneNormalized || contact.phone;
              const isSelected = selectedIds.includes(phone);
              return (
                <div
                  key={phone}
                  onClick={() => toggleSelect(phone)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? isDark
                        ? 'bg-[#00a884]/20 border border-[#00a884]/40'
                        : 'bg-emerald-50 border border-emerald-300'
                      : isDark
                      ? 'hover:bg-[#202c33]'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-700 shrink-0">
                      {contact.avatar ? (
                        <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-white bg-emerald-800">
                          {contact.name[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{contact.name}</div>
                      <div className="text-xs text-slate-400">{contact.phone}</div>
                    </div>
                    {error && <p role="alert" className="mt-3 px-2 text-xs text-rose-400">{error}</p>}
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-[#00a884] border-[#00a884] text-white'
                        : 'border-slate-500'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/40 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedIds.length === 0 || creating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            <span>{creating ? 'Creating...' : 'Create Group'}</span>
          </button>
        </div>
      </div>

      {/* Group Avatar Picker Modal */}
      {isAvatarPickerOpen && (
        <AvatarPickerModal
          title="Group Image"
          currentAvatar={groupAvatar}
          initialsFallback={groupName ? groupName[0] : 'G'}
          theme={theme}
          onClose={() => setIsAvatarPickerOpen(false)}
          onSaveAvatar={(url) => setGroupAvatar(url)}
          onRemoveAvatar={() => setGroupAvatar('')}
        />
      )}
    </div>
  );
};
