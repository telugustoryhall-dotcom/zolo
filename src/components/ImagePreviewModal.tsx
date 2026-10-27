import React, { useEffect, useState } from 'react';
import { Download, X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface ImagePreviewModalProps {
  imageUrl: string;
  imageAlt?: string;
  fileName?: string;
  theme?: 'dark' | 'light';
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  imageAlt = 'Full screen preview',
  fileName,
  theme = 'dark',
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle image download
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // If it's a blob URL or base64 data URL, we can trigger direct anchor download
      if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = fileName || `ZOLO_Image_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For remote URLs, fetch as blob first to avoid cross-origin navigation
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName || `ZOLO_Image_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      // Fallback simple link click
      const link = document.createElement('a');
      link.href = imageUrl;
      link.target = '_blank';
      link.download = fileName || `ZOLO_Image_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/95 backdrop-blur-md transition-opacity duration-200 select-none animate-in fade-in"
    >
      {/* Top Action Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-3.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-10"
      >
        {/* File Name / Title */}
        <div className="flex items-center gap-3 text-white">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00a884] shadow-sm shadow-[#00a884]/50 animate-pulse" />
          <span className="text-sm font-medium tracking-wide truncate max-w-[200px] sm:max-w-md">
            {fileName || 'ZOLO Media Preview'}
          </span>
        </div>

        {/* Controls: Zoom, Rotate, Download, Close */}
        <div className="flex items-center gap-2">
          {/* Zoom Out */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScale((prev) => Math.max(0.5, prev - 0.25));
            }}
            title="Zoom out"
            aria-label="Zoom out"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <ZoomOut className="w-5 h-5" />
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScale((prev) => Math.min(3, prev + 0.25));
            }}
            title="Zoom in"
            aria-label="Zoom in"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          {/* Rotate */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRotation((prev) => (prev + 90) % 360);
            }}
            title="Rotate"
            aria-label="Rotate image"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            title="Download image"
            aria-label="Download image"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00a884] hover:bg-[#008f72] active:bg-[#007a62] text-white font-medium text-xs sm:text-sm shadow-lg shadow-[#00a884]/20 active:scale-95 transition-all"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
          </button>

          <div className="w-[1px] h-6 bg-white/20 mx-1" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close image preview"
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Display */}
      <div
        className="flex-1 w-full flex items-center justify-center p-4 overflow-hidden"
        onClick={onClose}
      >
        <img
          src={imageUrl}
          alt={imageAlt}
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.18s ease-out',
          }}
          className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl cursor-default"
        />
      </div>

      {/* Bottom hint bar */}
      <div className="py-2.5 px-4 text-xs text-slate-400 font-medium">
        <span>Click anywhere outside or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200">Esc</kbd> to close</span>
      </div>
    </div>
  );
};
