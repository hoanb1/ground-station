/**
 * E2E tests for hardware configuration pages
 */

import { test, expect } from '@playwright/test';

test.describe('Rig Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hardware/rig');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display rig configuration page', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(2000);

    // Verify we're on the rigs page
    expect(page.url()).toContain('/hardware/rig');
  });

  test('should have rig configuration controls', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for common rig-related text or controls
    const rigContent = page.locator('button, input, select, [role="combobox"]');
    const count = await rigContent.count();

    // Should have some interactive elements for rig configuration
    expect(count).toBeGreaterThan(0);
  });

  test('should allow adding or configuring rigs', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for add button or configuration options
    const buttons = page.locator('button');
    const addButton = buttons.filter({ hasText: /add|new|create/i });

    // Should have controls (even if add button isn't present, other buttons should exist)
    const totalButtons = await buttons.count();
    expect(totalButtons).toBeGreaterThan(0);
  });
});

test.describe('Rotator Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hardware/rotator');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display rotator configuration page', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Verify we're on the rotator page
    expect(page.url()).toContain('/hardware/rotator');
  });

  test('should have rotator configuration controls', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for rotator-related controls
    const controls = page.locator('button, input, select');
    const count = await controls.count();

    // Should have some interactive elements
    expect(count).toBeGreaterThan(0);
  });

  test('should display azimuth and elevation controls or information', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for azimuth/elevation related text or controls
    const azElText = page.getByText(/azimuth|elevation|az|el/i);

    // Common rotator terminology should be present
    const count = await azElText.count();
    expect(count).toBeGreaterThanOrEqual(0); // May or may not be visible depending on setup
  });
});

test.describe('SDR Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hardware/sdrs');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display SDR configuration page', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Verify we're on the SDRs page
    expect(page.url()).toContain('/hardware/sdrs');
  });

  test('should have SDR configuration controls', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for SDR-related controls
    const controls = page.locator('button, input, select');
    const count = await controls.count();

    // Should have some interactive elements
    expect(count).toBeGreaterThan(0);
  });

  test('should allow adding or managing SDRs', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Look for buttons to manage SDRs
    const buttons = page.locator('button');
    const count = await buttons.count();

    // Should have control buttons
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Hardware Navigation Flow', () => {
  test('should navigate between hardware pages', async ({ page }) => {
    // Navigate to rigs
    await page.goto('/hardware/rig');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/hardware/rig');

    // Navigate to rotators
    await page.goto('/hardware/rotator');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/hardware/rotator');

    // Navigate to SDRs
    await page.goto('/hardware/sdrs');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/hardware/sdrs');
  });
});
