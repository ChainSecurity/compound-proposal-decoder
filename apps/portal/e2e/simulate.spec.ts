/**
 * Playwright E2E tests for the Simulate page
 *
 * Tests the portal's simulation functionality with various proposals:
 * - 528: Normal baseline (should succeed)
 * - 519: High value (should fail)
 *
 * Note: These tests require Tenderly virtual testnet access.
 * Simulations can take several minutes to complete.
 */

import { test, expect } from "@playwright/test";

// Simulations can take a long time
test.setTimeout(300000); // 5 minutes

test.describe("Simulate Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/simulate");
  });

  test("displays simulate page with input form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Proposal Simulator" })).toBeVisible();
    await expect(page.getByTestId("simulator-proposal-id-input")).toBeVisible();
  });

  test("shows error for invalid proposal ID", async ({ page }) => {
    const input = page.getByTestId("simulator-proposal-id-input");
    await input.fill("-1");

    await page.getByTestId("simulate-submit-button").click();

    await expect(page.getByTestId("simulator-error")).toBeVisible();
    await expect(page.getByTestId("simulator-error")).toContainText(/valid/i);
  });

  test("shows loading state when simulating", async ({ page }) => {
    const input = page.getByTestId("simulator-proposal-id-input");
    await input.fill("528");

    await page.getByTestId("simulate-submit-button").click();

    // Should show simulating state
    await expect(page.getByText(/simulating/i)).toBeVisible({ timeout: 5000 });
  });

  test("can select different simulation modes", async ({ page }) => {
    // Default should be governance
    await expect(page.getByRole("button", { name: "Governance" })).toHaveClass(/default/);

    // Switch to direct mode
    await page.getByRole("button", { name: "Direct" }).click();
    await expect(page.getByRole("button", { name: "Direct" })).toHaveClass(/default/);

    // Switch to direct-persist mode
    await page.getByRole("button", { name: "Direct + Persist" }).click();
    await expect(page.getByRole("button", { name: "Direct + Persist" })).toHaveClass(/default/);
  });

  test("can select different backends", async ({ page }) => {
    // Default should be Tenderly
    await expect(page.getByTestId("backend-tenderly")).toHaveClass(/default/);

    // Switch to Anvil
    await page.getByTestId("backend-anvil").click();
    await expect(page.getByTestId("backend-anvil")).toHaveClass(/default/);

    // Switch back to Tenderly
    await page.getByTestId("backend-tenderly").click();
    await expect(page.getByTestId("backend-tenderly")).toHaveClass(/default/);
  });

  test("simulates proposal 528 successfully (normal baseline)", async ({ page }) => {
    const input = page.getByTestId("simulator-proposal-id-input");
    await input.fill("528");

    // Use direct mode for faster simulation
    await page.getByRole("button", { name: "Direct" }).click();

    await page.getByTestId("simulate-submit-button").click();

    // Wait for results with long timeout
    await expect(page.getByTestId("simulation-results")).toBeVisible({ timeout: 180000 });

    // Check simulation status
    await expect(page.getByTestId("simulation-status")).toBeVisible();
    await expect(page.getByTestId("simulation-status")).toContainText(/success/i);
  });

  test("simulates proposal 519 and shows failure (high value)", async ({ page }) => {
    const input = page.getByTestId("simulator-proposal-id-input");
    await input.fill("519");

    // Use direct mode for faster simulation
    await page.getByRole("button", { name: "Direct" }).click();

    await page.getByTestId("simulate-submit-button").click();

    // Wait for results
    await expect(page.getByTestId("simulation-results")).toBeVisible({ timeout: 180000 });

    // Check simulation status - should fail
    await expect(page.getByTestId("simulation-status")).toBeVisible();
    await expect(page.getByTestId("simulation-status")).toContainText(/failed/i);
  });
});

test.describe("Simulate Page - Input Modes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/simulate");
  });

  test("can switch to calldata tab", async ({ page }) => {
    await page.getByRole("tab", { name: /calldata/i }).click();

    // Should show calldata textarea
    await expect(page.getByLabel(/calldata/i)).toBeVisible();
  });

  test("can switch to JSON tab", async ({ page }) => {
    await page.getByRole("tab", { name: /json/i }).click();

    // Should show JSON textarea
    await expect(page.getByLabel(/proposal details/i)).toBeVisible();
  });

  test("validates calldata format", async ({ page }) => {
    await page.getByRole("tab", { name: /calldata/i }).click();

    await page.getByLabel(/calldata/i).fill("invalid");
    await page.getByTestId("simulate-submit-button").click();

    await expect(page.getByTestId("simulator-error")).toBeVisible();
    await expect(page.getByTestId("simulator-error")).toContainText(/hex|0x/i);
  });

  test("validates JSON format", async ({ page }) => {
    await page.getByRole("tab", { name: /json/i }).click();

    await page.getByLabel(/proposal details/i).fill("not valid json");
    await page.getByTestId("simulate-submit-button").click();

    await expect(page.getByTestId("simulator-error")).toBeVisible();
    await expect(page.getByTestId("simulator-error")).toContainText(/json/i);
  });
});

test.describe("Simulate Page - Results Display", () => {
  test("displays chain execution results", async ({ page }) => {
    await page.goto("/simulate");

    const input = page.getByTestId("simulator-proposal-id-input");
    await input.fill("528");

    // Use direct mode
    await page.getByRole("button", { name: "Direct" }).click();
    await page.getByTestId("simulate-submit-button").click();

    // Wait for results
    await expect(page.getByTestId("simulation-results")).toBeVisible({ timeout: 180000 });

    // Should show chain execution section
    await expect(page.getByText(/chain execution/i)).toBeVisible();

    // Should show at least mainnet result
    await expect(page.getByText(/mainnet/i)).toBeVisible();
  });

  test("displays simulation metadata", async ({ page }) => {
    await page.goto("/simulate");

    const input = page.getByTestId("simulator-proposal-id-input");
    await input.fill("528");

    await page.getByRole("button", { name: "Direct" }).click();
    await page.getByTestId("simulate-submit-button").click();

    // Wait for results
    await expect(page.getByTestId("simulation-results")).toBeVisible({ timeout: 180000 });

    // Should show mode
    await expect(page.getByText(/mode/i)).toBeVisible();
    await expect(page.getByText(/direct/i)).toBeVisible();

    // Should show duration
    await expect(page.getByText(/duration/i)).toBeVisible();
  });
});
