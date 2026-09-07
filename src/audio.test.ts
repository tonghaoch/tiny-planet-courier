import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { AudioFeedback } from './audio';

class Parameter {
  value = 0;
  setValueAtTime(value: number) { this.value = value; return this; }
  setTargetAtTime(value: number) { this.value = value; return this; }
  linearRampToValueAtTime(value: number) { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number) { this.value = value; return this; }
}
class Node {
  gain = new Parameter();
  frequency = new Parameter();
  type = 'sine';
  loop = false;
  buffer: unknown;
  starts = 0;
  immediateStops = 0;
  scheduledStops = 0;
  onended: (() => void) | null = null;
  connect() { return this; }
  disconnect() {}
  start() { this.starts++; }
  stop(at?: number) {
    if (at === undefined) { this.immediateStops++; this.onended?.(); }
    else this.scheduledStops++;
  }
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static failResume = false;
  currentTime = 1;
  sampleRate = 1024;
  state = 'suspended';
  destination = new Node();
  gains: Node[] = [];
  oscillators: Node[] = [];
  sources: Node[] = [];
  closed = false;
  constructor() { FakeAudioContext.instances.push(this); }
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  createBufferSource() { const node = new Node(); this.sources.push(node); return node; }
  createBuffer(_channels: number, samples: number) { return { getChannelData: () => new Float32Array(samples) }; }
  async resume() { if (FakeAudioContext.failResume) throw new Error('Audio blocked'); this.state = 'running'; }
  async close() { this.closed = true; this.state = 'closed'; }
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  FakeAudioContext.failResume = false;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});
afterEach(() => vi.unstubAllGlobals());

describe('quiet, bounded driving audio', () => {
  it('does not allocate audio until the player enables it', () => {
    const audio = new AudioFeedback();
    audio.updateDrive({ speed: 5, phase: 'grounded', boosting: true, active: true });
    audio.chime(true);
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(audio.enabled).toBe(false);
  });

  it('reuses engine and wind nodes through repeated updates and pauses', () => {
    const audio = new AudioFeedback();
    audio.toggle();
    const context = FakeAudioContext.instances[0];
    for (let i = 0; i < 200; i++) audio.updateDrive({ speed: i % 8, phase: i % 3 ? 'grounded' : 'airborne', boosting: i % 2 === 0, active: true });
    expect(context.oscillators).toHaveLength(1);
    expect(context.sources).toHaveLength(1);
    expect(context.oscillators[0].starts).toBe(1);
    audio.setPaused(true);
    expect(context.gains[0].gain.value).toBe(0);
    audio.updateDrive({ speed: 7, phase: 'grounded', boosting: true, active: false });
    expect(context.gains.slice(1).every(node => node.gain.value === 0)).toBe(true);
    audio.setPaused(false);
    audio.updateDrive({ speed: 4, phase: 'grounded', boosting: false, active: true });
    expect(context.oscillators).toHaveLength(1);
    expect(context.sources).toHaveLength(1);
    audio.dispose();
    expect(context.closed).toBe(true);
  });

  it('mutes scheduled feedback as well as continuous sound', () => {
    const audio = new AudioFeedback();
    audio.toggle();
    audio.chime(true);
    audio.handle({ type: 'land', normal: new Vector3(0, 1, 0), strength: 0.6 });
    const context = FakeAudioContext.instances[0];
    expect(context.oscillators).toHaveLength(5);
    audio.toggle();
    expect(context.gains[0].gain.value).toBe(0);
    expect(context.oscillators.every(source => source.immediateStops === 1)).toBe(true);
    audio.chime();
    expect(context.oscillators).toHaveLength(5);
    audio.dispose();
  });

  it('does not schedule landing feedback while paused', () => {
    const audio = new AudioFeedback();
    audio.toggle();
    audio.setPaused(true);
    audio.handle({ type: 'land', normal: new Vector3(0, 1, 0), strength: 1 });
    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(0);
    audio.dispose();
  });

  it('gracefully handles unavailable or blocked audio', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const unavailable = new AudioFeedback();
    expect(unavailable.toggle()).toBe(false);
    expect(() => unavailable.dispose()).not.toThrow();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    FakeAudioContext.failResume = true;
    const blocked = new AudioFeedback();
    blocked.toggle();
    await vi.waitFor(() => expect(blocked.enabled).toBe(false));
    blocked.dispose();
  });
});
