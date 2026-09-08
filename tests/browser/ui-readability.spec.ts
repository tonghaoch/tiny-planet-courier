import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 1440, height: 900 }, { width: 1920, height: 1080 },
  { width: 1024, height: 768 }, { width: 390, height: 844 },
  { width: 320, height: 640 }, { width: 844, height: 390 },
];
const modes = ['standard', 'bay', 'station', 'garden', 'tour'];
// Independently measured Tour bounds before the compact layout; compare rendered boxes,
// not CSS width declarations, and allow 6px of content/font-driven height variation.
const initialTourBounds = [
  { viewport: { width: 1440, height: 900 }, width: 600, height: 146.296875 },
  { viewport: { width: 320, height: 640 }, width: 296, height: 134.890625 },
  { viewport: { width: 844, height: 390 }, width: 520, height: 94.1875 },
];
const font = (page: Page, selector: string) => page.locator(selector).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;
const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// Read DOM overlays and the actual rendered vehicle projection in the same browser task.
async function drivingVisibility(page: Page) {
  return page.evaluate(() => {
    const state = (window as any).__planetTest.snapshot();
    return { ...state, overlays: ['#navigation-hud', '.toast.visible'].flatMap(selector => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || element.hidden || getComputedStyle(element).display === 'none') return [];
      const rect = element.getBoundingClientRect();
      return [{ selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
    }) };
  });
}

function expectVanClear(state: Awaited<ReturnType<typeof drivingVisibility>>, width: number, height: number) {
  const van = state.vehicleScreen;
  expect(van.visible).toBe(true);
  expect(van.right - van.left).toBeGreaterThan(10);
  expect(van.bottom - van.top).toBeGreaterThan(15);
  expect(van.left).toBeGreaterThanOrEqual(0);
  expect(van.right).toBeLessThanOrEqual(width);
  expect(van.top).toBeGreaterThanOrEqual(0);
  expect(van.bottom).toBeLessThanOrEqual(height);
  for (const overlay of state.overlays) {
    expect(intersects(overlay, { x: van.left, y: van.top, width: van.right - van.left, height: van.bottom - van.top }),
      `${overlay.selector} covers van in ${state.phase ?? 'standard'}: ${JSON.stringify({ overlay, van })}`).toBe(false);
  }
}

type NavigationSurface = 'glass' | 'fallback' | 'reduced';

async function expectNavigationSurface(page: Page, expected?: NavigationSurface) {
  const surface = await page.locator('#navigation-hud').evaluate(hud => {
    const rgba = (value: string) => {
      const channels = value.match(/[\d.]+/g)!.map(Number);
      return { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 };
    };
    const composite = (foreground: ReturnType<typeof rgba>, background: number[]) =>
      foreground.rgb.map((channel, i) => channel * foreground.alpha + background[i] * (1 - foreground.alpha));
    const luminance = (rgb: number[]) => rgb.map(channel => {
      const srgb = channel / 255;
      return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
    const contrast = (foreground: number[], background: number[]) => {
      const values = [luminance(foreground), luminance(background)];
      return (Math.max(...values) + .05) / (Math.min(...values) + .05);
    };
    const style = getComputedStyle(hud);
    const content = ['.navigation-label', '#mission-name', '#mission-distance', '#mission-index', '#mission-hint', '#direction-arrow path'].map(selector => {
      const element = hud.querySelector(selector)!;
      const layers: Element[] = [];
      for (let current: Element | null = element; current && hud.contains(current); current = current.parentElement) layers.unshift(current);
      const color = rgba(getComputedStyle(element)[selector.includes('arrow') ? 'fill' : 'color']);
      // White is the brightest possible road sample; black represents dark space.
      // Composite every local backing (including the arrow disc); no credit for text shadows.
      const ratios = [255, 0].map(channel => {
        const background = layers.reduce((result, layer) => composite(rgba(getComputedStyle(layer).backgroundColor), result), [channel, channel, channel]);
        return contrast(composite(color, background), background);
      });
      return { selector, rgb: color.rgb, alpha: color.alpha, whiteContrast: ratios[0], darkContrast: ratios[1] };
    });
    // Opacity on any ancestor would also fade the supposedly opaque text and arrow.
    const elements = [...hud.querySelectorAll('*')];
    for (let current: Element | null = hud; current; current = current.parentElement) elements.push(current);
    return {
      background: rgba(style.backgroundColor),
      backgroundImage: style.backgroundImage,
      filter: style.getPropertyValue('backdrop-filter') || style.getPropertyValue('-webkit-backdrop-filter') || 'none',
      supportsFilter: CSS.supports('backdrop-filter', 'blur(5px)') || CSS.supports('-webkit-backdrop-filter', 'blur(5px)'),
      reduced: matchMedia('(prefers-reduced-transparency: reduce)').matches,
      fadedElements: elements.filter(element => getComputedStyle(element).opacity !== '1').map(element => element.id || element.tagName),
      content,
    };
  });
  const treatment = expected ?? (surface.reduced ? 'reduced' : surface.supportsFilter ? 'glass' : 'fallback');
  expect(surface.background.rgb).toEqual(treatment === 'glass' ? [2, 8, 10] : [16, 40, 47]);
  expect(surface.backgroundImage).toBe('none');
  expect(surface.fadedElements).toEqual([]);
  if (treatment === 'glass') {
    expect(surface.supportsFilter).toBe(true);
    expect(surface.reduced).toBe(false);
    expect(surface.background.alpha).toBe(.56);
    expect(surface.filter).toMatch(/blur\((5|6)px\)/);
    const saturation = Number(surface.filter.match(/saturate\(([\d.]+)\)/)?.[1]);
    expect(saturation).toBeGreaterThanOrEqual(1);
    expect(saturation).toBeLessThanOrEqual(1.15);
  } else {
    if (treatment === 'reduced') expect(surface.reduced).toBe(true);
    expect(surface.background.alpha).toBeGreaterThanOrEqual(.95);
    expect(surface.filter).toBe('none');
  }
  for (const sample of surface.content) {
    expect(sample.alpha, `${sample.selector} foreground opacity`).toBe(1);
    expect(sample.rgb, `${sample.selector} foreground color`).toEqual(sample.selector.includes('arrow') ? [255, 197, 156] : [255, 253, 245]);
    const minimum = sample.selector.includes('arrow') ? 3 : 4.5;
    expect(sample.whiteContrast, `${sample.selector} over white`).toBeGreaterThanOrEqual(minimum);
    expect(sample.darkContrast, `${sample.selector} over dark space`).toBeGreaterThanOrEqual(minimum);
  }
  return surface;
}

async function expectNavigationLayout(page: Page, width: number) {
  const hud = await box(page, '#navigation-hud');
  const arrow = await box(page, '.direction-disc');
  expect(Math.abs(arrow.x + arrow.width / 2 - width / 2)).toBeLessThan(1);
  expect(hud.x).toBeGreaterThanOrEqual(0);
  expect(hud.x + hud.width).toBeLessThanOrEqual(width);
  expect(hud.y).toBeGreaterThanOrEqual((await box(page, '.masthead')).height);
  expect(await page.locator('#direction-arrow').evaluate(element => parseFloat(getComputedStyle(element).width))).toBeGreaterThanOrEqual(width <= 760 ? 28 : 32);
  expect(await font(page, '#mission-name')).toBeGreaterThanOrEqual(14);
  expect(await font(page, '#mission-distance')).toBeGreaterThanOrEqual(18);
  expect(await font(page, '#mission-hint')).toBeGreaterThanOrEqual(12);
  for (const selector of ['.navigation-label', '#mission-index']) expect(await font(page, selector)).toBeGreaterThanOrEqual(10);
  const geometry = await page.locator('#navigation-hud').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const scaledAncestors = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      // Translation centers the HUD; scaling/rotation must not shrink its type or layout box.
      if (matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1
        || !['none', '1'].includes(style.getPropertyValue('scale'))
        || !['', '1', 'normal'].includes(style.getPropertyValue('zoom'))) scaledAncestors.push(current.id || current.tagName);
    }
    return { scaledAncestors, width: rect.width, height: rect.height, layoutWidth: element.clientWidth + 2, layoutHeight: element.clientHeight + 2 };
  });
  expect(geometry.scaledAncestors).toEqual([]);
  expect(Math.abs(geometry.width - geometry.layoutWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.height - geometry.layoutHeight)).toBeLessThanOrEqual(1);
  await expect(page.locator('.mission-card #direction-arrow')).toHaveCount(0);
  for (const id of ['direction-arrow', 'mission-name', 'mission-index', 'mission-distance', 'mission-hint', 'delivery-meter']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator(`#navigation-hud #${id}`)).toHaveCount(1);
  }
  await expect(page.locator('#navigation-hud')).toHaveAttribute('aria-live', 'off');
  expect(await page.locator('#navigation-hud').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  await expectNavigationSurface(page);
  for (const selector of ['.brand', '.sound-button', '.pause-button', '.run-time', '.mission-card', '.touch-controls', '.driving-console', '.delivery-queue', '.toast.visible']) {
    if (await page.locator(selector).isVisible()) expect(intersects(hud, await box(page, selector)), selector).toBe(false);
  }
  const overflow = await page.locator('#navigation-hud, #mission-name, #mission-hint, .navigation-distance').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.id));
  expect(overflow).toEqual([]);
  for (const selector of ['.navigation-destination', '.direction-disc', '.navigation-distance', '#mission-hint', '#navigation-hud .delivery-meter']) {
    const content = await box(page, selector);
    expect(content.x, `${selector} left containment`).toBeGreaterThanOrEqual(hud.x);
    expect(content.x + content.width, `${selector} right containment`).toBeLessThanOrEqual(hud.x + hud.width);
    expect(content.y, `${selector} top containment`).toBeGreaterThanOrEqual(hud.y);
    expect(content.y + content.height, `${selector} bottom containment`).toBeLessThanOrEqual(hud.y + hud.height);
  }
}

for (const treatment of ['glass', 'fallback', 'reduced'] as const) {
  test(`navigation glass treatment: ${treatment} preserves content opacity and contrast`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Reduced-transparency emulation uses Chromium CDP.');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: treatment === 'reduced' ? 'reduce' : 'no-preference' }] });
    let fallbackIntercepted = false;
    if (treatment === 'fallback') {
      // Chromium supports glass: force only this @supports gate false to exercise the
      // shipped fallback cascade, rather than injecting a replacement surface style.
      await page.route('**/src/style.css*', async route => {
        const response = await route.fetch();
        const css = await response.text();
        const gate = '@supports ((backdrop-filter: blur(5px)) or (-webkit-backdrop-filter: blur(5px)))';
        expect(css).toContain(gate);
        expect(css).toContain('-webkit-backdrop-filter: blur(5px) saturate(1.08)');
        fallbackIntercepted = true;
        await route.fulfill({ response, body: css.replace(gate, '@supports (backdrop-filter: unsupported-test-value)') });
      });
    }
    await page.goto('/?test=1&prototype=tour');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    if (treatment === 'fallback') expect(fallbackIntercepted).toBe(true);
    if (treatment === 'reduced') {
      test.skip(!await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), 'Browser does not expose reduced-transparency emulation.');
    }
    await page.getByRole('button', { name: 'Start delivering', exact: true }).click();
    await expect(page.locator('#navigation-hud')).toBeVisible();
    const surface = await expectNavigationSurface(page, treatment);
    await test.info().attach(`navigation-${treatment}`, { body: JSON.stringify(surface, null, 2), contentType: 'application/json' });
    if (treatment !== 'fallback') await expectNavigationLayout(page, 1440);
    if (treatment === 'reduced') {
      // Preference changes must restore glass without a reload or any geometry change.
      const before = await box(page, '#navigation-hud');
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
      await expectNavigationSurface(page, 'glass');
      expect(await box(page, '#navigation-hud')).toEqual(before);
    }
    await cdp.detach();
  });
}

for (const viewport of viewports) {
  for (const mode of modes) {
    test(`readable welcome and centered HUD in ${mode} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?test=1&prototype=${mode}`);
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#error-panel')).toBeHidden();
      await expect(page.locator('#navigation-hud')).toBeHidden();
      expect(await font(page, '.hero-description')).toBeGreaterThanOrEqual(viewport.width <= 760 ? 16 : 18);
      expect(await font(page, '.start-caption')).toBeGreaterThanOrEqual(12);
      expect(await font(page, '.hero-copy .eyebrow')).toBeGreaterThanOrEqual(12);
      const title = await page.locator('.home-view h1').evaluate(element => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) }));
      expect(title.height / title.lineHeight).toBeLessThanOrEqual(2.05);
      const start = page.getByRole('button', { name: 'Start delivering', exact: true });
      expect(await font(page, '.hero-copy > .start-button')).toBeGreaterThanOrEqual(16);
      expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      if (viewport.width === 844) {
        // Standard short landscape must fit the full CTA before any scrolling.
        const initial = (await start.boundingBox())!;
        expect(initial.y + initial.height).toBeLessThanOrEqual(viewport.height);
        const caption = await box(page, '.start-caption');
        expect(caption.y + caption.height).toBeLessThanOrEqual(viewport.height);
        expect(await page.locator('.home-view').evaluate(element => element.scrollTop)).toBe(0);
      }
      if (viewport.width <= 390) {
        const frame = await page.evaluate(() => (window as any).__planetTest.snapshot().welcomeFrame);
        const description = await box(page, '.hero-description');
        const initial = (await start.boundingBox())!;
        expect(frame.diameter).toBeGreaterThanOrEqual(viewport.width === 320 ? 170 : 250);
        expect(frame.y - frame.diameter / 2).toBeGreaterThanOrEqual(description.y + description.height + 10);
        expect(frame.y + frame.diameter / 2).toBeLessThanOrEqual(initial.y - 10);
        const caption = await box(page, '.start-caption');
        expect(caption.y + caption.height).toBeLessThanOrEqual(viewport.height - 16);
        expect(caption.y + caption.height).toBeGreaterThanOrEqual(viewport.height - 50);
        expect(await font(page, '.hero-copy > .start-button')).toBeGreaterThanOrEqual(17);
      }
      // Actual wheel scrolling, not DOM relocation or a forced click, makes short screens usable.
      await page.mouse.move(viewport.width * 0.25, viewport.height * 0.65);
      for (let tries = 0; tries < 8 && (await start.boundingBox())!.y + (await start.boundingBox())!.height > viewport.height; tries++) {
        await page.mouse.wheel(0, 160);
        await page.waitForTimeout(100);
      }
      const startBox = (await start.boundingBox())!;
      expect(startBox.y).toBeGreaterThanOrEqual((await box(page, '.masthead')).height);
      expect(startBox.y + startBox.height).toBeLessThanOrEqual(viewport.height);
      const overflow = await page.locator('.home-view, .hero-copy, .hero-description, .start-caption').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className));
      expect(overflow).toEqual([]);
      if (await page.locator('.home-footer').isVisible()) expect(intersects(await box(page, '.hero-copy'), await box(page, '.home-footer'))).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      await start.click();
      await expect(page.locator('#navigation-hud')).toBeVisible();
      await page.waitForTimeout(viewport.width === 844 ? 1800 : 200);
      await expectNavigationLayout(page, viewport.width);
      const baseline = mode === 'tour' && initialTourBounds.find(sample => sample.viewport.width === viewport.width && sample.viewport.height === viewport.height);
      if (baseline) {
        const rendered = await box(page, '#navigation-hud');
        expect(Math.abs(rendered.width - baseline.width * .7), 'HUD rendered width is 70% of the original').toBeLessThanOrEqual(1);
        expect(Math.abs(rendered.height - baseline.height * .7), 'Initial HUD rendered height is approximately 70% of the original').toBeLessThanOrEqual(6);
      }
      if (viewport.width === 844) {
        await expect(page.locator('.toast.visible')).toBeVisible();
        expectVanClear(await drivingVisibility(page), viewport.width, viewport.height);
        expect((await box(page, '#navigation-hud')).height).toBeLessThanOrEqual(100);
      }
      await expect(page.locator('#stage canvas')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('#navigation-hud')).toBeHidden();
      await expect(page.locator('.toast')).toBeHidden();
      await page.getByRole('button', { name: 'Resume journey' }).click();
      await expect(page.locator('#navigation-hud')).toBeVisible();
    });
  }
}

test('live Tour target updates, recovery, restart, completion and home hide stale navigation', async ({ page }) => {
  await page.goto('/?test=1&prototype=tour');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Start delivering' }).click();
  for (const [index, name] of ['Sunrise Bakery', 'Stargaze Station', 'Windmill Garden'].entries()) {
    await expect(page.locator('#mission-name')).toHaveText(name);
    await expect(page.locator('#mission-index')).toHaveText(`0${index + 1} / 03`);
    await expect(page.locator('#navigation-hud')).toBeVisible();
    await page.keyboard.press('KeyR');
    await expect(page.locator('#mission-name')).toHaveText(name);
    if (index > 0) await expect(page.locator('#mission-hint')).toContainText(/Reverse and turn|connecting road|deliveries are safe/);
    // State fixture only, not route-playability evidence.
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect.poll(() => page.evaluate(() => (window as any).__planetTest.snapshot().index)).toBe(index + 1);
  }
  await expect(page.locator('#navigation-hud')).toBeHidden();
  await expect(page.locator('#target-marker')).toBeHidden();
  await expect(page.locator('#tour-result')).toBeVisible();
  await page.getByRole('button', { name: 'Restart tour', exact: true }).click();
  await expect(page.locator('#navigation-hud')).toBeVisible();
  await expect(page.locator('#mission-name')).toHaveText('Sunrise Bakery');
  await expect(page.locator('#mission-index')).toHaveText('01 / 03');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Back to home' }).click();
  await expect(page.locator('#navigation-hud')).toBeHidden();
});

test('short landscape touch controls, readouts and handoff toast stay separate', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 844, height: 390 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/?test=1&prototype=tour');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await page.getByRole('button', { name: 'Start delivering' }).tap();
    await expect(page.locator('.touch-controls')).toBeVisible();
    await page.waitForTimeout(1800);
    await expectNavigationLayout(page, 844);
    await expect(page.locator('.toast.visible')).toBeVisible();
    await expect(page.locator('#toast')).toHaveAttribute('role', 'status');
    await expect(page.locator('#toast')).toHaveAttribute('aria-live', 'polite');
    expect(await page.locator('#toast').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
    expectVanClear(await drivingVisibility(page), 844, 390);
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect(page.locator('#mission-name')).toHaveText('Stargaze Station');
    await expect(page.locator('.toast.visible')).toContainText('Follow the connecting road');
    await page.waitForTimeout(1800);
    expectVanClear(await drivingVisibility(page), 844, 390);
    const selectors = ['#navigation-hud', '.toast.visible', '.run-time', '.driving-console', '.touch-steering', '.touch-pedals'];
    for (let i = 0; i < selectors.length; i++) {
      for (let j = i + 1; j < selectors.length; j++) {
        expect(intersects(await box(page, selectors[i]), await box(page, selectors[j])), `${selectors[i]} vs ${selectors[j]}`).toBe(false);
      }
    }
    await page.getByRole('button', { name: 'Pause game' }).tap();
    await expect(page.locator('#navigation-hud')).toBeHidden();
    await page.getByRole('button', { name: 'Resume journey' }).tap();
    await expect(page.locator('#navigation-hud')).toBeVisible();
  } finally { await context.close(); }
});

for (const hasTouch of [false, true]) {
  test(`short-landscape van stays clear during a real Bay boost launch (touch=${hasTouch})`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 844, height: 390 }, hasTouch });
    const page = await context.newPage();
    try {
      await page.goto('/?test=1&prototype=bay');
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
      await page.getByRole('button', { name: 'Start delivering', exact: true }).click();
      await page.waitForTimeout(1800);
      await expect(page.locator('.toast.visible')).toBeVisible();
      expectVanClear(await drivingVisibility(page), 844, 390);
      // Real keyboard/controller inputs, with coarse-pointer UI enabled in the touch case.
      await page.keyboard.down('KeyW');
      await page.keyboard.down('Space');
      let airborneSamples = 0;
      let initialToastSamples = 0;
      let landed = false;
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        const state = await drivingVisibility(page);
        expect(state.recoveries).toBe(0);
        expectVanClear(state, 844, 390);
        if (state.overlays.some((overlay: { selector: string }) => overlay.selector === '.toast.visible')) initialToastSamples++;
        if (state.phase === 'airborne') airborneSamples++;
        if (state.landings > 0) { landed = true; break; }
        await page.waitForTimeout(50);
      }
      await page.keyboard.up('Space');
      await page.keyboard.up('KeyW');
      expect(airborneSamples).toBeGreaterThanOrEqual(5);
      expect(initialToastSamples).toBeGreaterThan(0);
      expect(landed).toBe(true);
      await expect(page.locator('.toast.visible')).toContainText('Across the bay');
      expectVanClear(await drivingVisibility(page), 844, 390);
    } finally { await context.close(); }
  });
}

for (const touch of [false, true]) {
  test(`extreme-height welcome scrolls with real ${touch ? 'touch' : 'wheel'} gestures`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 844, height: 280 }, hasTouch: touch });
    const page = await context.newPage();
    try {
      await page.goto('/?test=1&prototype=tour');
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
      const start = page.getByRole('button', { name: 'Start delivering', exact: true });
      const initial = (await start.boundingBox())!;
      expect(initial.y + initial.height).toBeGreaterThan(280);
      expect(await page.locator('.home-view').evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
      if (touch) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 250, id: 0 }] });
        for (let y = 230; y >= 100; y -= 20) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y, id: 0 }] });
          await page.waitForTimeout(30);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(180, 230);
        await page.mouse.wheel(0, 180);
      }
      await expect.poll(() => page.locator('.home-view').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await expect.poll(async () => { const rect = (await start.boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(280);
      await start.click();
      await expect(page.locator('#app')).toHaveAttribute('data-mode', 'playing');
    } finally { await context.close(); }
  });
}

for (const viewport of [viewports[0], viewports[4], viewports[5]]) {
  test(`long-copy presentation, label avoidance and reduced motion at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Isolated real UI class and stylesheet: no renderer or gameplay state is modified.
    await page.route('**/ui-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en"><head><link rel="stylesheet" href="/src/style.css"></head><body><div id="app"></div></body></html>' }));
    await page.goto('/ui-fixture');
    await page.evaluate(async () => {
      const uiPath = '/src/ui.ts', gamePath = '/src/game.ts', prototypePath = '/src/delivery-prototypes.ts';
      const { UI } = await import(uiPath), { DeliveryRun } = await import(gamePath), { PROTOTYPES } = await import(prototypePath);
      const ui = new UI(PROTOTYPES.tour);
      const destinations = [{ id: 'long-name', name: 'Stargaze Station Observatory', parcel: 'A letter from Earth' }];
      const run = new DeliveryRun(destinations, { keepDrivingOnFinish: true });
      ui.setDestinations(destinations);
      run.start();
      ui.update(run, 0, 1, 12, Math.PI - .02, { phase: 'grounded', navigationPhase: 'transfer', reverseToExit: true });
      (window as any).__presentation = { ui, run };
    });
    await expect(page.locator('#mission-hint')).toHaveText('Next road is behind you. Reverse and turn gently.');
    await page.waitForTimeout(100);
    await expectNavigationLayout(page, viewport.width);
    const before = await page.locator('#direction-arrow').evaluate(element => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a);
    });
    await page.evaluate(() => {
      const { ui, run } = (window as any).__presentation;
      ui.resetJourney();
      ui.update(run, 0, 1, 12, -Math.PI + .03, { phase: 'grounded', navigationPhase: 'transfer' });
    });
    await expect(page.locator('#mission-hint')).toHaveText('Follow the connecting road to Stargaze Station Observatory.');
    // Restart deliberately snaps. Test the computed rendered orientation, not a CSS endpoint.
    // CSSOM serializes matrices/radians with finite precision; allow <0.002 degrees.
    const rendered = await page.locator('#direction-arrow').evaluate(element => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a);
    });
    expect(Math.abs(Math.atan2(Math.sin(rendered - before), Math.cos(rendered - before)) - .05)).toBeLessThan(.00002);
    expect(Math.abs(rendered - (-Math.PI + .03))).toBeLessThan(.00001);
    expect(await page.evaluate(() => (window as any).__presentation.ui.getNavigationPresentation().displayedHeading)).toBe(-Math.PI + .03);
    expect(await page.locator('#direction-arrow').evaluate(element => getComputedStyle(element).transitionProperty)).toBe('none');
    await page.waitForTimeout(100);
    await expectNavigationLayout(page, viewport.width);
    const geometry = await page.evaluate(() => {
      const { ui } = (window as any).__presentation;
      const hud = document.querySelector('#navigation-hud')!.getBoundingClientRect();
      let reads = 0;
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { reads++; return original.call(this); };
      try {
        const overlaps = ui.canShowTargetLabel(innerWidth / 2, hud.bottom);
        const clear = ui.canShowTargetLabel(innerWidth / 2, innerHeight * .68);
        for (let i = 0; i < 100; i++) { ui.getWelcomeFrame(); ui.canShowTargetLabel(innerWidth / 2, innerHeight / 2); }
        return { overlaps, clear, reads };
      } finally { Element.prototype.getBoundingClientRect = original; }
    });
    expect(geometry).toEqual({ overlaps: false, clear: true, reads: 0 });
    await page.evaluate(() => {
      const { ui, run } = (window as any).__presentation;
      run.index = 1;
      ui.update(run, 0, 1, 0, 0);
    });
    await expect(page.locator('#navigation-hud')).toBeHidden();
    await page.evaluate(() => {
      const { ui, run } = (window as any).__presentation;
      run.start(); ui.update(run, 0, 1, 0, 0); ui.showError('Graphics connection lost. Reload to retry.');
    });
    await expect(page.locator('#navigation-hud')).toBeHidden();
    await expect(page.locator('#error-panel')).toBeVisible();
  });
}
