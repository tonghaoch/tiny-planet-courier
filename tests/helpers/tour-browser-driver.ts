import type { Page } from '@playwright/test';
import { Vector3 } from 'three';
import type { PlanetTestBridge, PlanetTestSnapshot, PlanetTestTourLeg } from '../../src/dev/test-bridge-types';
import { surfaceDistance } from '../../src/math';
import { createTourPilot } from './tour-pilot';

const vector = (value: number[]) => new Vector3().fromArray(value);
export interface TourDriverGoal {
  index: number;
  path: number[][];
  destination: number[];
  leg?: PlanetTestTourLeg;
  variant?: 'wide' | 'short';
  physical?: number;
  untilEntry?: boolean;
  closing?: boolean;
}

/** Shared with the fixed-step cadence regression; only adapts occurrence-local Bay jumps. */
export function createTourLegPilot(goal: TourDriverGoal, initialJumps: number) {
  let pilot = createTourPilot(goal.path.map(vector), vector(goal.destination), false);
  let localBay = false;
  return (
    state: Pick<PlanetTestSnapshot, 'normal' | 'forward' | 'speed' | 'phase' | 'jumps' | 'recoveries'> & {
      entryVisited: readonly boolean[];
    },
  ) => {
    const leg = goal.leg;
    if (goal.variant === 'short' && leg?.stopId === 'bay' && state.entryVisited[goal.physical!] && !localBay) {
      const entryIndex = leg.short.reduce(
        (best, point, index, path) =>
          surfaceDistance(vector(point), vector(leg.entry.normal)) <
          surfaceDistance(vector(path[best]), vector(leg.entry.normal))
            ? index
            : best,
        0,
      );
      pilot = createTourPilot(leg.short.slice(entryIndex).map(vector), vector(leg.destination), true);
      initialJumps = state.jumps!;
      localBay = true;
    }
    return pilot({
      ...state,
      normal: vector(state.normal),
      forward: vector(state.forward),
      phase: state.phase!,
      jumps: state.jumps! - initialJumps,
      recoveries: state.recoveries!,
    });
  };
}

type Observation = PlanetTestSnapshot & { missionDistance: string | null };
export interface TourDriverStatus {
  running: boolean;
  reason: 'delivery' | 'entry' | 'closing' | 'cancelled' | 'error' | null;
  error: string | null;
  latest: Observation;
  handoff: { pre: Observation; post: Observation } | null;
  reversed: boolean;
  inactiveSites: string[];
  telemetry: {
    frames: number;
    simulatedMs: number[];
    observationMs: number[];
    minStationPlanterClearance: number;
  };
}
export function summarizeTourDriverTelemetry(telemetry: TourDriverStatus['telemetry']) {
  const summarize = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      max: sorted.at(-1),
    };
  };
  return {
    frames: telemetry.frames,
    simulatedMs: summarize(telemetry.simulatedMs),
    observationMs: summarize(telemetry.observationMs),
    minStationPlanterClearance: telemetry.minStationPlanterClearance,
  };
}

interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
  now(): number;
}

/** A bounded observer/controller loop. Node assertions never delay the next input. */
export function createTourFrameDriver(
  bridge: Pick<PlanetTestBridge, 'snapshot' | 'setControls'>,
  goal: TourDriverGoal,
  scheduler: FrameScheduler,
  missionDistance: () => string | null = () => null,
) {
  const observe = (): Observation => ({ ...bridge.snapshot(), missionDistance: missionDistance() });
  const initial = observe();
  const pilot = createTourLegPilot(goal, initial.jumps!);
  const inactiveSites = new Set<string>();
  const status: TourDriverStatus = {
    running: true,
    reason: null,
    error: null,
    latest: initial,
    handoff: null,
    reversed: false,
    inactiveSites: [],
    telemetry: { frames: 0, simulatedMs: [], observationMs: [], minStationPlanterClearance: Infinity },
  };
  let frameId = 0;
  let lastTime = scheduler.now();
  const stop = (reason: TourDriverStatus['reason'] = 'cancelled') => {
    if (!status.running) return;
    status.running = false;
    status.reason = reason;
    scheduler.cancel(frameId);
    bridge.setControls(null);
  };
  const bounded = (values: number[], value: number) => {
    if (values.length === 256) values.shift();
    values.push(value);
  };
  const frame = () => {
    if (!status.running) return;
    try {
      const start = scheduler.now();
      const state = observe();
      const previous = status.latest;
      status.latest = state;
      status.telemetry.frames++;
      bounded(status.telemetry.observationMs, scheduler.now() - start);
      const dt = goal.closing ? (start - lastTime) / 1000 : state.elapsed - previous.elapsed;
      lastTime = start;
      bounded(status.telemetry.simulatedMs, dt * 1000);
      if (state.index !== previous.index) status.handoff = { pre: previous, post: state };
      const station = state.tour?.catalog.find(site => site.id === 'station');
      if (station) {
        const local = state.tour!.locals[station.index];
        status.telemetry.minStationPlanterClearance = Math.min(
          status.telemetry.minStationPlanterClearance,
          Math.hypot(local.x + 2, local.y - 1.3) - 1 - 0.31,
        );
      }
      if (state.events.includes('collision')) throw new Error('Real driving collision');
      if (state.recoveries !== initial.recoveries) throw new Error('Real driving recovery');
      if (surfaceDistance(vector(previous.normal), vector(state.normal)) >= Math.max(0, dt) * 8.5 + 0.45)
        throw new Error('Non-continuous real driving pose');
      for (const site of state.tour?.catalog ?? []) {
        if (
          site.id !== goal.leg?.stopId &&
          site.id !== initial.tour?.completedLocationId &&
          !initial.tour!.entryVisited[site.index] &&
          state.tour!.entryVisited[site.index] &&
          surfaceDistance(vector(state.normal), vector(site.entry.normal)) < 1.6
        )
          inactiveSites.add(site.id);
      }
      status.inactiveSites = [...inactiveSites];
      if (goal.untilEntry && state.tour?.entryVisited[goal.physical!]) return stop('entry');
      if (!goal.closing && state.index > goal.index) return stop('delivery');
      if (
        goal.closing &&
        surfaceDistance(vector(state.normal), vector(goal.destination)) < 1.08 &&
        Math.abs(state.speed) < 1.15
      )
        return stop('closing');
      if (state.mode !== 'playing') throw new Error(`Driving interrupted: ${state.mode}`);
      const input = pilot({ ...state, entryVisited: state.tour?.entryVisited ?? [] });
      if (input.throttle < 0 && state.speed < -0.1) status.reversed = true;
      bridge.setControls(input);
      frameId = scheduler.request(frame);
    } catch (error) {
      status.error = error instanceof Error ? error.message : String(error);
      stop('error');
    }
  };
  frameId = scheduler.request(frame);
  return { status: () => status, stop };
}

let active: ReturnType<typeof createTourFrameDriver> | undefined;
export function startPageDriver(goal: TourDriverGoal) {
  active?.stop();
  const bridge = window.__planetTest;
  if (!bridge) throw new Error('Planet test bridge missing');
  active = createTourFrameDriver(
    bridge,
    goal,
    {
      request: callback => requestAnimationFrame(callback),
      cancel: id => cancelAnimationFrame(id),
      now: () => performance.now(),
    },
    () => document.querySelector('#mission-distance')?.textContent ?? null,
  );
}
export const pageDriverStatus = () => {
  if (!active) throw new Error('Tour driver missing');
  return active.status();
};
export const stopPageDriver = () => active?.stop();

// Vite transforms this module and its pure pilot imports; Playwright is type-only.
export async function startTourBrowserDriver(page: Page, goal: TourDriverGoal) {
  await page.evaluate(async goal => {
    const path = '/tests/helpers/tour-browser-driver.ts';
    const driver = (await import(/* @vite-ignore */ path)) as typeof import('./tour-browser-driver');
    driver.startPageDriver(goal);
  }, goal);
}
export async function tourBrowserDriverStatus(page: Page) {
  return page.evaluate(async () => {
    const path = '/tests/helpers/tour-browser-driver.ts';
    const driver = (await import(/* @vite-ignore */ path)) as typeof import('./tour-browser-driver');
    return driver.pageDriverStatus();
  });
}
export async function stopTourBrowserDriver(page: Page) {
  if (page.isClosed()) return;
  await page.evaluate(async () => {
    const path = '/tests/helpers/tour-browser-driver.ts';
    const driver = (await import(/* @vite-ignore */ path)) as typeof import('./tour-browser-driver');
    driver.stopPageDriver();
  });
}
