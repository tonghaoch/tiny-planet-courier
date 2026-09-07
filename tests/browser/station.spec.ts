import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { createBayPilot } from '../helpers/bay-pilot';

const snapshot = (page: Page) => page.evaluate(() => (window as any).__planetTest.snapshot());

async function loadStation(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?prototype=station&test=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-prototype', 'station');
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('#parcel-count')).toHaveText('01');
  expect((await snapshot(page)).prototypeId).toBe('station');
  return errors;
}

async function driveRoute(page: Page, name: 'outer' | 'inner') {
  const data = await page.evaluate(() => (window as any).__planetTest.routes());
  const route = data[name].map((p: number[]) => new Vector3().fromArray(p));
  const pilot = createBayPilot(route, new Vector3().fromArray(data.destination), false);
  const deadline = Date.now() + 35000;
  const choices = new Set<string>();
  let bendsCaptured = false;
  while (Date.now() < deadline) {
    const state = await snapshot(page);
    if (state.route) choices.add(state.route);
    if (state.finished) {
      await page.evaluate(() => (window as any).__planetTest.setControls(null));
      expect(choices.has(name)).toBe(true);
      return state;
    }
    const controls = pilot({ ...state, normal: new Vector3().fromArray(state.normal), forward: new Vector3().fromArray(state.forward) });
    await page.evaluate(value => (window as any).__planetTest.setControls(value), controls);
    if (name === 'inner' && !bendsCaptured && state.local.x > -5.8 && state.local.x < -3.5) {
      await page.screenshot({ path: 'artifacts/station-inner-lane.png' });
      bendsCaptured = true;
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`Station ${name} did not finish: ${JSON.stringify(await snapshot(page))}`);
}

test('both Station routes are physically driven, with local handoff and isolated records', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem('tiny-planet-courier:best:v1', '77');
    localStorage.setItem('tiny-planet-courier:bay-leap:best:v1', '88');
  });
  const errors = await loadStation(page);
  const ticket = await page.locator('.trip-ticket').boundingBox();
  const footer = await page.locator('.home-footer').boundingBox();
  expect(ticket!.y + ticket!.height).toBeLessThan(footer!.y);
  await page.screenshot({ path: 'artifacts/station-home.png' });
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await expect(page.locator('#mission-name')).toHaveText('Stargaze Station');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/station-start.png' });
  const outer = await driveRoute(page, 'outer');
  expect(outer.recoveries).toBe(0); expect(outer.jumps).toBe(0);
  expect(outer.events).not.toContain('collision');
  await expect(page.locator('#bay-result')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).reaction.progress).toBe(1);
  const delivered = await snapshot(page);
  expect(delivered.mode).toBe('playing');
  expect(delivered.cargoVisible).toBe(false);
  expect(delivered.reaction.destination).toBe('observatory');
  expect(delivered.reaction.parcelVisible).toBe(true);
  expect(delivered.reaction.windowGlow).toBeGreaterThan(1);
  expect(delivered.reaction.telescopeTurn).toBeGreaterThan(0.5);
  expect(delivered.reaction.doorOpen).toBeUndefined();
  expect(delivered.landingGuideVisible).toBe(false);
  expect(delivered.drawCalls).toBeLessThan(400);
  await page.screenshot({ path: 'artifacts/station-delivered.png' });
  await page.evaluate(() => (window as any).__planetTest.setControls({ throttle: 1, steer: 0.4, boost: false }));
  await page.waitForTimeout(450);
  const moving = await snapshot(page);
  expect(moving.normal).not.toEqual(delivered.normal);
  expect(moving.elapsed).toBe(delivered.elapsed);
  await page.getByRole('button', { name: 'Try another route' }).click();
  await expect(page.locator('#bay-result')).toBeHidden();
  expect((await snapshot(page)).reaction.progress).toBe(0);
  const inner = await driveRoute(page, 'inner');
  expect(inner.recoveries).toBe(0); expect(inner.jumps).toBe(0);
  expect(inner.events).not.toContain('collision');
  expect(inner.elapsed).toBeLessThan(outer.elapsed);
  await expect(page.locator('#bay-result')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tiny-planet-courier:best:v1'))).toBe('77');
  expect(await page.evaluate(() => localStorage.getItem('tiny-planet-courier:bay-leap:best:v1'))).toBe('88');
  expect(Number(await page.evaluate(() => localStorage.getItem('tiny-planet-courier:station:best:v1')))).toBe(inner.elapsed);
  expect(errors).toEqual([]);
  console.log(`Station route times: outer ${outer.elapsed.toFixed(2)}s, inner ${inner.elapsed.toFixed(2)}s; both physically driven.`);
});

test('Station keyboard, recovery, pause and early restart preserve the one-parcel lifecycle', async ({ page }) => {
  const errors = await loadStation(page);
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await page.getByRole('button', { name: 'Enable sound effects' }).click();
  await page.keyboard.down('KeyW'); await page.keyboard.down('Space');
  await page.waitForTimeout(600);
  const driven = await snapshot(page);
  expect(driven.speed).toBeGreaterThan(1);
  expect(driven.charge).toBeLessThan(1);
  expect(driven.jumps).toBe(0);
  await page.keyboard.up('KeyW'); await page.keyboard.up('Space');
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await snapshot(page)).recoveries).toBe(1);
  const recovered = await snapshot(page);
  expect(recovered.local.x).toBeCloseTo(-11, 2);
  expect(recovered.elapsed).toBeGreaterThanOrEqual(driven.elapsed);
  expect(recovered.cargoVisible).toBe(true); expect(recovered.index).toBe(0);
  expect(recovered.charge).toBe(1);
  await page.keyboard.press('Escape');
  const paused = await snapshot(page);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).normal).toEqual(paused.normal);
  expect((await snapshot(page)).elapsed).toBe(paused.elapsed);
  await page.keyboard.press('Escape');
  // Physical reachability is covered above; docking isolates the handoff lifecycle.
  await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
  await expect.poll(async () => (await snapshot(page)).finished).toBe(true);
  await page.getByRole('button', { name: 'Pause game' }).click();
  const handoff = (await snapshot(page)).reaction;
  await page.waitForTimeout(300);
  expect((await snapshot(page)).reaction).toEqual(handoff);
  await page.getByRole('button', { name: 'Restart delivery', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#bay-result')).toBeHidden();
  const restarted = await snapshot(page);
  expect(restarted.finished).toBe(false); expect(restarted.index).toBe(0);
  expect(restarted.cargoVisible).toBe(true); expect(restarted.reaction.progress).toBe(0);
  expect(restarted.recoveries).toBe(0); expect(restarted.speed).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Back to home', exact: true }).click();
  await page.getByRole('button', { name: 'Start delivering' }).click();
  expect((await snapshot(page)).local.x).toBeCloseTo(-11, 2);
  expect((await snapshot(page)).reaction.progress).toBe(0);
  expect(errors).toEqual([]);
});

test('Station reduced-motion phone results leave touch driving and retry available without storage', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 320, height: 640 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('storage unavailable'); };
      Storage.prototype.setItem = () => { throw new Error('storage unavailable'); };
    });
    const errors = await loadStation(page);
    await page.getByRole('button', { name: 'Start delivering' }).tap();
    const cdp = await context.newCDPSession(page);
    const gas = await page.getByRole('button', { name: 'Drive forward', exact: true }).boundingBox();
    const left = await page.getByRole('button', { name: 'Turn left', exact: true }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { x: gas!.x + gas!.width / 2, y: gas!.y + gas!.height / 2, id: 0 },
      { x: left!.x + left!.width / 2, y: left!.y + left!.height / 2, id: 1 },
    ] });
    await page.waitForTimeout(400);
    expect((await snapshot(page)).speed).toBeGreaterThan(0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect(page.locator('#bay-result')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).reaction.progress).toBe(1);
    expect((await snapshot(page)).reaction.telescopeTurn).toBeCloseTo(0.18);
    const card = await page.locator('#bay-result').boundingBox();
    const controls = await page.locator('.touch-controls').boundingBox();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(320);
    expect(card!.y + card!.height).toBeLessThan(controls!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: 'artifacts/station-delivered-mobile.png' });
    const elapsed = (await snapshot(page)).elapsed;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gas!.x + gas!.width / 2, y: gas!.y + gas!.height / 2, id: 0 }] });
    await page.waitForTimeout(450);
    expect((await snapshot(page)).speed).toBeGreaterThan(0.7);
    expect((await snapshot(page)).elapsed).toBe(elapsed);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: 'Try another route' }).tap();
    await expect(page.locator('#bay-result')).toBeHidden();
    const retry = await snapshot(page);
    expect(retry.finished).toBe(false); expect(retry.cargoVisible).toBe(true);
    expect(retry.reaction.progress).toBe(0); expect(retry.reaction.windowGlow).toBeCloseTo(0.18);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
