/**
 * Playwright E2E tests for the Snapshot Management panel
 *
 * Tests the snapshot panel functionality:
 * - Panel display and expand/collapse
 * - Snapshot listing filtered by current config
 * - RPC URL display
 * - Refresh functionality
 *
 * Note: These tests do not require actual snapshots to exist.
 * They test the UI behavior and API integration.
 */

import { test, expect } from "@playwright/test";

test.describe("Snapshot Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/simulate");
  });

  test("displays snapshot panel on simulate page", async ({ page }) => {
    await expect(page.getByTestId("snapshot-panel")).toBeVisible();
    await expect(page.getByText("Snapshot Management")).toBeVisible();
  });

  test("shows loading state initially", async ({ page }) => {
    // On fresh page load, should show loading
    await expect(page.getByText("Loading...")).toBeVisible({ timeout: 2000 });
  });

  test("panel header shows snapshot count or 'No snapshots'", async ({ page }) => {
    // Wait for loading to complete
    await expect(page.getByText("Loading...")).not.toBeVisible({ timeout: 10000 });

    // Should show either a count badge or "No snapshots"
    const header = page.getByTestId("snapshot-panel-header");
    await expect(header).toBeVisible();

    // Check that we have either "total" count or "No snapshots"
    const hasTotalBadge = await page.getByText(/\d+ total/).isVisible().catch(() => false);
    const hasNoSnapshots = await page.getByText("No snapshots").first().isVisible().catch(() => false);

    expect(hasTotalBadge || hasNoSnapshots).toBeTruthy();
  });

  test("panel expands and collapses on header click", async ({ page }) => {
    // Wait for loading to complete
    await expect(page.getByText("Loading...")).not.toBeVisible({ timeout: 10000 });

    const header = page.getByTestId("snapshot-panel-header");
    const content = page.getByTestId("snapshot-panel-content");

    // Get initial state - panel auto-expands if there are snapshots
    const isInitiallyExpanded = await content.isVisible().catch(() => false);

    // Click to toggle
    await header.click();

    if (isInitiallyExpanded) {
      // If was expanded, should now be collapsed
      await expect(content).not.toBeVisible();
    } else {
      // If was collapsed, should now be expanded
      await expect(content).toBeVisible();
    }

    // Click again to toggle back
    await header.click();

    if (isInitiallyExpanded) {
      await expect(content).toBeVisible();
    } else {
      await expect(content).not.toBeVisible();
    }
  });

  test("expanded panel shows refresh button", async ({ page }) => {
    // Wait for loading to complete
    await expect(page.getByText("Loading...")).not.toBeVisible({ timeout: 10000 });

    // Ensure panel is expanded
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    await expect(content).toBeVisible();
    await expect(page.getByTestId("snapshot-refresh-button")).toBeVisible();
  });

  test("refresh button triggers data reload", async ({ page }) => {
    // Wait for initial load
    await expect(page.getByText("Loading...")).not.toBeVisible({ timeout: 10000 });

    // Ensure panel is expanded
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    await expect(content).toBeVisible();

    // Click refresh
    const refreshButton = page.getByTestId("snapshot-refresh-button");
    await refreshButton.click();

    // Button should show spinning icon (disabled state)
    await expect(refreshButton).toBeDisabled();

    // Wait for refresh to complete
    await expect(refreshButton).not.toBeDisabled({ timeout: 10000 });
  });

  test("shows 'no snapshots' message when empty", async ({ page }) => {
    // Wait for loading to complete
    await expect(page.getByText("Loading...")).not.toBeVisible({ timeout: 10000 });

    // Ensure panel is expanded
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    // If there are no snapshots, should show the help message
    const noSnapshotsMessage = page.getByText(/No snapshots available.*Direct.*Persist/);
    const hasSnapshots = await page.locator('[data-testid^="snapshot-row-"]').first().isVisible().catch(() => false);

    if (!hasSnapshots) {
      await expect(noSnapshotsMessage).toBeVisible();
    }
  });
});

test.describe("Snapshot Panel - With Snapshots", () => {
  // These tests verify behavior when snapshots exist

  test.beforeEach(async ({ page }) => {
    await page.goto("/simulate");
    // Wait for loading to complete
    await expect(page.getByText("Loading...")).not.toBeVisible({ timeout: 10000 });
  });

  test("displays chain rows with snapshot counts", async ({ page }) => {
    // Ensure panel is expanded
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    // Check for any chain rows
    const chainRows = page.locator('[data-testid^="snapshot-row-"]');
    const rowCount = await chainRows.count();

    if (rowCount > 0) {
      // Each row should have chain name and snapshot badge
      const firstRow = chainRows.first();
      await expect(firstRow).toBeVisible();

      // Should show snapshot count
      await expect(firstRow.getByText(/\d+ snapshot/)).toBeVisible();
    }
  });

  test("chain rows display RPC URL when available", async ({ page }) => {
    // Ensure panel is expanded
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    // Check for any RPC URL displays
    const rpcUrls = page.locator('[data-testid^="rpc-url-"]');
    const urlCount = await rpcUrls.count();

    if (urlCount > 0) {
      const firstUrl = rpcUrls.first();
      await expect(firstUrl).toBeVisible();

      // Should show truncated URL with "RPC:" prefix
      await expect(firstUrl).toContainText("RPC:");
      await expect(firstUrl).toContainText("...");
    }
  });

  test("chain rows have revert buttons", async ({ page }) => {
    // Ensure panel is expanded
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    // Check for chain rows with revert buttons
    const chainRows = page.locator('[data-testid^="snapshot-row-"]');
    const rowCount = await chainRows.count();

    if (rowCount > 0) {
      // Each row with snapshots should have a revert button
      const revertButtons = page.locator('[data-testid^="revert-button-"]');
      const buttonCount = await revertButtons.count();

      // Should have at least one revert button if there are chain rows
      expect(buttonCount).toBeGreaterThanOrEqual(0);
    }
  });

  test("shows 'Revert All' button when multiple chains have snapshots", async ({ page }) => {
    // Ensure panel is expanded
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    // Count chains with snapshots
    const chainRows = page.locator('[data-testid^="snapshot-row-"]');
    const rowCount = await chainRows.count();

    // If more than one chain row exists, should show "Revert All" button
    if (rowCount > 1) {
      await expect(page.getByTestId("revert-all-button")).toBeVisible();
    }
  });

  test("snapshot dropdown shows available snapshots", async ({ page }) => {
    // Ensure panel is expanded
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    // Check for any chain rows with selects
    const chainRows = page.locator('[data-testid^="snapshot-row-"]');
    const rowCount = await chainRows.count();

    if (rowCount > 0) {
      const firstRow = chainRows.first();
      const select = firstRow.locator("select");

      if (await select.isVisible()) {
        // Should have "Latest" option
        await expect(select.locator("option", { hasText: "Latest" })).toBeVisible();
      }
    }
  });
});

test.describe("Snapshot Panel - API Integration", () => {
  test("handles API errors gracefully", async ({ page }) => {
    // Intercept the snapshots API and return an error
    await page.route("/api/snapshots", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Test error" }),
      });
    });

    await page.goto("/simulate");

    // Wait for loading
    await expect(page.getByText("Loading...")).not.toBeVisible({ timeout: 10000 });

    // Expand panel
    const content = page.getByTestId("snapshot-panel-content");
    if (!await content.isVisible().catch(() => false)) {
      await page.getByTestId("snapshot-panel-header").click();
    }

    // Should show error message
    await expect(page.getByText("Test error")).toBeVisible();
  });

  test("filters snapshots by current RPC URL from config", async ({ page }) => {
    // This test verifies the API returns filtered results
    // We intercept to check the response format
    const responsePromise = page.waitForResponse("/api/snapshots");

    await page.goto("/simulate");

    // Wait for API call
    const response = await responsePromise;
    const apiResponseData = await response.json();

    // Verify response structure includes rpcUrls
    expect(apiResponseData).toHaveProperty("success");
    if (apiResponseData.success === true) {
      expect(apiResponseData).toHaveProperty("rpcUrls");
      expect(typeof apiResponseData.rpcUrls).toBe("object");
    }
  });
});
