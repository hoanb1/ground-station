/**
 * Example E2E test for Ground Station
 */

import { test, expect } from '@playwright/test';

test.describe('Ground Station Application', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // Check if the Ground Station branding is visible
    await expect(page.locator('text=Ground Station')).toBeVisible();
  });

  test('should navigate to tracking console', async ({ page }) => {
    await page.goto('/');

    // Wait for app to be ready
    await page.waitForLoadState('domcontentloaded');

    // Wait for navigation to be rendered and find the tracking console link
    const trackingLink = page.getByRole('link', { name: /tracking console/i }).or(
      page.getByRole('button', { name: /tracking console/i })
    );
    await trackingLink.waitFor({ state: 'visible', timeout: 20000 });

    // Click on Tracking Console navigation item
    await trackingLink.click();

    // Wait for navigation with increased timeout
    await page.waitForURL('**/track', { timeout: 15000 });

    // Verify we're on the tracking page
    expect(page.url()).toContain('/track');
  });

  test('should navigate to waterfall view', async ({ page }) => {
    await page.goto('/');

    // Wait for app to be ready
    await page.waitForLoadState('domcontentloaded');

    // Wait for navigation to be rendered and find the waterfall view link
    const waterfallLink = page.getByRole('link', { name: /waterfall view/i }).or(
      page.getByRole('button', { name: /waterfall view/i })
    );
    await waterfallLink.waitFor({ state: 'visible', timeout: 20000 });

    // Click on Waterfall view navigation item
    await waterfallLink.click();

    // Wait for navigation with increased timeout
    await page.waitForURL('**/waterfall', { timeout: 15000 });

    // Verify we're on the waterfall page
    expect(page.url()).toContain('/waterfall');
  });

  test('should open hardware settings', async ({ page }) => {
    await page.goto('/');

    // Wait for app to be ready
    await page.waitForLoadState('domcontentloaded');

    // Navigate to SDRs page
    const sdrsLink = page.getByRole('link', { name: /sdrs/i }).or(
      page.getByRole('button', { name: /sdrs/i })
    );
    await sdrsLink.waitFor({ state: 'visible', timeout: 20000 });
    await sdrsLink.click();

    // Wait for navigation
    await page.waitForURL('**/hardware/sdrs', { timeout: 15000 });

    // Verify we're on the SDRs page
    expect(page.url()).toContain('/hardware/sdrs');
  });

  test('should display satellite groups', async ({ page }) => {
    await page.goto('/satellites/groups');

    // Wait for the page to load
    await page.waitForLoadState('domcontentloaded');

    // Check for the Satellite Groups heading specifically
    await expect(
      page.getByText('Satellite Groups')
    ).toBeVisible({ timeout: 15000 });
  });

  test('should open preferences settings', async ({ page }) => {
    await page.goto('/settings/preferences');

    // Wait for preferences form to load
    await page.waitForLoadState('domcontentloaded');

    // Verify preferences page heading is visible
    await expect(
      page.getByRole('heading', { name: 'General' })
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check if the main content or navigation is rendered (using first match)
    await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
  });

  test('should work on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check if the main content is rendered
    await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });
  });
});
