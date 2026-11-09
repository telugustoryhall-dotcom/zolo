import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { MediaDownloadButton } from './MediaDownloadButton';

interface ImageMediaViewerProps {
  images: Array<{ url: string; fileName: string }>;
  initialIndex: number;
  onClose: () => void;
}

export const ImageMediaViewer: React.FC<ImageMediaViewerProps> = ({
  images,
  initialIndex,
  onClose,
}) => {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const image = images[index];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(images.length - 1, value + 1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, onClose]);

  useEffect(() => setZoom(1), [index]);

  if (!image) return null;

  const changeIndex = (amount: number) => {
    setIndex((value) => Math.max(0, Math.min(images.length - 1, value + amount)));
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-3 text-white"
      onClick={onClose}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const distance = event.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(distance) > 60) changeIndex(distance < 0 ? 1 : -1);
        touchStartX.current = null;
      }}
    >
      <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between">
        <span className="max-w-[65vw] truncate text-xs text-white/80">{image.fileName}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.max(1, value - 0.25)); }} className="rounded-full bg-white/10 p-2" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.min(4, value + 0.25)); }} className="rounded-full bg-white/10 p-2" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <MediaDownloadButton url={image.url} fileName={image.fileName} className="bg-white/10 p-2" title="Download or share image" />
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2" aria-label="Close viewer"><X className="h-5 w-5" /></button>
        </div>
      </div>
      {index > 0 && (
        <button type="button" onClick={(event) => { event.stopPropagation(); changeIndex(-1); }} className="absolute left-3 z-10 rounded-full bg-black/50 p-2" aria-label="Previous image"><ChevronLeft /></button>
      )}
      <img
        src={image.url}
        alt={image.fileName}
        onDoubleClick={(event) => { event.stopPropagation(); setZoom((value) => value === 1 ? 2 : 1); }}
        onClick={(event) => event.stopPropagation()}
        style={{ transform: `scale(${zoom})` }}
        className="max-h-[90vh] max-w-[94vw] object-contain transition-transform duration-150"
      />
      {index < images.length - 1 && (
        <button type="button" onClick={(event) => { event.stopPropagation(); changeIndex(1); }} className="absolute right-3 z-10 rounded-full bg-black/50 p-2" aria-label="Next image"><ChevronRight /></button>
      )}
      {images.length > 1 && <div className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-xs">{index + 1} / {images.length}</div>}
    </div>
  );
};
