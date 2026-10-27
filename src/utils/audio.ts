// Web Audio API Synthesizer for SkaarChat (WhatsApp sound effects)

class SoundSystem {
  private ctx: AudioContext | null = null;
  private ringOscillator: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: number | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Outgoing message sound: subtle high-pitch click/pop ("tock")
   */
  playSendSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.04);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Audio context policy fallback
    }
  }

  /**
   * Incoming message sound: pleasant iconic two-tone chime ("ding-dong")
   */
  playReceiveSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      // Note 1: E6 (1318.5 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1318.5, ctx.currentTime);
      gain1.gain.setValueAtTime(0.25, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.25);

      // Note 2: G6 (1567.98 Hz) slightly delayed
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1567.98, ctx.currentTime + 0.12);
      gain2.gain.setValueAtTime(0.28, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.45);
    } catch {
      // Audio context policy fallback
    }
  }

  /**
   * Status update notification chime: sparkling cheerful triple-tone harmonic ("chime-sparkle")
   */
  playStatusSound() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      // Harmonic chime: C6 (1046.5 Hz) -> E6 (1318.5 Hz) -> A6 (1760.0 Hz)
      const notes = [
        { freq: 1046.5, delay: 0, dur: 0.22, vol: 0.18 },
        { freq: 1318.5, delay: 0.08, dur: 0.25, vol: 0.22 },
        { freq: 1760.0, delay: 0.16, dur: 0.40, vol: 0.24 },
      ];

      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.delay);
        gain.gain.setValueAtTime(n.vol, ctx.currentTime + n.delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + n.delay + n.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + n.delay);
        osc.stop(ctx.currentTime + n.delay + n.dur);
      }
    } catch {
      // Audio context policy fallback
    }
  }

  /**
   * Start ringing sound for outgoing/incoming calls
   */
  startRinging() {
    this.stopRinging();
    const ctx = this.getContext();
    if (!ctx) return;

    const playRingCycle = () => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // Standard 440/480 tone
        osc.frequency.setValueAtTime(480, ctx.currentTime + 0.5);

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.3);
      } catch {
        // Audio context policy fallback
      }
    };

    playRingCycle();
    this.ringInterval = window.setInterval(playRingCycle, 3000);
  }

  stopRinging() {
    if (this.ringInterval !== null) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }
}

export const sound = new SoundSystem();
