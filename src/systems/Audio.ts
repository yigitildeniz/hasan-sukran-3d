import type { SurfaceKind } from '../world/surfaces';

export type EngineKind = 'car' | 'scooter' | 'escooter';

export interface EngineState {
  kind: EngineKind;
  /** Signed forward speed (m/s). */
  speed: number;
  maxSpeed: number;
  /** -1..1 throttle input. */
  throttle: number;
}

const MUTE_KEY = 'atakent_audio_muted';
const MASTER_VOLUME = 0.9;

/**
 * Zero-asset Web Audio sound system. Everything is synthesized at runtime (no external files),
 * routed through one master gain so a single toggle mutes the whole game safely.
 *
 * Continuous loops: engine (rpm/gear model), tyre skid, kettle hot-water pour.
 * One-shots: footsteps, vehicle enter/exit, crash, interaction click, school bell,
 * kettle click / noodle ready, alerts, pickups, mission fanfare, whistle.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  // engine loop
  private engOsc: OscillatorNode | null = null;
  private engSub: OscillatorNode | null = null;
  private engSubGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private engGain: GainNode | null = null;
  // skid loop
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;
  // pour loop
  private pourFilter: BiquadFilterNode | null = null;
  private pourGain: GainNode | null = null;

  private _muted: boolean;
  private unlockBound = false;
  onMuteChange: ((muted: boolean) => void) | null = null;

  constructor() {
    let saved = false;
    try {
      saved = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      saved = false;
    }
    this._muted = saved;
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
      // storage unavailable — ignore
    }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(value ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.02);
    }
    this.onMuteChange?.(value);
  }

  toggleMute(): boolean {
    this.muted = !this._muted;
    return this._muted;
  }

  /** Browsers require a user gesture: create / resume the AudioContext on the first input. */
  attachAutoUnlock(): void {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const handler = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(ev, handler, { passive: true });
    }
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : MASTER_VOLUME;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // 2 s of white noise reused by every noise-based sound
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Engine: sawtooth + sub-octave square through a resonant low-pass
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc.frequency.value = 45;
    this.engSub = ctx.createOscillator();
    this.engSub.type = 'square';
    this.engSub.frequency.value = 22;
    this.engSubGain = ctx.createGain();
    this.engSubGain.gain.value = 0.5;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 300;
    this.engFilter.Q.value = 4;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter);
    this.engSub.connect(this.engSubGain).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc.start();
    this.engSub.start();

    // Skid: band-passed noise
    const skidSrc = this.loopNoise();
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 2100;
    this.skidFilter.Q.value = 3;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    skidSrc?.connect(this.skidFilter).connect(this.skidGain).connect(this.master);

    // Pour: low-passed noise (water stream)
    const pourSrc = this.loopNoise();
    this.pourFilter = ctx.createBiquadFilter();
    this.pourFilter.type = 'lowpass';
    this.pourFilter.frequency.value = 900;
    this.pourGain = ctx.createGain();
    this.pourGain.gain.value = 0;
    pourSrc?.connect(this.pourFilter).connect(this.pourGain).connect(this.master);
  }

  private loopNoise(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  // ------------------------------------------------------------------ continuous loops
  setEngine(state: EngineState | null): void {
    if (!this.ctx || !this.engOsc || !this.engSub || !this.engGain || !this.engFilter || !this.engSubGain) return;
    const now = this.ctx.currentTime;
    if (!state) {
      this.engGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }
    const ratio = Math.min(1.2, Math.abs(state.speed) / Math.max(1, state.maxSpeed));
    const thr = Math.max(0, state.throttle);
    let freq: number, cutoff: number, gain: number, subMix: number;
    if (state.kind === 'escooter') {
      this.engOsc.type = 'sine';
      freq = 170 + ratio * 650 + thr * 40;
      cutoff = 2400;
      gain = ratio < 0.02 && thr === 0 ? 0.004 : 0.022 + thr * 0.018;
      subMix = 0.05;
    } else if (state.kind === 'scooter') {
      // CVT moped: continuous rpm rise
      this.engOsc.type = 'sawtooth';
      const rpm = 0.28 + ratio * 0.72 + thr * 0.12;
      freq = 36 + rpm * 92;
      cutoff = 280 + rpm * 900 + thr * 450;
      gain = 0.034 + thr * 0.026;
      subMix = 0.45;
    } else {
      // 4-speed car: rpm saw-tooths through gears
      this.engOsc.type = 'sawtooth';
      const gearPos = Math.min(3.999, ratio * 4);
      const gear = Math.floor(gearPos);
      const rpm = 0.26 + (gearPos - gear) * 0.6 + (gear > 0 ? 0.12 : 0) + thr * 0.06;
      freq = 28 + rpm * 78;
      cutoff = 220 + rpm * 700 + thr * 520;
      gain = 0.04 + thr * 0.03;
      subMix = 0.6;
    }
    this.engOsc.frequency.setTargetAtTime(freq, now, 0.05);
    this.engSub.frequency.setTargetAtTime(freq * 0.5, now, 0.05);
    this.engSubGain.gain.setTargetAtTime(subMix, now, 0.1);
    this.engFilter.frequency.setTargetAtTime(cutoff, now, 0.06);
    this.engGain.gain.setTargetAtTime(gain, now, 0.08);
  }

  /** 0..1 tyre squeal / brake skid intensity. */
  setSkid(amount: number): void {
    if (!this.ctx || !this.skidGain || !this.skidFilter) return;
    const now = this.ctx.currentTime;
    const a = Math.max(0, Math.min(1, amount));
    this.skidGain.gain.setTargetAtTime(a < 0.05 ? 0 : a * 0.085, now, 0.05);
    this.skidFilter.frequency.setTargetAtTime(1700 + a * 900, now, 0.08);
  }

  /** Kettle hot-water pouring loop. */
  setPour(active: boolean): void {
    if (!this.ctx || !this.pourGain || !this.pourFilter) return;
    const now = this.ctx.currentTime;
    this.pourGain.gain.setTargetAtTime(active ? 0.05 : 0, now, 0.12);
    if (active) this.pourFilter.frequency.setTargetAtTime(700 + Math.random() * 500, now, 0.2);
  }

  /** Fade every loop (pause menu, mod menu, focus loss). */
  silenceLoops(): void {
    this.setEngine(null);
    this.setSkid(0);
    this.setPour(false);
  }

  // ------------------------------------------------------------------ one-shots
  footstep(sprinting: boolean, surface: SurfaceKind = 'concrete'): void {
    const soft = surface === 'grass' || surface === 'dirt';
    this.noise(0.07, 'lowpass', soft ? 500 : sprinting ? 1500 : 1100, sprinting ? 0.11 : 0.07, 0.8);
    this.tone(sprinting ? 120 : 95, 45, 0.06, 'triangle', soft ? 0.03 : sprinting ? 0.06 : 0.04);
  }

  vehicleEnter(kind: EngineKind): void {
    if (kind === 'car') {
      this.tone(110, 48, 0.16, 'sine', 0.16);
      this.noise(0.05, 'lowpass', 900, 0.08);
      setTimeout(() => this.tone(60, 120, 0.35, 'sawtooth', 0.05), 220);
    } else if (kind === 'scooter') {
      this.noise(0.04, 'highpass', 2500, 0.06);
      setTimeout(() => this.tone(55, 110, 0.3, 'sawtooth', 0.06), 120);
    } else {
      this.tone(1320, 1320, 0.07, 'square', 0.035);
      setTimeout(() => this.tone(1760, 1760, 0.09, 'square', 0.035), 100);
    }
  }

  vehicleExit(kind: EngineKind): void {
    if (kind === 'car') {
      this.noise(0.04, 'highpass', 1800, 0.04);
      setTimeout(() => this.tone(105, 45, 0.18, 'sine', 0.17), 260);
    } else if (kind === 'scooter') {
      this.noise(0.05, 'highpass', 2200, 0.06);
    } else {
      this.tone(1760, 1320, 0.1, 'square', 0.03);
    }
  }

  crash(impact: number): void {
    const v = Math.min(1, impact / 12);
    this.noise(0.25 + v * 0.25, 'lowpass', 500 + v * 900, 0.08 + v * 0.22, 0.7);
    this.tone(80, 35, 0.22, 'sine', 0.1 + v * 0.18);
  }

  /** Soft click for doors, shelves, counters, desks. */
  interact(): void {
    this.tone(880, 620, 0.05, 'square', 0.03);
    this.noise(0.03, 'bandpass', 3000, 0.03);
  }

  /** Classic electric school bell (~2 s). */
  schoolBell(): void {
    if (this._muted || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 2.0;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.085, now + 0.03);
    out.gain.setValueAtTime(0.085, now + dur - 0.25);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(trem.gain);
    for (const [f, type] of [[1046, 'triangle'], [2093, 'sine'], [3140, 'sine']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(trem);
      o.start(now);
      o.stop(now + dur + 0.05);
    }
    trem.connect(out).connect(this.master);
    lfo.start(now);
    lfo.stop(now + dur + 0.05);
  }

  kettleClick(): void {
    this.noise(0.03, 'highpass', 3000, 0.06);
    this.tone(1400, 900, 0.04, 'square', 0.025);
  }

  noodleReady(): void {
    this.tone(1318, 1318, 0.18, 'sine', 0.08);
    setTimeout(() => this.tone(1760, 1760, 0.3, 'sine', 0.08), 150);
  }

  alert(): void {
    this.tone(540, 740, 0.14, 'sawtooth', 0.07);
  }

  pickup(): void {
    this.tone(587, 880, 0.12, 'sine', 0.08);
    setTimeout(() => this.tone(880, 1175, 0.16, 'sine', 0.07), 90);
  }

  missionComplete(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      setTimeout(() => this.tone(f, f * 1.01, 0.22, 'triangle', 0.09), i * 110);
    });
  }

  whistle(): void {
    this.tone(1900, 1650, 0.22, 'sine', 0.08);
    setTimeout(() => this.tone(1850, 1400, 0.28, 'sine', 0.07), 240);
  }

  boilBubble(): void {
    const f = 320 + Math.random() * 240;
    this.tone(f, f * 1.45, 0.09, 'sine', 0.045);
  }

  // ------------------------------------------------------------------ primitives
  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    if (this._muted || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private noise(dur: number, type: BiquadFilterType, freq: number, vol: number, q = 1): void {
    if (this._muted || !this.ctx || !this.master || !this.noiseBuf) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(now, Math.random() * 1.5);
    src.stop(now + dur + 0.02);
  }
}
