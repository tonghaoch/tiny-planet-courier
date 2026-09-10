import type { BayDriveEvent, BayPhase } from './bay-types';

interface DriveSound {
  speed: number;
  boosting: boolean;
  phase: BayPhase;
  active: boolean;
}

export class AudioFeedback {
  enabled = false;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private paused = false;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private wind: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly transients = new Set<AudioScheduledSourceNode>();

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    else this.stopTransients();
    this.updateMaster();
    return this.enabled;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.paused ? 0 : 1;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => {
          this.enabled = false;
          this.updateMaster();
        });
      }
    } catch {
      this.enabled = false;
    }
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.stopTransients();
    else this.unlock();
    this.updateMaster();
  }

  private updateMaster() {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.enabled && !this.paused ? 1 : 0, this.context.currentTime, 0.025);
  }

  private stopTransients() {
    for (const source of this.transients) {
      try {
        source.stop();
      } catch {
        /* An already-ended source needs no further work. */
      }
      source.disconnect();
    }
    this.transients.clear();
  }

  private noiseBuffer(): AudioBuffer {
    const context = this.context!;
    if (!this.noise) {
      this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = this.noise.getChannelData(0);
      let sample = 0;
      for (let i = 0; i < data.length; i++) {
        sample = (sample + (Math.random() * 2 - 1) * 0.07) / 1.035;
        data[i] = sample;
      }
    }
    return this.noise;
  }

  private ensureDriveNodes() {
    if (this.engine || !this.context || !this.master) return;
    const context = this.context;
    this.engine = context.createOscillator();
    this.engine.type = 'triangle';
    this.engine.frequency.value = 48;
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    this.engine.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engine.start();
    this.wind = context.createBufferSource();
    this.wind.buffer = this.noiseBuffer();
    this.wind.loop = true;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(this.windGain);
    this.windGain.connect(this.master);
    this.wind.start();
  }

  updateDrive(state: DriveSound) {
    if (!this.enabled || !this.context) return;
    if (state.active) this.ensureDriveNodes();
    if (!this.engine || !this.engineGain || !this.windGain) return;
    const time = this.context.currentTime;
    const speed = Math.min(8, Math.abs(state.speed));
    const active = state.active && !this.paused && state.phase !== 'recovering';
    const grounded = state.phase === 'grounded';
    this.engine.frequency.setTargetAtTime(46 + speed * 12 + (state.boosting ? 12 : 0), time, 0.07);
    this.engineGain.gain.setTargetAtTime(active ? (grounded ? 0.004 + speed * 0.0018 : 0.001) : 0, time, 0.06);
    this.windGain.gain.setTargetAtTime(active ? (grounded ? speed * 0.004 : 0.09) : 0, time, 0.07);
  }

  private tone(
    frequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    delay = 0,
  ) {
    if (!this.enabled || this.paused || !this.context || !this.master) return;
    const context = this.context;
    const at = context.currentTime + delay;
    const source = context.createOscillator();
    const gain = context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, at);
    source.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(Math.min(0.1, Math.max(0, volume)), at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    source.connect(gain);
    gain.connect(this.master);
    this.transients.add(source);
    source.onended = () => {
      this.transients.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(at);
    source.stop(at + duration + 0.01);
  }

  private splashNoise() {
    if (!this.enabled || this.paused || !this.context || !this.master) return;
    const context = this.context;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer();
    gain.gain.setValueAtTime(0.45, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
    source.connect(gain);
    gain.connect(this.master);
    this.transients.add(source);
    source.onended = () => {
      this.transients.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    source.stop(context.currentTime + 0.32);
  }

  handle(event: BayDriveEvent) {
    if (!this.enabled) return;
    this.unlock();
    const strength = Math.min(1, Math.max(0, event.strength));
    if (event.type === 'boost') this.tone(105, 170, 0.17, 0.035, 'triangle');
    else if (event.type === 'launch') this.tone(290, 520, 0.18, 0.025);
    else if (event.type === 'land') this.tone(115, 42, 0.19, 0.025 + strength * 0.045, 'triangle');
    else if (event.type === 'collision') this.tone(90, 35, 0.13, 0.025 + strength * 0.02, 'triangle');
    else if (event.type === 'splash') {
      this.splashNoise();
      this.tone(440, 160, 0.25, 0.025);
    } else if (event.type === 'recovered') this.tone(440, 440, 0.15, 0.02);
  }

  chime(complete = false) {
    if (!this.enabled) return;
    this.unlock();
    const notes = complete ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 783.99, 987.77];
    notes.forEach((note, i) => this.tone(note, note, 0.45, 0.09, 'sine', i * 0.1));
  }

  dispose() {
    this.stopTransients();
    this.engine?.stop();
    this.wind?.stop();
    this.engine?.disconnect();
    this.wind?.disconnect();
    this.engineGain?.disconnect();
    this.windGain?.disconnect();
    this.master?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.engine = null;
    this.wind = null;
    this.engineGain = null;
    this.windGain = null;
    this.noise = null;
  }
}
