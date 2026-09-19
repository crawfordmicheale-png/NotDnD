/**
 * Procedural sound effects built from oscillators and noise bursts.
 * No audio files are shipped; everything is synthesized at runtime.
 */
export type SfxName =
  | "swing"
  | "heavy"
  | "hit"
  | "hitArmor"
  | "hurt"
  | "dodge"
  | "pickup"
  | "scrap"
  | "levelup"
  | "spell"
  | "spit"
  | "die"
  | "bossRoar"
  | "eat"
  | "denied"
  | "rest"
  | "ui";

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;
  volume = 0.5;

  /** Must be invoked from a user gesture to satisfy autoplay policies. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  private tone(freq: number, endFreq: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, filterType: BiquadFilterType = "lowpass", delay = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  play(name: SfxName): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case "swing":
        this.noise(0.12, 0.25, 1800, "bandpass");
        break;
      case "heavy":
        this.noise(0.25, 0.35, 900, "bandpass");
        this.tone(140, 60, 0.25, "sine", 0.2);
        break;
      case "hit":
        this.noise(0.08, 0.5, 600);
        this.tone(220, 80, 0.12, "square", 0.15);
        break;
      case "hitArmor":
        this.tone(900, 300, 0.1, "triangle", 0.25);
        this.noise(0.06, 0.3, 3000, "highpass");
        break;
      case "hurt":
        this.tone(300, 120, 0.2, "sawtooth", 0.25);
        this.noise(0.15, 0.3, 500);
        break;
      case "dodge":
        this.noise(0.18, 0.15, 2500, "highpass");
        break;
      case "pickup":
        this.tone(600, 900, 0.08, "square", 0.12);
        this.tone(900, 1200, 0.1, "square", 0.12, 0.07);
        break;
      case "scrap":
        this.tone(1200, 1500, 0.05, "square", 0.08);
        break;
      case "levelup":
        this.tone(440, 440, 0.12, "triangle", 0.2);
        this.tone(554, 554, 0.12, "triangle", 0.2, 0.12);
        this.tone(659, 659, 0.12, "triangle", 0.2, 0.24);
        this.tone(880, 880, 0.3, "triangle", 0.25, 0.36);
        break;
      case "spell":
        this.tone(200, 1200, 0.25, "sawtooth", 0.18);
        this.noise(0.2, 0.15, 2000, "bandpass");
        break;
      case "spit":
        this.tone(500, 150, 0.15, "sine", 0.15);
        break;
      case "die":
        this.tone(180, 40, 0.5, "sawtooth", 0.25);
        this.noise(0.4, 0.3, 400);
        break;
      case "bossRoar":
        this.tone(90, 40, 1.2, "sawtooth", 0.4);
        this.noise(1.0, 0.35, 300);
        break;
      case "eat":
        this.tone(300, 200, 0.08, "square", 0.1);
        this.tone(320, 220, 0.08, "square", 0.1, 0.1);
        break;
      case "denied":
        this.tone(200, 150, 0.15, "square", 0.15);
        break;
      case "rest":
        this.tone(330, 330, 0.3, "sine", 0.15);
        this.tone(495, 495, 0.5, "sine", 0.15, 0.2);
        break;
      case "ui":
        this.tone(800, 800, 0.04, "square", 0.06);
        break;
    }
  }
}
