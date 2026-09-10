import { afterEach, describe, expect, it, vi } from 'vitest';
import { BayDrive } from './bay-driving';
import { DELIVERY_HOLD, DeliveryRun } from './game';
import { TourLayout } from './tour-layout';
import { TOUR_RECORD_KEY, TourSession } from './tour-session';
import { spherical } from './math';

const dock = (session: TourSession, index = session.index) =>
  session.update(DELIVERY_HOLD, session.destinations[index].normal, 0);
afterEach(() => vi.unstubAllGlobals());

describe('Tour ordered delivery and active splits', () => {
  it('reuses DeliveryRun eligibility and records only the exact returned delivery index once', () => {
    const session = new TourSession();
    const baseline = new DeliveryRun(session.destinations, { keepDrivingOnFinish: true });
    session.start();
    baseline.start();
    const inputs: [number, number, number, number, boolean][] = [
      [1, 1, 0, 0, true],
      [1, 0, 0, 0, false],
      [1, 0, 0, 0.3, true],
      [1, 0, 2, 0, true],
      [NaN, 0, 0, 0, true],
      [-1, 0, 0, 0, true],
      [0, 0, 0, 0, true],
      [0.3, 0, 0, 0, true],
      [0.3, 0, 0, 0, true],
      [1, 0, 0, 0, true],
      [0.6, 1, 0, 0, true],
      [1, 1, 0, 0, true],
      [0.6, 2, 0, 0, true],
      [1, 2, 0, 0, true],
    ];
    const delivered: number[] = [];
    for (const [dt, index, speed, altitude, grounded] of inputs) {
      const normal = session.destinations[index].normal;
      const event = session.update(dt, normal, speed, altitude, grounded);
      expect(event).toEqual(baseline.update(dt, normal, speed, altitude, grounded));
      expect(session.elapsed).toBe(baseline.elapsed);
      expect(session.index).toBe(baseline.index);
      if (event) delivered.push(event.index);
      expect(session.splits).toHaveLength(delivered.length);
    }
    expect(delivered).toEqual([0, 1, 2]);
    expect(session.splits.map(s => s.stopId)).toEqual(['bay', 'station', 'garden']);
    expect(session.splits.reduce((total, s) => total + s.elapsed, 0)).toBeCloseTo(session.elapsed, 12);
    expect(session.splits[2].cumulative).toBe(session.elapsed);
    expect(session.finished).toBe(true);
    expect(session.mode).toBe('playing');
    expect(session.currentStop).toBeUndefined();
  });

  it('counts transfer and voluntary waiting in the following split, excluding pauses and post-finish time', () => {
    const session = new TourSession();
    session.start();
    session.update(2, session.layout.spawnPose.normal, 3);
    dock(session);
    expect(session.splits[0].elapsed).toBe(2 + DELIVERY_HOLD);
    session.update(4, session.destinations[0].normal, 0);
    session.pause();
    expect(session.update(100, session.destinations[1].normal, 0)).toBeNull();
    const time = session.elapsed;
    expect(session.updateLocation(session.layout.stops[1].entryPose.normal, true)).toBe(false);
    session.resume();
    expect(session.elapsed).toBe(time);
    dock(session);
    expect(session.splits[1].elapsed).toBeCloseTo(4 + DELIVERY_HOLD, 12);
    dock(session);
    const finished = session.elapsed,
      splits = session.splits;
    expect(session.update(100, session.destinations[2].normal, 0)).toBeNull();
    session.pause();
    session.resume();
    expect(session.mode).toBe('playing');
    expect(session.elapsed).toBe(finished);
    expect(session.splits).toEqual(splits);
  });

  it('performs no storage writes and exports a distinct final-total record key', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem });
    const session = new TourSession();
    session.start();
    dock(session);
    dock(session);
    dock(session);
    session.home();
    session.start();
    expect(setItem).not.toHaveBeenCalled();
    expect(TOUR_RECORD_KEY).toBe('tiny-planet-courier:tour:best:v1');
  });
});

describe('Tour earned recovery points', () => {
  it('starts at Bay and never grants an unvisited next entrance merely because index advanced', () => {
    const session = new TourSession();
    const [bay, station, garden] = session.layout.stops;
    expect(session.checkpoint).toMatchObject({ stopId: 'bay', kind: 'entry', label: 'Sunrise Bakery entrance' });
    expect(session.checkpoint.pose).toEqual(bay.entryPose);
    expect(session.updateLocation(station.entryPose.normal, true)).toBe(false);
    session.start();
    expect(session.updateLocation(garden.entryPose.normal, true)).toBe(false);
    dock(session);
    expect(session.currentStop?.id).toBe('station');
    expect(session.checkpoint.pose).toEqual(bay.deliveredPose);
    expect(session.checkpoint).toMatchObject({ stopId: 'bay', kind: 'pad' });
    expect(session.entryVisited).toEqual([true, false, false]);
    expect(session.updateLocation(bay.destination.normal, true)).toBe(false);
    expect(session.updateLocation(station.entryPose.normal, false)).toBe(false);
    expect(session.updateLocation(station.level.toNormal(-12.6, 0), true)).toBe(false);
    expect(session.checkpoint.pose).toEqual(bay.deliveredPose);
    expect(session.updateLocation(station.level.toNormal(-12.4, 0), true)).toBe(true);
    expect(session.checkpoint.pose).toEqual(station.entryPose);
    expect(session.updateLocation(station.entryPose.normal, true)).toBe(false);
    expect(session.entryVisited).toEqual([true, true, false]);
    dock(session);
    expect(session.checkpoint.pose).toEqual(station.deliveredPose);
    expect(session.updateLocation(garden.entryPose.normal, true)).toBe(true);
    dock(session);
    expect(session.checkpoint.pose).toEqual(garden.deliveredPose);
    expect(session.updateLocation(bay.entryPose.normal, true)).toBe(false);
    expect(session.checkpoint.pose).toEqual(garden.deliveredPose);
  });

  it('allows off-road deliveries without entrance visits and protects owned poses and arrays', () => {
    const session = new TourSession();
    session.start();
    dock(session);
    dock(session);
    dock(session);
    expect(session.entryVisited).toEqual([true, false, false]);
    expect(session.finished).toBe(true);
    const checkpoint = session.checkpoint;
    const expected = session.checkpoint;
    checkpoint.pose.normal.set(0, 0, 0);
    checkpoint.pose.forward.set(0, 0, 0);
    expect(session.checkpoint).toEqual(expected);
    const splits = session.splits as { stopId: string; elapsed: number; cumulative: number }[];
    splits[0].elapsed = 200;
    splits.pop();
    expect(session.splits).toHaveLength(3);
    expect(session.splits[0].elapsed).toBe(DELIVERY_HOLD);
    const visited = session.entryVisited as boolean[];
    visited[1] = true;
    expect(session.entryVisited[1]).toBe(false);
    // Session checkpoints retain their own copies even if a view edits layout descriptors.
    session.layout.stops[0].entryPose.normal.copy(spherical(-80, 0));
    session.start();
    expect(session.checkpoint.pose.normal).toEqual(session.layout.spawnPose.normal);
  });

  it('uses real manual and automatic recovery without changing scoring or earned progress', () => {
    const layout = new TourLayout();
    const session = new TourSession(layout);
    const environment = layout.createEnvironment([]);
    const drive = new BayDrive(environment);
    session.start();
    dock(session);
    environment.recoveryPose = session.checkpoint.pose;
    const checkpoint = session.checkpoint,
      splits = session.splits,
      time = session.elapsed;
    drive.recover();
    expect(drive.normal).toEqual(checkpoint.pose.normal);
    expect(session.index).toBe(1);
    expect(session.elapsed).toBe(time);
    expect(session.splits).toEqual(splits);
    expect(session.updateLocation(drive.normal, true)).toBe(false);
    expect(session.checkpoint).toEqual(checkpoint);

    // An unboosted, actually driven Bay approach splashes and uses the same earned pad.
    drive.reset();
    let splashed = false;
    for (let i = 0; i < 120 * 10 && !drive.recoveries; i++) {
      const events = drive.update(1 / 120, { throttle: 1, steer: 0, boost: false });
      splashed ||= events.some(event => event.type === 'splash');
    }
    expect(splashed).toBe(true);
    expect(drive.recoveries).toBe(1);
    expect(drive.normal).toEqual(checkpoint.pose.normal);
    expect(session.index).toBe(1);
    expect(session.elapsed).toBe(time);
    expect(session.splits).toEqual(splits);
  });

  it.each(['partial', 'finished'] as const)('resets every journey field on start and home after a %s run', state => {
    const session = new TourSession();
    const exercise = () => {
      session.start();
      dock(session);
      session.updateLocation(session.layout.stops[1].entryPose.normal, true);
      if (state === 'finished') {
        dock(session);
        dock(session);
      }
      session.pause();
    };
    const resetState = () => {
      expect(session.index).toBe(0);
      expect(session.elapsed).toBe(0);
      expect(session.parkedFor).toBe(0);
      expect(session.splits).toEqual([]);
      expect(session.entryVisited).toEqual([true, false, false]);
      expect(session.checkpoint).toMatchObject({ stopId: 'bay', kind: 'entry' });
      expect(session.currentStop?.id).toBe('bay');
      expect(session.finished).toBe(false);
    };
    exercise();
    session.start();
    resetState();
    expect(session.mode).toBe('playing');
    exercise();
    session.home();
    resetState();
    expect(session.mode).toBe('home');
    expect(session.update(10, session.destinations[0].normal, 0)).toBeNull();
  });
});
