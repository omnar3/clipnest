import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your clipboard, collected.' })).toBeVisible();
});
test('search, type filters and clear state', async ({ page }) => {
  await expect(page.locator('.clip-card')).toHaveCount(8);
  await page.getByRole('searchbox', { name: 'Search clips' }).fill('javascript');
  await expect(page.locator('.clip-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.getByText('Nothing here just yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.clip-card')).toHaveCount(8);
});
test('favorite, title and category updates', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Design principles', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill('Updated principles');
  await dialog.getByRole('button', { name: 'Favorite', exact: true }).click();
  await dialog.getByLabel('Category', { exact: true }).selectOption('ideas');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /Favorites/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Updated principles', exact: true }),
  ).toBeVisible();
});
test('create and remove category without deleting its clips', async ({ page }) => {
  await page.getByRole('button', { name: 'New category', exact: true }).click();
  await page.getByLabel('Category name').fill('Writing');
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await page.getByRole('button', { name: 'Open Design principles', exact: true }).click();
  const select = page.getByRole('dialog').getByLabel('Category', { exact: true });
  await select.selectOption({ label: 'Writing' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Edit category Writing' }).click();
  await page.getByRole('button', { name: 'Delete category', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete category', exact: true })
    .click();
  await expect(page.locator('.clip-card')).toHaveCount(8);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Uncategorized' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Design principles', exact: true }),
  ).toBeVisible();
});
test('bulk delete requires confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Select clips', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select all matching clips' }).check();
  await page.getByRole('button', { name: 'Delete selected' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.clip-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Delete selected' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.clip-card')).toHaveCount(0);
});
test('settings theme and clear history preserve favorites', async ({ page }) => {
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Clear history', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /All clips/ })
    .click();
  await expect(page.locator('.clip-card')).toHaveCount(3);
});
test('keyboard and dialog focus', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.getByRole('button', { name: 'Open A little inspiration', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('responsive layout does not overflow', async ({ page }) => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 1440 || width === 390)
      await page.screenshot({ path: `test-results/preview-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  }
});
