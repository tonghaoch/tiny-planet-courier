import { afterEach, describe, expect, it, vi } from 'vitest';
import { BayDrive } from './bay-driving';
import { DELIVERY_HOLD, DeliveryRun } from './game';
import { TourLayout } from './tour-layout';
import { TOUR_RECORD_KEY, TourSession } from './tour-session';
import { copyTourPlan, createTourPlan, eligibleSecondBags, TOUR_LOCATION_IDS } from './tour-itinerary';
import { spherical } from './math';

const plan = copyTourPlan({
  ...createTourPlan(0),
  order: [...TOUR_LOCATION_IDS, ...eligibleSecondBags(TOUR_LOCATION_IDS)[0]],
});
const makeSession = () => new TourSession(new TourLayout(), plan);
const dock = (session: TourSession, index = session.index) =>
  session.update(DELIVERY_HOLD, session.destinations[index].normal, 0);
afterEach(() => vi.unstubAllGlobals());

describe('ten independent delivery occurrences', () => {
  it('retains exact DeliveryRun policy, resolves repeat IDs, and freezes only at ten', () => {
    const session = makeSession();
    const baseline = new DeliveryRun(session.destinations, { keepDrivingOnFinish: true });
    session.start();
    baseline.start();
    for (let index = 0; index < 10; index++) {
      expect(session.currentStop).toBe(session.layout.location(plan.order[index]));
      expect(session.currentLocationId).toBe(plan.order[index]);
      const normal = session.target!.normal;
      for (const [dt, speed, altitude, grounded] of [
        [NaN, 0, 0, true],
        [-1, 0, 0, true],
        [1, 0, 0, false],
        [1, 0, 0.3, true],
        [1, 2, 0, true],
        [0.3, 0, 0, true],
        [0.3, 0, 0, true],
      ] as const) {
        const expected = baseline.update(dt, normal, speed, altitude, grounded);
        const actual = session.update(dt, normal, speed, altitude, grounded);
        if (expected) expect(actual).toMatchObject(expected);
        else expect(actual).toBeNull();
        expect(session.elapsed).toBe(baseline.elapsed);
        expect(session.index).toBe(baseline.index);
      }
      expect(session.splits).toHaveLength(index + 1);
      expect(session.completedLocationId).toBe(plan.order[index]);
      expect(session.update(DELIVERY_HOLD, normal, 0)).toBeNull();
      baseline.update(DELIVERY_HOLD, normal, 0);
      if (index < 9) expect(session.finished).toBe(false);
    }
    expect(session.finished).toBe(true);
    expect(session.mode).toBe('playing');
    expect(session.currentStop).toBeUndefined();
    expect(session.currentLocationId).toBeUndefined();
    expect(new Set(session.splits.map(split => split.occurrenceId)).size).toBe(10);
    expect(session.splits.map(split => split.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(session.splits.reduce((total, split) => total + split.elapsed, 0)).toBeCloseTo(session.elapsed, 12);
    const elapsed = session.elapsed;
    session.update(100, session.destinations[9].normal, 0);
    expect(session.elapsed).toBe(elapsed);
  });

  it('counts transfers and waiting, but not pauses or post-finish time', () => {
    const session = makeSession();
    session.start();
    session.update(2, session.layout.spawnPose.normal, 3);
    dock(session);
    expect(session.splits[0].elapsed).toBe(2 + DELIVERY_HOLD);
    session.update(4, session.destinations[0].normal, 0);
    session.pause();
    const time = session.elapsed;
    expect(session.update(100, session.target!.normal, 0)).toBeNull();
    expect(session.updateLocation(session.currentStop!.entryPose.normal, true)).toBe(false);
    session.resume();
    expect(session.elapsed).toBe(time);
    dock(session);
    expect(session.splits[1].elapsed).toBeCloseTo(4 + DELIVERY_HOLD, 12);
    while (!session.finished) dock(session);
    const finished = session.elapsed;
    session.pause();
    session.resume();
    session.update(100, session.destinations[9].normal, 0);
    expect(session.elapsed).toBe(finished);
  });

  it('restarts/replays the same immutable plan, explicitly starts a new one, and isolates records without storage', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem });
    const session = makeSession();
    const original = session.plan;
    const key = session.recordKey;
    expect(TOUR_RECORD_KEY).toBe('tiny-planet-courier:tour:best:v1');
    expect(key).not.toBe(TOUR_RECORD_KEY);
    session.start();
    dock(session);
    session.restart();
    expect(session.plan).toBe(original);
    expect(session.index).toBe(0);
    expect(session.splits).toEqual([]);
    while (!session.finished) dock(session);
    session.home();
    expect(session.mode).toBe('home');
    expect(session.index).toBe(0);
    expect(session.elapsed).toBe(0);
    expect(session.plan).toBe(original);
    expect(session.recordKey).toBe(key);
    session.newTour(42);
    expect(session.plan).toEqual(createTourPlan(42));
    expect(session.recordKey).not.toBe(key);
    session.startPlan({ ...original, seed: 999 });
    expect(session.recordKey).toBe(key);
    expect(session.destinations).toHaveLength(10);
    expect(setItem).not.toHaveBeenCalled();
    expect(() => session.startPlan({ ...original, order: [] })).toThrow(RangeError);
    expect(session.plan.order).toEqual(original.order);
  });
});

describe('actually-earned per-leg recovery', () => {
  it('earns grounded transit entrances, never unlocks remotely, and clears previous visits each leg', () => {
    const session = makeSession();
    const [bay, station, garden] = session.layout.stops;
    expect(session.checkpoint.pose).toEqual(bay.entryPose);
    expect(session.updateLocation(station.entryPose.normal, true)).toBe(false);
    session.start();
    expect(session.updateLocation(garden.entryPose.normal, false)).toBe(false);
    expect(session.updateLocation(garden.entryPose.normal, true)).toBe(true);
    expect(session.checkpoint.stopId).toBe('garden');
    expect(session.updateLocation(garden.entryPose.normal, true)).toBe(false);
    dock(session);
    expect(session.entryVisited).toEqual([false, false, false, false, false]);
    expect(session.checkpoint).toMatchObject({ stopId: 'bay', kind: 'pad', legIndex: 1 });
    expect(session.updateLocation(station.level.toNormal(-12.6, 0), true)).toBe(false);
    expect(session.updateLocation(station.level.toNormal(-12.4, 0), true)).toBe(true);
    dock(session);
    expect(session.currentLocationId).toBe('garden');
    expect(session.checkpoint.stopId).toBe('station');
    expect(session.updateLocation(garden.entryPose.normal, true)).toBe(true);
    while (session.index < 5) dock(session);
    expect(session.checkpoint.kind).toBe('pad');
    expect(session.entryVisited.every(value => !value)).toBe(true);
    const next = session.currentStop!;
    expect(session.checkpoint.stopId).not.toBe(next.id);
    expect(session.updateLocation(next.entryPose.normal, false)).toBe(false);
    expect(session.updateLocation(next.entryPose.normal, true)).toBe(true);
    while (!session.finished) dock(session);
    expect(session.updateLocation(bay.entryPose.normal, true)).toBe(false);
  });

  it('protects safe poses, splits, and observations from mutation', () => {
    const session = makeSession();
    session.start();
    dock(session);
    const expected = session.checkpoint;
    session.checkpoint.pose.normal.set(0, 0, 0);
    session.checkpoint.pose.forward.set(0, 0, 0);
    expect(session.checkpoint).toEqual(expected);
    const splits = session.splits;
    Reflect.set(splits[0], 'elapsed', 200);
    Array.prototype.pop.call(splits);
    expect(session.splits[0].elapsed).toBe(DELIVERY_HOLD);
    session.layout.stops[0].entryPose.normal.copy(spherical(-80, 0));
    session.restart();
    expect(session.checkpoint.pose.normal).toEqual(session.layout.spawnPose.normal);
    const snapshot = session.plan;
    for (let i = 0; i < 20; i++) {
      void session.checkpoint;
      void session.currentStop;
      void session.splits;
      session.routeForLeg(0, 'wide');
    }
    expect(session.plan).toBe(snapshot);
    expect(session.routeForLeg(0, 'wide')).toBe(session.routeForLeg(0, 'wide'));
  });

  it('uses real manual and automatic recovery without changing progress or scoring', () => {
    const session = makeSession();
    const environment = session.layout.createEnvironment([]);
    const drive = new BayDrive(environment);
    session.start();
    dock(session);
    environment.recoveryPose = session.checkpoint.pose;
    const checkpoint = session.checkpoint,
      splits = session.splits,
      time = session.elapsed;
    drive.recover();
    expect(drive.normal).toEqual(checkpoint.pose.normal);
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
});
