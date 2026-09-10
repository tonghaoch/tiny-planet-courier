import { localeSnapshot, setPlanetControls, dockAtTarget, bayRoutes } from '../helpers/planet-test';
import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { createBayPilot } from '../helpers/bay-pilot';

async function snapshot(page: Page) {
  return localeSnapshot(page);
}

async function loadBay(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?prototype=bay&test=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-prototype', 'bay');
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('#parcel-count')).toHaveText('01');
  return errors;
}

async function driveRoute(page: Page, shortcut: boolean) {
  const data = await bayRoutes(page);
  const route = (shortcut ? data.jump : data.safe).map((point: number[]) => new Vector3().fromArray(point));
  const pilot = createBayPilot(route, new Vector3().fromArray(data.destination), shortcut);
  const deadline = Date.now() + 35000;
  let flightCaptured = false;
  while (Date.now() < deadline) {
    const state = await snapshot(page);
    if (state.finished) {
      await setPlanetControls(page, null);
      return state;
    }
    const controls = pilot({
      ...state,
      normal: new Vector3().fromArray(state.normal),
      forward: new Vector3().fromArray(state.forward),
    });
    await setPlanetControls(page, controls);
    if (
      shortcut &&
      !flightCaptured &&
      state.phase === 'airborne' &&
      Math.abs(state.local.x) < 1 &&
      state.landingGuideVisible
    ) {
      await page.screenshot({ path: 'artifacts/bay-flight.png' });
      flightCaptured = true;
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`Driving did not finish: ${JSON.stringify(await snapshot(page))}`);
}

test('both real driven routes deliver, with a non-blocking bakery reaction', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await loadBay(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/bay-home.png' });
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'artifacts/bay-start.png' });
  const road = await driveRoute(page, false);
  expect(road.recoveries).toBe(0);
  expect(road.jumps).toBe(0);
  await expect(page.locator('#bay-result')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).reaction.progress).toBe(1);
  const delivered = await snapshot(page);
  expect(delivered.mode).toBe('playing');
  expect(delivered.cargoVisible).toBe(false);
  expect(delivered.reaction.doorOpen).toBeCloseTo(1);
  expect(delivered.reaction.recipientVisible).toBe(true);
  expect(delivered.reaction.parcelVisible).toBe(true);
  expect(delivered.reaction.windowGlow).toBeGreaterThan(1);
  expect(delivered.drawCalls).toBeLessThan(400);
  await page.screenshot({ path: 'artifacts/bay-delivered.png' });
  await setPlanetControls(page, { throttle: 1, steer: 0.5, boost: false });
  await page.waitForTimeout(500);
  const moving = await snapshot(page);
  expect(moving.normal).not.toEqual(delivered.normal);
  expect(moving.elapsed).toBe(delivered.elapsed);
  await page.getByRole('button', { name: 'Try another route' }).click();
  await expect(page.locator('#bay-result')).toBeHidden();
  expect((await snapshot(page)).reaction.progress).toBe(0);
  const jump = await driveRoute(page, true);
  expect(jump.jumps).toBe(1);
  expect(jump.landings).toBe(1);
  expect(jump.recoveries).toBe(0);
  expect(jump.elapsed).toBeLessThan(road.elapsed);
  await expect(page.locator('#bay-result')).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    `Bay route times: coast ${road.elapsed.toFixed(2)}s, leap ${jump.elapsed.toFixed(2)}s; both physically driven.`,
  );
});

test('keyboard boost still works after enabling sound and shows the landing guide', async ({ page }) => {
  const errors = await loadBay(page);
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await page.getByRole('button', { name: 'Enable sound effects' }).click();
  await expect(page.locator('#sound-label')).toHaveText('Sound on');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => {
    const bridge = window.__planetTest;
    if (!bridge) throw new Error('Planet test bridge missing; load a DEV page with ?test=1.');
    const state = bridge.snapshot();
    return state.phase === 'airborne' && Math.abs(state.local!.x) < 0.8 && state.landingGuideVisible;
  });
  const airborne = await snapshot(page);
  expect(airborne.jumps).toBe(1);
  expect(airborne.charge).toBeLessThan(1);
  expect(airborne.cameraRadius).toBeGreaterThan(18);
  await page.screenshot({ path: 'artifacts/bay-keyboard-leap.png' });
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await snapshot(page)).landings).toBe(1);
  expect((await snapshot(page)).recoveries).toBe(0);
  await expect.poll(async () => (await snapshot(page)).landingGuideVisible).toBe(false);
  await page.keyboard.press('Escape');
  const paused = await snapshot(page);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).normal).toEqual(paused.normal);
  expect(errors).toEqual([]);
});

test('an unboosted splash recovers quickly with the parcel intact', async ({ page }) => {
  const errors = await loadBay(page);
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => (await snapshot(page)).recoveries, { timeout: 12000, intervals: [80, 100, 150] })
    .toBe(1);
  await page.keyboard.up('KeyW');
  const recovered = await snapshot(page);
  expect(recovered.events).toContain('splash');
  expect(recovered.events).toContain('recovered');
  expect(recovered.phase).toBe('grounded');
  expect(recovered.local.x).toBeCloseTo(-8, 2);
  expect(recovered.cargoVisible).toBe(true);
  expect(recovered.index).toBe(0);
  expect(recovered.charge).toBe(1);
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await snapshot(page)).recoveries).toBe(2);
  expect(errors).toEqual([]);
});

test('small-phone results keep touch driving available and the reaction can pause', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 320, height: 640 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const errors = await loadBay(page);
    await page.getByRole('button', { name: 'Start delivering' }).tap();
    await expect(page.locator('.touch-controls')).toBeVisible();
    const cdp = await context.newCDPSession(page);
    const gas = await page.getByRole('button', { name: 'Drive forward', exact: true }).boundingBox();
    const left = await page.getByRole('button', { name: 'Turn left', exact: true }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: gas!.x + gas!.width / 2, y: gas!.y + gas!.height / 2, id: 0 },
        { x: left!.x + left!.width / 2, y: left!.y + left!.height / 2, id: 1 },
      ],
    });
    await page.waitForTimeout(450);
    expect((await snapshot(page)).speed).toBeGreaterThan(0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // The two routes are driven in the first test; this fixture isolates handoff/UI behavior.
    await dockAtTarget(page);
    await expect.poll(async () => (await snapshot(page)).finished).toBe(true);
    await page.getByRole('button', { name: 'Pause game' }).tap();
    const before = (await snapshot(page)).reaction.progress;
    await page.waitForTimeout(350);
    expect((await snapshot(page)).reaction.progress).toBe(before);
    await page.getByRole('button', { name: 'Resume journey' }).tap();
    await expect(page.locator('#bay-result')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).reaction.progress).toBe(1);
    const card = await page.locator('#bay-result').boundingBox();
    const controls = await page.locator('.touch-controls').boundingBox();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(320);
    expect(card!.y + card!.height).toBeLessThan(controls!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: 'artifacts/bay-delivered-mobile.png' });
    const time = (await snapshot(page)).elapsed;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: gas!.x + gas!.width / 2, y: gas!.y + gas!.height / 2, id: 0 }],
    });
    await page.waitForTimeout(550);
    expect((await snapshot(page)).speed).toBeGreaterThan(1);
    expect((await snapshot(page)).elapsed).toBe(time);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: 'Try another route' }).tap();
    await expect(page.locator('#bay-result')).toBeHidden();
    const retry = await snapshot(page);
    expect(retry.index).toBe(0);
    expect(retry.cargoVisible).toBe(true);
    expect(retry.reaction.progress).toBe(0);
    expect(retry.reaction.windowGlow).toBeCloseTo(0.2);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
