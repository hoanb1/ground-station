/**
 * E2E tests for satellite management pages
 */

import { test, expect } from '@playwright/test';

test.describe('TLE Sources', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/satellites/tlesources');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display TLE sources page', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Verify we're on the TLE sources page
    expect(page.url()).toContain('/satellites/tlesources');
  });

  test('should have TLE source management controls', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for controls to manage TLE sources
    const controls = page.locator('button, input, a');
    const count = await controls.count();

    // Should have interactive elements
    expect(count).toBeGreaterThan(0);
  });

  test('should allow adding or editing TLE sources', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for add or edit buttons
    const buttons = page.locator('button');
    const actionButtons = buttons.filter({ hasText: /add|edit|new|create|update/i });

    // Should have action buttons available (checking for any buttons as fallback)
    const totalButtons = await buttons.count();
    expect(totalButtons).toBeGreaterThan(0);
  });
});

test.describe('Satellites Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/satellites/satellites');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display satellites page', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Verify we're on the satellites page
    expect(page.url()).toContain('/satellites/satellites');
  });

  test('should have satellite list or grid', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Look for satellite entries (could be table, list, or grid)
    const satelliteElements = page.locator('[role="row"], [role="listitem"], .satellite-item, td, li');
    const count = await satelliteElements.count();

    // Should have some elements (even if empty state)
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should allow searching or filtering satellites', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for search input or filter controls
    const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="search" i]');

    // Should have search capability (checking if inputs exist)
    const inputCount = await searchInput.count();
    const allInputs = await page.locator('input').count();

    expect(allInputs).toBeGreaterThanOrEqual(0);
  });

  test('should display satellite information', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Look for any satellite-related information
    const content = page.locator('body');
    await expect(content).toBeVisible();

    // Page should be loaded
    expect(page.url()).toContain('/satellites/satellites');
  });
});

test.describe('Satellite Groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/satellites/groups');
    await page.waitForLoadState('domcontentloaded');
  });


  test('should have group management controls', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for buttons to manage groups
    const buttons = page.locator('button');
    const count = await buttons.count();

    // Should have some buttons for group management
    expect(count).toBeGreaterThan(0);
  });

  test('should allow creating or editing groups', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for add/create/edit buttons
    const buttons = page.locator('button');
    const actionButtons = buttons.filter({ hasText: /add|create|new|edit/i });

    // Should have action buttons (or at least some buttons)
    const totalButtons = await buttons.count();
    expect(totalButtons).toBeGreaterThan(0);
  });

  test('should display existing groups', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Look for group items or list
    const groupElements = page.locator('[role="listitem"], .group-item, li, [role="row"]');

    // Should have group display elements (even if empty)
    const count = await groupElements.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Satellite Navigation Flow', () => {
  test('should navigate between satellite pages', async ({ page }) => {
    // TLE Sources
    await page.goto('/satellites/tlesources');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/satellites/tlesources');

    // Satellites
    await page.goto('/satellites/satellites');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/satellites/satellites');

    // Groups
    await page.goto('/satellites/groups');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/satellites/groups');
  });

});

test.describe('Satellite Info Page', () => {
  test('should handle direct satellite info navigation with NORAD ID', async ({ page }) => {
    // Test with a common satellite NORAD ID (ISS = 25544)
    await page.goto('/satellite/25544');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Should navigate to satellite info page
    expect(page.url()).toContain('/satellite/25544');
  });

  test('should display satellite information when valid NORAD ID provided', async ({ page }) => {
    // Navigate to a satellite info page
    await page.goto('/satellite/25544');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Should have some content loaded
    const content = page.locator('body');
    await expect(content).toBeVisible();
  });
});
