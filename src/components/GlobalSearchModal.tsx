import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  MessageSquare,
  Image,
  FileText,
  Link2,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import type { Contact, Message } from '../types/chat';

interface GlobalSearchModalProps {
  contacts: Contact[];
  messages: Record<string, Message[]>;
  theme: 'dark' | 'light';
  onClose: () => void;
  onSelectChat: (contactId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  contacts,
  messages,
  theme,
  onClose,
  onSelectChat,
}) => {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'text' | 'image' | 'document' | 'links'>('all');

  const isDark = theme === 'dark';

  // Compute search matches across all conversations
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: Array<{
      id: string;
      chatId: string;
      contactName: string;
      contactAvatar: string;
      text: string;
      mediaType?: string;
      timestamp: string;
      matchedText: string;
    }> = [];

    const contactsMap = new Map<string, Contact>();
    contacts.forEach((c) => contactsMap.set(c.id, c));

    Object.entries(messages).forEach(([chatId, chatMessages]) => {
      const contact = contactsMap.get(chatId) || {
        name: 'Chat',
        avatar: '',
      };

      chatMessages.forEach((msg) => {
        // Apply filter type
        if (filterType === 'image' && msg.mediaType !== 'image') return;
        if (filterType === 'document' && msg.mediaType !== 'document') return;
        if (filterType === 'links' && !msg.text.includes('http')) return;
        if (filterType === 'text' && msg.mediaType && msg.mediaType !== 'text') return;

        const hay = `${msg.text} ${msg.senderName} ${msg.mediaFileName || ''} ${contact.name}`.toLowerCase();
        if (hay.includes(q)) {
          results.push({
            id: msg.id,
            chatId,
            contactName: contact.name,
            contactAvatar: contact.avatar,
            text: msg.text || (msg.mediaType === 'image' ? 'Photo' : 'Attachment'),
            mediaType: msg.mediaType,
            timestamp: msg.timestamp,
            matchedText: msg.text,
          });
        }
      });
    });

    return results.slice(0, 50);
  }, [query, filterType, messages, contacts]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24 bg-black/75 backdrop-blur-sm animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-xl max-h-[75vh] rounded-3xl border flex flex-col overflow-hidden shadow-2xl ${
          isDark ? 'bg-[#182229] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Search Bar Input */}
        <div className="p-4 border-b border-slate-800/40 flex items-center gap-3">
          <Search className="w-5 h-5 text-[#00a884] shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search messages, shared files, links, or contacts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder-slate-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-slate-400 hover:text-white px-1.5 py-0.5 rounded"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="px-4 py-2 border-b border-slate-800/30 flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
          {(['all', 'text', 'image', 'document', 'links'] as const).map((ft) => (
            <button
              key={ft}
              type="button"
              onClick={() => setFilterType(ft)}
              className={`px-3 py-1 rounded-lg capitalize transition-all ${
                filterType === ft
                  ? 'bg-[#00a884] text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {ft === 'all' ? 'All Results' : ft}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!query.trim() ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
              <Search className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm font-semibold">Type to search ZOLO</p>
              <p className="text-xs max-w-xs mt-1">Search through your chats, photos, documents, and web links.</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
              <p className="text-sm font-semibold">No results found for "{query}"</p>
              <p className="text-xs mt-1">Try checking for typos or searching a different keyword.</p>
            </div>
          ) : (
            searchResults.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSelectChat(r.chatId);
                  onClose();
                }}
                className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition-colors ${
                  isDark
                    ? 'bg-[#202c33]/70 border-slate-700/60 hover:border-[#00a884] hover:bg-[#202c33]'
                    : 'bg-slate-50 border-slate-200 hover:border-[#00a884] hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center shrink-0">
                    {r.mediaType === 'image' ? (
                      <Image className="w-4 h-4" />
                    ) : r.mediaType === 'document' ? (
                      <FileText className="w-4 h-4" />
                    ) : (
                      <MessageSquare className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{r.contactName}</span>
                      <span className="text-[10px] text-slate-400">{r.timestamp}</span>
                    </div>
                    <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {r.text}
                    </p>
                  </div>
                </div>

                <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
