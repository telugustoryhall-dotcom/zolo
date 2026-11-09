import React, { useState } from 'react';
import { Download, Loader2, Check } from 'lucide-react';

interface MediaDownloadButtonProps {
  url: string;
  fileName: string;
  className?: string;
  title?: string;
}

export const MediaDownloadButton: React.FC<MediaDownloadButtonProps> = ({
  url,
  fileName,
  className = '',
  title = 'Download file',
}) => {
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setComplete(false);
    setCompletionNote('');
    setProgress(null);
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const total = Number(response.headers.get('content-length')) || 0;
      let blob: Blob;
      if (response.body && total > 0) {
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const chunk = new Uint8Array(value.byteLength);
            chunk.set(value);
            chunks.push(chunk.buffer);
            received += value.byteLength;
            setProgress(Math.min(99, Math.round((received / total) * 100)));
          }
        }
        blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
      } else {
        blob = await response.blob();
      }
      const file = new File([blob], fileName || 'attachment', {
        type: blob.type || 'application/octet-stream',
      });

      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: file.name });
        setComplete(true);
        setCompletionNote('Shared; not saved to Gallery');
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setComplete(true);
      setCompletionNote('Downloaded; not saved to Gallery');
      setProgress(100);
    } catch (downloadError) {
      if (downloadError instanceof DOMException && downloadError.name === 'AbortError') {
        setError('Sharing cancelled.');
        return;
      }
      const message = downloadError instanceof Error ? downloadError.message : 'Download failed.';
      const fallback = document.createElement('a');
      fallback.href = url;
      fallback.download = fileName || 'attachment';
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      document.body.appendChild(fallback);
      fallback.click();
      fallback.remove();
      setError(`${message} Opened file link`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void download();
      }}
      disabled={busy}
      title={error || (complete ? 'Downloaded or shared; save to Gallery separately if desired.' : title)}
      aria-label={error || title}
      aria-live="polite"
      className={`inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-60 ${className}`}
    >
      {busy ? progress !== null ? <span className="text-[9px] tabular-nums">{progress}%</span> : <Loader2 className="h-4 w-4 animate-spin" /> : complete ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      {(complete || error) && <span className="ml-1 max-w-[150px] truncate text-[9px]">{error || completionNote}</span>}
      <span className="sr-only">
        {error || completionNote || (busy && progress !== null ? `Downloading ${progress} percent` : 'Download file')}
      </span>
    </button>
  );
};
