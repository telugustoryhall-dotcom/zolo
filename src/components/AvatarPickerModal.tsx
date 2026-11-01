import React, { useState, useRef } from 'react';
import { X, Upload, Trash2, Camera, Check } from 'lucide-react';
import sarahAvatar from '../assets/images/skaarchat_avatar_sarah_1793026236800.jpg';
import alexAvatar from '../assets/images/skaarchat_avatar_alex_1793026237938.jpg';
import elenaAvatar from '../assets/images/skaarchat_avatar_elena_1793026238122.jpg';
import { ZOLO_LOGO_ASSET } from './ZoloLogo';

interface AvatarPickerModalProps {
  title: string;
  currentAvatar?: string;
  initialsFallback: string;
  theme: 'dark' | 'light';
  onClose: () => void;
  onSaveAvatar: (newAvatarUrl: string) => void;
  onRemoveAvatar: () => void;
}

const PRESET_AVATARS = [
  { label: 'Sarah (Studio)', url: sarahAvatar },
  { label: 'Alex (Glasses)', url: alexAvatar },
  { label: 'Elena (Executive)', url: elenaAvatar },
  { label: 'ZOLO Logo', url: ZOLO_LOGO_ASSET },
];

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  title,
  currentAvatar,
  initialsFallback,
  theme,
  onClose,
  onSaveAvatar,
  onRemoveAvatar,
}) => {
  const [preview, setPreview] = useState<string>(currentAvatar || '');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDark = theme === 'dark';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPreview(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    onSaveAvatar(preview);
    onClose();
  };

  const handleRemove = () => {
    setPreview('');
    onRemoveAvatar();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div
        className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl flex flex-col border ${
          isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700/30">
          <h3 className="font-semibold text-base">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col items-center gap-5">
          {/* Large Circular Avatar Preview */}
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-28 h-28 rounded-full overflow-hidden shadow-xl border-4 border-[#00a884] bg-slate-800 flex items-center justify-center">
              {preview ? (
                <img src={preview} alt="Avatar preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white bg-emerald-800">
                  {initialsFallback || 'G'}
                </div>
              )}
            </div>

            {/* Hover overlay with Camera */}
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity">
              <Camera className="w-7 h-7 mb-1" />
              <span className="text-[10px] font-semibold tracking-wide uppercase">Upload</span>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Action buttons: Upload File & Remove */}
          <div className="flex items-center gap-3 w-full">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold shadow-md transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Photo</span>
            </button>

            {preview && (
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center justify-center p-2 rounded-xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Remove photo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Preset Avatars */}
          <div className="w-full pt-2 border-t border-slate-700/30">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 text-center">
              Or pick a preset image
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AVATARS.map((preset, idx) => {
                const isSelected = preview === preset.url;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPreview(preset.url)}
                    className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-transform active:scale-95 ${
                      isSelected ? 'border-[#00a884] ring-2 ring-[#00a884]/40 scale-105' : 'border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/30 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold shadow-md transition-colors"
          >
            Save Photo
          </button>
        </div>
      </div>
    </div>
  );
};
