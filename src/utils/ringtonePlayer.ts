import type { RingtoneItem, RingtonePreferences } from '../types/chat';

export interface BuiltinRingtone {
  id: string;
  name: string;
  description: string;
}

export const BUILTIN_RINGTONES: BuiltinRingtone[] = [
  { id: 'zolo-pulse', name: 'ZOLO Pulse', description: 'Modern marimba melodic pulse' },
  { id: 'classic-bell', name: 'Classic Chime', description: 'Rich acoustic chime melody' },
  { id: 'gentle-breeze', name: 'Gentle Breeze', description: 'Soft harmonic ambient ring' },
  { id: 'neon-cyber', name: 'Neon Cyber', description: 'Upbeat rhythmic synthesizer tone' },
  { id: 'cosmic-echo', name: 'Cosmic Echo', description: 'Polyphonic ethereal ringtone' },
];

class RingtoneManager {
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentHtmlAudio: HTMLAudioElement | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private loopTimer: number | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  // Synthesize rich polyphonic tones using Web Audio API for built-in ringtones
  private synthesizeBuiltin(id: string, volume: number): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), now);
    masterGain.connect(ctx.destination);

    // Sequence helper
    const playNote = (freq: number, startTime: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      noteGain.gain.setValueAtTime(0.001, startTime);
      noteGain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    };

    if (id === 'classic-bell') {
      // Classic bell chord arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((f, idx) => {
        playNote(f, now + idx * 0.12, 0.45, 'triangle');
        playNote(f * 2, now + idx * 0.12, 0.25, 'sine');
      });
      // Second phrase
      notes.slice().reverse().forEach((f, idx) => {
        playNote(f, now + 0.8 + idx * 0.12, 0.5, 'triangle');
      });
    } else if (id === 'neon-cyber') {
      // Electronic synth sequence
      const freqs = [440, 554.37, 659.25, 880, 659.25, 880];
      freqs.forEach((f, idx) => {
        playNote(f, now + idx * 0.11, 0.18, 'sawtooth');
      });
      freqs.forEach((f, idx) => {
        playNote(f * 1.5, now + 0.9 + idx * 0.11, 0.18, 'sawtooth');
      });
    } else if (id === 'gentle-breeze') {
      // Harmonic pentatonic wash
      const freqs = [392.0, 440.0, 523.25, 587.33, 659.25];
      freqs.forEach((f, idx) => {
        playNote(f, now + idx * 0.16, 0.6, 'sine');
      });
    } else if (id === 'cosmic-echo') {
      // Space echo chords
      const chord = [329.63, 493.88, 659.25, 987.77];
      chord.forEach((f) => {
        playNote(f, now, 0.7, 'sine');
        playNote(f * 1.5, now + 0.35, 0.7, 'triangle');
      });
    } else {
      // Default: 'zolo-pulse' - Modern melodic rhythm
      const melody = [587.33, 659.25, 880.0, 987.77, 1174.66];
      melody.forEach((f, idx) => {
        playNote(f, now + idx * 0.1, 0.3, 'sine');
        playNote(f * 0.5, now + idx * 0.1, 0.25, 'triangle');
      });
      melody.slice(1, 4).forEach((f, idx) => {
        playNote(f * 1.25, now + 0.7 + idx * 0.12, 0.35, 'sine');
      });
    }
  }

  public play(ringtoneId: string, customList: RingtoneItem[] = [], volume = 0.85, loop = true): void {
    this.stop();
    this.isPlaying = true;

    // Check if it's a custom ringtone
    const customMatch = customList.find((r) => r.id === ringtoneId);
    if (customMatch && (customMatch.audioUrl || customMatch.dataBase64)) {
      const src = customMatch.audioUrl || customMatch.dataBase64!;
      try {
        const audio = new Audio(src);
        audio.volume = Math.min(1, Math.max(0, volume));
        audio.loop = loop;
        this.currentHtmlAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('HTML5 audio play blocked by browser autoplay policy, falling back to WebAudio synthesis:', err);
            this.playBuiltinLoop('zolo-pulse', volume, loop);
          });
        }
        return;
      } catch (err) {
        console.warn('Error loading custom audio, falling back to builtin:', err);
      }
    }

    // Builtin ringtone playback
    this.playBuiltinLoop(ringtoneId, volume, loop);
  }

  private playBuiltinLoop(id: string, volume: number, loop: boolean): void {
    this.synthesizeBuiltin(id, volume);

    if (loop && this.isPlaying) {
      this.loopTimer = window.setInterval(() => {
        if (!this.isPlaying) return;
        this.synthesizeBuiltin(id, volume);
      }, 2400);
    }
  }

  public stop(): void {
    this.isPlaying = false;

    if (this.loopTimer !== null) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }

    if (this.currentHtmlAudio) {
      try {
        this.currentHtmlAudio.pause();
        this.currentHtmlAudio.currentTime = 0;
      } catch {}
      this.currentHtmlAudio = null;
    }

    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
  }

  public validateAudioFile(file: File): Promise<{
    valid: boolean;
    error?: string;
    durationSeconds?: number;
    base64Data?: string;
  }> {
    return new Promise((resolve) => {
      // 1. File size check (max 15MB)
      if (file.size > 15 * 1024 * 1024) {
        resolve({ valid: false, error: 'Audio file must be under 15MB.' });
        return;
      }

      // 2. MIME type / extension check
      const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'];
      const fileNameLower = file.name.toLowerCase();
      const hasValidExt = validExts.some((ext) => fileNameLower.endsWith(ext));
      const hasValidMime = file.type.startsWith('audio/') || file.type === 'video/ogg';

      if (!hasValidExt && !hasValidMime) {
        resolve({
          valid: false,
          error: 'Unsupported format. Please select an MP3, WAV, OGG, M4A, or AAC audio file.',
        });
        return;
      }

      // 3. Read data and measure duration
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target?.result as string;
        const tempAudio = new Audio(base64Data);

        tempAudio.onloadedmetadata = () => {
          const duration = Math.round(tempAudio.duration || 0);
          resolve({
            valid: true,
            durationSeconds: duration,
            base64Data,
          });
        };

        tempAudio.onerror = () => {
          // If metadata read fails, still allow if size and extension matched
          resolve({
            valid: true,
            durationSeconds: 30,
            base64Data,
          });
        };
      };

      reader.onerror = () => {
        resolve({ valid: false, error: 'Could not read audio file from device.' });
      };

      reader.readAsDataURL(file);
    });
  }

  public playIncomingCallRingtone(params: {
    callType: 'audio' | 'video';
    isGroup?: boolean;
    preferences: RingtonePreferences;
  }): void {
    const { callType, isGroup, preferences } = params;
    let targetRingtoneId = preferences.voiceCallRingtoneId;

    if (isGroup) {
      targetRingtoneId = preferences.groupCallRingtoneId || 'neon-cyber';
    } else if (callType === 'video') {
      targetRingtoneId = preferences.videoCallRingtoneId || 'classic-bell';
    }

    this.play(
      targetRingtoneId,
      preferences.customRingtones || [],
      preferences.volume ?? 0.85,
      true
    );
  }
}

export const ringtonePlayer = new RingtoneManager();
