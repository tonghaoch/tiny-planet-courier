import type { PlanetTestTourLeg, PlanetTestTourRoutes } from '../../src/dev/test-bridge-types';
import { tourSnapshot, setPlanetControls, dockAtTarget, dockAtStop, tourRoutes } from '../helpers/planet-test';
import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { surfaceDistance } from '../../src/math';
import { createTourPilot } from '../helpers/tour-pilot';

const key = 'tiny-planet-courier:tour:best:v1';
const legacyKeys = [
  'tiny-planet-courier:best:v1',
  'tiny-planet-courier:bay-leap:best:v1',
  'tiny-planet-courier:station:best:v1',
  'tiny-planet-courier:garden:best:v1',
];
const snapshot = (page: Page) => tourSnapshot(page);
const vector = (value: number[]) => new Vector3().fromArray(value);
const controls = (page: Page, value: { throttle: number; steer: number; boost: boolean } | null) =>
  setPlanetControls(page, value);
const fixtures = (page: Page) => tourRoutes(page);

async function loadTour(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?prototype=tour&test=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-prototype', 'tour');
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('#parcel-count')).toHaveText('03');
  await expect(page.getByRole('button', { name: 'Enable sound effects' })).toHaveAttribute('aria-pressed', 'false');
  return errors;
}

/** The continuity proof only supplies real controller inputs. Never call dockAtTarget here. */
async function driveLeg(page: Page, leg: PlanetTestTourLeg, variant: 'wide' | 'short', untilEntry = false) {
  const pilot = createTourPilot(
    leg[variant].map(vector),
    vector(leg.destination),
    leg.index === 0 && variant === 'short',
  );
  const deadline = Date.now() + 85000;
  let previous = await snapshot(page);
  let reversed = false;
  while (Date.now() < deadline) {
    const state = await snapshot(page);
    // Teleport/pose reset would violate this surface-distance bound, including at handoffs.
    const travelled = surfaceDistance(vector(previous.normal), vector(state.normal));
    expect(travelled).toBeLessThan(Math.max(0, state.elapsed - previous.elapsed) * 8.5 + 0.45);
    expect(state.recoveries).toBe(previous.recoveries);
    expect(state.events).not.toContain('collision');
    expect(state.tour.recoveryPose).toEqual(state.tour.checkpoint.pose);
    if (untilEntry && state.tour.entryVisited[leg.index]) {
      await controls(page, null);
      return state;
    }
    if (state.index > leg.index) {
      await controls(page, null);
      expect(state.index).toBe(leg.index + 1);
      expect(state.cargoCount).toBe(2 - leg.index);
      expect(state.tour.handoffs.map(h => h.index)).toEqual(Array.from({ length: leg.index + 1 }, (_, i) => i));
      expect(state.tour.handoffs.at(-1)!.remaining).toBe(2 - leg.index);
      const handoff = state.tour.handoffs.at(-1)!;
      expect(vector(handoff.forward).dot(vector(previous.forward))).toBeGreaterThan(0.95);
      expect(vector(state.forward).dot(vector(handoff.forward))).toBeGreaterThan(0.95);
      expect(Math.abs(state.speed - handoff.speed)).toBeLessThan(0.5);
      expect(Math.abs(state.charge - handoff.charge)).toBeLessThan(0.1);
      expect(vector(handoff.origin).distanceTo(vector(previous.cargoPositions[0]))).toBeLessThan(0.5);
      expect(state.tour.splits).toHaveLength(leg.index + 1);
      expect(state.tour.checkpoint.kind).toBe('pad');
      expect(state.tour.checkpoint.stopId).toBe(leg.stopId);
      if (variant === 'wide' && leg.index === 2) expect(reversed).toBe(true);
      return state;
    }
    const input = pilot({ ...state, normal: vector(state.normal), forward: vector(state.forward) });
    if (input.throttle < 0 && state.speed < -0.1) reversed = true;
    await controls(page, input);
    previous = state;
    await page.waitForTimeout(45);
  }
  throw new Error(`Tour ${variant}, leg ${leg.index} timed out: ${JSON.stringify(await snapshot(page))}`);
}

async function driveClosing(page: Page, data: PlanetTestTourRoutes) {
  const pilot = createTourPilot(data.closing.map(vector), vector(data.spawn), false);
  const finished = await snapshot(page);
  const deadline = Date.now() + 65000;
  while (Date.now() < deadline) {
    const state = await snapshot(page);
    expect(state.elapsed).toBe(finished.elapsed);
    expect(state.tour.splits).toEqual(finished.tour.splits);
    expect(state.index).toBe(3);
    expect(state.cargoCount).toBe(0);
    expect(state.recoveries).toBe(0);
    expect(state.events).not.toContain('collision');
    if (surfaceDistance(vector(state.normal), vector(data.spawn)) < 1.08 && Math.abs(state.speed) < 1.15) {
      await controls(page, null);
      return;
    }
    await controls(page, pilot({ ...state, normal: vector(state.normal), forward: vector(state.forward) }));
    await page.waitForTimeout(45);
  }
  throw new Error(`Tour closing road timed out: ${JSON.stringify(await snapshot(page))}`);
}

for (const variant of ['wide', 'short'] as const) {
  test(`continuous ${variant} Tour uses real inputs through three handoffs and the closing road`, async ({ page }) => {
    test.setTimeout(300000);
    await page.addInitScript(keys => keys.forEach((key, i) => localStorage.setItem(key, String(60 + i))), legacyKeys);
    const errors = await loadTour(page);
    const data = await fixtures(page);
    expect(data.legs.map(leg => leg.stopId)).toEqual(['bay', 'station', 'garden']);
    expect(data.connectors.map(connector => [connector.from, connector.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
    await page.getByRole('button', { name: 'Start delivering' }).click();
    const initial = await snapshot(page);
    expect(initial.cargoCount).toBe(3);
    expect(initial.tour.entryVisited).toEqual([true, false, false]);
    await page.screenshot({ path: `artifacts/tour-${variant}-start.png` });
    let previousTotal = 0;
    for (const leg of data.legs) {
      const state = await driveLeg(page, leg, variant);
      const split = state.tour.splits.at(-1)!;
      expect(split.elapsed).toBeGreaterThan(0);
      expect(split.cumulative).toBeCloseTo(previousTotal + split.elapsed, 9);
      previousTotal = split.cumulative;
      expect(state.mode).toBe('playing');
      expect(state.tour.reactions[leg.index].progress).toBeGreaterThan(0);
      for (let i = leg.index + 1; i < 3; i++) expect(state.tour.reactions[i].progress).toBe(0);
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.locator('#stage canvas')).toBeFocused();
      if (leg.index < 2) {
        await expect(page.locator('#tour-result')).toBeHidden();
        await expect(page.locator('#bay-result')).toBeHidden();
        await expect(page.locator('#mission-name')).toHaveText(
          leg.index === 0 ? 'Stargaze Station' : 'Windmill Garden',
        );
        await expect(page.locator('#mission-hint')).toContainText(/connecting road|reverse and turn/i);
        expect(state.tour.navigationPhase).toBe('transfer');
        expect(state.tour.routeCache!.index).toBe(leg.index + 1);
        expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
      }
      await page.screenshot({ path: `artifacts/tour-${variant}-${leg.stopId}-handoff.png` });
    }
    const finished = await snapshot(page);
    expect(finished.finished).toBe(true);
    expect(finished.tour.entryVisited).toEqual([true, true, true]);
    expect(finished.tour.splits.reduce((sum: number, split) => sum + split.elapsed, 0)).toBeCloseTo(
      finished.elapsed,
      9,
    );
    expect(finished.tour.splits.at(-1)!.cumulative).toBe(finished.elapsed);
    expect(finished.jumps).toBe(variant === 'short' ? 1 : 0);
    expect(finished.recoveries).toBe(0);
    expect(finished.tour.handoffs.map(h => h.remaining)).toEqual([2, 1, 0]);
    await expect(page.locator('#tour-result')).toBeVisible();
    await expect(page.locator('#tour-splits li')).toHaveCount(3);
    await expect.poll(async () => (await snapshot(page)).tour.reactions.map(r => r.progress)).toEqual([1, 1, 1]);
    const reacted = await snapshot(page);
    expect(reacted.tour.reactions.every(r => r.recipientVisible && r.parcelVisible)).toBe(true);
    expect(reacted.tour.reactions[0].doorOpen).toBe(1);
    expect(reacted.tour.reactions[1].telescopeTurn).toBeCloseTo(0.75);
    expect(reacted.tour.reactions[2].flowersBloomed).toBe(true);
    await page.screenshot({ path: `artifacts/tour-${variant}-finished.png` });
    expect(Number(await page.evaluate(key => localStorage.getItem(key), key))).toBe(finished.elapsed);
    expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), legacyKeys)).toEqual([
      '60',
      '61',
      '62',
      '63',
    ]);
    await driveClosing(page, data);
    await expect(page.locator('#tour-result')).toBeVisible();
    expect((await snapshot(page)).tour.handoffs).toHaveLength(3);
    await page.getByRole('button', { name: 'Restart tour', exact: true }).click();
    const restart = await snapshot(page);
    expect(restart.index).toBe(0);
    expect(restart.finished).toBe(false);
    expect(restart.cargoCount).toBe(3);
    expect(restart.tour.splits).toEqual([]);
    expect(restart.tour.handoffs).toEqual([]);
    expect(restart.tour.reactions.map(r => r.progress)).toEqual([0, 0, 0]);
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
  expect(state.cargoCount).toBe(3);

  // An out-of-order UI fixture must not deliver, earn a future checkpoint, or write a record.
  await dockAtStop(page, 2);
  await page.waitForTimeout(800);
  state = await snapshot(page);
  expect(state.index).toBe(0);
  expect(state.cargoCount).toBe(3);
  expect(state.tour.splits).toEqual([]);
  expect(state.tour.entryVisited).toEqual([true, false, false]);
  expect(state.tour.checkpoint.stopId).toBe('bay');
  expect(state.tour.reactions.map(r => r.progress)).toEqual([0, 0, 0]);
  await page.keyboard.press('KeyR');
  expect(surfaceDistance(vector((await snapshot(page)).normal), vector(data.spawn))).toBeLessThan(0.01);

  // Explicit UI fixture only. The two tests above prove route continuity without this helper.
  await dockAtTarget(page);
  await expect.poll(async () => (await snapshot(page)).index).toBe(1);
  const delivered = await snapshot(page);
  expect(delivered.tour.entryVisited).toEqual([true, false, false]);
  expect(delivered.tour.checkpoint).toMatchObject({ stopId: 'bay', kind: 'pad' });
  await page.waitForTimeout(800);
  expect((await snapshot(page)).tour.handoffs).toHaveLength(1);
  expect((await snapshot(page)).cargoCount).toBe(2);
  await page.keyboard.press('KeyR');
  state = await snapshot(page);
  expect(surfaceDistance(vector(state.normal), vector(data.legs[0].pad.normal))).toBeLessThan(0.01);
  expect(surfaceDistance(vector(state.normal), vector(data.legs[1].entry.normal))).toBeGreaterThan(5);
  expect(state.index).toBe(1);
  expect(state.cargoCount).toBe(2);
  expect(state.tour.splits).toEqual(delivered.tour.splits);
  expect(state.elapsed).toBeGreaterThanOrEqual(delivered.elapsed);
  // Real transfer inputs earn the next entrance; R cannot grant it in advance.
  const entered = await driveLeg(page, data.legs[1], 'short', true);
  expect(entered.tour.checkpoint).toMatchObject({ stopId: 'station', kind: 'entry' });
  expect(entered.tour.entryVisited).toEqual([true, true, false]);
  await page.keyboard.press('KeyR');
  const recovered = await snapshot(page);
  expect(surfaceDistance(vector(recovered.normal), vector(data.legs[1].entry.normal))).toBeLessThan(0.01);
  expect(recovered.tour.recoveryPose).toEqual(recovered.tour.checkpoint.pose);
  expect(recovered.tour.splits).toEqual(delivered.tour.splits);
  expect(recovered.cargoCount).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('dialog')).toBeVisible();
  const paused = await snapshot(page);
  await page.waitForTimeout(350);
  expect((await snapshot(page)).elapsed).toBe(paused.elapsed);
  expect((await snapshot(page)).tour.reactions).toEqual(paused.tour.reactions);
  await expect(page.getByRole('button', { name: 'Resume journey' })).toBeFocused();
  await page.getByRole('button', { name: 'Resume journey' }).click();
  await expect(page.locator('#stage canvas')).toBeFocused();
  await dockAtTarget(page);
  await expect.poll(async () => (await snapshot(page)).index).toBe(2);
  await page.keyboard.press('Escape');
  const pausedHandoff = await snapshot(page);
  await page.waitForTimeout(300);
  expect((await snapshot(page)).tour.reactions).toEqual(pausedHandoff.tour.reactions);
  await page.getByRole('dialog').getByRole('button', { name: 'Restart tour', exact: true }).click();
  await page.waitForTimeout(1600);
  state = await snapshot(page);
  expect(state.index).toBe(0);
  expect(state.speed).toBe(0);
  expect(state.cargoCount).toBe(3);
  expect(state.tour.splits).toEqual([]);
  expect(state.tour.entryVisited).toEqual([true, false, false]);
  expect(state.tour.reactions.map(r => r.progress)).toEqual([0, 0, 0]);
  expect(state.tour.checkpoint).toMatchObject({ stopId: 'bay', kind: 'entry' });
  await expect(page.locator('#tour-result')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Back to home', exact: true }).click();
  state = await snapshot(page);
  expect(state.mode).toBe('home');
  expect(state.elapsed).toBe(0);
  expect(state.tour.recoveryPose).toEqual(state.tour.checkpoint.pose);
  await page.getByRole('button', { name: 'Start delivering' }).click();
  expect((await snapshot(page)).cargoCount).toBe(3);
  expect(errors).toEqual([]);
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
    for (let i = 0; i < 3; i++) {
      await dockAtTarget(page);
      await expect.poll(async () => (await snapshot(page)).index).toBe(i + 1);
      expect((await snapshot(page)).cargoCount).toBe(2 - i);
      if (i < 2) await expect(page.locator('#tour-result')).toBeHidden();
    }
    await expect(page.locator('#tour-result')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).tour.reactions.map(r => r.progress)).toEqual([1, 1, 1]);
    await page.waitForTimeout(1000);
    const card = await page.locator('#tour-result').boundingBox();
    const pedals = await page.locator('.touch-controls').boundingBox();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(320);
    expect(card!.y + card!.height).toBeLessThan(pedals!.y);
    const recipient = (await snapshot(page)).tour.recipientScreens[2]!;
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
    expect(retry.cargoCount).toBe(3);
    expect(retry.tour.splits).toEqual([]);
    expect(retry.tour.reactions.map(r => r.progress)).toEqual([0, 0, 0]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
