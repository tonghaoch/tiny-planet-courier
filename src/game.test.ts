import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeliveryRun, formatTime, readBest, saveBest } from './game';
import { spherical, type Destination } from './math';

const targets: Destination[] = [0, 35, 90].map((lon, i) => ({
  id: String(i),
  name: 'Station',
  label: 'STATION',
  parcel: 'Package',
  normal: spherical(0, lon),
  color: 0xffffff,
}));
const wait = (run: DeliveryRun, seconds = 0.7, speed = 0, altitude = 0) => {
  const target = run.target!.normal.clone();
  let result = null;
  for (let i = 0; i < seconds * 120; i++) result = run.update(1 / 120, target, speed, altitude) ?? result;
  return result;
};

afterEach(() => vi.unstubAllGlobals());

describe('delivery journey', () => {
  it('requires starting before the timer can advance', () => {
    const run = new DeliveryRun(targets);
    wait(run);
    expect(run.index).toBe(0);
    expect(run.elapsed).toBe(0);
  });

  it('requires proximity, low speed, grounded parking, and continuous dwell', () => {
    const run = new DeliveryRun(targets);
    run.start();
    run.update(1, spherical(0, 160), 0);
    expect(run.index).toBe(0);
    wait(run, 1, 2);
    wait(run, 1, -2);
    wait(run, 1, 0, 0.6);
    expect(run.index).toBe(0);
    wait(run, 0.3);
    run.update(1 / 120, spherical(0, 160), 0);
    wait(run, 0.3);
    expect(run.index).toBe(0);
    expect(wait(run)).toEqual({ index: 0, finished: false });
    expect(run.index).toBe(1);
  });

  it('delivers each parcel exactly once, then stops the timer', () => {
    const run = new DeliveryRun(targets);
    run.start();
    for (let i = 0; i < 3; i++) expect(wait(run)).toEqual({ index: i, finished: i === 2 });
    expect(run.mode).toBe('complete');
    expect(run.index).toBe(3);
    const elapsed = run.elapsed;
    expect(run.update(10, targets[2].normal, 0)).toBeNull();
    expect(run.elapsed).toBe(elapsed);
  });

  it('pauses time and parking progress, then resets the journey on restart', () => {
    const run = new DeliveryRun(targets);
    run.start();
    wait(run, 0.2);
    run.pause();
    const elapsed = run.elapsed;
    wait(run, 2);
    expect(run.elapsed).toBe(elapsed);
    expect(run.index).toBe(0);
    run.resume();
    wait(run);
    expect(run.index).toBe(1);
    run.start();
    expect(run.index).toBe(0);
    expect(run.elapsed).toBe(0);
    expect(run.parkedFor).toBe(0);
  });

  it('ignores invalid time deltas', () => {
    const run = new DeliveryRun(targets);
    run.start();
    for (const dt of [NaN, Infinity, -1, 0]) run.update(dt, targets[0].normal, 0);
    expect(run.elapsed).toBe(0);
    expect(run.index).toBe(0);
  });
});

describe('local record and time presentation', () => {
  it('formats minutes, seconds and optional fractions', () => {
    expect(formatTime(65.28)).toBe('01:05');
    expect(formatTime(65.28, true)).toBe('01:05.2');
    expect(formatTime(Infinity)).toBe('00:00');
  });

  it('gracefully tolerates unavailable browser storage', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    });
    expect(readBest()).toBeNull();
    expect(saveBest(24)).toBe(false);
  });

  it('only saves a valid improved record', () => {
    let record: string | null = null;
    vi.stubGlobal('localStorage', {
      getItem: () => record,
      setItem: (_key: string, value: string) => {
        record = value;
      },
    });
    expect(saveBest(30)).toBe(true);
    expect(saveBest(40)).toBe(false);
    expect(saveBest(20)).toBe(true);
    expect(saveBest(NaN)).toBe(false);
    expect(readBest()).toBe(20);
    record = 'not-a-number';
    expect(readBest()).toBeNull();
  });
});
