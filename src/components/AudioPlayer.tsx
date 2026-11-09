import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

interface AudioPlayerProps {
  duration?: number;
  isOutgoing: boolean;
  theme: 'dark' | 'light';
  mediaUrl?: string;
  waveformSamples?: number[];
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  duration = 15,
  isOutgoing,
  theme,
  mediaUrl,
  waveformSamples,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [audioDuration, setAudioDuration] = useState(duration);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Default wave heights fallback or use dynamic samples from actual microphone
  const defaultWaveHeights = [20, 45, 70, 35, 80, 50, 90, 65, 40, 75, 100, 60, 45, 85, 30, 55, 95, 40, 70, 25, 60, 85, 40, 20];
  const waveHeights = waveformSamples && waveformSamples.length > 5 ? waveformSamples : defaultWaveHeights;

  // Real audio element event listeners when mediaUrl is present
  useEffect(() => {
    if (!mediaUrl) return;

    const audio = new Audio(mediaUrl);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audioRef.current = null;
    };
  }, [mediaUrl]);

  // Fallback timer simulation when no mediaUrl
  useEffect(() => {
    if (mediaUrl) return;

    if (isPlaying) {
      const interval = 100; // 100ms ticks
      timerRef.current = window.setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + (0.1 * playbackRate);
          if (next >= audioDuration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, interval);
    } else {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, playbackRate, audioDuration, mediaUrl]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.playbackRate = playbackRate;
        audioRef.current.play().catch(() => {
          // Autoplay policy fallback
        });
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const cycleSpeed = () => {
    let nextRate: 1 | 1.5 | 2 = 1;
    if (playbackRate === 1) nextRate = 1.5;
    else if (playbackRate === 1.5) nextRate = 2;
    else nextRate = 1;

    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleSeek = (index: number) => {
    const fraction = index / waveHeights.length;
    const targetTime = fraction * audioDuration;
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressFraction = audioDuration > 0 ? currentTime / audioDuration : 0;
  const activeWaveIndex = Math.floor(progressFraction * waveHeights.length);

  return (
    <div className="flex items-center gap-3 py-1 min-w-[260px] sm:min-w-[300px]">
      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm ${
          isOutgoing
            ? theme === 'dark'
              ? 'bg-[#00a884] text-white hover:bg-[#008f72]'
              : 'bg-[#008069] text-white hover:bg-[#00705b]'
            : theme === 'dark'
            ? 'bg-[#00a884] text-white hover:bg-[#008f72]'
            : 'bg-[#008069] text-white hover:bg-[#00705b]'
        }`}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform Scrubber & Timer */}
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-[2px] h-7 cursor-pointer" title="Seek audio">
          {waveHeights.map((h, i) => {
            const isPlayed = i <= activeWaveIndex;
            return (
              <div
                key={i}
                onClick={() => handleSeek(i)}
                className="flex-1 flex items-center h-full group"
              >
                <div
                  style={{ height: `${Math.max(15, h)}%` }}
                  className={`w-full rounded-full transition-colors duration-150 ${
                    isPlayed
                      ? isOutgoing
                        ? theme === 'dark'
                          ? 'bg-[#00a884]'
                          : 'bg-[#008069]'
                        : theme === 'dark'
                        ? 'bg-[#00a884]'
                        : 'bg-[#008069]'
                      : theme === 'dark'
                      ? 'bg-slate-600 group-hover:bg-slate-500'
                      : 'bg-slate-300 group-hover:bg-slate-400'
                  }`}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] font-medium leading-none text-slate-400">
          <span className="tabular-nums">
            {formatTime(currentTime > 0 ? currentTime : audioDuration)}
          </span>
          <div className="flex items-center gap-1">
            <Mic className="w-3 h-3 text-[#00a884]" />
            <span>Voice note</span>
          </div>
        </div>
      </div>

      {/* Speed Rate Pill Button */}
      <button
        onClick={cycleSpeed}
        className={`px-2 py-0.5 text-[11px] font-bold rounded-full transition-colors shrink-0 ${
          theme === 'dark'
            ? 'bg-[#182229] hover:bg-[#202c33] text-slate-300'
            : 'bg-slate-200/80 hover:bg-slate-300 text-slate-700'
        }`}
        title="Toggle playback speed"
      >
        {playbackRate}x
      </button>
    </div>
  );
};
