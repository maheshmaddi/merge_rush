/**
 * Tiny Web Audio sound engine. All effects are synthesized at runtime with
 * oscillators, filtered noise and gain envelopes - no audio assets, no
 * network. Everything runs through a soft compressor and a short synthetic
 * reverb so the effects sound like one polished kit rather than raw beeps.
 * The AudioContext is created lazily and resumed on the first user gesture
 * to comply with autoplay policies. When sound is disabled, everything is a
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
  | 'select'
  | 'revive';

interface ToneSpec {
  freq: number;
  /** Seconds from now. */
  at: number;
  duration: number;
  type: OscillatorType;
  peak: number;
  slideTo?: number;
  /** Seconds of attack; short by default for a crisp onset. */
  attack?: number;
  /** 0..1 share of the tone sent to the reverb. */
  wet?: number;
  /** Destination bus; the master by default. */
  out?: AudioNode;
}

interface NoiseSpec {
  at: number;
  duration: number;
  peak: number;
  filter: BiquadFilterType;
  from: number;
  to: number;
  q?: number;
  wet?: number;
  out?: AudioNode;
}

export type MusicMode = 'off' | 'title' | 'game';

/** Background loop: A minor, Am - F - C - G, 84 BPM, eight steps per bar. */
const BPM = 84;
const STEP = 60 / BPM / 2;
const CHORDS = [
  { root: 110, pad: [220, 261.63, 329.63] },
  { root: 87.31, pad: [174.61, 220, 261.63] },
  { root: 130.81, pad: [261.63, 329.63, 392] },
  { root: 98, pad: [196, 246.94, 293.66] },
];
const ARP = [0, 2, 1, 2, 0, 2, 1, 2];
/** Music bus level per mode: full on the title, a soft bed during play. */
const MUSIC_LEVEL: Record<MusicMode, number> = { off: 0, title: 1, game: 0.4 };

/** C major pentatonic across three octaves: any merge pitch sounds musical. */
const SCALE = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66,
  1318.51, 1567.98, 1760.0,
];

function scaleNote(index: number): number {
  return SCALE[Math.max(0, Math.min(SCALE.length - 1, index))];
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicBus: GainNode | null = null;
  private enabled = true;
  private musicEnabled = false;
  private musicMode: MusicMode = 'off';
  /** Held silent while an ad plays. */
  private held = false;
  private musicTimer: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.sync());
    }
  }

  /** Sound effects on/off. */
  configure(enabled: boolean): void {
    this.enabled = enabled;
    this.sync();
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.sync();
  }

  setMusicMode(mode: MusicMode): void {
    this.musicMode = mode;
    if (this.musicBus !== null && this.ctx !== null) {
      this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL[mode], this.ctx.currentTime, 0.4);
    }
    this.sync();
  }

  /** Silences everything (ads bring their own audio). */
  hold(held: boolean): void {
    this.held = held;
    this.sync();
  }

  private get musicWanted(): boolean {
    return this.musicEnabled && this.musicMode !== 'off';
  }

  /** Reconciles the context and the music scheduler with the current flags. */
  private sync(): void {
    const hidden = typeof document !== 'undefined' && document.hidden;
    const wanted = !this.held && !hidden && (this.enabled || this.musicWanted);
    if (wanted) this.unlock();
    const ctx = this.ctx;
    if (ctx !== null) {
      if (wanted && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      if (!wanted && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    }
    const playMusic = wanted && this.musicWanted && ctx !== null;
    if (playMusic && this.musicTimer === null) {
      this.nextStepTime = 0;
      this.musicTimer = window.setInterval(() => this.tickMusic(), 100);
    } else if (!playMusic && this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private tickMusic(): void {
    const ctx = this.ctx;
    if (ctx === null || ctx.state !== 'running' || this.musicBus === null) return;
    try {
      if (this.nextStepTime < ctx.currentTime) {
        // First tick or we fell behind (tab was suspended): restart on the bar.
        this.nextStepTime = ctx.currentTime + 0.05;
        this.stepIndex = 0;
      }
      while (this.nextStepTime < ctx.currentTime + 0.5) {
        this.scheduleStep(this.nextStepTime - ctx.currentTime, this.stepIndex);
        this.nextStepTime += STEP;
        this.stepIndex += 1;
      }
    } catch {
      // Music is optional.
    }
  }

  private scheduleStep(at: number, index: number): void {
    const bus = this.musicBus;
    if (bus === null) return;
    const step = index % 8;
    const bar = Math.floor(index / 8);
    const chord = CHORDS[bar % CHORDS.length];
    const title = this.musicMode === 'title';
    if (step === 0) {
      // Warm pad swelling across the bar, plus a soft bass note.
      chord.pad.forEach((f, i) => {
        this.tone({
          freq: f * (i === 2 ? 1.003 : 1),
          at,
          duration: STEP * 8 + 0.4,
          type: 'triangle',
          peak: 0.05,
          attack: 0.9,
          wet: 0.5,
          out: bus,
        });
      });
      this.tone({
        freq: chord.root,
        at,
        duration: STEP * 3.6,
        type: 'sine',
        peak: 0.16,
        attack: 0.03,
        wet: 0.05,
        out: bus,
      });
    }
    if (step === 4) {
      this.tone({
        freq: chord.root * 1.5,
        at,
        duration: STEP * 3,
        type: 'sine',
        peak: 0.1,
        attack: 0.03,
        wet: 0.05,
        out: bus,
      });
    }
    // Plucked arpeggio; sparser while playing so it never fights the game sounds.
    if (title || step % 2 === 0) {
      const note = chord.pad[ARP[step]] * 2;
      this.tone({
        freq: note,
        at,
        duration: STEP * 1.8,
        type: 'triangle',
        peak: title ? 0.08 : 0.05,
        attack: 0.006,
        wet: 0.45,
        out: bus,
      });
      if (title && step === 6 && bar % 2 === 1) {
        this.tone({
          freq: chord.pad[2] * 4,
          at: at + STEP,
          duration: 0.6,
          type: 'sine',
          peak: 0.05,
          attack: 0.01,
          wet: 0.6,
          out: bus,
        });
      }
    }
    if (title) {
      if (step % 4 === 0) {
        this.tone({
          freq: 90,
          at,
          duration: 0.18,
          type: 'sine',
          peak: 0.16,
          slideTo: 42,
          attack: 0.004,
          wet: 0,
          out: bus,
        });
      }
      if (step % 2 === 1) {
        this.noise({
          at,
          duration: 0.05,
          peak: 0.035,
          filter: 'highpass',
          from: 7000,
          to: 9000,
          q: 0.5,
          wet: 0.05,
          out: bus,
        });
      }
    }
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
      const ctx = new Ctor();
      this.ctx = ctx;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.2;
      compressor.connect(ctx.destination);

      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(compressor);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_LEVEL[this.musicMode];
      this.musicBus.connect(this.master);

      // Short generated room: decaying noise, no asset needed.
      const seconds = 0.9;
      const length = Math.floor(ctx.sampleRate * seconds);
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const data = impulse.getChannelData(c);
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
        }
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = impulse;
      this.reverb = ctx.createGain();
      this.reverb.gain.value = 0.5;
      this.reverb.connect(convolver);
      convolver.connect(this.master);

      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const noiseData = noise.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
      this.noiseBuffer = noise;
    } catch {
      this.ctx = null;
      this.master = null;
      this.reverb = null;
      this.musicBus = null;
      this.noiseBuffer = null;
    }
  }

  private tone({
    freq,
    at,
    duration,
    type,
    peak,
    slideTo,
    attack = 0.008,
    wet = 0.2,
    out,
  }: ToneSpec): void {
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
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(out ?? this.master);
    if (wet > 0 && this.reverb !== null) {
      const send = ctx.createGain();
      send.gain.value = wet;
      gain.connect(send);
      send.connect(this.reverb);
    }
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** A glassy bell: fundamental plus two quieter overtones. */
  private bell(freq: number, at: number, duration: number, peak: number): void {
    this.tone({ freq, at, duration, type: 'sine', peak, wet: 0.35 });
    this.tone({
      freq: freq * 2.01,
      at,
      duration: duration * 0.6,
      type: 'sine',
      peak: peak * 0.35,
      wet: 0.35,
    });
    this.tone({
      freq: freq * 3.0,
      at,
      duration: duration * 0.3,
      type: 'sine',
      peak: peak * 0.15,
      wet: 0.35,
    });
  }

  /** Filtered noise burst with a sweeping cutoff: whooshes, booms, flicks. */
  private noise({
    at,
    duration,
    peak,
    filter,
    from,
    to,
    q = 0.9,
    wet = 0.15,
    out,
  }: NoiseSpec): void {
    if (this.ctx === null || this.master === null || this.noiseBuffer === null) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(from, start);
    biquad.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(biquad);
    biquad.connect(gain);
    gain.connect(out ?? this.master);
    if (wet > 0 && this.reverb !== null) {
      const send = ctx.createGain();
      send.gain.value = wet;
      gain.connect(send);
      send.connect(this.reverb);
    }
    src.start(start);
    src.stop(start + duration + 0.05);
  }

  play(name: SoundName, opts?: { value?: number; streak?: number }): void {
    if (!this.enabled || this.held) return;
    this.unlock();
    if (this.ctx === null || this.master === null) return;

    try {
      switch (name) {
        case 'move':
          // Soft swipe: a breath of air plus a tiny low thump.
          this.noise({
            at: 0,
            duration: 0.09,
            peak: 0.1,
            filter: 'bandpass',
            from: 1400,
            to: 500,
            q: 0.7,
            wet: 0.05,
          });
          this.tone({
            freq: 120,
            at: 0,
            duration: 0.07,
            type: 'sine',
            peak: 0.12,
            slideTo: 70,
            wet: 0,
          });
          break;
        case 'merge': {
          // Pitch climbs the pentatonic scale with the resulting tile value.
          const value = opts?.value ?? 4;
          const step = Math.round(Math.log2(Math.max(4, value)) - 2) + 1;
          const freq = scaleNote(step);
          this.bell(freq, 0.02, 0.38, 0.26);
          // Pop at the moment of the merge.
          this.tone({
            freq: freq / 2,
            at: 0,
            duration: 0.09,
            type: 'triangle',
            peak: 0.2,
            slideTo: freq / 3,
            wet: 0,
          });
          if (value >= 128) {
            // Big tiles get a sub thump and a sparkle on top.
            this.tone({
              freq: 90,
              at: 0,
              duration: 0.25,
              type: 'sine',
              peak: 0.3,
              slideTo: 45,
              wet: 0,
            });
            this.bell(freq * 2, 0.08, 0.5, 0.12);
          }
          if (value >= 1024) {
            this.bell(scaleNote(step + 2), 0.14, 0.7, 0.14);
            this.bell(scaleNote(step + 4), 0.22, 0.9, 0.12);
          }
          break;
        }
        case 'combo': {
          // Quick rising arpeggio that gets higher and denser with the streak.
          const streak = Math.min(opts?.streak ?? 2, 8);
          const base = 3 + streak;
          for (let i = 0; i < 3; i++) {
            this.tone({
              freq: scaleNote(base + i * 2),
              at: 0.06 + i * 0.055,
              duration: 0.12,
              type: 'triangle',
              peak: 0.11,
              wet: 0.3,
            });
          }
          break;
        }
        case 'rushStart':
          // Riser into a bright power chord.
          this.noise({
            at: 0,
            duration: 0.28,
            peak: 0.12,
            filter: 'bandpass',
            from: 400,
            to: 5000,
            q: 1.4,
            wet: 0.2,
          });
          [392, 523.25, 659.25, 783.99].forEach((f, i) => {
            this.tone({
              freq: f,
              at: 0.04 + i * 0.065,
              duration: 0.2,
              type: 'sawtooth',
              peak: 0.1,
              wet: 0.3,
            });
          });
          this.bell(1046.5, 0.3, 0.7, 0.22);
          this.bell(1567.98, 0.34, 0.8, 0.12);
          this.tone({
            freq: 130.8,
            at: 0.3,
            duration: 0.5,
            type: 'sine',
            peak: 0.25,
            slideTo: 98,
            wet: 0.1,
          });
          break;
        case 'rushEnd':
          this.tone({
            freq: 880,
            at: 0,
            duration: 0.22,
            type: 'triangle',
            peak: 0.13,
            slideTo: 330,
            wet: 0.3,
          });
          this.noise({
            at: 0,
            duration: 0.2,
            peak: 0.05,
            filter: 'lowpass',
            from: 3000,
            to: 300,
            wet: 0.2,
          });
          break;
        case 'gameOver':
          [329.63, 293.66, 246.94, 196].forEach((f, i) => {
            this.tone({
              freq: f,
              at: i * 0.18,
              duration: 0.5,
              type: 'triangle',
              peak: 0.17,
              wet: 0.4,
            });
          });
          this.tone({
            freq: 98,
            at: 0.5,
            duration: 1,
            type: 'sine',
            peak: 0.22,
            slideTo: 55,
            wet: 0.2,
          });
          break;
        case 'undo':
          this.noise({
            at: 0,
            duration: 0.16,
            peak: 0.08,
            filter: 'bandpass',
            from: 300,
            to: 1800,
            q: 0.8,
            wet: 0.1,
          });
          this.tone({
            freq: 700,
            at: 0,
            duration: 0.12,
            type: 'triangle',
            peak: 0.1,
            slideTo: 330,
            wet: 0.2,
          });
          break;
        case 'bomb':
          // Crack, boom and a rumbling tail.
          this.noise({
            at: 0,
            duration: 0.05,
            peak: 0.5,
            filter: 'highpass',
            from: 2500,
            to: 4000,
            q: 0.5,
            wet: 0.1,
          });
          this.noise({
            at: 0,
            duration: 0.7,
            peak: 0.7,
            filter: 'lowpass',
            from: 2400,
            to: 70,
            q: 0.8,
            wet: 0.35,
          });
          this.tone({
            freq: 150,
            at: 0,
            duration: 0.5,
            type: 'sine',
            peak: 0.7,
            slideTo: 32,
            wet: 0.1,
          });
          this.tone({
            freq: 80,
            at: 0.03,
            duration: 0.55,
            type: 'sawtooth',
            peak: 0.12,
            slideTo: 28,
            wet: 0.2,
          });
          break;
        case 'upgrade':
          // Sparkling climb with a bright landing.
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            this.bell(f, i * 0.07, 0.35, 0.16);
          });
          this.bell(1567.98, 0.3, 0.7, 0.18);
          break;
        case 'shuffle':
          // Cards riffling.
          for (let i = 0; i < 8; i++) {
            this.noise({
              at: i * 0.045,
              duration: 0.06,
              peak: 0.14,
              filter: 'bandpass',
              from: 2500 + i * 250,
              to: 1200 + i * 150,
              q: 1.6,
              wet: 0.1,
            });
          }
          this.tone({
            freq: 440,
            at: 0.36,
            duration: 0.18,
            type: 'triangle',
            peak: 0.1,
            slideTo: 660,
            wet: 0.3,
          });
          break;
        case 'sweep':
          // Broom whoosh with a chime tail.
          this.noise({
            at: 0,
            duration: 0.45,
            peak: 0.28,
            filter: 'bandpass',
            from: 4200,
            to: 400,
            q: 1.1,
            wet: 0.3,
          });
          this.tone({
            freq: 1300,
            at: 0.04,
            duration: 0.35,
            type: 'sine',
            peak: 0.12,
            slideTo: 330,
            wet: 0.35,
          });
          this.bell(1046.5, 0.3, 0.6, 0.14);
          break;
        case 'powerEarned':
          // Cheerful "ding-ding-DING".
          this.bell(783.99, 0, 0.3, 0.17);
          this.bell(1046.5, 0.08, 0.3, 0.17);
          this.bell(1567.98, 0.16, 0.6, 0.22);
          break;
        case 'select':
          this.tone({
            freq: 620,
            at: 0,
            duration: 0.07,
            type: 'sine',
            peak: 0.14,
            slideTo: 900,
            wet: 0.25,
          });
          this.tone({
            freq: 1240,
            at: 0.03,
            duration: 0.08,
            type: 'sine',
            peak: 0.06,
            slideTo: 1800,
            wet: 0.25,
          });
          break;
        case 'revive':
          // Hopeful rising shimmer.
          this.noise({
            at: 0,
            duration: 0.5,
            peak: 0.1,
            filter: 'bandpass',
            from: 500,
            to: 4500,
            q: 1.2,
            wet: 0.3,
          });
          [392, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => {
            this.bell(f, i * 0.08, 0.5, 0.16);
          });
          break;
        case 'record':
          // Short fanfare.
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            this.bell(f, i * 0.1, 0.45, 0.2);
          });
          this.bell(1318.51, 0.45, 1, 0.22);
          this.bell(1567.98, 0.5, 1.1, 0.16);
          this.tone({
            freq: 130.8,
            at: 0.4,
            duration: 0.7,
            type: 'triangle',
            peak: 0.16,
            wet: 0.2,
          });
          break;
      }
    } catch {
      // Audio must never take the game down.
    }
  }
}

export const soundEngine = new SoundEngine();
