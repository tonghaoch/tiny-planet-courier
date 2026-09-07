import { afterEach, describe, expect, it, vi } from 'vitest';
import { BAY_RECORD_KEY, DeliveryRun, readBest, saveBest } from './game';
import { spherical, type Destination } from './math';

const bakery: Destination = { id: 'bay-bakery', name: 'Sunrise Bakery', label: 'SUNRISE BAKERY', parcel: 'Warm croissants', normal: spherical(25, 40), color: 0xf6b87b };
const dock = (run: DeliveryRun, grounded = true) => {
  const events = [];
  for (let i = 0; i < 90; i++) {
    const event = run.update(1 / 120, bakery.normal, 0, 0, grounded);
    if (event) events.push(event);
  }
  return events;
};

afterEach(() => vi.unstubAllGlobals());

describe('one-parcel bay session', () => {
  it('finishes once without blocking continued driving or advancing the clock', () => {
    const run = new DeliveryRun([bakery], { keepDrivingOnFinish: true });
    run.start();
    expect(dock(run)).toEqual([{ index: 0, finished: true }]);
    expect(run.finished).toBe(true);
    expect(run.mode).toBe('playing');
    const time = run.elapsed;
    expect(run.update(2, bakery.normal, 4.7)).toBeNull();
    expect(run.elapsed).toBe(time);
    expect(dock(run)).toEqual([]);
  });

  it('does not deliver during a low flight or recovery', () => {
    const run = new DeliveryRun([bakery], { keepDrivingOnFinish: true });
    run.start();
    expect(dock(run, false)).toEqual([]);
    expect(run.index).toBe(0);
    expect(run.parkedFor).toBe(0);
    expect(dock(run)).toHaveLength(1);
  });

  it('can pause after delivery and resets fully for another route', () => {
    const run = new DeliveryRun([bakery], { keepDrivingOnFinish: true });
    run.start();
    dock(run);
    const time = run.elapsed;
    run.pause();
    expect(run.mode).toBe('paused');
    run.update(10, bakery.normal, 0);
    run.resume();
    expect(run.mode).toBe('playing');
    expect(run.elapsed).toBe(time);
    run.start();
    expect(run.finished).toBe(false);
    expect(run.index).toBe(0);
    expect(run.elapsed).toBe(0);
    expect(dock(run)).toHaveLength(1);
  });

  it('does not change the original modal-completion policy', () => {
    const run = new DeliveryRun([bakery]);
    run.start();
    dock(run);
    expect(run.mode).toBe('complete');
  });

  it('keeps bay records separate from the original route', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    saveBest(67);
    saveBest(12.5, BAY_RECORD_KEY);
    expect(readBest()).toBe(67);
    expect(readBest(BAY_RECORD_KEY)).toBe(12.5);
    expect(saveBest(14, BAY_RECORD_KEY)).toBe(false);
    expect(saveBest(11, BAY_RECORD_KEY)).toBe(true);
    expect(readBest()).toBe(67);
  });
});
