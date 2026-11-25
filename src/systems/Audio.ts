/** Zero-asset Web Audio synthesizer for footsteps, alerts, pickups and engine hum. */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.ctx.destination);
    this.engineOsc.start();
  }

  setEngine(active: boolean, speed: number, electric: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const now = this.ctx.currentTime;
    if (!active || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }
    this.engineOsc.type = electric ? 'sine' : 'sawtooth';
    const base = electric ? 140 : 52;
    this.engineOsc.frequency.setTargetAtTime(base + Math.abs(speed) * (electric ? 18 : 6.5), now, 0.06);
    this.engineGain.gain.setTargetAtTime(electric ? 0.035 : 0.045, now, 0.08);
  }

  footstep(sprinting: boolean): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(sprinting ? 145 : 110, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.06);
    g.gain.setValueAtTime(sprinting ? 0.08 : 0.045, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
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

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }
}
