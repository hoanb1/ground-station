/**
 * E2E tests for navigation functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should navigate to file browser', async ({ page }) => {
    const fileBrowserLink = page.getByRole('link', { name: /file browser/i }).or(
      page.getByRole('button', { name: /file browser/i })
    );

    await fileBrowserLink.waitFor({ state: 'visible', timeout: 15000 });
    await fileBrowserLink.click();

    await page.waitForURL('**/filebrowser', { timeout: 10000 });
    expect(page.url()).toContain('/filebrowser');
  });
});

test.describe('Navigation State', () => {
  test('should maintain navigation state after refresh', async ({ page }) => {
    await page.goto('/settings/preferences');
    await page.waitForLoadState('networkidle');

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be on preferences page
    expect(page.url()).toContain('/settings/preferences');
  });

  test('should navigate back using browser back button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wait for any dialogs to close
    await page.locator('.MuiDialog-root').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    // Navigate to tracking console
    const trackingLink = page.getByRole('link', { name: /tracking console/i }).or(
      page.getByRole('button', { name: /tracking console/i })
    );
    await trackingLink.waitFor({ state: 'visible', timeout: 15000 });
    await trackingLink.click();
    await page.waitForURL('**/track', { timeout: 10000 });

    // Go back
    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Should be back at home
    expect(page.url()).not.toContain('/track');
  });
});
