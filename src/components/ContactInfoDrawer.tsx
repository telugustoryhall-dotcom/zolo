import React, { useState } from 'react';
import { Contact, Message, UserProfile } from '../types/chat';
import { AvatarPickerModal } from './AvatarPickerModal';
import { UserAvatar } from './UserAvatar';
import {
  X, Phone, Video, Bell, BellOff, Clock, Star, ShieldAlert,
  Image as ImageIcon, FileText, ChevronRight, Camera
} from 'lucide-react';

interface ContactInfoDrawerProps {
  contact: Contact;
  allContacts?: Contact[];
  currentUser?: UserProfile;
  messages: Message[];
  theme: 'dark' | 'light';
  onClose: () => void;
  onAudioCall: () => void;
  onVideoCall: () => void;
  onToggleMute: () => void;
  onUpdateDisappearing: (setting: 'off' | '24h' | '7d' | '90d') => void;
  onUpdateAvatar?: (contactId: string, newAvatar: string) => void;
}

export const ContactInfoDrawer: React.FC<ContactInfoDrawerProps> = ({
  contact,
  allContacts = [],
  currentUser,
  messages,
  theme,
  onClose,
  onAudioCall,
  onVideoCall,
  onToggleMute,
  onUpdateDisappearing,
  onUpdateAvatar,
}) => {
  const [showDisappearingOptions, setShowDisappearingOptions] = useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const isDark = theme === 'dark';

  const mediaMessages = messages.filter((m) => m.mediaType === 'image' && m.mediaUrl);
  const docMessages = messages.filter((m) => m.mediaType === 'document');
  const starredMessages = messages.filter((m) => m.isStarred);

  return (
    <div
      className={`w-80 md:w-96 border-l shrink-0 flex flex-col h-full overflow-hidden transition-all duration-300 ${
        isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Top Header */}
      <div
        className={`h-14 px-4 flex items-center justify-between border-b shrink-0 ${
          isDark ? 'bg-[#202c33] border-slate-700/60' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-700/30 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400 hover:text-white" />
          </button>
          <span className="font-semibold text-sm">
            {contact.isGroup ? 'Group Info' : 'Contact Info'}
          </span>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Header */}
        <div className={`p-6 flex flex-col items-center text-center border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          {contact.isGroup ? (
            /* Editable Group Avatar */
            <div
              onClick={() => onUpdateAvatar && setIsAvatarPickerOpen(true)}
              className="relative w-24 h-24 rounded-full overflow-hidden shadow-lg mb-3 bg-slate-700 cursor-pointer group"
              title="Click to change group image"
            >
              {contact.avatar ? (
                <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white bg-emerald-800">
                  {contact.name[0]}
                </div>
              )}

              {/* Camera hover badge overlay for group */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity">
                <Camera className="w-6 h-6 mb-0.5" />
                <span className="text-[9px] uppercase tracking-wider font-semibold">
                  Change Icon
                </span>
              </div>
            </div>
          ) : (
            /* Static Read-Only Avatar for Individual Contacts */
            <div className="relative w-24 h-24 rounded-full overflow-hidden shadow-lg mb-3 bg-slate-700 select-none">
              {contact.avatar ? (
                <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white bg-emerald-800">
                  {contact.name[0]}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 justify-center">
            <h3 className="text-lg font-bold">{contact.name}</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{contact.phone}</p>

          {/* Quick Call Actions */}
          <div className="flex items-center gap-6 mt-4">
            <button
              onClick={onAudioCall}
              className="flex flex-col items-center gap-1 group"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-600/20 text-[#00a884] flex items-center justify-center group-hover:bg-[#00a884] group-hover:text-white transition-colors">
                <Phone className="w-5 h-5" />
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Audio</span>
            </button>

            <button
              onClick={onVideoCall}
              className="flex flex-col items-center gap-1 group"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-600/20 text-[#00a884] flex items-center justify-center group-hover:bg-[#00a884] group-hover:text-white transition-colors">
                <Video className="w-5 h-5" />
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Video</span>
            </button>
          </div>
        </div>

        {/* About section */}
        <div className={`p-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            {contact.isGroup ? 'Group Description' : 'About'}
          </div>
          <div className="text-sm leading-relaxed">{contact.about}</div>
        </div>

        {/* Group Participants List showing User's Profile Picture */}
        {contact.isGroup && (
          <div className={`p-4 border-b space-y-2.5 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {(contact.groupMembers?.length || 0) + 1} Participants
            </div>
            {currentUser && (
              <div className="flex items-center justify-between gap-2.5 py-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar
                    src={currentUser.avatar}
                    name={currentUser.name}
                    className="w-9 h-9"
                    textClassName="text-xs"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{currentUser.name} (You)</div>
                    <div className="text-[11px] text-slate-400 truncate tabular-nums">
                      {currentUser.phone}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-[#00a884] font-medium shrink-0">Admin</span>
              </div>
            )}
            {(contact.groupMembers || []).map((memberId) => {
              const member = allContacts.find((c) => c.id === memberId);
              if (!member) return null;
              return (
                <div key={member.id} className="flex items-center gap-2.5 py-1">
                  <UserAvatar
                    src={member.avatar}
                    name={member.name}
                    className="w-9 h-9"
                    textClassName="text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{member.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{member.about}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Media, Links & Docs strip */}
        <div className={`p-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
            <span>MEDIA, LINKS AND DOCS</span>
            <span className="text-[#00a884] font-medium">{mediaMessages.length + docMessages.length} items</span>
          </div>

          {mediaMessages.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {mediaMessages.slice(0, 3).map((m) => (
                <div key={m.id} className="aspect-square rounded-lg overflow-hidden bg-slate-800">
                  <img src={m.mediaUrl} alt="media" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-2">No media shared yet</div>
          )}
        </div>

        {/* Settings rows */}
        <div className="flex flex-col">
          {/* Mute Notifications */}
          <div
            onClick={onToggleMute}
            className={`flex items-center justify-between p-4 cursor-pointer border-b transition-colors ${
              isDark ? 'border-slate-800 hover:bg-[#202c33]' : 'border-slate-100 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {contact.isMuted ? (
                <BellOff className="w-5 h-5 text-slate-400" />
              ) : (
                <Bell className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <div className="text-sm font-medium">Mute notifications</div>
                <div className="text-xs text-slate-400">{contact.isMuted ? 'Muted' : 'Unmuted'}</div>
              </div>
            </div>

            <div
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                contact.isMuted ? 'bg-[#00a884]' : 'bg-slate-600'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  contact.isMuted ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Disappearing Messages */}
          <div
            onClick={() => setShowDisappearingOptions(!showDisappearingOptions)}
            className={`flex items-center justify-between p-4 cursor-pointer border-b transition-colors ${
              isDark ? 'border-slate-800 hover:bg-[#202c33]' : 'border-slate-100 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400" />
              <div>
                <div className="text-sm font-medium">Disappearing messages</div>
                <div className="text-xs text-slate-400 capitalize">
                  {contact.disappearingMessages || 'Off'}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>

          {showDisappearingOptions && (
            <div className={`p-3 flex flex-col gap-1 border-b ${isDark ? 'bg-[#0b141a] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              {(['off', '24h', '7d', '90d'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    onUpdateDisappearing(opt);
                    setShowDisappearingOptions(false);
                  }}
                  className={`text-left px-3 py-1.5 text-xs rounded-md capitalize transition-colors ${
                    (contact.disappearingMessages || 'off') === opt
                      ? 'bg-[#00a884] text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt === 'off' ? 'Off' : `${opt} timer`}
                </button>
              ))}
            </div>
          )}

          {/* Starred Messages Count */}
          <div
            className={`flex items-center justify-between p-4 border-b ${
              isDark ? 'border-slate-800' : 'border-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-amber-400" />
              <div className="text-sm font-medium">Starred Messages</div>
            </div>
            <span className="text-xs font-semibold text-slate-400">{starredMessages.length}</span>
          </div>

          {/* Encryption statement */}
          <div className="p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-400 leading-relaxed">
              Messages and calls in this ZOLO conversation are end-to-end encrypted. No one outside of this chat can read or listen to them.
            </div>
          </div>
        </div>
      </div>

      {/* Avatar Picker Modal - Only for Groups */}
      {isAvatarPickerOpen && contact.isGroup && onUpdateAvatar && (
        <AvatarPickerModal
          title="Group Image"
          currentAvatar={contact.avatar}
          initialsFallback={contact.name[0]}
          theme={theme}
          onClose={() => setIsAvatarPickerOpen(false)}
          onSaveAvatar={(newAvatar) => {
            onUpdateAvatar(contact.id, newAvatar);
          }}
          onRemoveAvatar={() => {
            onUpdateAvatar(contact.id, '');
          }}
        />
      )}
    </div>
  );
};
