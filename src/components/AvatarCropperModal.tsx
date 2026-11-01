import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Check, Move } from 'lucide-react';

interface AvatarCropperModalProps {
  imageFile: File;
  isDark?: boolean;
  onCancel: () => void;
  onConfirmCrop: (croppedBlob: Blob, previewDataUrl: string) => void;
}

const VIEWPORT_SIZE = 240;
const EXPORT_SIZE = 400;

export const AvatarCropperModal: React.FC<AvatarCropperModalProps> = ({
  imageFile,
  isDark = true,
  onCancel,
  onConfirmCrop,
}) => {
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(imageFile);
    const img = new Image();
    img.onload = () => {
      setImageEl(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => {
      setError('Could not load selected image. Please choose a valid JPG, PNG, or WebP file.');
    };
    img.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageEl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

    const baseScale = Math.max(
      VIEWPORT_SIZE / imageEl.naturalWidth,
      VIEWPORT_SIZE / imageEl.naturalHeight
    );
    const scale = baseScale * zoom;
    const drawW = imageEl.naturalWidth * scale;
    const drawH = imageEl.naturalHeight * scale;
    const drawX = (VIEWPORT_SIZE - drawW) / 2 + offset.x;
    const drawY = (VIEWPORT_SIZE - drawH) / 2 + offset.y;

    ctx.drawImage(imageEl, drawX, drawY, drawW, drawH);
  }, [imageEl, zoom, offset]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const clampOffset = (nextX: number, nextY: number, currentZoom = zoom) => {
    if (!imageEl) return { x: nextX, y: nextY };
    const baseScale = Math.max(
      VIEWPORT_SIZE / imageEl.naturalWidth,
      VIEWPORT_SIZE / imageEl.naturalHeight
    );
    const scale = baseScale * currentZoom;
    const maxX = Math.max(0, (imageEl.naturalWidth * scale - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (imageEl.naturalHeight * scale - VIEWPORT_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextX)),
      y: Math.min(maxY, Math.max(-maxY, nextY)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const rawX = e.clientX - dragStart.x;
    const rawY = e.clientY - dragStart.y;
    setOffset(clampOffset(rawX, rawY));
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const handleZoomChange = (nextZoom: number) => {
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
  };

  const handleConfirm = () => {
    if (!imageEl) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = EXPORT_SIZE;
    exportCanvas.height = EXPORT_SIZE;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    const ratio = EXPORT_SIZE / VIEWPORT_SIZE;
    const baseScale = Math.max(
      VIEWPORT_SIZE / imageEl.naturalWidth,
      VIEWPORT_SIZE / imageEl.naturalHeight
    );
    const scale = baseScale * zoom * ratio;
    const drawW = imageEl.naturalWidth * scale;
    const drawH = imageEl.naturalHeight * scale;
    const drawX = (EXPORT_SIZE - drawW) / 2 + offset.x * ratio;
    const drawY = (EXPORT_SIZE - drawH) / 2 + offset.y * ratio;

    ctx.drawImage(imageEl, drawX, drawY, drawW, drawH);

    const previewDataUrl = exportCanvas.toDataURL('image/jpeg', 0.9);
    exportCanvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Failed to process cropped image.');
          return;
        }
        onConfirmCrop(blob, previewDataUrl);
      },
      'image/webp',
      0.9
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
          isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="px-4 py-3.5 border-b border-slate-700/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Adjust Profile Picture</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel crop"
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          {error ? (
            <p className="text-xs text-rose-400 text-center py-8">{error}</p>
          ) : (
            <>
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative w-[240px] h-[240px] rounded-full overflow-hidden border-4 border-[#00a884] shadow-xl cursor-grab active:cursor-grabbing touch-none bg-slate-900"
              >
                <canvas
                  ref={canvasRef}
                  width={VIEWPORT_SIZE}
                  height={VIEWPORT_SIZE}
                  className="w-full h-full block"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Move className="w-3.5 h-3.5" />
                <span>Drag to reposition</span>
              </div>

              <div className="w-full flex items-center gap-3 px-2">
                <ZoomOut className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => handleZoomChange(Number(e.target.value))}
                  aria-label="Zoom profile picture"
                  className="flex-1 accent-[#00a884] cursor-pointer"
                />
                <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3.5 border-t border-slate-700/40 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!imageEl || Boolean(error)}
            onClick={handleConfirm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            <span>Apply Photo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
