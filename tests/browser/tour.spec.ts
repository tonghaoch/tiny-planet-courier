import type { PlanetTestSnapshot, PlanetTestTourLeg, PlanetTestTourRoutes } from '../../src/dev/test-bridge-types';
import { tourSnapshot, setPlanetControls, dockAtLocation, tourRoutes } from '../helpers/planet-test';
import { deliverFixture, firstTargetPlans, fullTourCases, location, NORTHERN_SEED } from '../helpers/tour-fixture';
import { createTourPlan } from '../../src/tour-itinerary';
import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { surfaceDistance } from '../../src/math';
import {
  startTourBrowserDriver,
  stopTourBrowserDriver,
  tourBrowserDriverStatus,
  summarizeTourDriverTelemetry,
} from '../helpers/tour-browser-driver';

const key = 'tiny-planet-courier:tour:best:v1';
const legacyKeys = [
  'tiny-planet-courier:best:v1',
  'tiny-planet-courier:bay-leap:best:v1',
  'tiny-planet-courier:station:best:v1',
  'tiny-planet-courier:garden:best:v1',
  key,
];
const snapshot = (page: Page) => tourSnapshot(page);
const vector = (value: number[]) => new Vector3().fromArray(value);
const controls = (page: Page, value: { throttle: number; steer: number; boost: boolean } | null) =>
  setPlanetControls(page, value);
const fixtures = (page: Page) => tourRoutes(page);

async function loadTour(page: Page, seed = NORTHERN_SEED) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/?prototype=tour&test=1&tourSeed=${seed}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-prototype', 'tour');
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('#parcel-count')).toHaveText('10');
  await expect(page.getByRole('button', { name: 'Enable sound effects' })).toHaveAttribute('aria-pressed', 'false');
  return errors;
}

/** The continuity proof only supplies real controller inputs. Never call dockAtTarget here. */
async function driveLeg(
  page: Page,
  leg: PlanetTestTourLeg,
  variant: 'wide' | 'short',
  untilEntry = false,
  inactiveSites = new Set<string>(),
) {
  const initial = await snapshot(page);
  const physical = location(initial.tour, leg.stopId).index;
  const deadline = Date.now() + 85000;
  let previous: PlanetTestSnapshot = initial;
  await startTourBrowserDriver(page, {
    index: leg.index,
    path: leg[variant],
    destination: leg.destination,
    leg,
    variant,
    physical,
    untilEntry,
  });
  try {
    while (Date.now() < deadline) {
      const driver = await tourBrowserDriverStatus(page);
      const state = { ...driver.latest, tour: driver.latest.tour! };
      expect(driver.error, JSON.stringify(driver)).toBeNull();
      for (const site of driver.inactiveSites) inactiveSites.add(site);
      // Teleport/pose reset would violate this surface-distance bound, including at handoffs.
      const travelled = surfaceDistance(vector(previous.normal), vector(state.normal));
      expect(travelled).toBeLessThan(Math.max(0, state.elapsed - previous.elapsed) * 8.5 + 0.45);
      expect(state.recoveries).toBe(previous.recoveries);
      expect(state.events).not.toContain('collision');
      expect(state.tour.recoveryPose).toEqual(state.tour.checkpoint.pose);
      expect(state.tour.plan).toEqual(initial.tour.plan);
      if (untilEntry && state.tour.entryVisited[physical]) {
        await controls(page, null);
        return state;
      }
      if (state.index > leg.index) {
        await controls(page, null);
        expect(state.index).toBe(leg.index + 1);
        expect(state.cargoCount).toBe(9 - leg.index);
        expect(state.tour.handoffs.map(h => h.index)).toEqual(Array.from({ length: leg.index + 1 }, (_, i) => i));
        const handoff = state.tour.handoffs.at(-1)!;
        expect(handoff).toMatchObject({
          remaining: 9 - leg.index,
          locationId: leg.stopId,
          occurrenceId: leg.occurrenceId,
        });
        expect(driver.handoff).not.toBeNull();
        const { pre, post } = driver.handoff!;
        expect(vector(handoff.forward).dot(vector(pre.forward))).toBeGreaterThan(0.95);
        expect(vector(post.forward).dot(vector(handoff.forward))).toBeGreaterThan(0.95);
        expect(Math.abs(post.speed - handoff.speed)).toBeLessThan(0.5);
        expect(Math.abs(post.charge - handoff.charge)).toBeLessThan(0.1);
        expect(vector(handoff.origin).distanceTo(vector(pre.cargoPositions[0]))).toBeLessThan(0.5);
        expect(state.tour.splits).toHaveLength(leg.index + 1);
        expect(state.tour.splits.at(-1)).toMatchObject({
          index: leg.index,
          occurrenceId: leg.occurrenceId,
          stopId: leg.stopId,
        });
        expect(state.tour.checkpoint).toMatchObject({ kind: 'pad', stopId: leg.stopId, legIndex: leg.index + 1 });
        if (variant === 'wide' && initial.tour.completedLocationId === 'station' && leg.stopId === 'garden')
          expect(driver.reversed).toBe(true);
        console.log(
          `Tour ${variant} leg ${leg.index} driver: ${JSON.stringify(summarizeTourDriverTelemetry(driver.telemetry))}`,
        );
        return state;
      }
      expect(state.index).toBe(leg.index);
      expect(state.cargoCount).toBe(10 - leg.index);
      expect(state.tour.handoffs).toHaveLength(leg.index);
      expect(state.tour.currentLocationId).toBe(leg.stopId);
      expect(state.target).toEqual(leg.destination);
      expect(state.navigationTarget).toEqual(leg.destination);
      for (const site of state.tour.catalog) {
        if (
          site.id !== leg.stopId &&
          site.id !== initial.tour.completedLocationId &&
          !initial.tour.entryVisited[site.index] &&
          state.tour.entryVisited[site.index] &&
          surfaceDistance(vector(state.normal), vector(site.entry.normal)) < 1.6
        )
          inactiveSites.add(site.id);
      }
      previous = state;
      await page.waitForTimeout(45);
    }
    throw new Error(`Tour ${variant}, leg ${leg.index} timed out: ${JSON.stringify(await snapshot(page))}`);
  } finally {
    await stopTourBrowserDriver(page);
  }
}

async function driveClosing(page: Page, data: PlanetTestTourRoutes) {
  expect(data.plan.order.at(-1)).toBe('garden');
  const finished = await snapshot(page);
  let previous: PlanetTestSnapshot = finished;
  let sampledAt = Date.now();
  const deadline = Date.now() + 65000;
  await startTourBrowserDriver(page, { index: 10, path: data.closing, destination: data.spawn, closing: true });
  try {
    while (Date.now() < deadline) {
      const driver = await tourBrowserDriverStatus(page);
      expect(driver.error, JSON.stringify(driver)).toBeNull();
      const state = { ...driver.latest, tour: driver.latest.tour! };
      const now = Date.now();
      expect(surfaceDistance(vector(previous.normal), vector(state.normal))).toBeLessThan(
        ((now - sampledAt) / 1000) * 8.5 + 0.45,
      );
      expect(state.elapsed).toBe(finished.elapsed);
      expect(state.tour.splits).toEqual(finished.tour.splits);
      expect(state.tour.handoffs).toEqual(finished.tour.handoffs);
      expect(state.index).toBe(10);
      expect(state.cargoCount).toBe(0);
      expect(state.recoveries).toBe(0);
      expect(state.events).not.toContain('collision');
      if (surfaceDistance(vector(state.normal), vector(data.spawn)) < 1.08 && Math.abs(state.speed) < 1.15) {
        await controls(page, null);
        expect(state.normal).not.toEqual(finished.normal);
        return;
      }
      previous = state;
      sampledAt = now;
      await page.waitForTimeout(45);
    }
    throw new Error(`Tour closing road timed out: ${JSON.stringify(await snapshot(page))}`);
  } finally {
    await stopTourBrowserDriver(page);
  }
}

for (const { variant, plan } of fullTourCases) {
  test(`continuous ${variant} Tour seed ${plan.seed} uses real inputs through ten handoffs and the closing road`, async ({
    page,
  }) => {
    // Ten randomized cross-planet legs instead of three: 10 x 85s + 65s closing, plus UI checks.
    test.setTimeout(960000);
    await page.addInitScript(keys => keys.forEach((key, i) => localStorage.setItem(key, String(60 + i))), legacyKeys);
    const errors = await loadTour(page, plan.seed);
    const data = await fixtures(page);
    expect(data.plan).toEqual(plan);
    expect(plan.order.at(-1)).toBe('garden');
    expect(plan.order[0] === 'bay').toBe(variant === 'short');
    expect(data.legs.map(leg => leg.stopId)).toEqual(plan.order);
    expect(data.catalog).toHaveLength(5);
    expect(data.connectors.map(connector => [connector.from, connector.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
      [1, 4],
      [4, 3],
      [3, 1],
    ]);
    await page.getByRole('button', { name: 'Start delivering' }).click();
    const initial = await snapshot(page);
    expect(initial.cargoCount).toBe(10);
    expect(initial.tour.entryVisited).toEqual([true, false, false, false, false]);
    await page.screenshot({ path: `artifacts/tour-${variant}-start.png` });
    let previousTotal = 0;
    const inactiveSites = new Set<string>();
    for (const leg of data.legs) {
      const site = location(data, leg.stopId);
      expect(leg.destination).toEqual(site.destination);
      await expect(page.locator('#mission-name')).toHaveText(site.name);
      await expect(page.locator('#mission-index')).toHaveText(`${String(leg.index + 1).padStart(2, '0')} / 10`);
      const state = await driveLeg(page, leg, variant, false, inactiveSites);
      const split = state.tour.splits.at(-1)!;
      expect(split.elapsed).toBeGreaterThan(0);
      expect(split.cumulative).toBeCloseTo(previousTotal + split.elapsed, 9);
      previousTotal = split.cumulative;
      expect(state.mode).toBe('playing');
      expect(state.tour.reactions[site.index].progress).toBeGreaterThan(0);
      // A second visit restarts the same physical reaction rather than leaving it completed.
      expect(state.tour.reactions[site.index].progress).toBeLessThan(1);
      const deliveredIds = new Set(plan.order.slice(0, leg.index + 1));
      for (const untouched of data.catalog.filter(site => !deliveredIds.has(site.id)))
        expect(state.tour.reactions[untouched.index].progress).toBe(0);
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.locator('#stage canvas')).toBeFocused();
      if (leg.index < 9) {
        expect(state.finished).toBe(false);
        expect(state.tour.currentLocationId).toBe(plan.order[leg.index + 1]);
        await expect(page.locator('#tour-result')).toBeHidden();
        await expect(page.locator('#bay-result')).toBeHidden();
        await expect(page.locator('#mission-name')).toHaveText(location(data, plan.order[leg.index + 1]).name);
        await expect(page.locator('#mission-hint')).toContainText(/connecting road|reverse and turn/i);
        expect(state.tour.navigationPhase).toBe('transfer');
        expect(state.tour.routeCache!.index).toBe(leg.index + 1);
        expect(await page.evaluate(key => localStorage.getItem(key), data.recordKey)).toBeNull();
      }
      await page.screenshot({ path: `artifacts/tour-${variant}-${leg.index}-${leg.stopId}-handoff.png` });
    }
    const finished = await snapshot(page);
    expect(finished.finished).toBe(true);
    expect(finished.tour.currentLocationId).toBeNull();
    expect(finished.tour.completedLocationId).toBe('garden');
    expect(finished.tour.entryVisited).toEqual([false, false, false, false, false]);
    expect(inactiveSites.size).toBeGreaterThan(0);
    expect(finished.tour.splits.reduce((sum, split) => sum + split.elapsed, 0)).toBeCloseTo(finished.elapsed, 9);
    expect(finished.tour.splits.at(-1)!.cumulative).toBe(finished.elapsed);
    expect(finished.jumps).toBe(variant === 'short' ? 2 : 0);
    expect(finished.recoveries).toBe(0);
    expect(finished.tour.handoffs.map(h => h.remaining)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(new Set(finished.tour.handoffs.map(h => h.occurrenceId)).size).toBe(10);
    expect(finished.tour.handoffs.map(event => event.locationId)).toEqual(plan.order);
    await expect(page.locator('#tour-result')).toBeVisible();
    await expect(page.locator('#tour-splits li')).toHaveCount(10);
    await expect(page.locator('#tour-details')).not.toHaveAttribute('open', '');
    await expect.poll(async () => (await snapshot(page)).tour.reactions.map(r => r.progress)).toEqual([1, 1, 1, 1, 1]);
    const reacted = await snapshot(page);
    expect(reacted.tour.reactions.every(r => r.recipientVisible && r.parcelVisible)).toBe(true);
    expect(reacted.tour.reactions[location(data, 'bay').index].doorOpen).toBe(1);
    expect(reacted.tour.reactions[location(data, 'station').index].telescopeTurn).toBeCloseTo(0.75);
    expect(reacted.tour.reactions[location(data, 'garden').index].flowersBloomed).toBe(true);
    await page.screenshot({ path: `artifacts/tour-${variant}-finished.png` });
    expect(Number(await page.evaluate(key => localStorage.getItem(key), data.recordKey))).toBe(finished.elapsed);
    expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), legacyKeys)).toEqual([
      '60',
      '61',
      '62',
      '63',
      '64',
    ]);
    await driveClosing(page, data);
    await expect(page.locator('#tour-result')).toBeVisible();
    expect((await snapshot(page)).tour.handoffs).toHaveLength(10);
    await page.getByRole('button', { name: 'Restart tour', exact: true }).click();
    const restart = await snapshot(page);
    expect(restart.index).toBe(0);
    expect(restart.finished).toBe(false);
    expect(restart.cargoCount).toBe(10);
    expect(restart.tour.plan).toEqual(initial.tour.plan);
    expect(restart.tour.recordKey).toBe(data.recordKey);
    expect(restart.tour.splits).toEqual([]);
    expect(restart.tour.handoffs).toEqual([]);
    expect(restart.tour.reactions.map(r => r.progress)).toEqual([0, 0, 0, 0, 0]);
    expect(restart.tour.sceneObjects).toBe(initial.tour.sceneObjects);
    await expect(page.locator('#tour-result')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('earned Tour recovery, pause/blur and early restart preserve or abandon only the intended state', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = await loadTour(page);
  await page.getByRole('button', { name: 'Start delivering' }).click();
  const data = await fixtures(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyR');
  let state = await snapshot(page);
  expect(surfaceDistance(vector(state.normal), vector(data.spawn))).toBeLessThan(0.01);
  expect(state.tour.checkpoint.stopId).toBe('bay');
  expect(state.cargoCount).toBe(10);

  // An out-of-order UI fixture must not deliver, earn a future checkpoint, or write a record.
  await dockAtLocation(page, 'garden');
  await page.waitForTimeout(800);
  state = await snapshot(page);
  expect(state.index).toBe(0);
  expect(state.cargoCount).toBe(10);
  expect(state.tour.splits).toEqual([]);
  expect(state.tour.entryVisited).toEqual([true, false, false, false, false]);
  expect(state.tour.checkpoint.stopId).toBe('bay');
  expect(state.tour.reactions.map(r => r.progress)).toEqual([0, 0, 0, 0, 0]);
  await page.keyboard.press('KeyR');
  expect(surfaceDistance(vector((await snapshot(page)).normal), vector(data.spawn))).toBeLessThan(0.01);

  // Explicit UI fixture only. The two tests above prove route continuity without this helper.
  const delivered = await deliverFixture(page, 0);
  expect(delivered.tour.entryVisited).toEqual([false, false, false, false, false]);
  expect(delivered.tour.checkpoint).toMatchObject({ stopId: 'bay', kind: 'pad', legIndex: 1 });
  await page.waitForTimeout(800);
  expect((await snapshot(page)).tour.handoffs).toHaveLength(1);
  expect((await snapshot(page)).cargoCount).toBe(9);
  await page.keyboard.press('KeyR');
  state = await snapshot(page);
  expect(surfaceDistance(vector(state.normal), vector(data.legs[0].pad.normal))).toBeLessThan(0.01);
  expect(surfaceDistance(vector(state.normal), vector(data.legs[1].entry.normal))).toBeGreaterThan(5);
  expect(state.index).toBe(1);
  expect(state.cargoCount).toBe(9);
  expect(state.tour.splits).toEqual(delivered.tour.splits);
  expect(state.elapsed).toBeGreaterThanOrEqual(delivered.elapsed);
  expect(state.tour.plan).toEqual(data.plan);
  // Real transfer inputs earn the next entrance; R cannot grant it in advance.
  const entered = await driveLeg(page, data.legs[1], 'short', true);
  expect(entered.tour.checkpoint).toMatchObject({ stopId: 'station', kind: 'entry', legIndex: 1 });
  expect(entered.tour.entryVisited).toEqual([false, true, false, false, false]);
  await page.keyboard.press('KeyR');
  const recovered = await snapshot(page);
  expect(surfaceDistance(vector(recovered.normal), vector(data.legs[1].entry.normal))).toBeLessThan(0.01);
  expect(recovered.tour.recoveryPose).toEqual(recovered.tour.checkpoint.pose);
  expect(recovered.tour.splits).toEqual(delivered.tour.splits);
  expect(recovered.cargoCount).toBe(9);
  expect(recovered.tour.plan).toEqual(data.plan);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('dialog')).toBeVisible();
  const paused = await snapshot(page);
  await page.waitForTimeout(350);
  expect((await snapshot(page)).elapsed).toBe(paused.elapsed);
  expect((await snapshot(page)).tour.reactions).toEqual(paused.tour.reactions);
  expect((await snapshot(page)).tour.plan).toEqual(data.plan);
  await expect(page.getByRole('button', { name: 'Resume journey' })).toBeFocused();
  await page.getByRole('button', { name: 'Resume journey' }).click();
  await expect(page.locator('#stage canvas')).toBeFocused();
  await deliverFixture(page, 1);
  await page.keyboard.press('Escape');
  const pausedHandoff = await snapshot(page);
  await page.waitForTimeout(300);
  expect((await snapshot(page)).tour.reactions).toEqual(pausedHandoff.tour.reactions);
  await page.getByRole('dialog').getByRole('button', { name: 'Restart tour', exact: true }).click();
  await page.waitForTimeout(1600);
  state = await snapshot(page);
  expect(state.index).toBe(0);
  expect(state.speed).toBe(0);
  expect(state.cargoCount).toBe(10);
  expect(state.tour.plan).toEqual(data.plan);
  expect(state.tour.splits).toEqual([]);
  expect(state.tour.entryVisited).toEqual([true, false, false, false, false]);
  expect(state.tour.reactions.map(r => r.progress)).toEqual([0, 0, 0, 0, 0]);
  expect(state.tour.checkpoint).toMatchObject({ stopId: 'bay', kind: 'entry', legIndex: 0 });
  await expect(page.locator('#tour-result')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), data.recordKey)).toBeNull();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Back to home', exact: true }).click();
  state = await snapshot(page);
  expect(state.mode).toBe('home');
  expect(state.elapsed).toBe(0);
  expect(state.tour.recoveryPose).toEqual(state.tour.checkpoint.pose);
  await page.getByRole('button', { name: 'Start delivering' }).click();
  expect((await snapshot(page)).cargoCount).toBe(10);
  expect(errors).toEqual([]);
});

for (const plan of firstTargetPlans) {
  test(`offered Tour seed ${plan.seed} starts at ${plan.order[0]} without delivering at inactive locations`, async ({
    page,
  }) => {
    const errors = await loadTour(page, plan.seed);
    const data = await fixtures(page);
    expect(data.plan).toEqual(plan);
    await expect(page.locator('#ticket-next')).toHaveText(`Next: ${location(data, plan.order[0]).name}`);
    await page.getByRole('button', { name: 'Start delivering' }).click();
    const first = location(data, plan.order[0]);
    await expect(page.locator('#mission-name')).toHaveText(first.name);
    await expect(page.locator('#mission-index')).toHaveText('01 / 10');
    expect((await snapshot(page)).target).toEqual(first.destination);
    for (const site of data.catalog.filter(site => site.id !== first.id)) {
      await dockAtLocation(page, site.id);
      await page.waitForTimeout(800);
      const state = await snapshot(page);
      expect(state.index).toBe(0);
      expect(state.cargoCount).toBe(10);
      expect(state.tour.handoffs).toEqual([]);
      expect(state.tour.splits).toEqual([]);
      expect(state.tour.reactions.every(reaction => reaction.progress === 0)).toBe(true);
      expect(state.tour.plan).toEqual(plan);
    }
    const delivered = await deliverFixture(page, 0);
    expect(delivered.tour.handoffs[0]).toMatchObject({ locationId: first.id, occurrenceId: data.legs[0].occurrenceId });
    expect(errors).toEqual([]);
  });
}

test('unseeded Home offers a fresh order while retry shares only the identical itinerary record', async ({ page }) => {
  // Control independent offers, not renderer randomness or a probabilistic non-collision assertion.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/?test=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const offered = await fixtures(page);
  expect(offered.plan).toEqual(createTourPlan(0));
  await page.getByRole('button', { name: 'Start delivering' }).click();
  for (let index = 0; index < 10; index++) await deliverFixture(page, index);
  const finished = await snapshot(page);
  expect(Number(await page.evaluate(key => localStorage.getItem(key), offered.recordKey))).toBe(finished.elapsed);
  await expect(page.locator('#tour-best-time')).not.toHaveText('—');
  await page.getByRole('button', { name: 'Restart tour', exact: true }).click();
  expect((await snapshot(page)).tour.plan).toEqual(offered.plan);
  expect((await snapshot(page)).tour.recordKey).toBe(offered.recordKey);
  // Finish the retry too: it reuses the same record and physical reaction objects.
  for (let index = 0; index < 10; index++) await deliverFixture(page, index);
  const retry = await snapshot(page);
  expect(Number(await page.evaluate(key => localStorage.getItem(key), offered.recordKey))).toBe(
    Math.min(finished.elapsed, retry.elapsed),
  );
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    Math.random = () => 1 / 0x100000000;
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Back to home', exact: true }).click();
  const fresh = await fixtures(page);
  expect(fresh.plan).toEqual(createTourPlan(1));
  expect(fresh.plan.order).not.toEqual(offered.plan.order);
  expect(fresh.recordKey).not.toBe(offered.recordKey);
  expect(await page.evaluate(key => localStorage.getItem(key), fresh.recordKey)).toBeNull();
  await page.getByRole('button', { name: 'Start delivering' }).click();
  expect((await snapshot(page)).tour.plan).toEqual(fresh.plan);
  for (let index = 0; index < 10; index++) await deliverFixture(page, index);
  expect(Number(await page.evaluate(key => localStorage.getItem(key), fresh.recordKey))).toBe(
    (await snapshot(page)).elapsed,
  );
  expect(Number(await page.evaluate(key => localStorage.getItem(key), offered.recordKey))).toBe(
    Math.min(finished.elapsed, retry.elapsed),
  );
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), legacyKeys)).toEqual(
    legacyKeys.map(() => null),
  );
});

test('320px Tour completion keeps touch driving, recipient, focus and restart usable with reduced motion', async ({
  browser,
}) => {
  test.setTimeout(45000);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 320, height: 640 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error('storage unavailable');
      };
      Storage.prototype.setItem = () => {
        throw new Error('storage unavailable');
      };
    });
    const errors = await loadTour(page);
    await page.getByRole('button', { name: 'Start delivering' }).tap();
    const cdp = await context.newCDPSession(page);
    const gas = await page.getByRole('button', { name: 'Drive forward', exact: true }).boundingBox();
    const right = await page.getByRole('button', { name: 'Turn right', exact: true }).boundingBox();
    const touch = async (turn: boolean) =>
      cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: gas!.x + gas!.width / 2, y: gas!.y + gas!.height / 2, id: 0 },
          ...(turn ? [{ x: right!.x + right!.width / 2, y: right!.y + right!.height / 2, id: 1 }] : []),
        ],
      });
    await touch(true);
    await page.waitForTimeout(350);
    expect((await snapshot(page)).speed).toBeGreaterThan(0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // UI-only fixtures, deliberately separate from continuous route acceptance.
    for (let i = 0; i < 10; i++) {
      const state = await deliverFixture(page, i);
      expect(state.cargoCount).toBe(9 - i);
      if (i < 9) await expect(page.locator('#tour-result')).toBeHidden();
    }
    await expect(page.locator('#tour-result')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).tour.reactions.map(r => r.progress)).toEqual([1, 1, 1, 1, 1]);
    await page.waitForTimeout(1000);
    const card = await page.locator('#tour-result').boundingBox();
    const pedals = await page.locator('.touch-controls').boundingBox();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(320);
    expect(card!.y + card!.height).toBeLessThan(pedals!.y);
    const state = await snapshot(page);
    const recipient = state.tour.recipientScreens[location(state.tour, state.tour.completedLocationId!).index]!;
    expect(recipient.visible).toBe(true);
    expect(recipient.left).toBeGreaterThanOrEqual(0);
    expect(recipient.right).toBeLessThanOrEqual(320);
    expect(recipient.top).toBeGreaterThan(card!.y + card!.height);
    expect(recipient.bottom).toBeLessThan(pedals!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: 'artifacts/tour-finished-mobile.png' });
    const finished = await snapshot(page);
    await touch(false);
    await page.waitForTimeout(400);
    const moving = await snapshot(page);
    expect(moving.speed).toBeGreaterThan(0.7);
    expect(moving.normal).not.toEqual(finished.normal);
    expect(moving.elapsed).toBe(finished.elapsed);
    expect(moving.tour.splits).toEqual(finished.tour.splits);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: 'Pause game' }).tap();
    await expect(page.locator('#tour-result')).toBeHidden();
    await page.getByRole('button', { name: 'Resume journey' }).tap();
    await expect(page.locator('#tour-result')).toBeVisible();
    await expect(page.locator('#stage canvas')).toBeFocused();
    await page.getByRole('button', { name: 'Restart tour', exact: true }).tap();
    await expect(page.locator('#tour-result')).toBeHidden();
    const retry = await snapshot(page);
    expect(retry.cargoCount).toBe(10);
    expect(retry.tour.splits).toEqual([]);
    expect(retry.tour.reactions.map(r => r.progress)).toEqual([0, 0, 0, 0, 0]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
