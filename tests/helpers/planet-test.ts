import type { Page } from '@playwright/test';
import type { PlanetTestControls, PlanetTestNavigationFixture } from '../../src/dev/test-bridge-types';

// evaluate callbacks run in the browser: keep guards inside them, never close over a Node helper.
export const planetSnapshot = (page: Page) =>
  page.evaluate(() => {
    const bridge = window.__planetTest;
    if (!bridge) throw new Error('Planet test bridge missing; load a DEV page with ?test=1.');
    return bridge.snapshot();
  });

export async function authoredSnapshot(page: Page) {
  const state = await planetSnapshot(page);
  if (
    !state.phase ||
    !state.reaction ||
    state.jumps === undefined ||
    state.recoveries === undefined ||
    state.landings === undefined
  ) {
    throw new Error('Expected an authored driving snapshot.');
  }
  return {
    ...state,
    phase: state.phase,
    reaction: state.reaction,
    jumps: state.jumps,
    recoveries: state.recoveries,
    landings: state.landings,
  };
}

export async function localeSnapshot(page: Page) {
  const state = await authoredSnapshot(page);
  if (!state.local) throw new Error('Expected a single-locale driving snapshot.');
  return { ...state, local: state.local };
}

export async function tourSnapshot(page: Page) {
  const state = await authoredSnapshot(page);
  if (!state.tour) throw new Error('Expected a Tour snapshot.');
  return { ...state, tour: state.tour };
}

export const planetRoutes = (page: Page) =>
  page.evaluate(() => {
    const bridge = window.__planetTest;
    if (!bridge) throw new Error('Planet test bridge missing; load a DEV page with ?test=1.');
    return bridge.routes();
  });

export async function bayRoutes(page: Page) {
  const routes = await planetRoutes(page);
  if (!routes || !('safe' in routes)) throw new Error('Expected Bay route fixtures.');
  return routes;
}

export async function roadRoutes(page: Page) {
  const routes = await planetRoutes(page);
  if (!routes || !('outer' in routes)) throw new Error('Expected Station or Garden route fixtures.');
  return routes;
}

export async function tourRoutes(page: Page) {
  const routes = await planetRoutes(page);
  if (!routes || !('legs' in routes)) throw new Error('Expected Tour route fixtures.');
  return routes;
}

export const setPlanetControls = (page: Page, controls: PlanetTestControls | null) =>
  page.evaluate(controls => {
    const bridge = window.__planetTest;
    if (!bridge) throw new Error('Planet test bridge missing; load a DEV page with ?test=1.');
    bridge.setControls(controls);
  }, controls);

export const setNavigationFixture = (page: Page, pose: PlanetTestNavigationFixture) =>
  page.evaluate(pose => {
    const bridge = window.__planetTest;
    if (!bridge) throw new Error('Planet test bridge missing; load a DEV page with ?test=1.');
    bridge.setNavigationFixture(pose);
  }, pose);

export const dockAtTarget = (page: Page) =>
  page.evaluate(() => {
    const bridge = window.__planetTest;
    if (!bridge) throw new Error('Planet test bridge missing; load a DEV page with ?test=1.');
    bridge.dockAtTarget();
  });

export const dockAtStop = (page: Page, index: number) =>
  page.evaluate(index => {
    const bridge = window.__planetTest;
    if (!bridge) throw new Error('Planet test bridge missing; load a DEV page with ?test=1.');
    bridge.dockAtStop(index);
  }, index);
