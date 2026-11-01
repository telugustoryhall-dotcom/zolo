import React, { useState } from 'react';
import { StatusStory, UserProfile } from '../types/chat';
import { X, Type, Image as ImageIcon, Send, Palette } from 'lucide-react';

interface StatusCreatorModalProps {
  currentUser?: UserProfile;
  onClose: () => void;
  onAddStatus: (status: StatusStory) => void;
}

const BG_COLORS = [
  '#005c4b', // WhatsApp Dark Emerald
  '#128c7e', // Classic Teal
  '#0d47a1', // Deep Blue
  '#4a148c', // Deep Purple
  '#b71c1c', // Crimson
  '#e65100', // Deep Orange
  '#212121', // Onyx
];

export const StatusCreatorModal: React.FC<StatusCreatorModalProps> = ({
  currentUser,
  onClose,
  onAddStatus,
}) => {
  const [tab, setTab] = useState<'text' | 'image'>('text');
  const [textContent, setTextContent] = useState('');
  const [selectedBg, setSelectedBg] = useState(BG_COLORS[0]);
  const [caption, setCaption] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePublish = () => {
    if (tab === 'text' && !textContent.trim()) return;
    if (tab === 'image' && !previewImage) return;

    const newStory: StatusStory = {
      id: `st_user_${Date.now()}`,
      contactId: 'user',
      contactName: currentUser?.name ? `${currentUser.name} (My Status)` : 'My Status',
      contactAvatar: currentUser?.avatar || '',
      timestamp: 'Just now',
      timestampRaw: Date.now(),
      type: tab,
      text: tab === 'text' ? textContent.trim() : undefined,
      mediaUrl: tab === 'image' && previewImage ? previewImage : undefined,
      caption: tab === 'image' ? caption.trim() : undefined,
      bgColor: tab === 'text' ? selectedBg : undefined,
      viewed: true,
    };

    onAddStatus(newStory);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#111b21] border border-slate-800 text-white overflow-hidden shadow-2xl flex flex-col h-[520px]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTab('text')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'text' ? 'bg-[#00a884] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Type className="w-4 h-4" />
              Text Status
            </button>
            <button
              onClick={() => setTab('image')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'image' ? 'bg-[#00a884] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Photo Status
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative flex flex-col overflow-hidden">
          {tab === 'text' ? (
            <div
              style={{ backgroundColor: selectedBg }}
              className="w-full h-full flex flex-col items-center justify-center p-8 transition-colors duration-300"
            >
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Type a status..."
                rows={4}
                className="w-full bg-transparent text-center text-2xl sm:text-3xl font-bold placeholder-white/60 text-white resize-none outline-none"
                autoFocus
              />

              {/* Color picker pills */}
              <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-2">
                <Palette className="w-4 h-4 text-white/70 mr-1" />
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    style={{ backgroundColor: c }}
                    onClick={() => setSelectedBg(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      selectedBg === c ? 'border-white scale-125' : 'border-transparent hover:scale-110'
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-900">
              {previewImage ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="max-h-[260px] object-contain rounded-lg"
                  />
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption..."
                    className="mt-4 w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#00a884]"
                  />
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-3 cursor-pointer p-8 border-2 border-dashed border-slate-700 rounded-2xl hover:border-slate-500 transition-colors w-full h-64">
                  <ImageIcon className="w-12 h-12 text-slate-400" />
                  <span className="text-sm font-medium text-slate-300">Click to upload photo for Status</span>
                  <span className="text-xs text-slate-500">Supports JPG, PNG, WebP</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer / Publish Button */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-[#111b21]">
          <span className="text-xs text-slate-400">
            Visible to your contacts for 24 hours
          </span>
          <button
            onClick={handlePublish}
            disabled={tab === 'text' ? !textContent.trim() : !previewImage}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#00a884]/20"
          >
            <span>Share</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
