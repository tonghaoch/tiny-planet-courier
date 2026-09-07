import { expect, test, type Page } from '@playwright/test';

async function snapshot(page: Page) {
  return page.evaluate(() => (window as any).__planetTest.snapshot());
}

async function expectEnglish(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Tiny Planet Courier');
  const content = await page.evaluate(() => [
    document.body.textContent,
    document.querySelector('meta[name="description"]')?.getAttribute('content'),
    ...Array.from(document.querySelectorAll('[aria-label], [title]'), element => `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`),
  ].join('\n'));
  expect(content).not.toMatch(/\p{Script=Han}/u);
}

async function expectTextFits(page: Page, selector: string) {
  const overflow = await page.locator(selector).evaluateAll(elements => elements
    .filter(element => element.getClientRects().length > 0 && element.scrollWidth > element.clientWidth + 2)
    .map(element => element.id || element.className));
  expect(overflow).toEqual([]);
}

async function load(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?test=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#error-panel')).toBeHidden();
  await expectEnglish(page);
  return errors;
}

test('desktop scene, keyboard driving, pause, delivery and replay', async ({ page }) => {
  const errors = await load(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/home-desktop.png' });
  await expect(page.getByRole('heading', { name: /Tiny planet\./ })).toBeVisible();
  await expectTextFits(page, '.hero-copy, .trip-ticket, .start-button');
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'playing');
  const before = await snapshot(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  const after = await snapshot(page);
  expect(after.speed).toBeGreaterThan(2);
  expect(after.charge).toBeLessThan(1);
  expect(after.normal).not.toEqual(before.normal);
  expect(after.cameraRadius).toBeGreaterThan(18);
  expect(after.drawCalls).toBeLessThan(400);
  await page.screenshot({ path: 'artifacts/driving-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'The planet can wait.' })).toBeVisible();
  await expectEnglish(page);
  await expectTextFits(page, '.pause-modal, .pause-modal .start-button');
  const paused = await snapshot(page);
  await page.waitForTimeout(400);
  expect((await snapshot(page)).elapsed).toBe(paused.elapsed);
  await page.getByRole('button', { name: 'Resume journey' }).click();
  const destinations = ['Sunrise Bakery', 'Stargaze Station', 'Windmill Garden'];
  for (let index = 0; index < 3; index++) {
    await expect(page.locator('#mission-name')).toHaveText(destinations[index]);
    await expectEnglish(page);
    await expectTextFits(page, '.mission-card, #mission-name, #mission-parcel, #mission-hint');
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect.poll(async () => (await snapshot(page)).index).toBe(index + 1);
  }
  await expect(page.getByRole('dialog', { name: 'All smiles, delivered.' })).toBeVisible();
  await expectEnglish(page);
  await page.screenshot({ path: 'artifacts/complete-desktop.png' });
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'playing');
  expect((await snapshot(page)).index).toBe(0);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(250);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('KeyW');
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'paused');
  expect(errors).toEqual([]);
  console.log('Rendering diagnostics:', JSON.stringify(after));
});

test('portrait layout and pointer driving controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await load(page);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/home-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expectTextFits(page, '.hero-copy, .start-button');
  await page.getByRole('button', { name: 'Start delivering' }).click();
  await expect(page.locator('.touch-controls')).toBeVisible();
  await page.waitForTimeout(1000);
  const gas = page.getByRole('button', { name: 'Drive forward', exact: true });
  const rect = await gas.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  expect((await snapshot(page)).speed).toBeGreaterThan(1);
  await page.mouse.up();
  await expectEnglish(page);
  await expectTextFits(page, '.mission-card, #mission-name, #mission-hint, .boost-readout');
  await page.screenshot({ path: 'artifacts/driving-mobile.png' });
  await page.getByRole('button', { name: 'Pause game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'paused');
  await page.getByRole('button', { name: 'Resume journey' }).click();
  await page.waitForTimeout(1700);
  expect((await snapshot(page)).speed).toBeLessThan(0.2);
  expect(errors).toEqual([]);
});

test('simultaneous touch steering and acceleration release correctly', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/?test=1');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Start delivering' }).tap();
  const start = await snapshot(page);
  const gas = await page.getByRole('button', { name: 'Drive forward', exact: true }).boundingBox();
  const left = await page.getByRole('button', { name: 'Turn left', exact: true }).boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { x: gas!.x + gas!.width / 2, y: gas!.y + gas!.height / 2, id: 0 },
    { x: left!.x + left!.width / 2, y: left!.y + left!.height / 2, id: 1 },
  ] });
  await page.waitForTimeout(900);
  const turning = await snapshot(page);
  expect(turning.speed).toBeGreaterThan(1);
  expect(turning.forward).not.toEqual(start.forward);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.pressed')).toHaveCount(0);
  await page.waitForTimeout(1800);
  expect((await snapshot(page)).speed).toBeLessThan(0.2);
  await context.close();
});

test('unsupported graphics produces a readable recovery screen', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
      if (type.includes('webgl')) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The planet cannot launch yet.' })).toBeVisible();
  await expect(page.locator('#error-message')).toContainText('WebGL 2');
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expectEnglish(page);
});

test('storage failure does not prevent finishing a delivery run', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Disabled', 'SecurityError'); } });
  });
  const errors = await load(page);
  await page.getByRole('button', { name: 'Start delivering' }).click();
  for (let index = 0; index < 3; index++) {
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect.poll(async () => (await snapshot(page)).index).toBe(index + 1);
  }
  await expect(page.getByRole('dialog', { name: 'All smiles, delivered.' })).toBeVisible();
  await expect(page.locator('#best-time')).toHaveText('—');
  await expectEnglish(page);
  expect(errors).toEqual([]);
});

test('English labels and dialogs fit a small phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const errors = await load(page);
  await expectTextFits(page, '.hero-copy, .start-button, .masthead');
  await page.getByRole('button', { name: 'Start delivering' }).click();
  const consoleBox = await page.locator('.driving-console').boundingBox();
  const queueBox = await page.locator('.delivery-queue').boundingBox();
  expect(consoleBox!.x + consoleBox!.width).toBeLessThanOrEqual(queueBox!.x);
  await page.getByRole('button', { name: 'Pause game' }).click();
  await expectTextFits(page, '.pause-modal, .modal-secondary');
  await page.getByRole('button', { name: 'Resume journey' }).click();
  const destinations = ['Sunrise Bakery', 'Stargaze Station', 'Windmill Garden'];
  for (let index = 0; index < 3; index++) {
    await expect(page.locator('#mission-name')).toHaveText(destinations[index]);
    await expectTextFits(page, '.mission-card, #mission-name, #mission-parcel, #mission-hint, .boost-readout');
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect.poll(async () => (await snapshot(page)).index).toBe(index + 1);
  }
  await expect(page.getByRole('dialog', { name: 'All smiles, delivered.' })).toBeVisible();
  await expectEnglish(page);
  await expectTextFits(page, '.complete-modal, .complete-modal .start-button');
  const dialog = await page.locator('.complete-modal').boundingBox();
  expect(dialog!.x).toBeGreaterThanOrEqual(0);
  expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(320);
  expect(dialog!.y).toBeGreaterThanOrEqual(0);
  expect(dialog!.y + dialog!.height).toBeLessThanOrEqual(640);
  await page.screenshot({ path: 'artifacts/complete-small-mobile.png' });
  expect(errors).toEqual([]);
});
