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
    await page.waitForLoadState('networkidle');

    // Wait for the navigation item to be visible and clickable
    await page.waitForSelector('text=Tracking console', { state: 'visible', timeout: 10000 });

    // Click on Tracking Console navigation item
    await page.click('text=Tracking console');

    // Wait for navigation with increased timeout
    await page.waitForURL('**/track', { timeout: 15000 });

    // Verify we're on the tracking page
    expect(page.url()).toContain('/track');
  });

  test('should navigate to waterfall view', async ({ page }) => {
    await page.goto('/');

    // Wait for app to be ready
    await page.waitForLoadState('networkidle');

    // Wait for the navigation item to be visible and clickable
    await page.waitForSelector('text=Waterfall view', { state: 'visible', timeout: 10000 });

    // Click on Waterfall view navigation item
    await page.click('text=Waterfall view');

    // Wait for navigation with increased timeout
    await page.waitForURL('**/waterfall', { timeout: 15000 });

    // Verify we're on the waterfall page
    expect(page.url()).toContain('/waterfall');
  });

  test('should open hardware settings', async ({ page }) => {
    await page.goto('/');

    // Navigate to SDRs page
    await page.click('text=SDRs');

    // Wait for navigation
    await page.waitForURL('**/hardware/sdrs');

    // Verify we're on the SDRs page
    expect(page.url()).toContain('/hardware/sdrs');
  });

  test('should display satellite groups', async ({ page }) => {
    await page.goto('/satellites/groups');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check for groups heading or table
    await expect(
      page.locator('text=Groups').or(page.locator('table'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('should open preferences settings', async ({ page }) => {
    await page.goto('/settings/preferences');

    // Wait for preferences form to load
    await page.waitForLoadState('networkidle');

    // Verify preferences page elements are visible
    await expect(
      page.locator('text=Preferences').or(page.locator('form'))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');

    // Check if mobile menu/drawer works
    await expect(page.locator('text=Ground Station')).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/');

    await expect(page.locator('text=Ground Station')).toBeVisible();
  });
});
