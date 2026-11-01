import React, { useState, useRef } from 'react';
import { Contact } from '../types/chat';
import { X, Users, Check, ArrowRight, Camera, Upload } from 'lucide-react';
import { AvatarPickerModal } from './AvatarPickerModal';

interface NewGroupModalProps {
  contacts: Contact[];
  theme: 'dark' | 'light';
  onClose: () => void;
  onCreateGroup: (groupName: string, selectedContactIds: string[], groupAvatar?: string) => void;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({
  contacts,
  theme,
  onClose,
  onCreateGroup,
}) => {
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const isDark = theme === 'dark';

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedIds.length === 0) return;
    onCreateGroup(groupName.trim(), selectedIds, groupAvatar);
    onClose();
  };

  const directContacts = contacts.filter((c) => !c.isGroup && c.id !== 'c5');

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
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-2 mb-2">
            <span>SELECT PARTICIPANTS</span>
            <span>{selectedIds.length} selected</span>
          </div>

          <div className="flex flex-col gap-1">
            {directContacts.map((contact) => {
              const isSelected = selectedIds.includes(contact.id);
              return (
                <div
                  key={contact.id}
                  onClick={() => toggleSelect(contact.id)}
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
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedIds.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
          >
            <span>Create Group</span>
            <ArrowRight className="w-4 h-4" />
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
