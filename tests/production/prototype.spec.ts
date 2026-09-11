import { expect, test, type Page } from '@playwright/test';

async function expectOfficialWelcome(page: Page) {
  await expect(page.locator('#app')).toHaveAttribute('data-prototype', 'tour');
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'home');
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('.home-view h1')).toBeVisible();
  await expect(page.locator('.home-view h1')).toHaveText(/Five places\.\s*One big day\./);
  await expect(page.locator('.hero-copy > .eyebrow')).toHaveText('TEN-STOP TOUR');
  await expect(page.locator('.hero-description')).toHaveText(
    /Five places\. Ten little deliveries\.\s*Pick your paths and follow the roads between stops\./,
  );
  await expect(page.locator('.ticket-stamp')).toHaveText('READY TO GO');
  await expect(page.locator('#parcel-count')).toHaveText('10');
  await expect(page.locator('.ticket-count small')).toHaveText('little parcels');
  await expect(page.locator('#app')).not.toContainText(/playtest/i);
  expect(await page.evaluate(() => '__planetTest' in window)).toBe(false);
}

async function loadTour(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`./${query}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expectOfficialWelcome(page);
  return errors;
}

async function startTour(page: Page) {
  await page.getByRole('button', { name: 'Start delivering', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'playing');
  await expect(page.locator('#navigation-hud')).toBeVisible();
  await expect(page.locator('#mission-name')).toHaveText(
    /^(Sunrise Bakery|Stargaze Station|Windmill Garden|Beacon Post|Redrock Depot)$/,
  );
  await expect(page.locator('#mission-index')).toHaveText('01 / 10');
  await expect(page.locator('#queue-stops .queue-stop')).toHaveCount(10);
  await expect(page.locator('#stage canvas')).toBeFocused();
  expect(await page.evaluate(() => '__planetTest' in window)).toBe(false);
}

const speed = async (page: Page) => Number(await page.locator('#speed').innerText());
const distance = async (page: Page) => parseInt(await page.locator('#mission-distance').innerText(), 10);

for (const query of [
  '',
  '?test=1',
  '?prototype=standard&test=1',
  '?prototype=bay&test=1',
  '?prototype=station&test=1',
  '?prototype=garden&test=1',
  '?prototype=tour&test=1',
  '?prototype=&test=1',
  '?prototype=unknown&test=1',
  '?prototype=constructor&test=1',
  '?prototype=__proto__&test=1',
  '?prototype=standard&prototype=bay&test=1',
  '?test&tourSeed=227',
  '?test=1&tourSeed=0',
  '?prototype=station&test=1&tourSeed=1',
  '?prototype=garden&test=1&tourSeed=invalid',
  '?test=1&tourSeed=',
  '?test=1&tourSeed=1.5',
  '?test=1&tourSeed=Infinity',
  '?tourSeed=227',
  '?prototype=unknown&prototype=standard&test=1',
]) {
  test(`production releases Tour without a test bridge: ${query || 'default'}`, async ({ page }) => {
    const errors = await loadTour(page, query);
    await startTour(page);
    expect(errors).toEqual([]);
  });
}

test('production seed parameters cannot replace the independently offered itinerary', async ({ page }) => {
  // Identical offer randomness makes isolation observable without any production bridge.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await loadTour(page);
  await expect(page.locator('#ticket-next')).toHaveText('Next: Redrock Depot');
  await startTour(page);
  const offered = await page.locator('#mission-name').textContent();
  expect(offered).toBe('Redrock Depot');
  for (const query of ['?test&tourSeed=227', '?test=1&tourSeed=invalid', '?prototype=bay&test=1&tourSeed=1']) {
    const errors = await loadTour(page, query);
    await expect(page.locator('#ticket-next')).toHaveText(`Next: ${offered}`);
    await startTour(page);
    // DEV seed 227 starts at Bakery; the production query must still offer Depot.
    await expect(page.locator('#mission-name')).toHaveText(offered!);
    expect(await page.evaluate(() => '__planetTest' in window)).toBe(false);
    expect(errors).toEqual([]);
  }
});

test('public Tour supports keyboard driving, pause, recovery, restart and a clean home/start', async ({ page }) => {
  const errors = await loadTour(page);
  await startTour(page);
  const firstTarget = await page.locator('#mission-name').textContent();
  const offeredQueue = await page.locator('#queue-stops .queue-stop').allTextContents();
  await expect.poll(() => distance(page)).toBeGreaterThan(0);
  const initialDistance = await distance(page);
  await page.keyboard.down('KeyW');
  try {
    await expect.poll(() => speed(page)).toBeGreaterThan(5);
    await expect.poll(async () => Math.abs((await distance(page)) - initialDistance)).toBeGreaterThan(0);
  } finally {
    await page.keyboard.up('KeyW');
  }

  const pause = page.getByRole('dialog', { name: 'The planet can wait.' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'paused');
  await expect(pause).toBeVisible();
  await expect(pause).toContainText('Your parcels and the view will be here.');
  await expect(page.locator('#navigation-hud')).toBeHidden();
  const pausedTime = await page.locator('#run-time').textContent();
  await pause.getByRole('button', { name: 'Resume journey' }).click();
  await expect(pause).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'playing');
  await expect(page.locator('#navigation-hud')).toBeVisible();
  await expect(page.locator('#stage canvas')).toBeFocused();
  await expect(page.locator('#run-time')).not.toHaveText(pausedTime!);

  await page.keyboard.down('KeyW');
  try {
    await expect.poll(() => speed(page)).toBeGreaterThan(5);
  } finally {
    await page.keyboard.up('KeyW');
  }
  await page.keyboard.press('KeyR');
  await expect(page.locator('#toast.visible')).toContainText(/Back at .+\. Your deliveries are safe\./);
  await expect(page.locator('#mission-hint')).toBeVisible();
  await expect.poll(() => speed(page)).toBe(0);
  await expect(page.locator('#mission-name')).toHaveText(firstTarget!);
  expect(await page.locator('#queue-stops .queue-stop').allTextContents()).toEqual(offeredQueue);
  await expect(page.locator('#mission-index')).toHaveText('01 / 10');

  await page.getByRole('button', { name: 'Pause game' }).click();
  await expect(pause).toBeVisible();
  // Restart through the pause dialog, not the hidden Tour completion panel.
  await pause.getByRole('button', { name: 'Restart tour', exact: true }).click();
  await expect(page.locator('#run-time')).toHaveText('00:00');
  await expect(page.locator('#speed')).toHaveText('00');
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'playing');
  await expect(page.locator('#app')).toHaveAttribute('data-delivered', 'false');
  await expect(pause).toBeHidden();
  await expect(page.locator('#mission-name')).toHaveText(firstTarget!);
  expect(await page.locator('#queue-stops .queue-stop').allTextContents()).toEqual(offeredQueue);
  await expect(page.locator('#mission-index')).toHaveText('01 / 10');
  await expect(page.locator('#queue-stops .is-done')).toHaveCount(0);
  await expect(page.locator('#tour-result')).toBeHidden();
  await expect(page.locator('#bay-result')).toBeHidden();
  await expect(page.locator('#stage canvas')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(pause).toBeVisible();
  await pause.getByRole('button', { name: 'Back to home', exact: true }).click();
  await expectOfficialWelcome(page);
  await expect(page.locator('#navigation-hud')).toBeHidden();
  await expect(page.locator('#mission-context')).toBeHidden();
  await expect(page.locator('#tour-result')).toBeHidden();
  await expect(page.locator('#toast')).not.toHaveClass(/visible/);
  await startTour(page);
  await expect(page.locator('#speed')).toHaveText('00');
  await expect(page.locator('#queue-stops .is-done')).toHaveCount(0);
  await expect(page.locator('#toast.visible')).toContainText('Follow the compass to your first neighbor.');
  expect(errors).toEqual([]);
});

test('narrow public welcome fits and touch UI drives with real pointer input', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const errors = await loadTour(page);
  const start = page.getByRole('button', { name: 'Start delivering', exact: true });
  await expect(start).toBeInViewport({ ratio: 1 });
  const title = await page.locator('.home-view h1').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(title.height / title.lineHeight).toBeLessThanOrEqual(2.05);
  const eyebrow = await page.locator('.hero-copy > .eyebrow').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(eyebrow.height / eyebrow.lineHeight).toBeLessThanOrEqual(1.05);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const overflow = await page
    .locator('.home-view, .hero-copy, .hero-description, .start-caption')
    .evaluateAll(elements =>
      elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className),
    );
  expect(overflow).toEqual([]);
  await startTour(page);
  await expect(page.locator('.touch-controls')).toBeVisible();
  for (const name of ['Turn left', 'Turn right', 'Brake and reverse', 'Boost', 'Drive forward']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  }
  const gas = page.getByRole('button', { name: 'Drive forward', exact: true });
  const rect = (await gas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(() => speed(page)).toBeGreaterThan(5);
  } finally {
    await page.mouse.up();
  }
  await expect(page.locator('.touch-controls .pressed')).toHaveCount(0);
  await expect.poll(() => speed(page)).toBe(0);
  await page.getByRole('button', { name: 'Pause game' }).click();
  const pause = page.getByRole('dialog', { name: 'The planet can wait.' });
  await expect(pause).toBeVisible();
  await pause.getByRole('button', { name: 'Resume journey' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'playing');
  await expect(page.locator('.touch-controls')).toBeVisible();
  expect(await page.evaluate(() => '__planetTest' in window)).toBe(false);
  expect(errors).toEqual([]);
});
