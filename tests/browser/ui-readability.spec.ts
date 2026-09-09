import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 1440, height: 900 }, { width: 1920, height: 1080 },
  { width: 1024, height: 768 }, { width: 390, height: 844 },
  { width: 320, height: 640 }, { width: 844, height: 390 },
];
const modes = ['standard', 'bay', 'station', 'garden', 'tour'];
// Measured compact Tour boxes before extracting the hint row; widths stay unchanged.
const initialTourBounds = [
  { viewport: { width: 1440, height: 900 }, width: 420, height: 102.4, removed: 20 },
  { viewport: { width: 320, height: 640 }, width: 207.2, height: 95.8, removed: 20 },
  { viewport: { width: 844, height: 390 }, width: 364, height: 65.6, removed: 14 },
];
const font = (page: Page, selector: string) => page.locator(selector).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;
const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// Read DOM overlays and the actual rendered vehicle projection in the same browser task.
async function drivingVisibility(page: Page) {
  return page.evaluate(() => {
    const state = (window as any).__planetTest.snapshot();
    return { ...state, overlays: ['#navigation-hud', '#mission-hint', '.mission-card', '.toast.visible'].flatMap(selector => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || element.hidden || getComputedStyle(element).display === 'none') return [];
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];
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

async function expectNavigationVisibility(page: Page, visible: boolean) {
  for (const selector of ['#navigation-hud', '#mission-context', '#mission-hint']) {
    if (visible) await expect(page.locator(selector)).toBeVisible();
    else await expect(page.locator(selector)).toBeHidden();
  }
}

async function contextGeometry(page: Page) {
  return page.evaluate(() => {
    const context = document.querySelector<HTMLElement>('#mission-context')!;
    const navigation = document.querySelector('#navigation-hud')!.getBoundingClientRect();
    const rects = [context, ...context.querySelectorAll('#mission-hint, .mission-card')]
      .map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
    const actual = Math.max(navigation.top, ...rects.map(rect => rect.bottom));
    const cached = parseFloat(getComputedStyle(document.querySelector('#toast')!).getPropertyValue('--context-bottom'));
    const style = getComputedStyle(context);
    return { actual, cached, navigationTop: navigation.top, navigationBottom: navigation.bottom, navigationLeft: navigation.left,
      cachedTop: parseFloat(style.getPropertyValue('--navigation-top')),
      cachedBottom: parseFloat(style.getPropertyValue('--navigation-bottom')),
      cachedLeft: parseFloat(style.getPropertyValue('--navigation-left')) };
  });
}

async function expectContextGeometry(page: Page) {
  await expect.poll(async () => {
    const geometry = await contextGeometry(page);
    return Math.max(Math.abs(geometry.actual - geometry.cached), Math.abs(geometry.navigationTop - geometry.cachedTop),
      Math.abs(geometry.navigationBottom - geometry.cachedBottom), Math.abs(geometry.navigationLeft - geometry.cachedLeft));
  }, { message: 'Cached context must include the currently styled, visible hint and parcel' }).toBeLessThanOrEqual(1);
}

async function expectToastLayout(page: Page) {
  const viewport = page.viewportSize()!;
  const landscape = viewport.width >= 761 && viewport.height <= 500;
  await expect(page.locator('#toast.visible')).toBeVisible();
  await expect(page.locator('#toast')).toHaveCSS('opacity', '1');
  await expect(page.locator('#toast')).toHaveAttribute('role', 'status');
  await expect(page.locator('#toast')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#toast')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('#toast :is(button, a, [tabindex])')).toHaveCount(0);
  const active = await page.locator('#navigation-hud').isVisible();
  if (active) {
    await expect(page.locator('#mission-context')).toHaveCSS('transition-property', 'none');
    await expectContextGeometry(page);
  }
  const toast = await box(page, '#toast');
  expect(Math.abs(toast.x - (viewport.width <= 760 || landscape ? 16 : viewport.width * .043))).toBeLessThanOrEqual(1);
  expect(toast.width).toBeLessThanOrEqual(landscape ? Math.min(260, viewport.width * .3) : viewport.width <= 760 ? 220 : 224);
  expect(toast.y).toBeGreaterThanOrEqual((await box(page, '.masthead')).height);
  expect(toast.y + toast.height).toBeLessThanOrEqual(viewport.height);
  if (active && !landscape) {
    const geometry = await contextGeometry(page);
    expect(toast.y, 'Real hint/parcel-to-toast gap').toBeGreaterThanOrEqual(geometry.actual + 12);
    expect(toast.y).toBeLessThanOrEqual(geometry.actual + 13);
    if (viewport.width > 760) expect(toast.x + toast.width).toBeLessThanOrEqual((await box(page, '#navigation-hud')).x - 12);
  }
  const clipped = await page.locator('#toast, #toast-message').evaluateAll(elements => elements.some(element =>
    element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1));
  expect(clipped, 'Long status messages wrap without clipping').toBe(false);
  for (const selector of ['.masthead', '#navigation-hud', '#mission-hint', '.mission-card', '.run-time', '.driving-console', '.touch-steering', '.touch-pedals', '.delivery-queue', '#bay-result', '#tour-result']) {
    if (await page.locator(selector).isVisible()) expect(intersects(toast, await box(page, selector)), `toast vs ${selector}`).toBe(false);
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
    const content = ['.navigation-label', '#mission-name', '#mission-distance', '#mission-index', '#direction-cue', '#mission-hint', '#direction-arrow path'].map(selector => {
      const element = document.querySelector(selector)!;
      const detached = selector === '#mission-hint';
      const root = detached ? document.querySelector('#mission-context')! : hud;
      const layers: Element[] = [];
      for (let current: Element | null = element; current && root.contains(current); current = current.parentElement) layers.unshift(current);
      const paint = getComputedStyle(element), arrow = selector.includes('arrow');
      const color = rgba(arrow ? paint.fill : paint.getPropertyValue('-webkit-text-fill-color') || paint.color);
      const outline = rgba(paint.getPropertyValue(arrow ? 'stroke' : '-webkit-text-stroke-color'));
      // Verify actual paint, not a shadow allowance. The detached hint has its own
      // transparent ancestry, never the navigation backing. White/black bracket scene luminance.
      const ratios = [255, 0].map(channel => {
        const background = layers.reduce((result, layer) => composite(rgba(getComputedStyle(layer).backgroundColor), result), [channel, channel, channel]);
        const protection = composite(outline, background);
        return { direct: contrast(composite(color, background), background), outlined: contrast(composite(color, protection), protection) };
      });
      return { selector, detached, rgb: color.rgb, alpha: color.alpha, outline,
        fillOpacity: arrow ? Number(paint.fillOpacity) : 1, strokeOpacity: arrow ? Number(paint.strokeOpacity) : 1,
        strokeWidth: parseFloat(paint.getPropertyValue(arrow ? 'stroke-width' : '-webkit-text-stroke-width')),
        paintOrder: paint.getPropertyValue('paint-order'), vectorEffect: paint.getPropertyValue('vector-effect'),
        backings: layers.filter(layer => layer !== hud && !layer.classList.contains('direction-disc')).map(layer => ({ color: rgba(getComputedStyle(layer).backgroundColor), image: getComputedStyle(layer).backgroundImage })),
        whiteContrast: ratios[0], darkContrast: ratios[1] };
    });
    // Opacity on any ancestor would also fade the supposedly opaque text and arrow.
    const elements = [...hud.querySelectorAll('*'), ...document.querySelectorAll('#mission-context, #mission-hint')];
    for (let current: Element | null = hud; current; current = current.parentElement) elements.push(current);
    return {
      background: rgba(style.backgroundColor),
      backgroundImage: style.backgroundImage,
      filter: style.getPropertyValue('backdrop-filter') || style.getPropertyValue('-webkit-backdrop-filter') || 'none',
      disc: rgba(getComputedStyle(hud.querySelector('.direction-disc')!).backgroundColor),
      supportsOutline: CSS.supports('-webkit-text-stroke', '2px #07151c') && CSS.supports('paint-order', 'stroke fill'),
      supportsFilter: CSS.supports('backdrop-filter', 'blur(2px)') || CSS.supports('-webkit-backdrop-filter', 'blur(2px)'),
      reduced: matchMedia('(prefers-reduced-transparency: reduce)').matches,
      fadedElements: elements.filter(element => getComputedStyle(element).opacity !== '1').map(element => element.id || element.tagName),
      content,
    };
  });
  const treatment = expected ?? (surface.reduced ? 'reduced' : surface.supportsFilter ? 'glass' : 'fallback');
  expect(surface.background.rgb).toEqual(treatment === 'glass' ? [2, 8, 10] : [16, 40, 47]);
  expect(surface.backgroundImage).toBe('none');
  expect(surface.fadedElements).toEqual([]);
  expect(surface.supportsOutline).toBe(true);
  expect(surface.disc).toEqual({ rgb: [41, 75, 77], alpha: .22 });
  if (treatment === 'glass') {
    expect(surface.supportsFilter).toBe(true);
    expect(surface.reduced).toBe(false);
    expect(surface.background.alpha).toBe(.18);
    expect(surface.filter).toContain('blur(2px)');
    const saturation = Number(surface.filter.match(/saturate\(([\d.]+)\)/)?.[1]);
    expect(saturation).toBe(1.02);
  } else {
    if (treatment === 'reduced') expect(surface.reduced).toBe(true);
    expect(surface.background.alpha).toBeGreaterThanOrEqual(.95);
    expect(surface.filter).toBe('none');
  }
  for (const sample of surface.content) {
    expect(sample.alpha, `${sample.selector} foreground opacity`).toBe(1);
    expect(sample.fillOpacity).toBe(1);
    expect(sample.strokeOpacity).toBe(1);
    expect(sample.rgb, `${sample.selector} foreground color`).toEqual(sample.selector.includes('arrow') ? [255, 197, 156] : [255, 253, 245]);
    const minimum = sample.selector.includes('arrow') ? 3 : 4.5;
    expect(sample.outline).toEqual({ rgb: [7, 21, 28], alpha: 1 });
    expect(sample.strokeWidth).toBeGreaterThanOrEqual(1.5);
    expect(sample.strokeWidth).toBeLessThanOrEqual(2.5);
    expect(sample.paintOrder).toMatch(/^stroke(?: fill)?$/);
    if (sample.selector.includes('arrow')) expect(sample.vectorEffect).toBe('non-scaling-stroke');
    for (const backing of sample.backings) {
      expect(backing.color.alpha, `${sample.selector} must not gain a rectangular chip`).toBe(0);
      expect(backing.image).toBe('none');
    }
    for (const [scene, ratios] of [['white', sample.whiteContrast], ['dark', sample.darkContrast]] as const) {
      expect(ratios.outlined, `${sample.selector} protective outline over ${scene}`).toBeGreaterThanOrEqual(minimum);
      if (treatment !== 'glass' && !sample.detached) expect(ratios.direct, `${sample.selector} opaque fallback over ${scene}`).toBeGreaterThanOrEqual(minimum);
    }
  }
  return surface;
}

async function expectNavigationLayout(page: Page, width: number, treatment?: NavigationSurface) {
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
  const geometries = await page.locator('#navigation-hud, #mission-hint').evaluateAll(elements => elements.map(element => {
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
    const style = getComputedStyle(element);
    return { scaledAncestors, width: rect.width, height: rect.height,
      layoutWidth: element.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth),
      layoutHeight: element.clientHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) };
  }));
  for (const geometry of geometries) {
    expect(geometry.scaledAncestors).toEqual([]);
    expect(Math.abs(geometry.width - geometry.layoutWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.height - geometry.layoutHeight)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('.mission-card #direction-arrow')).toHaveCount(0);
  for (const id of ['direction-arrow', 'mission-name', 'mission-index', 'mission-distance', 'mission-hint', 'delivery-meter']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator(`#navigation-hud #${id}`)).toHaveCount(id === 'mission-hint' ? 0 : 1);
  }
  await expect(page.locator('#navigation-hud')).toHaveAttribute('aria-live', 'off');
  expect(await page.locator('#navigation-hud').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  await expectContextGeometry(page);
  const hint = await box(page, '#mission-hint');
  await expect(page.locator('#mission-context > #mission-hint')).toHaveCount(1);
  await expect(page.locator('#mission-hint')).toBeVisible();
  expect(await page.locator('#mission-context').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  await expect(page.locator('#mission-context :is(button, a, [tabindex])')).toHaveCount(0);
  expect(hint.x).toBeGreaterThanOrEqual(0);
  expect(hint.x + hint.width).toBeLessThanOrEqual(width);
  expect(hint.y + hint.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(hint.width).toBeLessThanOrEqual(width <= 760 ? 220 : 224);
  if (width <= 760) {
    expect(hint.x).toBe(16);
    expect(Math.abs(hint.y - hud.y - hud.height - 8)).toBeLessThanOrEqual(1);
  } else {
    expect(Math.abs(hint.x - width * .043)).toBeLessThanOrEqual(1);
    expect(Math.abs(hint.y - hud.y)).toBeLessThanOrEqual(1);
    expect(hint.x + hint.width).toBeLessThanOrEqual(hud.x - 12);
  }
  if (await page.locator('.mission-card').isVisible()) {
    const parcel = await box(page, '.mission-card');
    expect(parcel.x).toBe(hint.x);
    expect(parcel.y).toBeGreaterThanOrEqual(hint.y + hint.height + 12);
    expect(parcel.width).toBe(248);
  }
  const wrapping = await page.locator('#mission-hint').evaluate(element => {
    const style = getComputedStyle(element);
    return { clipped: element.scrollHeight > element.clientHeight + 1, whitespace: style.whiteSpace, align: style.textAlign };
  });
  expect(wrapping).toEqual({ clipped: false, whitespace: 'normal', align: 'left' });
  await expectNavigationSurface(page, treatment);
  for (const selector of ['.brand', '.sound-button', '.pause-button', '.run-time', '.mission-card', '.touch-controls', '.driving-console', '.delivery-queue', '.toast.visible']) {
    if (await page.locator(selector).isVisible()) {
      const other = await box(page, selector);
      expect(intersects(hud, other), `navigation vs ${selector}`).toBe(false);
      expect(intersects(hint, other), `hint vs ${selector}`).toBe(false);
    }
  }
  expect(intersects(hint, hud)).toBe(false);
  const overflow = await page.locator('#navigation-hud, #mission-name, #mission-hint, .navigation-distance').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.id));
  expect(overflow).toEqual([]);
  for (const selector of ['.navigation-destination', '.direction-disc', '.navigation-distance', '#navigation-hud .delivery-meter']) {
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
        const gate = '@supports ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px)))';
        expect(css).toContain(gate);
        expect(css).toContain('-webkit-backdrop-filter: blur(2px) saturate(1.02)');
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
    await expectNavigationVisibility(page, true);
    const surface = await expectNavigationSurface(page, treatment);
    await test.info().attach(`navigation-${treatment}`, { body: JSON.stringify(surface, null, 2), contentType: 'application/json' });
    const compositionGeometry = await box(page, '#navigation-hud');
    expect(compositionGeometry.width).toBe(initialTourBounds[0].width);
    expect(compositionGeometry.height).toBeLessThanOrEqual(initialTourBounds[0].height - initialTourBounds[0].removed);
    const hintGeometry = await box(page, '#mission-hint');
    // Real bright/dark compositions complement the computed outline contract; they
    // are not a claim that CSS ratios prove every antialiased scene pixel.
    for (const background of ['rgb(255, 255, 255)', 'rgb(0, 0, 0)']) {
      await page.locator('#stage').evaluate((stage, color) => {
        stage.style.background = color;
        stage.querySelector('canvas')!.style.visibility = 'hidden';
      }, background);
      expect(await page.locator('#stage').evaluate(element => getComputedStyle(element).backgroundColor)).toBe(background);
      await expectNavigationSurface(page, treatment);
      expect(await box(page, '#navigation-hud')).toEqual(compositionGeometry);
      expect(await box(page, '#mission-hint')).toEqual(hintGeometry);
    }
    await expectNavigationLayout(page, 1440, treatment);
    if (treatment === 'reduced') {
      // Preference changes must restore glass without a reload or any geometry change.
      const before = await box(page, '#navigation-hud');
      const hintBefore = await box(page, '#mission-hint');
      await expectContextGeometry(page);
      const contextBefore = await contextGeometry(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
      await expectNavigationSurface(page, 'glass');
      expect(await box(page, '#navigation-hud')).toEqual(before);
      expect(await box(page, '#mission-hint')).toEqual(hintBefore);
      await expectContextGeometry(page);
      expect(await contextGeometry(page)).toEqual(contextBefore);
    }
    await cdp.detach();
  });
}

test('bare development root welcomes the released Tour and starts three deliveries', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-prototype', 'tour');
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'home');
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('.home-view h1')).toHaveText(/Three stops\.\s*One big day\./);
  await expect(page.locator('.hero-copy > .eyebrow')).toHaveText('THREE-STOP TOUR');
  await expect(page.locator('.ticket-stamp')).toHaveText('READY TO GO');
  await expect(page.locator('#parcel-count')).toHaveText('03');
  await expect(page.locator('.ticket-count small')).toHaveText('little parcels');
  await expect(page.locator('#app')).not.toContainText(/playtest/i);
  expect(await page.evaluate(() => '__planetTest' in window)).toBe(false);
  await expectNavigationVisibility(page, false);
  await page.getByRole('button', { name: 'Start delivering', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-mode', 'playing');
  await expectNavigationVisibility(page, true);
  await expect(page.locator('#mission-name')).toHaveText('Sunrise Bakery');
  await expect(page.locator('#mission-index')).toHaveText('01 / 03');
  await expect(page.locator('#queue-stops .queue-stop')).toHaveCount(3);
  await expect(page.locator('#stage canvas')).toBeFocused();
  expect(await page.evaluate(() => '__planetTest' in window)).toBe(false);
  expect(errors).toEqual([]);
});

for (const viewport of viewports) {
  for (const mode of modes) {
    test(`readable welcome and centered HUD in ${mode} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?test=1&prototype=${mode}`);
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#app')).toHaveAttribute('data-prototype', mode);
      if (mode === 'bay' || mode === 'station' || mode === 'garden') {
        await expect(page.locator('.brand-type')).toContainText('PLAYTEST');
        await expect(page.locator('.header-center')).toContainText('Local playtest');
        await expect(page.locator('.ticket-stamp')).toHaveText('PLAYTEST');
      } else {
        await expect(page.locator('#app')).not.toContainText(/playtest/i);
      }
      await expect(page.locator('#error-panel')).toBeHidden();
      await expectNavigationVisibility(page, false);
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
      await expectNavigationVisibility(page, true);
      await page.waitForTimeout(viewport.width === 844 ? 1800 : 200);
      if (viewport.width === 844) {
        const state = await drivingVisibility(page);
        expect(state.overlays).toEqual(expect.arrayContaining([expect.objectContaining({ selector: '.toast.visible' })]));
        expectVanClear(state, viewport.width, viewport.height);
      }
      await expectToastLayout(page);
      await expectNavigationLayout(page, viewport.width);
      const baseline = mode === 'tour' && initialTourBounds.find(sample => sample.viewport.width === viewport.width && sample.viewport.height === viewport.height);
      if (baseline) {
        const rendered = await box(page, '#navigation-hud');
        expect(Math.abs(rendered.width - baseline.width), 'Keep the approved compact width').toBeLessThanOrEqual(1);
        expect(rendered.height, 'Removing the hint row makes the initial navigation strictly shorter').toBeLessThanOrEqual(baseline.height - baseline.removed);
        expect(rendered.height).toBeGreaterThanOrEqual(viewport.width === 844 ? 46 : 54);
      }
      if (viewport.width === 844) {
        expect((await box(page, '#navigation-hud')).height).toBeLessThanOrEqual(100);
      }
      await expect(page.locator('#stage canvas')).toBeFocused();
      await page.keyboard.press('Escape');
      await expectNavigationVisibility(page, false);
      await expect(page.locator('.toast')).toBeHidden();
      await page.getByRole('button', { name: 'Resume journey' }).click();
      await expectNavigationVisibility(page, true);
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
    await expectNavigationVisibility(page, true);
    await page.keyboard.press('KeyR');
    await expect(page.locator('#mission-name')).toHaveText(name);
    if (index > 0) await expect(page.locator('#mission-hint')).toContainText(/Reverse and turn|connecting road|deliveries are safe/);
    // State fixture only, not route-playability evidence.
    await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
    await expect.poll(() => page.evaluate(() => (window as any).__planetTest.snapshot().index)).toBe(index + 1);
  }
  await expectNavigationVisibility(page, false);
  await expect(page.locator('#target-marker')).toBeHidden();
  await expect(page.locator('#tour-result')).toBeVisible();
  await page.getByRole('button', { name: 'Restart tour', exact: true }).click();
  await expectNavigationVisibility(page, true);
  await expect(page.locator('#mission-name')).toHaveText('Sunrise Bakery');
  await expect(page.locator('#mission-index')).toHaveText('01 / 03');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Back to home' }).click();
  await expectNavigationVisibility(page, false);
});

for (const [viewport, reducedMotion] of [
  [viewports[0], 'no-preference'], [viewports[0], 'reduce'],
  [viewports[4], 'no-preference'], [viewports[4], 'reduce'],
] as const) {
  test(`initial and handoff Tour toast stays left with a real context gap at ${viewport.width}x${viewport.height} (${reducedMotion})`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport, hasTouch: true, reducedMotion });
    const page = await context.newPage();
    try {
      await page.goto('/?test=1&prototype=tour');
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
      await page.getByRole('button', { name: 'Start delivering', exact: true }).tap();
      await expectToastLayout(page);
      expectVanClear(await drivingVisibility(page), viewport.width, viewport.height);
      // State fixtures isolate presentation; the real-input Bay launch remains below.
      for (const name of ['Stargaze Station', 'Windmill Garden']) {
        await page.evaluate(() => (window as any).__planetTest.dockAtTarget());
        await expect(page.locator('#mission-name')).toHaveText(name);
        await expect(page.locator('#toast.visible')).toContainText('Follow the connecting road');
        await expectToastLayout(page);
        expectVanClear(await drivingVisibility(page), viewport.width, viewport.height);
      }
    } finally { await context.close(); }
  });
}

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
    const selectors = ['#navigation-hud', '#mission-hint', '.toast.visible', '.run-time', '.driving-console', '.touch-steering', '.touch-pedals'];
    for (let i = 0; i < selectors.length; i++) {
      for (let j = i + 1; j < selectors.length; j++) {
        expect(intersects(await box(page, selectors[i]), await box(page, selectors[j])), `${selectors[i]} vs ${selectors[j]}`).toBe(false);
      }
    }
    await page.getByRole('button', { name: 'Pause game' }).tap();
    await expectNavigationVisibility(page, false);
    await page.getByRole('button', { name: 'Resume journey' }).tap();
    await expectNavigationVisibility(page, true);
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
    await page.addInitScript(() => {
      (window as any).__geometryErrors = [];
      window.addEventListener('error', event => {
        if (event.message.includes('ResizeObserver')) (window as any).__geometryErrors.push(event.message);
      });
    });
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
      ui.toast('Follow the connecting road to Stargaze Station Observatory.');
      (window as any).__presentation = { ui, run };
    });
    await expect(page.locator('#mission-hint')).toHaveText('Next road is behind you. Reverse and turn gently.');
    await page.waitForTimeout(100);
    await expectNavigationLayout(page, viewport.width);
    const longNavigation = await box(page, '#navigation-hud');
    expect(longNavigation.height).toBeLessThanOrEqual(viewport.width <= 760 ? 110 : viewport.height <= 500 ? 85 : 100);
    await expect(page.locator('.toast.visible')).toBeVisible();
    await expectToastLayout(page);
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
    expect(await box(page, '#navigation-hud'), 'Hint wording never increases the central panel').toEqual(longNavigation);
    const geometry = await page.evaluate(() => {
      const { ui } = (window as any).__presentation;
      const hud = document.querySelector('#navigation-hud')!.getBoundingClientRect();
      const hint = document.querySelector('#mission-hint')!.getBoundingClientRect();
      let reads = 0;
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { reads++; return original.call(this); };
      try {
        const overlaps = ui.canShowTargetLabel(innerWidth / 2, hud.bottom);
        const overlapsHint = ui.canShowTargetLabel(hint.x + hint.width / 2, hint.bottom);
        const clear = ui.canShowTargetLabel(innerWidth / 2, innerHeight * .68);
        for (let i = 0; i < 100; i++) { ui.getWelcomeFrame(); ui.canShowTargetLabel(innerWidth / 2, innerHeight / 2); }
        return { overlaps, overlapsHint, clear, reads };
      } finally { Element.prototype.getBoundingClientRect = original; }
    });
    expect(geometry).toEqual({ overlaps: false, overlapsHint: false, clear: true, reads: 0 });
    const idleReads = await page.evaluate(async () => {
      let reads = 0;
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { reads++; return original.call(this); };
      try {
        for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        return reads;
      } finally { Element.prototype.getBoundingClientRect = original; }
    });
    expect(idleReads, 'Stable geometry must not schedule a measuring frame loop').toBe(0);
    expect(await page.evaluate(() => (window as any).__geometryErrors)).toEqual([]);
    for (const resized of [viewport.width <= 760 ? viewports[0] : viewports[4], viewport]) {
      await page.setViewportSize(resized);
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        await page.emulateMedia({ reducedMotion });
        await page.evaluate(() => (window as any).__presentation.ui.toast('Follow the connecting road to Stargaze Station Observatory.'));
        await expectToastLayout(page);
        const settled = await contextGeometry(page);
        // Check subsequent rendered frames, not a fixed sleep that could conceal a stale cache.
        for (let frame = 0; frame < 4; frame++) {
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
          expect(await contextGeometry(page)).toEqual(settled);
        }
      }
    }
    expect(await page.evaluate(() => (window as any).__geometryErrors)).toEqual([]);
    await page.evaluate(() => {
      const { ui, run } = (window as any).__presentation;
      run.index = 1;
      ui.update(run, 0, 1, 0, 0);
    });
    await expectNavigationVisibility(page, false);
    if (viewport.width <= 760 || viewport.height > 500) {
      await page.evaluate(() => {
        const { ui } = (window as any).__presentation;
        ui.showTourResults(90, [{ stopId: 'bay', elapsed: 25 }, { stopId: 'station', elapsed: 30 }, { stopId: 'garden', elapsed: 35 }], false);
        ui.toast('All three parcels delivered. Keep exploring.');
      });
      await expect(page.locator('#tour-result')).toBeVisible();
      await expect(page.locator('#toast.visible')).toHaveText('All three parcels delivered. Keep exploring.');
      await expect.poll(async () => (await box(page, '#toast')).y - (await box(page, '#tour-result')).y - (await box(page, '#tour-result')).height).toBeGreaterThanOrEqual(12);
      await expectToastLayout(page);
    }
    await page.evaluate(() => {
      const { ui, run } = (window as any).__presentation;
      run.start(); ui.update(run, 0, 1, 0, 0); ui.showError('Graphics connection lost. Reload to retry.');
    });
    await expectNavigationVisibility(page, false);
    await expect(page.locator('#error-panel')).toBeVisible();
  });
}
