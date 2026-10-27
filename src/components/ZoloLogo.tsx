import React, { useEffect, useState } from 'react';

export const ZOLO_LOGO_ASSET = '/assets/aistudio/Vibrant_ZOLO_Chat_Logo_d7bbe5fc.png';

interface ZoloLogoProps {
  variant?: 'full' | 'icon';
  theme?: 'dark' | 'light';
  className?: string;
}

const processedLogoCache: Record<string, string> = {};

/**
 * Renders the ZOLO Chat logo from /assets/aistudio/Vibrant_ZOLO_Chat_Logo_d7bbe5fc.png,
 * tightly cropping excess outer margins, flood-filling exterior white background to transparent
 * while preserving the interior white "Z" mark, and adapting the wordmark contrast for dark/light mode.
 */
export const ZoloLogo: React.FC<ZoloLogoProps> = ({
  variant = 'full',
  theme = 'dark',
  className = 'h-8 w-auto',
}) => {
  const cacheKey = `${variant}_${theme}`;
  const [processedSrc, setProcessedSrc] = useState<string | null>(
    () => processedLogoCache[cacheKey] || null
  );

  useEffect(() => {
    if (processedLogoCache[cacheKey]) {
      setProcessedSrc(processedLogoCache[cacheKey]);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const natW = img.naturalWidth || 1254;
        const natH = img.naturalHeight || 1254;
        const scaleX = natW / 1254;
        const scaleY = natH / 1254;

        // Exact crop bounds in 1254x1254 reference space
        const cropX = Math.round(56 * scaleX);
        const cropY = Math.round(394 * scaleY);
        const cropW = Math.round((variant === 'icon' ? 506 : 1150) * scaleX);
        const cropH = Math.round(428 * scaleY);
        const wordmarkStartX = Math.round((545 - 56) * scaleX);

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        const imageData = ctx.getImageData(0, 0, cropW, cropH);
        const data = imageData.data;

        const total = cropW * cropH;
        const bgMask = new Uint8Array(total);
        const queue = new Int32Array(total);
        let qHead = 0;
        let qTail = 0;

        const isNearWhite = (pIdx: number) =>
          data[pIdx] > 224 && data[pIdx + 1] > 224 && data[pIdx + 2] > 224;

        const enqueueIfBg = (x: number, y: number) => {
          const idx = y * cropW + x;
          if (bgMask[idx]) return;
          const pIdx = idx * 4;
          if (isNearWhite(pIdx)) {
            bgMask[idx] = 1;
            queue[qTail++] = idx;
          }
        };

        // Seed flood-fill along outer border so enclosed white "Z" inside bubble stays opaque
        for (let x = 0; x < cropW; x++) {
          enqueueIfBg(x, 0);
          enqueueIfBg(x, cropH - 1);
        }
        for (let y = 0; y < cropH; y++) {
          enqueueIfBg(0, y);
          enqueueIfBg(cropW - 1, y);
        }

        while (qHead < qTail) {
          const curr = queue[qHead++];
          const cx = curr % cropW;
          const cy = (curr / cropW) | 0;

          if (cx > 0) enqueueIfBg(cx - 1, cy);
          if (cx + 1 < cropW) enqueueIfBg(cx + 1, cy);
          if (cy > 0) enqueueIfBg(cx, cy - 1);
          if (cy + 1 < cropH) enqueueIfBg(cx, cy + 1);
        }

        const isDark = theme === 'dark';

        for (let y = 0; y < cropH; y++) {
          for (let x = 0; x < cropW; x++) {
            const idx = y * cropW + x;
            const pIdx = idx * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];

            if (variant === 'icon' && x >= wordmarkStartX - Math.round(6 * scaleX)) {
              // Mask out the bottom-left serif corner of the navy "Z" in ZOLO when rendering icon-only
              if (b < 140 && r < 110) {
                data[pIdx + 3] = 0;
                continue;
              }
            }

            if (x >= wordmarkStartX) {
              // Wordmark region ("ZOLO"): convert white background (including "O" counters) to alpha
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              if (lum >= 242) {
                data[pIdx + 3] = 0;
              } else {
                // Smooth alpha based on darkness of navy glyph
                const alpha = Math.min(255, Math.max(0, Math.round(((245 - lum) / 220) * 255)));
                if (isDark && b < 130 && r < 100) {
                  //Crisp white wordmark in dark mode
                  data[pIdx] = 248;
                  data[pIdx + 1] = 250;
                  data[pIdx + 2] = 252;
                }
                data[pIdx + 3] = alpha;
              }
            } else {
              // Speech-bubble + 3-dots icon region
              if (bgMask[idx]) {
                data[pIdx + 3] = 0;
              } else {
                // Feather anti-aliased edge pixels touching exterior background
                const touchesBg =
                  (x > 0 && bgMask[idx - 1]) ||
                  (x + 1 < cropW && bgMask[idx + 1]) ||
                  (y > 0 && bgMask[idx - cropW]) ||
                  (y + 1 < cropH && bgMask[idx + cropW]);

                if (touchesBg) {
                  const minCh = Math.min(r, g, b);
                  if (minCh > 180) {
                    const edgeAlpha = Math.max(0, Math.min(255, Math.round(((245 - minCh) / 65) * 255)));
                    data[pIdx + 3] = edgeAlpha;
                  }
                }
              }
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        processedLogoCache[cacheKey] = dataUrl;
        if (!cancelled) {
          setProcessedSrc(dataUrl);
        }
      } catch {
        // Fallback to raw image if canvas extraction fails
      }
    };
    img.src = ZOLO_LOGO_ASSET;

    return () => {
      cancelled = true;
    };
  }, [cacheKey, theme, variant]);

  if (processedSrc) {
    return (
      <img
        src={processedSrc}
        data-asset-src={ZOLO_LOGO_ASSET}
        alt="ZOLO"
        className={`object-contain select-none ${className}`}
        draggable={false}
      />
    );
  }

  // Immediate pre-canvas fallback directly displaying the local PNG asset cropped to its lockup bounds
  return (
    <span
      className={`inline-flex items-center overflow-hidden rounded-lg bg-white/95 px-1.5 ${className}`}
      style={{ aspectRatio: variant === 'icon' ? '1.18 / 1' : '2.68 / 1' }}
    >
      <img
        src={ZOLO_LOGO_ASSET}
        alt="ZOLO"
        className="w-full h-auto max-w-none object-cover select-none"
        draggable={false}
      />
    </span>
  );
};
