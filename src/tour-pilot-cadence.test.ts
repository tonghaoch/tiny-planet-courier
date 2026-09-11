import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createTourFrameDriver,
  createTourLegPilot,
  pageDriverStatus,
  startPageDriver,
  stopPageDriver,
  type TourDriverGoal,
} from '../tests/helpers/tour-browser-driver';
import type { PlanetTestSnapshot } from './dev/test-bridge-types';
import { BayDrive } from './bay-driving';
import { createTourPlan } from './tour-itinerary';
import { TourSession } from './tour-session';
import type { Controls } from './vehicle';
import { PlanetWorld } from './world';

let world: PlanetWorld;
beforeAll(() => {
  world = new PlanetWorld('tour');
});

function driveTour(seed: number, refreshTicks: number, delayTicks = 0) {
  const variant = seed === 55 ? 'short' : 'wide';
  const layout = world.tourLayout!;
  const environment = world.drivingEnvironment!;
  environment.spawnPose = layout.spawnPose;
  environment.recoveryPose = layout.spawnPose;
  const drive = new BayDrive(environment);
  const session = new TourSession(layout, createTourPlan(seed));
  session.start();
  let minimum = Infinity;
  let collision: { leg: number; local: { x: number; y: number } } | null = null;
  for (let index = 0; index < 10; index++) {
    const stop = session.currentStop!;
    const leg = {
      index,
      occurrenceId: session.occurrenceId(index),
      stopId: stop.id,
      destination: stop.destination.normal.toArray(),
      entry: { normal: stop.entryPose.normal.toArray(), forward: stop.entryPose.forward.toArray() },
      pad: { normal: stop.deliveredPose.normal.toArray(), forward: stop.deliveredPose.forward.toArray() },
      wide: session.routeForLeg(index, 'wide').map(point => point.toArray()),
      short: session.routeForLeg(index, 'short').map(point => point.toArray()),
    };
    const pilot = createTourLegPilot(
      {
        index,
        path: leg[variant],
        destination: leg.destination,
        leg,
        variant,
        physical: layout.stops.findIndex(site => site.id === stop.id),
      },
      drive.jumps,
    );
    let input: Controls = { throttle: 0, steer: 0, boost: false };
    let pending = input;
    for (let tick = 0; tick < 120 * 85 && session.index === index; tick++) {
      if (tick % refreshTicks === 0)
        pending = pilot({
          normal: drive.normal.toArray(),
          forward: drive.forward.toArray(),
          speed: drive.speed,
          phase: drive.phase,
          jumps: drive.jumps,
          recoveries: drive.recoveries,
          entryVisited: session.entryVisited,
        });
      if (tick % refreshTicks === delayTicks) input = pending;
      const events = drive.update(1 / 120, input);
      const local = layout.location('station').level.toLocal(drive.normal);
      minimum = Math.min(minimum, Math.hypot(local.x + 2, local.y - 1.3) - 1.31);
      if (events.some(event => event.type === 'collision')) {
        collision = { leg: index, local };
        return { collision, minimum, index: session.index, jumps: drive.jumps, recoveries: drive.recoveries };
      }
      session.updateLocation(drive.normal, drive.phase === 'grounded');
      session.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
      world.setTourRecoveryPose(session.checkpoint.pose);
    }
    if (session.index !== index + 1) break;
  }
  return { collision, minimum, index: session.index, jumps: drive.jumps, recoveries: drive.recoveries };
}

describe('Tour input refresh cadence with unchanged 120Hz physics and actual scenery', () => {
  it.each([227, 9, 55].flatMap(seed => [2, 4].map(ticks => [seed, ticks])))(
    'seed %s at one input per %s ticks',
    (seed, ticks) => {
      const result = driveTour(seed, ticks);
      process.stdout.write(`${JSON.stringify({ seed, hz: 120 / ticks, ...result })}\n`);
      expect(result.collision).toBeNull();
      expect(result.index).toBe(10);
      expect(result.recoveries).toBe(0);
      expect(result.jumps).toBe(seed === 55 ? 2 : 0);
      // Positive geometric clearance, not merely an impact below the event threshold.
      expect(result.minimum).toBeGreaterThan(0);
    },
  );

  it.each([227, 9, 55])('diagnoses stale 133ms refresh + 33ms input age for seed %s', seed => {
    const result = driveTour(seed, 16, 4);
    process.stdout.write(`${JSON.stringify({ seed, hz: 7.5, delayMs: 1000 / 30, ...result })}\n`);
    expect(result.collision).not.toBeNull();
    expect(Math.hypot(result.collision!.local.x + 2, result.collision!.local.y - 1.3)).toBeLessThan(1.4);
  });
});

describe('page-local driver lifecycle (isolated bridge/scheduler doubles)', () => {
  afterEach(() => {
    stopPageDriver();
    vi.unstubAllGlobals();
  });
  function fixture() {
    // This snapshot double only exercises scheduling, not application driving.
    let state = {
      mode: 'playing',
      index: 0,
      elapsed: 0,
      normal: [0, 1, 0],
      forward: [1, 0, 0],
      speed: 0,
      phase: 'grounded',
      jumps: 0,
      recoveries: 0,
      events: [],
    } as unknown as PlanetTestSnapshot;
    let now = 0;
    let id = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    const scheduler = {
      request: (callback: FrameRequestCallback) => {
        callbacks.set(++id, callback);
        return id;
      },
      cancel: vi.fn((id: number) => {
        callbacks.delete(id);
      }),
      now: () => now,
    };
    const bridge = { snapshot: () => structuredClone(state), setControls: vi.fn() };
    const goal: TourDriverGoal = {
      index: 0,
      path: [
        [0, 1, 0],
        [1, 0, 0],
      ],
      destination: [1, 0, 0],
    };
    const advance = (patch: Partial<PlanetTestSnapshot> = {}) => {
      now += 1000 / 60;
      state = { ...state, elapsed: state.elapsed + 1 / 60, ...patch };
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(now);
    };
    return { bridge, goal, scheduler, advance, callbacks };
  }

  it.each(['delivery', 'entry', 'closing'] as const)('stops at %s without a subsequent input overwrite', reason => {
    const f = fixture();
    const goal = { ...f.goal, untilEntry: reason === 'entry', physical: 0, closing: reason === 'closing' };
    // The closing goal is already nearby; no pose jump is needed in this scheduler test.
    if (reason === 'closing') goal.destination = [0, 1, 0];
    const driver = createTourFrameDriver(f.bridge, goal, f.scheduler);
    const stale = [...f.callbacks.values()][0];
    f.advance(
      reason === 'delivery'
        ? { index: 1 }
        : reason === 'entry'
          ? { tour: { entryVisited: [true], catalog: [] } as unknown as PlanetTestSnapshot['tour'] }
          : {},
    );
    expect(driver.status().reason).toBe(reason);
    expect(f.callbacks.size).toBe(0);
    expect(f.bridge.setControls).toHaveBeenLastCalledWith(null);
    const count = f.bridge.setControls.mock.calls.length;
    stale(100);
    driver.stop();
    expect(f.bridge.setControls).toHaveBeenCalledTimes(count);
    if (reason === 'delivery') {
      expect(driver.status().handoff!.pre.index).toBe(0);
      expect(driver.status().handoff!.post.index).toBe(1);
      expect(driver.status().handoff!.post.elapsed - driver.status().handoff!.pre.elapsed).toBeCloseTo(1 / 60);
    }
  });

  it('latches collision evidence even if later observations would drop the event', () => {
    const f = fixture();
    const driver = createTourFrameDriver(f.bridge, f.goal, f.scheduler);
    f.advance({ events: ['collision'] });
    f.advance({ events: [] });
    expect(driver.status().reason).toBe('error');
    expect(driver.status().error).toContain('collision');
    expect(driver.status().latest.events).toEqual(['collision']);
    expect(f.callbacks.size).toBe(0);
  });

  it('bounds telemetry and cancels on observer errors', () => {
    const f = fixture();
    const driver = createTourFrameDriver(f.bridge, f.goal, f.scheduler);
    for (let i = 0; i < 300; i++) f.advance();
    expect(driver.status().telemetry.frames).toBe(300);
    expect(driver.status().telemetry.simulatedMs).toHaveLength(256);
    expect(driver.status().telemetry.observationMs).toHaveLength(256);
    f.bridge.snapshot = () => {
      throw new Error('observation failed');
    };
    f.advance();
    expect(driver.status().error).toBe('observation failed');
    expect(f.callbacks.size).toBe(0);
    expect(f.bridge.setControls).toHaveBeenLastCalledWith(null);
  });

  it('replacement and cleanup disarm old callbacks before the next leg', () => {
    const f = fixture();
    vi.stubGlobal('window', { __planetTest: f.bridge });
    vi.stubGlobal('requestAnimationFrame', function (this: unknown, callback: FrameRequestCallback) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return f.scheduler.request(callback);
    });
    vi.stubGlobal('cancelAnimationFrame', function (this: unknown, id: number) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      f.scheduler.cancel(id);
    });
    vi.stubGlobal('document', { querySelector: () => null });
    startPageDriver(f.goal);
    const stale = [...f.callbacks.values()][0];
    startPageDriver(f.goal);
    const count = f.bridge.setControls.mock.calls.length;
    stale(100);
    expect(f.bridge.setControls).toHaveBeenCalledTimes(count);
    expect(f.callbacks.size).toBe(1);
    f.advance();
    expect(pageDriverStatus().telemetry.frames).toBe(1);
    stopPageDriver();
    expect(f.callbacks.size).toBe(0);
    expect(pageDriverStatus().reason).toBe('cancelled');
  });
});
