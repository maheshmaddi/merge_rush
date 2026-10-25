/**
 * Tiny Web Audio sound engine. All effects are synthesized at runtime with
 * oscillators and gain envelopes - no audio assets, no network. The
 * AudioContext is created lazily and resumed on the first user gesture to
 * comply with autoplay policies. When sound is disabled, everything is a
 * no-op. Any failure (missing AudioContext, suspended context) is swallowed:
 * audio is a nicety, never a crash vector.
 */

export type SoundName =
  | 'move'
  | 'merge'
  | 'combo'
  | 'rushStart'
  | 'rushEnd'
  | 'gameOver'
  | 'undo'
  | 'record'
  | 'bomb'
  | 'upgrade'
  | 'shuffle'
  | 'sweep'
  | 'powerEarned'
  | 'select';

interface ToneSpec {
  freq: number;
  /** Seconds from now. */
  at: number;
  duration: number;
  type: OscillatorType;
  peak: number;
  slideTo?: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  configure(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.ctx !== null && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => undefined);
    }
    if (enabled) this.unlock();
  }

  /** Creates/resumes the AudioContext; safe to call from any user gesture. */
  unlock(): void {
    if (this.ctx !== null) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => undefined);
      }
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.2;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  private tone({ freq, at, duration, type, peak, slideTo }: ToneSpec): void {
    if (this.ctx === null || this.master === null) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  play(name: SoundName, opts?: { value?: number; streak?: number }): void {
    if (!this.enabled) return;
    this.unlock();
    if (this.ctx === null || this.master === null) return;

    try {
      switch (name) {
        case 'move':
          this.tone({ freq: 150, at: 0, duration: 0.06, type: 'triangle', peak: 0.16 });
          break;
        case 'merge': {
          // Pitch climbs with the resulting tile value.
          const value = opts?.value ?? 4;
          const freq = 180 + Math.log2(value) * 46;
          this.tone({ freq, at: 0, duration: 0.13, type: 'sine', peak: 0.3, slideTo: freq * 1.4 });
          break;
        }
        case 'combo': {
          const streak = opts?.streak ?? 2;
          const base = 380 + Math.min(streak, 8) * 40;
          this.tone({ freq: base, at: 0, duration: 0.08, type: 'square', peak: 0.1 });
          this.tone({ freq: base * 1.5, at: 0.07, duration: 0.1, type: 'square', peak: 0.1 });
          break;
        }
        case 'rushStart':
          this.tone({ freq: 392, at: 0, duration: 0.09, type: 'sawtooth', peak: 0.14 });
          this.tone({ freq: 523.25, at: 0.08, duration: 0.09, type: 'sawtooth', peak: 0.14 });
          this.tone({ freq: 783.99, at: 0.16, duration: 0.16, type: 'sawtooth', peak: 0.16 });
          break;
        case 'rushEnd':
          this.tone({ freq: 660, at: 0, duration: 0.16, type: 'triangle', peak: 0.16, slideTo: 300 });
          break;
        case 'gameOver':
          this.tone({ freq: 220, at: 0, duration: 0.3, type: 'triangle', peak: 0.2, slideTo: 110 });
          this.tone({ freq: 165, at: 0.25, duration: 0.4, type: 'sine', peak: 0.16, slideTo: 82 });
          break;
        case 'undo':
          this.tone({ freq: 520, at: 0, duration: 0.09, type: 'triangle', peak: 0.14, slideTo: 260 });
          break;
        case 'bomb':
          this.tone({ freq: 140, at: 0, duration: 0.32, type: 'sawtooth', peak: 0.24, slideTo: 40 });
          this.tone({ freq: 90, at: 0.02, duration: 0.4, type: 'square', peak: 0.12, slideTo: 30 });
          break;
        case 'upgrade':
          this.tone({ freq: 660, at: 0, duration: 0.1, type: 'sine', peak: 0.2, slideTo: 990 });
          this.tone({ freq: 990, at: 0.08, duration: 0.18, type: 'triangle', peak: 0.18, slideTo: 1480 });
          break;
        case 'shuffle':
          for (let i = 0; i < 5; i++) {
            this.tone({ freq: 300 + i * 90, at: i * 0.04, duration: 0.07, type: 'triangle', peak: 0.12 });
          }
          break;
        case 'sweep':
          this.tone({ freq: 900, at: 0, duration: 0.3, type: 'sine', peak: 0.16, slideTo: 220 });
          this.tone({ freq: 1300, at: 0.05, duration: 0.25, type: 'triangle', peak: 0.08, slideTo: 400 });
          break;
        case 'powerEarned':
          this.tone({ freq: 784, at: 0, duration: 0.08, type: 'square', peak: 0.1 });
          this.tone({ freq: 1046.5, at: 0.07, duration: 0.08, type: 'square', peak: 0.1 });
          this.tone({ freq: 1568, at: 0.14, duration: 0.18, type: 'sine', peak: 0.16 });
          break;
        case 'select':
          this.tone({ freq: 620, at: 0, duration: 0.06, type: 'sine', peak: 0.12, slideTo: 760 });
          break;
        case 'record':
          this.tone({ freq: 523.25, at: 0, duration: 0.1, type: 'sine', peak: 0.2 });
          this.tone({ freq: 659.25, at: 0.1, duration: 0.1, type: 'sine', peak: 0.2 });
          this.tone({ freq: 783.99, at: 0.2, duration: 0.22, type: 'sine', peak: 0.24 });
          break;
      }
    } catch {
      // Audio must never take the game down.
    }
  }
}

export const soundEngine = new SoundEngine();
