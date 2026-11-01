import React, { useState } from 'react';
import {
  X,
  Files,
  Image,
  FileText,
  Music,
  Link2,
  Download,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import type { Contact, Message } from '../types/chat';

interface SharedMediaModalProps {
  contacts: Contact[];
  messages: Record<string, Message[]>;
  theme: 'dark' | 'light';
  onClose: () => void;
  onOpenChat: (contactId: string) => void;
  onOpenImageModal: (url: string) => void;
}

export const SharedMediaModal: React.FC<SharedMediaModalProps> = ({
  contacts,
  messages,
  theme,
  onClose,
  onOpenChat,
  onOpenImageModal,
}) => {
  const [tab, setTab] = useState<'images' | 'documents' | 'audio' | 'links'>('images');
  const isDark = theme === 'dark';

  const contactsMap = new Map<string, Contact>();
  contacts.forEach((c) => contactsMap.set(c.id, c));

  const allMediaItems = Object.entries(messages).flatMap(([chatId, chatMessages]) => {
    const contact = contactsMap.get(chatId) || { name: 'Chat', avatar: '' };
    return chatMessages.map((m) => ({
      ...m,
      chatContactName: contact.name,
    }));
  });

  const images = allMediaItems.filter((m) => m.mediaType === 'image' && m.mediaUrl);
  const documents = allMediaItems.filter((m) => m.mediaType === 'document' || m.mediaFileName);
  const audios = allMediaItems.filter((m) => m.mediaType === 'audio');
  const links = allMediaItems.filter((m) => m.text && (m.text.includes('http://') || m.text.includes('https://')));

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
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center">
              <Files className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Shared Files &amp; Media Library</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Browse attachments across your conversations
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1.5 p-3 border-b border-slate-800/40 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('images')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              tab === 'images' ? 'bg-[#00a884] text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Image className="w-3.5 h-3.5" />
            <span>Photos ({images.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('documents')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              tab === 'documents' ? 'bg-[#00a884] text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Documents ({documents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('audio')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              tab === 'audio' ? 'bg-[#00a884] text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Audio &amp; Voice ({audios.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('links')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              tab === 'links' ? 'bg-[#00a884] text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Links ({links.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'images' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400">
                  <p className="text-sm font-semibold">No shared photos</p>
                </div>
              ) : (
                images.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => img.mediaUrl && onOpenImageModal(img.mediaUrl)}
                    className="relative group rounded-xl overflow-hidden aspect-square border border-slate-700/60 cursor-pointer bg-black/20"
                  >
                    <img
                      src={img.mediaUrl}
                      alt="Shared media"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-[11px] text-white">
                      <span className="truncate">{img.chatContactName}</span>
                      <span className="text-[10px] text-slate-300">{img.timestamp}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'documents' && (
            <div className="space-y-2">
              {documents.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm font-semibold">No shared documents</p>
                </div>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between ${
                      isDark ? 'bg-[#202c33]/70 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs truncate">
                          {doc.mediaFileName || 'Shared_Document.pdf'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {doc.mediaFileSize || '1.8 MB'} • in {doc.chatContactName}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onOpenChat(doc.chatId);
                        onClose();
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                      title="Jump to chat"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'audio' && (
            <div className="space-y-2">
              {audios.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm font-semibold">No voice notes or audio</p>
                </div>
              ) : (
                audios.map((aud) => (
                  <div
                    key={aud.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between ${
                      isDark ? 'bg-[#202c33]/70 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                        <Music className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-xs">Voice Message ({aud.audioDuration || 15}s)</p>
                        <p className="text-[11px] text-slate-400">From {aud.senderName} • {aud.timestamp}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onOpenChat(aud.chatId);
                        onClose();
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                      title="Jump to chat"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'links' && (
            <div className="space-y-2">
              {links.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm font-semibold">No shared web links</p>
                </div>
              ) : (
                links.map((lnk) => (
                  <div
                    key={lnk.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between ${
                      isDark ? 'bg-[#202c33]/70 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                        <Link2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs truncate text-[#00a884]">{lnk.text}</p>
                        <p className="text-[11px] text-slate-400">Shared in {lnk.chatContactName} • {lnk.timestamp}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onOpenChat(lnk.chatId);
                        onClose();
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                      title="Jump to chat"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
