import { expect, test } from '@playwright/test';

for (const query of ['', '?prototype=bay&test=1', '?prototype=station&test=1', '?prototype=garden&test=1', '?prototype=unknown&test=1']) {
  test(`production keeps the original game without a test bridge: ${query || 'default'}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`./${query}`);
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#error-panel')).toBeHidden();
    await expect(page.locator('#parcel-count')).toHaveText('03');
    expect(await page.evaluate(() => '__planetTest' in window)).toBe(false);
    await page.getByRole('button', { name: 'Start delivering' }).click();
    await expect(page.locator('#mission-name')).toHaveText('Sunrise Bakery');
    expect(errors).toEqual([]);
  });
}
