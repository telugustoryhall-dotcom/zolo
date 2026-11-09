import React, { useEffect, useState } from 'react';
import { StatusStory, UserProfile } from '../types/chat';
import { X, Type, Image as ImageIcon, Send, Palette, Video, Loader2 } from 'lucide-react';
import { authApi } from '../utils/authApi';

interface StatusCreatorModalProps {
  currentUser?: UserProfile;
  isAuthenticated?: boolean;
  onClose: () => void;
  onAddStatus: (status: StatusStory) => Promise<void>;
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
  isAuthenticated = false,
  onClose,
  onAddStatus,
}) => {
  const [tab, setTab] = useState<'text' | 'image' | 'video'>('text');
  const [textContent, setTextContent] = useState('');
  const [selectedBg, setSelectedBg] = useState(BG_COLORS[0]);
  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if ((tab === 'image' && !isImage) || (tab === 'video' && !isVideo)) {
      setError(tab === 'image' ? 'Choose a supported image file.' : 'Choose a supported video file.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('Status media must be 25 MB or smaller.');
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const handlePublish = async () => {
    if (tab === 'text' && !textContent.trim()) return;
    if (tab !== 'text' && !selectedFile) return;
    setIsPublishing(true);
    setError(null);
    try {
      const upload = isAuthenticated && selectedFile
        ? await authApi.uploadAttachment(selectedFile)
        : null;

    const newStory: StatusStory = {
      id: `st_user_${Date.now()}`,
      contactId: 'user',
      contactName: currentUser?.name ? `${currentUser.name} (My Status)` : 'My Status',
      contactAvatar: currentUser?.avatar || '',
      timestamp: 'Just now',
      timestampRaw: Date.now(),
      type: tab,
      text: tab === 'text' ? textContent.trim() : undefined,
      mediaUrl: tab !== 'text' ? upload?.url || previewUrl || undefined : undefined,
      caption: tab !== 'text' ? caption.trim() : undefined,
      bgColor: tab === 'text' ? selectedBg : undefined,
      viewed: true,
    };

      await onAddStatus(newStory);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish status. Please try again.');
    } finally {
      setIsPublishing(false);
    }
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
            <button
              onClick={() => setTab('video')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'video' ? 'bg-[#00a884] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              Video
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
              {previewUrl ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  {tab === 'video' ? (
                    <video src={previewUrl} controls className="max-h-[260px] max-w-full rounded-lg" />
                  ) : (
                    <img src={previewUrl} alt="Preview" className="max-h-[260px] object-contain rounded-lg" />
                  )}
                  <div className="mt-2 text-xs text-slate-400 truncate max-w-full">{selectedFile?.name}</div>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption..."
                    className="mt-4 w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#00a884]"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="mt-2 text-xs text-rose-300 hover:text-rose-200"
                  >
                    Remove media
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-3 cursor-pointer p-8 border-2 border-dashed border-slate-700 rounded-2xl hover:border-slate-500 transition-colors w-full h-64">
                  {tab === 'video' ? <Video className="w-12 h-12 text-slate-400" /> : <ImageIcon className="w-12 h-12 text-slate-400" />}
                  <span className="text-sm font-medium text-slate-300">Choose a {tab} for your Status</span>
                  <span className="text-xs text-slate-500">Maximum file size: 25 MB</span>
                  <input
                    type="file"
                    accept={tab === 'video' ? 'video/*' : 'image/*'}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
              {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
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
            disabled={isPublishing || (tab === 'text' ? !textContent.trim() : !selectedFile)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#00a884]/20"
          >
            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{isPublishing ? 'Uploading...' : 'Share'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
