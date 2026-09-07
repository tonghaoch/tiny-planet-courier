import { expect, test, type Page } from '@playwright/test';
import { Vector3 } from 'three';
import { createBayPilot } from '../helpers/bay-pilot';

const snapshot = (page: Page) => page.evaluate(() => (window as any).__planetTest.snapshot());

async function loadGarden(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?prototype=garden&test=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-prototype', 'garden');
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('#parcel-count')).toHaveText('01');
  expect((await snapshot(page)).prototypeId).toBe('garden');
  return errors;
}

async function driveRoute(page: Page, name: 'outer' | 'inner') {
  const data = await page.evaluate(() => (window as any).__planetTest.routes());
  const route = data[name].map((p: number[]) => new Vector3().fromArray(p));
  const pilot = createBayPilot(route, new Vector3().fromArray(data.destination), false);
  const deadline = Date.now() + 35000;
  const choices = new Set<string>();
  const bendSpeeds: number[] = [];
  let pathCaptured = false;
  while (Date.now() < deadline) {
    const state = await snapshot(page);
    if (state.route) choices.add(state.route);
    if (state.finished) {
      await page.evaluate(() => (window as any).__planetTest.setControls(null));
      expect(choices.has(name)).toBe(true);
      if (name === 'inner') {
        expect(bendSpeeds.length).toBeGreaterThan(3);
        expect(Math.min(...bendSpeeds)).toBeGreaterThan(1);
      }
      return state;
    }
    const controls = pilot({ ...state, normal: new Vector3().fromArray(state.normal), forward: new Vector3().fromArray(state.forward) });
    await page.evaluate(value => (window as any).__planetTest.setControls(value), controls);
    if (name === 'inner' && state.local.x > -9 && state.local.x < -3) {
      bendSpeeds.push(state.speed);
      if (!pathCaptured && state.local.x > -7) {
        await page.screenshot({ path: 'artifacts/garden-flower-path.png' });
        pathCaptured = true;
      }
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`Garden ${name} did not finish: ${JSON.stringify(await snapshot(page))}`);
}

test('both Garden routes are driven, with continuous S-bends, blooming feedback and isolated records', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem('tiny-planet-courier:best:v1', '77');
    localStorage.setItem('tiny-planet-courier:bay-leap:best:v1', '88');
    localStorage.setItem('tiny-planet-courier:station:best:v1', '66');
  });
  const errors = await loadGarden(page);
  const ticket = await page.locator('.trip-ticket').boundingBox();
  const footer = await page.locator('.home-footer').boundingBox();
  expect(ticket!.y + ticket!.height).toBeLessThan(footer!.y);
  await page.screenshot({ path: 'artifacts/garden-home.png' });
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await expect(page.locator('#mission-name')).toHaveText('Windmill Garden');
  await expect(page.locator('#mission-hint')).not.toContainText(/bay|bakery|station|ramp/i);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/garden-start.png' });
  const outer = await driveRoute(page, 'outer');
  expect(outer.recoveries).toBe(0); expect(outer.jumps).toBe(0);
  expect(outer.events).not.toContain('collision');
  await expect(page.locator('#bay-result')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).reaction.progress).toBe(1);
  const delivered = await snapshot(page);
  expect(delivered.mode).toBe('playing');
  expect(delivered.cargoVisible).toBe(false);
  expect(delivered.reaction.destination).toBe('windmill');
  expect(delivered.reaction.parcelVisible).toBe(true);
  expect(delivered.reaction.bloom).toBe(1);
  expect(delivered.reaction.flowersBloomed).toBe(true);
  expect(delivered.reaction.doorOpen).toBeUndefined();
  expect(delivered.reaction.telescopeTurn).toBeUndefined();
  expect(delivered.landingGuideVisible).toBe(false);
  expect(delivered.drawCalls).toBeLessThan(400);
  await page.screenshot({ path: 'artifacts/garden-delivered.png' });
  await page.evaluate(() => (window as any).__planetTest.setControls({ throttle: 1, steer: 0.4, boost: false }));
  await page.waitForTimeout(450);
  const moving = await snapshot(page);
  expect(moving.normal).not.toEqual(delivered.normal);
  expect(moving.elapsed).toBe(delivered.elapsed);
  await page.getByRole('button', { name: 'Try another route' }).click();
  await expect(page.locator('#bay-result')).toBeHidden();
  expect((await snapshot(page)).reaction.bloom).toBe(0);
  await page.waitForTimeout(1000);
  const inner = await driveRoute(page, 'inner');
  expect(inner.recoveries).toBe(0); expect(inner.jumps).toBe(0);
  expect(inner.events).not.toContain('collision');
  expect(inner.elapsed).toBeLessThan(outer.elapsed);
  await expect(page.locator('#bay-result')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tiny-planet-courier:best:v1'))).toBe('77');
  expect(await page.evaluate(() => localStorage.getItem('tiny-planet-courier:bay-leap:best:v1'))).toBe('88');
  expect(await page.evaluate(() => localStorage.getItem('tiny-planet-courier:station:best:v1'))).toBe('66');
  expect(Number(await page.evaluate(() => localStorage.getItem('tiny-planet-courier:garden:best:v1')))).toBe(inner.elapsed);
  expect(errors).toEqual([]);
  console.log(`Garden route times: loop ${outer.elapsed.toFixed(2)}s, flower path ${inner.elapsed.toFixed(2)}s; both physically driven.`);
});

test('Garden keyboard, immediate recovery and paused handoff reset without stale blooms or results', async ({ page }) => {
  const errors = await loadGarden(page);
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await page.getByRole('button', { name: 'Enable sound effects' }).click();
  await page.keyboard.down('KeyW'); await page.keyboard.down('Space');
  await page.waitForTimeout(600);
  const driven = await snapshot(page);
  expect(driven.speed).toBeGreaterThan(1);
  expect(driven.charge).toBeLessThan(1); expect(driven.jumps).toBe(0);
  await page.keyboard.up('KeyW'); await page.keyboard.up('Space');
  await page.keyboard.press('KeyR');
  await expect.poll(async () => (await snapshot(page)).recoveries).toBe(1);
  const recovered = await snapshot(page);
  expect(recovered.local.x).toBeCloseTo(-13, 2);
  expect(recovered.elapsed).toBeGreaterThanOrEqual(driven.elapsed);
  expect(recovered.cargoVisible).toBe(true); expect(recovered.index).toBe(0);
  expect(recovered.charge).toBe(1);
  // Route reachability is tested above; docking isolates pause/reset during handoff.
  await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
  await expect.poll(async () => (await snapshot(page)).finished).toBe(true);
  await page.getByRole('button', { name: 'Pause game' }).click();
  const paused = await snapshot(page);
  await page.waitForTimeout(350);
  expect((await snapshot(page)).reaction).toEqual(paused.reaction);
  expect((await snapshot(page)).elapsed).toBe(paused.elapsed);
  await page.getByRole('button', { name: 'Restart delivery', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#bay-result')).toBeHidden();
  const restarted = await snapshot(page);
  expect(restarted.finished).toBe(false); expect(restarted.index).toBe(0);
  expect(restarted.cargoVisible).toBe(true); expect(restarted.reaction.bloom).toBe(0);
  expect(restarted.reaction.progress).toBe(0); expect(restarted.recoveries).toBe(0);
  expect(restarted.speed).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Back to home', exact: true }).click();
  await page.getByRole('button', { name: 'Start delivering' }).click();
  expect((await snapshot(page)).local.x).toBeCloseTo(-13, 2);
  expect((await snapshot(page)).reaction.bloom).toBe(0);
  expect(errors).toEqual([]);
});

test('Garden phone controls and retry remain usable with reduced motion and unavailable storage', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 320, height: 640 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('storage unavailable'); };
      Storage.prototype.setItem = () => { throw new Error('storage unavailable'); };
    });
    const errors = await loadGarden(page);
    await page.getByRole('button', { name: 'Start delivering' }).tap();
    const cdp = await context.newCDPSession(page);
    const gas = await page.getByRole('button', { name: 'Drive forward', exact: true }).boundingBox();
    const right = await page.getByRole('button', { name: 'Turn right', exact: true }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { x: gas!.x + gas!.width / 2, y: gas!.y + gas!.height / 2, id: 0 },
      { x: right!.x + right!.width / 2, y: right!.y + right!.height / 2, id: 1 },
    ] });
    await page.waitForTimeout(400);
    expect((await snapshot(page)).speed).toBeGreaterThan(0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect(page.locator('#bay-result')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).reaction.flowersBloomed).toBe(true);
    const card = await page.locator('#bay-result').boundingBox();
    const controls = await page.locator('.touch-controls').boundingBox();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(320);
    expect(card!.y + card!.height).toBeLessThan(controls!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: 'artifacts/garden-delivered-mobile.png' });
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
    expect(retry.reaction.progress).toBe(0); expect(retry.reaction.bloom).toBe(0);
    expect(retry.reaction.flowersBloomed).toBe(false);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
