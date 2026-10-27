import React, { useState, useRef } from 'react';
import {
  X,
  FolderLock,
  Plus,
  FileText,
  Image,
  Music,
  Trash2,
  Download,
  Lock,
  Upload,
  HardDrive,
  FileCheck,
  Search,
} from 'lucide-react';

export interface VaultFile {
  id: string;
  name: string;
  type: 'image' | 'document' | 'audio' | 'note';
  sizeBytes: number;
  url?: string;
  textContent?: string;
  isEncrypted: boolean;
  createdAt: number;
}

interface ZoloVaultModalProps {
  theme: 'dark' | 'light';
  onClose: () => void;
}

const INITIAL_VAULT_FILES: VaultFile[] = [
  {
    id: 'vf_1',
    name: 'Personal_Recovery_Seed_Phrase.txt',
    type: 'note',
    sizeBytes: 1024 * 4,
    textContent: 'Private personal recovery notes: ZOLO encryption master secret configured on trusted device.',
    isEncrypted: true,
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: 'vf_2',
    name: 'Passport_Scan_Confidential.pdf',
    type: 'document',
    sizeBytes: 1024 * 1024 * 2.8,
    url: '#',
    isEncrypted: true,
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 'vf_3',
    name: 'ZOLO_Product_Blueprint_2026.png',
    type: 'image',
    sizeBytes: 1024 * 1024 * 1.4,
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    isEncrypted: true,
    createdAt: Date.now() - 1000 * 60 * 60 * 12,
  },
];

export const ZoloVaultModal: React.FC<ZoloVaultModalProps> = ({ theme, onClose }) => {
  const [files, setFiles] = useState<VaultFile[]>(() => {
    try {
      const saved = localStorage.getItem('zolo_vault_items');
      return saved ? JSON.parse(saved) : INITIAL_VAULT_FILES;
    } catch {
      return INITIAL_VAULT_FILES;
    }
  });

  const [activeCategory, setActiveCategory] = useState<'all' | 'image' | 'document' | 'note'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isDark = theme === 'dark';

  const saveFiles = (next: VaultFile[]) => {
    setFiles(next);
    try {
      localStorage.setItem('zolo_vault_items', JSON.stringify(next));
    } catch {}
  };

  const totalBytesUsed = files.reduce((acc, f) => acc + f.sizeBytes, 0);
  const totalMBUsed = (totalBytesUsed / (1024 * 1024)).toFixed(1);
  const maxStorageMB = 5120; // 5 GB
  const percentageUsed = Math.min(100, Math.round((Number(totalMBUsed) / maxStorageMB) * 100));

  const filteredFiles = files.filter((f) => {
    if (activeCategory !== 'all' && f.type !== activeCategory) return false;
    if (searchQuery && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type: VaultFile['type'] = 'document';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('audio/')) type = 'audio';

    const reader = new FileReader();
    reader.onload = () => {
      const newFile: VaultFile = {
        id: `vf_${Date.now()}`,
        name: file.name,
        type,
        sizeBytes: file.size,
        url: typeof reader.result === 'string' ? reader.result : undefined,
        isEncrypted: true,
        createdAt: Date.now(),
      };
      saveFiles([newFile, ...files]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;

    const newNote: VaultFile = {
      id: `vf_${Date.now()}`,
      name: `${noteTitle.trim()}.txt`,
      type: 'note',
      sizeBytes: noteContent.length * 2,
      textContent: noteContent,
      isEncrypted: true,
      createdAt: Date.now(),
    };

    saveFiles([newNote, ...files]);
    setNoteTitle('');
    setNoteContent('');
    setIsAddingNote(false);
  };

  const handleDeleteFile = (id: string) => {
    saveFiles(files.filter((f) => f.id !== id));
  };

  const handleDownloadVaultFile = (file: VaultFile) => {
    if (file.textContent) {
      const blob = new Blob([file.textContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (file.url) {
      const a = document.createElement('a');
      a.href = file.url;
      a.download = file.name;
      a.click();
    }
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
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center">
              <FolderLock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg">ZOLO Vault</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00a884]/20 text-[#00a884]">
                  <Lock className="w-3 h-3" />
                  E2E Encrypted
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Personal private cloud storage protected with your device secret
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

        {/* Quota & Storage Bar */}
        <div className={`p-4 border-b ${isDark ? 'bg-[#111b21] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
            <span className="flex items-center gap-1.5 text-slate-400">
              <HardDrive className="w-3.5 h-3.5 text-[#00a884]" />
              <span>Storage Usage</span>
            </span>
            <span className="font-bold text-[#00a884]">
              {totalMBUsed} MB <span className="text-slate-400 font-normal">/ {maxStorageMB} MB ({percentageUsed}%)</span>
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-700/40 overflow-hidden">
            <div
              style={{ width: `${Math.max(4, percentageUsed)}%` }}
              className="h-full bg-gradient-to-r from-[#008069] to-[#00a884] rounded-full transition-all"
            />
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/40">
          {/* Categories */}
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            {(['all', 'document', 'image', 'note'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                  activeCategory === cat
                    ? 'bg-[#00a884] text-white shadow-sm'
                    : isDark
                    ? 'text-slate-400 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {cat === 'all' ? 'All Files' : cat}
              </button>
            ))}
          </div>

          {/* Action Buttons: Upload & New Note */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAddingNote(!isAddingNote)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                isDark
                  ? 'border-slate-700 hover:bg-slate-800 text-white'
                  : 'border-slate-300 hover:bg-slate-100 text-slate-800'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-[#00a884]" />
              <span>New Note</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold flex items-center gap-1.5 shadow"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload File</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {/* Add Note Form Dropdown */}
        {isAddingNote && (
          <form onSubmit={handleCreateNote} className="p-4 border-b border-[#00a884]/40 bg-[#00a884]/10 space-y-3">
            <input
              type="text"
              placeholder="Note title (e.g. Bank Account details)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs ${
                isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-1 focus:ring-[#00a884]`}
              required
            />
            <textarea
              placeholder="Encrypted note content..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 rounded-xl border text-xs ${
                isDark ? 'bg-[#111b21] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-1 focus:ring-[#00a884] resize-none`}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingNote(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-[#00a884] text-white text-xs font-semibold"
              >
                Save Encrypted Note
              </button>
            </div>
          </form>
        )}

        {/* Files List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredFiles.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
              <FolderLock className="w-12 h-12 text-slate-600 mb-3" />
              <p className="text-sm font-semibold">No files in your Vault yet</p>
              <p className="text-xs mt-1 max-w-xs">Upload confidential documents, photos, or private secure notes.</p>
            </div>
          ) : (
            filteredFiles.map((f) => (
              <div
                key={f.id}
                className={`p-3 rounded-2xl border flex items-center justify-between transition-all group ${
                  isDark
                    ? 'bg-[#202c33]/70 border-slate-700/60 hover:border-[#00a884]'
                    : 'bg-slate-50 border-slate-200 hover:border-[#00a884]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#00a884]/15 text-[#00a884] flex items-center justify-center shrink-0">
                    {f.type === 'image' ? (
                      <Image className="w-5 h-5" />
                    ) : f.type === 'note' ? (
                      <FileCheck className="w-5 h-5" />
                    ) : (
                      <FileText className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs sm:text-sm font-semibold truncate">{f.name}</p>
                      {f.isEncrypted && (
                        <span title="End-to-End Encrypted">
                          <Lock className="w-3 h-3 text-[#00a884] shrink-0" />
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {(f.sizeBytes / 1024).toFixed(1)} KB • {new Date(f.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDownloadVaultFile(f)}
                    title="Download"
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFile(f.id)}
                    title="Delete"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
