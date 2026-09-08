import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { headingTo, surfaceDistance, spherical, tangent } from '../../src/math';
import { DELIVERY_RADIUS } from '../../src/game';
import { BayLevel } from '../../src/bay-level';
import { StationLevel } from '../../src/station-level';
import { GardenLevel } from '../../src/garden-level';
import { TourLayout } from '../../src/tour-layout';
import { createTourPilot } from '../helpers/tour-pilot';

const snapshot = (page: Page) => page.evaluate(() => ({ ...(window as any).__planetTest.snapshot(),
  missionName: document.querySelector('#mission-name')!.textContent,
  missionDistance: document.querySelector('#mission-distance')!.textContent }));
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const vector = (a: number[]) => new Vector3().fromArray(a);

/** Compare with the active delivery (or an independently authored destination), never a waypoint. */
function expectDestinationBearing(state: any, destination: number[] = state.target) {
  const g = state.guidance;
  expect(destination).toBeDefined();
  expect(state.target).toHaveLength(destination.length);
  destination.forEach((component, index) => expect(state.target[index]).toBeCloseTo(component, 12));
  expect(g.target).toEqual(state.target);
  expect(state.navigationTarget).toEqual(state.target);
  const distance = surfaceDistance(vector(g.normal), vector(state.target));
  expect(g.distance).toBeCloseTo(distance, 10);
  if (distance > 1e-6) {
    const expected = headingTo(vector(g.normal), vector(g.forward), vector(state.target));
    expect(g.canonicalHeading).toBeCloseTo(expected, 10);
    expect(g.directDestinationHeading).toBeCloseTo(expected, 10);
    expect(state.directDestinationHeading).toBeCloseTo(expected, 10);
    if (g.mode === 'steering') {
      expect(g.commandedHeading).toBeCloseTo(expected, 10);
      expect(state.hudHeading).toBeCloseTo(expected, 10);
    }
  } else expect(g.canonicalHeading).toBeNull();
  if (g.mode === 'parking' || g.mode === 'recovering') expect(state.hudHeading).toBeNull();
}

async function load(page: Page, mode: string) {
  await page.goto(`/?test=1&prototype=${mode}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Start delivering', exact: true }).click();
}

for (const reduced of [false, true]) {
  test(`real UI angle fixture: interrupted rendered retarget (reduced motion=${reduced})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    // Explicit presentation isolation; same UI class, stylesheet and render-tick method as main.
    await page.route('**/navigation-fixture', route => route.fulfill({ contentType: 'text/html', body: '<link rel="stylesheet" href="/src/style.css"><div id="app"></div>' }));
    await page.goto('/navigation-fixture');
    const samples = await page.evaluate(async reduced => {
      const uiPath = '/src/ui.ts', gamePath = '/src/game.ts';
      const { UI } = await import(uiPath), { DeliveryRun } = await import(gamePath);
      const ui = new UI();
      const destinations = [{ id: 'fixture', name: 'Angle fixture', parcel: 'Test parcel' }];
      const run = new DeliveryRun(destinations);
      ui.setDestinations(destinations); run.start();
      const command = (degrees: number) => ui.update(run, 0, 1, 12, degrees * Math.PI / 180);
      const rendered = () => {
        const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#direction-arrow')!).transform);
        return Math.atan2(m.b, m.a);
      };
      command(0);
      await document.fonts.ready;
      // Start after initial stylesheet/font/layout work, not during the cold page load.
      for (let i = 0; i < 3; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      command(170);
      // Like main's render tick, paint one frame of the new command immediately.
      ui.advanceNavigation(1 / 60);
      let last = performance.now(), start = last;
      let interrupted = false;
      const values: { before: number; after: number; dt: number }[] = [];
      let atInterrupt = 0;
      await new Promise<void>(resolve => {
        const frame = (now: number) => {
          const dt = (now - last) / 1000; last = now;
          if (!interrupted && now - start >= 60) {
            atInterrupt = rendered(); command(-20); interrupted = true;
          }
          const before = rendered();
          ui.advanceNavigation(dt);
          if (interrupted) values.push({ before, after: rendered(), dt });
          if (now - start > 330 && values.length >= 8) resolve(); else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const final = rendered();
      command(120); ui.setMode('paused');
      const paused = rendered(); ui.advanceNavigation(.2);
      const afterPause = rendered();
      ui.setMode('playing'); ui.resetNavigationPresentation(); command(-100);
      return { values, atInterrupt, final, paused, afterPause, reset: rendered(), reduced,
        transition: getComputedStyle(document.querySelector('#direction-arrow')!).transitionProperty };
    }, reduced);
    expect(samples.transition).toBe('none');
    expect(samples.values.length).toBeGreaterThan(2);
    if (!reduced) {
      expect(samples.atInterrupt).toBeGreaterThan(0);
      expect(samples.atInterrupt).toBeLessThan(170 * Math.PI / 180);
      for (const sample of samples.values) {
        const turn = angleDelta(sample.before, sample.after);
        const desired = angleDelta(sample.before, -20 * Math.PI / 180);
        expect(turn * desired).toBeGreaterThanOrEqual(-1e-6);
        expect(Math.abs(turn)).toBeLessThanOrEqual(Math.abs(desired) + 1e-6);
      }
      expect(samples.values[0].after).toBeLessThan(samples.atInterrupt);
    }
    expect(Math.abs(angleDelta(samples.final, -20 * Math.PI / 180))).toBeLessThan(.025);
    expect(samples.afterPause).toBe(samples.paused);
    expect(samples.reset).toBeCloseTo(-100 * Math.PI / 180, 5);
  });
}

for (const mode of ['bay', 'station', 'garden', 'tour', 'standard']) {
  test(`navigation state fixtures: ${mode} pad crossing, hysteresis, passive snapshots and reset`, async ({ page }) => {
    await load(page, mode);
    const states = await page.evaluate(radius => {
      const bridge = (window as any).__planetTest;
      const result = [];
      for (const offset of [-.02, 0, .02, radius + .1, radius + .26, radius + .1, .02]) {
        bridge.setNavigationFixture({ targetOffset: offset });
        result.push({ ...bridge.snapshot().guidance, hint: document.querySelector('#mission-hint')!.textContent,
          arrowHidden: getComputedStyle(document.querySelector('#direction-arrow')!).display === 'none' });
      }
      const before = bridge.snapshot();
      const repeated = Array.from({ length: 20 }, () => bridge.snapshot());
      // Mutating the returned diagnostics must not mutate subsequent snapshots or live caches.
      const exposed = bridge.snapshot();
      if (exposed.guidance.cursor) exposed.guidance.cursor.progress = -999;
      if (exposed.guidance.localCursor) exposed.guidance.localCursor.progress = -999;
      if (exposed.tour?.routeCache?.cursor) exposed.tour.routeCache.cursor.progress = -999;
      if (exposed.guidance.target) exposed.guidance.target[0] = -999;
      if (exposed.navigationTarget) exposed.navigationTarget[0] = -999;
      exposed.guidance.normal[0] = -999;
      exposed.guidance.forward[0] = -999;
      return { result, before, repeated, after: bridge.snapshot() };
    }, DELIVERY_RADIUS);
    expect(states.result.map(s => s.mode)).toEqual(['parking', 'parking', 'parking', 'parking', 'steering', 'steering', 'parking']);
    expect(states.result.slice(0, 4).every(s => s.arrowHidden && s.commandedHeading === null)).toBe(true);
    expect(states.result[3].hint).toBe('Move back into the ring to deliver.');
    expect(states.repeated.every(s => JSON.stringify(s.guidance) === JSON.stringify(states.before.guidance))).toBe(true);
    expect(states.after.guidance).toEqual(states.before.guidance);
    expect(states.after.tour?.routeCache).toEqual(states.before.tour?.routeCache);
    expectDestinationBearing(states.after);
    expect(JSON.stringify(states.before.guidance)).not.toContain('"path"');
    expect(JSON.stringify(states.before.tour?.routeCache ?? null)).not.toContain('"path"');
    expect(JSON.stringify(states.before.guidance).length).toBeLessThan(1200);
    // Outside eligibility but still in parking tolerance must not advance delivery.
    await page.evaluate(radius => (window as any).__planetTest.setNavigationFixture({ targetOffset: radius + .1 }), DELIVERY_RADIUS);
    await page.waitForTimeout(700);
    expect((await snapshot(page)).index).toBe(0);
    expect((await snapshot(page)).parkedFor).toBe(0);
    await expect(page.locator('#direction-cue')).toHaveText('P');
    await page.keyboard.press('KeyR');
    await expect.poll(async () => (await snapshot(page)).guidance).not.toBeNull();
    if (mode !== 'standard') await expect(page.locator('#direction-arrow')).toBeVisible();
    expectDestinationBearing(await snapshot(page));
    await page.keyboard.press('Escape');
    await expect(page.locator('#navigation-hud')).toBeHidden();
    expect((await snapshot(page)).guidance.mode).toBe('hidden');
    await page.getByRole('button', { name: 'Resume journey' }).click();
    await expect(page.locator('#navigation-hud')).toBeVisible();
    expectDestinationBearing(await snapshot(page));
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').getByRole('button', { name: /Restart/ }).click();
    await expect(page.locator('#direction-arrow')).toBeVisible();
    expect((await snapshot(page)).guidance.arrival).toBe(false);
    expect((await snapshot(page)).index).toBe(0);
    expectDestinationBearing(await snapshot(page));
    await page.getByRole('button', { name: 'Back to Tiny Planet home' }).click();
    await expect(page.locator('#navigation-hud')).toBeHidden();
    await page.getByRole('button', { name: 'Start delivering', exact: true }).click();
    await expect(page.locator('#direction-arrow')).toBeVisible();
    expect((await snapshot(page)).index).toBe(0);
    expectDestinationBearing(await snapshot(page));
  });
}

for (const mode of ['bay', 'tour', 'standard']) {
  test(`slow physical pad-center crossing keeps parking and unchanged handoff in ${mode}`, async ({ page }) => {
    await load(page, mode);
    // Explicit initial pose fixture; subsequent crossing and dwell use actual controller steps.
    await page.evaluate(() => (window as any).__planetTest.setNavigationFixture({ targetOffset: -.1, speed: 3, reset: true }));
    await expect(page.locator('#mission-hint')).toHaveText('Brake to make your delivery.');
    expect((await snapshot(page)).parkedFor).toBe(0);
    const before = await page.evaluate(() => {
      const bridge = (window as any).__planetTest;
      bridge.setNavigationFixture({ targetOffset: -.04, speed: .7, reset: true });
      return bridge.snapshot();
    });
    await page.waitForTimeout(180);
    const crossed = await snapshot(page);
    expect(vector(crossed.normal).sub(vector(before.target)).dot(vector(before.forward))).toBeGreaterThan(0);
    expect(crossed.index).toBe(0);
    expect(crossed.guidance.mode).toBe('parking');
    await expect(page.locator('#direction-arrow')).toBeHidden();
    expect(crossed.parkedFor).toBeGreaterThan(0);
    await expect.poll(async () => (await snapshot(page)).index).toBe(1);
    if (mode === 'bay') await expect(page.locator('#navigation-hud')).toBeHidden();
    else {
      await expect(page.locator('#direction-arrow')).toBeVisible();
      expect((await snapshot(page)).guidance.arrival).toBe(false);
      if (mode === 'tour') {
        expect((await snapshot(page)).tour.routeCache.index).toBe(1);
        expect((await snapshot(page)).guidance.phase).toBe('transfer');
      }
    }
  });
}

test('legacy airborne presentation is truthful without altering altitude eligibility', async ({ page }) => {
  await load(page, 'standard');
  const { state, coincident } = await page.evaluate(() => {
    const bridge = (window as any).__planetTest;
    bridge.setNavigationFixture({ targetOffset: .1, altitude: .1 });
    const state = bridge.snapshot();
    bridge.setNavigationFixture({ targetOffset: 0, altitude: .1 });
    return { state, coincident: { ...bridge.snapshot(),
      arrowHidden: getComputedStyle(document.querySelector('#direction-arrow')!).display === 'none',
      cueHidden: getComputedStyle(document.querySelector('#direction-cue')!).display === 'none',
      hint: document.querySelector('#mission-hint')!.textContent } };
  });
  expect(state.guidance.grounded).toBe(false);
  expect(state.guidance.mode).toBe('steering');
  expect(state.guidance.arrival).toBe(false);
  expectDestinationBearing(state);
  expectDestinationBearing(coincident);
  expect(coincident.guidance.grounded).toBe(false);
  expect(coincident.guidance.mode).toBe('hidden');
  expect(coincident.guidance.arrival).toBe(false);
  expect(coincident.hudHeading).toBeNull();
  expect(coincident.arrowHidden && coincident.cueHidden).toBe(true);
  expect(coincident.hint).toBe('Above the delivery. Land, then park.');
});

test('actual HUD Bay coast and Garden noise reproductions point to the active delivery', async ({ page }) => {
  for (const mode of ['bay', 'tour', 'garden']) {
    await load(page, mode);
    const values = await page.evaluate(mode => {
      const bridge = (window as any).__planetTest;
      const coordinates = mode === 'garden' ? [{ x: -7.540, y: 1 }, { x: -7.536, y: 1 }]
        : [{ x: -6, y: 1.299, heading: Math.PI / 2 }, { x: -6, y: 1.301, heading: Math.PI / 2 }];
      return coordinates.map((coordinate, index) => { bridge.setNavigationFixture({ ...coordinate, reset: index === 0 }); return bridge.snapshot(); });
    }, mode);
    expect(Math.abs(angleDelta(values[0].guidance.canonicalHeading, values[1].guidance.canonicalHeading)) * 180 / Math.PI).toBeLessThan(.2);
    for (const state of values) {
      const g = state.guidance;
      expectDestinationBearing(state);
      expect(g.branch).toBe(mode === 'garden' ? 'inner' : 'coast');
    }
  }
});

for (const mode of ['bay', 'station', 'garden', 'tour']) {
  test(`destination compass ignores ${mode} road bends and off-road route reacquisition`, async ({ page }) => {
    await load(page, mode);
    const level = mode === 'tour' ? new TourLayout().stops[0].level : mode === 'bay' ? new BayLevel()
      : mode === 'station' ? new StationLevel() : new GardenLevel();
    const bends = mode === 'station' ? [{ x: -7, y: -2.6 }, { x: -5, y: -4.4 }]
      : mode === 'garden' ? [{ x: -9.7, y: -2.8 }, { x: -6.1, y: -4.6 }]
      : [{ x: -6, y: 1.3 }, { x: -6, y: 2.8 }];
    const offRoad = mode === 'station' ? { x: -9, y: 3 } : mode === 'garden' ? { x: -12, y: 3 } : { x: -8, y: -3 };
    // Isolated pose fixtures, not evidence that a straight line is drivable.
    for (const [index, position] of [...bends, offRoad].entries()) {
      for (const heading of [0, Math.PI / 2, Math.PI]) {
        const state = await page.evaluate(pose => {
          const bridge = (window as any).__planetTest;
          bridge.setNavigationFixture(pose);
          return { ...bridge.snapshot(), name: document.querySelector('#mission-name')!.textContent,
            distanceText: document.querySelector('#mission-distance')!.textContent };
        }, { ...position, heading, reset: true });
        expectDestinationBearing(state, level.destination.normal.toArray());
        expect(state.guidance.mode).toBe('steering');
        expect(state.name).toBe(level.destination.name);
        expect(state.distanceText).toBe(`${Math.round(state.guidance.distance * 10)} m`);
        const normal = vector(state.guidance.normal), forward = vector(state.guidance.forward);
        const road = level.navigation(normal, null, { forward, grounded: true });
        if (index < bends.length) {
          expect(level.sampleSurface(normal).kind).toBe('road');
          const roadBearing = headingTo(normal, forward, road.target);
          expect(Math.abs(angleDelta(roadBearing, state.guidance.canonicalHeading))).toBeGreaterThan(Math.PI / 6);
          if (mode === 'bay' || mode === 'tour') {
            // The compass points across water while the selected coast road bends around it.
            expect(road.route).toBe('coast');
            expect(level.sampleSurface(normal.clone().lerp(level.destination.normal, .5).normalize()).kind).toBe('water');
          }
        } else expect(level.sampleSurface(normal).kind).toBe('ground');
      }
    }
  });
}

test('Tour handoff fixtures retarget the destination but keep reverse-to-exit road-aware', async ({ page }) => {
  await load(page, 'tour');
  const layout = new TourLayout();
  for (let index = 1; index < 3; index++) {
    // Delivery/state isolation only; the real-input Tour tests prove transfer playability.
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect.poll(async () => (await snapshot(page)).index).toBe(index);
    const handoff = await snapshot(page);
    const destination = layout.stops[index].destination;
    expectDestinationBearing(handoff, destination.normal.toArray());
    expect(handoff.missionName).toBe(destination.name);
    expect(handoff.guidance.phase).toBe('transfer');
    expect(handoff.tour.routeCache.index).toBe(index);
    const level = layout.stops[index].level;
    const position = level.toLocal(vector(handoff.normal));
    const normal = level.toNormal(position.x, position.y);
    // Pick both discriminating orientations from road geometry, not from the HUD.
    // At the Bay pad the two bearings differ by only about 3.6 degrees.
    const headings = new Map<string, number>();
    for (let degrees = 0; degrees < 360; degrees++) {
      const heading = degrees * Math.PI / 180;
      const forward = tangent(level.toNormal(position.x + Math.cos(heading) * .01, position.y + Math.sin(heading) * .01), normal);
      const road = layout.navigation(index, normal, null, true, { forward });
      const roadBehind = Math.abs(headingTo(normal, forward, road.target)) > Math.PI / 2;
      const destinationBehind = Math.abs(headingTo(normal, forward, destination.normal)) > Math.PI / 2;
      if (roadBehind !== destinationBehind) headings.set(`${roadBehind}:${destinationBehind}`, heading);
    }
    expect(headings.size).toBe(2);
    const values = await page.evaluate(({ position, headings }) => {
      const bridge = (window as any).__planetTest;
      return headings.map(heading => {
        bridge.setNavigationFixture({ ...position, heading, reset: true });
        return { ...bridge.snapshot(), hint: document.querySelector('#mission-hint')!.textContent };
      });
    }, { position, headings: [...headings.values()] });
    const disagreements = new Set<string>();
    for (const state of values) {
      expectDestinationBearing(state, destination.normal.toArray());
      const normal = vector(state.guidance.normal), forward = vector(state.guidance.forward);
      const road = layout.navigation(index, normal, null, true, { forward });
      const roadBearing = headingTo(normal, forward, road.target);
      const roadBehind = Math.abs(roadBearing) > Math.PI / 2;
      const destinationBehind = Math.abs(state.guidance.canonicalHeading) > Math.PI / 2;
      expect(state.hint).toBe(roadBehind ? 'Next road is behind you. Reverse and turn gently.'
        : `Follow the connecting road to ${destination.name}.`);
      if (roadBehind !== destinationBehind) disagreements.add(`${roadBehind}:${destinationBehind}`);
    }
    expect([...disagreements]).toEqual(expect.arrayContaining(['true:false', 'false:true']));
    // R restores the earned pad, not a path target or the preceding destination.
    await page.keyboard.press('KeyR');
    await expect(page.locator('#direction-arrow')).toBeVisible();
    expectDestinationBearing(await snapshot(page), destination.normal.toArray());
  }
});

test('original-game compass tracks driving, turning and destination handoffs', async ({ page }) => {
  await load(page, 'standard');
  const before = await snapshot(page);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  const headings = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(70);
    const state = await snapshot(page);
    expectDestinationBearing(state, spherical(30, 28).toArray());
    expect(state.guidance.mode).toBe('steering');
    expect(state.missionName).toBe('Sunrise Bakery');
    expect(state.missionDistance).toBe(`${Math.round(state.guidance.distance * 10)} m`);
    headings.push(state.guidance.canonicalHeading);
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  const after = await snapshot(page);
  expect(surfaceDistance(vector(before.normal), vector(after.normal))).toBeGreaterThan(.1);
  expect(Math.abs(angleDelta(headings[0], headings.at(-1)!))).toBeGreaterThan(.1);
  // Explicit handoff/visibility fixtures, separate from the physical movement above.
  const destinations = [spherical(30, 28), spherical(-10, 85), spherical(48, -50)];
  const names = ['Sunrise Bakery', 'Stargaze Station', 'Windmill Garden'];
  for (let index = 0; index < destinations.length; index++) {
    const state = await snapshot(page);
    expectDestinationBearing(state, destinations[index].toArray());
    expect(state.missionName).toBe(names[index]);
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect.poll(async () => (await snapshot(page)).index).toBe(index + 1);
  }
  await expect(page.locator('#navigation-hud')).toBeHidden();
  const complete = await snapshot(page);
  expect(complete.mode).toBe('complete');
  expect(complete.guidance.target).toBeNull();
  expect(complete.hudHeading).toBeNull();
});

test('real unboosted Bay splash uses a non-steering recovery cue then restores guidance', async ({ page }) => {
  await load(page, 'bay');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await snapshot(page)).phase, { timeout: 12000, intervals: [25] }).toBe('recovering');
  await page.keyboard.up('KeyW');
  await expect(page.locator('#direction-arrow')).toBeHidden();
  await expect(page.locator('#direction-cue')).toHaveText('···');
  expect((await snapshot(page)).hudHeading).toBeNull();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('grounded');
  await expect(page.locator('#direction-arrow')).toBeVisible();
  const state = await snapshot(page);
  expect(state.guidance.arrival).toBe(false);
  expect(state.events).toContain('recovered');
  expectDestinationBearing(state, new BayLevel().destination.normal.toArray());
});

/** Route fixtures choose the road; the HUD remains a destination compass.
 * This travel check supplies only real controller inputs, never pose fixtures. */
async function driveRouteWithCompass(page: Page, legs: any[]) {
  let previous = await snapshot(page);
  const branches = new Set<string>(), phases = new Set<string>();
  let count = 0;
  for (const leg of legs) {
    const pilot = createTourPilot(leg.path.map(vector), vector(leg.destination), false);
    const deadline = Date.now() + 85000;
    let delivered = false;
    while (Date.now() < deadline) {
      const state = await snapshot(page), g = state.guidance;
      expect(state.recoveries).toBe(0);
      expect(state.events).not.toContain('collision');
      expect(surfaceDistance(vector(previous.normal), vector(state.normal))).toBeLessThan((state.elapsed - previous.elapsed) * 8.5 + .45);
      if (state.index > leg.index) {
        expect(state.index).toBe(leg.index + 1);
        if (state.target) expectDestinationBearing(state, legs[state.index].destination);
        await page.evaluate(() => (window as any).__planetTest.setControls(null));
        previous = state;
        delivered = true;
        break;
      }
      expectDestinationBearing(state, leg.destination);
      branches.add(`${state.index}:${g.branch}`); phases.add(`${state.index}:${g.phase}`);
      expect(state.missionDistance).toBe(`${Math.round(g.distance * 10)} m`);
      const input = pilot({ ...state, normal: vector(state.normal), forward: vector(state.forward) });
      await page.evaluate(value => (window as any).__planetTest.setControls(value), input);
      previous = state; count++;
      await page.waitForTimeout(40);
    }
    expect(delivered, `Route fixture leg ${leg.index}: ${JSON.stringify(await snapshot(page))}`).toBe(true);
  }
  return { state: await snapshot(page), branches: [...branches], phases: [...phases], count };
}

for (const mode of ['bay', 'station', 'garden', 'tour']) {
  test(`real route-fixture controller drives ${mode} while the compass points to each delivery`, async ({ page }) => {
    test.setTimeout(mode === 'tour' ? 300000 : 100000);
    await load(page, mode);
    const routes = await page.evaluate(() => (window as any).__planetTest.routes());
    const legs = mode === 'tour' ? routes.legs.map((leg: any) => ({ ...leg, path: leg.wide }))
      : [{ index: 0, destination: routes.destination, path: routes.safe ?? routes.outer }];
    const result = await driveRouteWithCompass(page, legs);
    expect(result.count).toBeGreaterThan(20);
    expect(result.state.finished).toBe(true);
    expect(result.state.recoveries).toBe(0);
    if (mode === 'bay' || mode === 'tour') expect(result.branches).toContain('0:coast');
    if (mode === 'tour') {
      expect(result.phases).toEqual(expect.arrayContaining(['0:local', '1:transfer', '1:local', '2:transfer', '2:local']));
      expect(result.state.tour.splits).toHaveLength(3);
    }
    await expect(page.locator('#navigation-hud')).toBeHidden();
    expect(result.state.guidance.target).toBeNull();
    expect(result.state.hudHeading).toBeNull();
  });
}
