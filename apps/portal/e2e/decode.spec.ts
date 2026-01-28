/**
 * Playwright E2E tests for the Decode page
 *
 * Tests the portal's decode functionality with various proposals:
 * - 528: Normal baseline proposal
 * - 524: CCIP/Ronin bridge
 *
 * These tests validate:
 * - Input handling
 * - Loading states
 * - Results display
 * - Error handling
 */

import { test, expect } from "@playwright/test";

test.describe("Decode Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/decode");
  });

  test("displays decode page with input form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Proposal Decoder" })).toBeVisible();
    await expect(page.getByTestId("proposal-id-input")).toBeVisible();
  });

  test("shows error for invalid proposal ID", async ({ page }) => {
    const input = page.getByTestId("proposal-id-input");
    await input.fill("-1");
    await input.press("Enter");

    await expect(page.getByTestId("decode-error")).toBeVisible();
    await expect(page.getByTestId("decode-error")).toContainText(/valid/i);
  });

  test("shows loading state when decoding", async ({ page }) => {
    const input = page.getByTestId("proposal-id-input");
    await input.fill("528");
    await input.press("Enter");

    // Should show loading state
    await expect(page.getByText(/fetching|decoding|loading/i)).toBeVisible({ timeout: 5000 });
  });

  test("decodes proposal 528 (normal baseline)", async ({ page }) => {
    const input = page.getByTestId("proposal-id-input");
    await input.fill("528");
    await input.press("Enter");

    // Wait for results with generous timeout for RPC calls
    await expect(page.getByTestId("proposal-overview")).toBeVisible({ timeout: 120000 });

    // Verify proposal ID is displayed
    await expect(page.getByText("#528")).toBeVisible();

    // Verify at least one action card is visible
    await expect(page.getByTestId("action-0")).toBeVisible();
  });

  test("decodes proposal 524 (CCIP bridge)", async ({ page }) => {
    const input = page.getByTestId("proposal-id-input");
    await input.fill("524");
    await input.press("Enter");

    // Wait for results
    await expect(page.getByTestId("proposal-overview")).toBeVisible({ timeout: 120000 });

    // Verify proposal ID is displayed
    await expect(page.getByText("#524")).toBeVisible();

    // Should have at least one action
    await expect(page.getByTestId("action-0")).toBeVisible();
  });

  test("can navigate back from results", async ({ page }) => {
    const input = page.getByTestId("proposal-id-input");
    await input.fill("528");
    await input.press("Enter");

    // Wait for results
    await expect(page.getByTestId("proposal-overview")).toBeVisible({ timeout: 120000 });

    // Click back button
    await page.getByRole("button", { name: /back/i }).click();

    // Should be back on input page
    await expect(page.getByTestId("proposal-id-input")).toBeVisible();
  });

  test("can use keyboard navigation (Escape to go back)", async ({ page }) => {
    const input = page.getByTestId("proposal-id-input");
    await input.fill("528");
    await input.press("Enter");

    // Wait for results
    await expect(page.getByTestId("proposal-overview")).toBeVisible({ timeout: 120000 });

    // Press Escape to go back
    await page.keyboard.press("Escape");

    // Should be back on input page
    await expect(page.getByTestId("proposal-id-input")).toBeVisible();
  });

  test("can toggle JSON view", async ({ page }) => {
    const input = page.getByTestId("proposal-id-input");
    await input.fill("528");
    await input.press("Enter");

    // Wait for results
    await expect(page.getByTestId("proposal-overview")).toBeVisible({ timeout: 120000 });

    // Click JSON toggle
    await page.getByRole("button", { name: /json/i }).click();

    // Should show raw JSON
    await expect(page.locator("pre")).toBeVisible();
    await expect(page.locator("pre")).toContainText("governor");
  });

  test("example proposal buttons work", async ({ page }) => {
    // Click on example proposal #439
    await page.getByRole("button", { name: "#439" }).click();

    // Should start decoding
    await expect(page.getByText(/fetching|decoding|loading/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Decode Page - Input Modes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/decode");
  });

  test("can switch to calldata mode", async ({ page }) => {
    await page.getByRole("button", { name: /calldata/i }).click();

    // Should show textarea for calldata
    await expect(page.getByPlaceholder(/calldata/i)).toBeVisible();
  });

  test("can switch to JSON mode", async ({ page }) => {
    await page.getByRole("button", { name: /json/i }).click();

    // Should show textarea for JSON
    await expect(page.getByPlaceholder(/targets/i)).toBeVisible();
  });

  test("validates calldata format", async ({ page }) => {
    await page.getByRole("button", { name: /calldata/i }).click();

    const textarea = page.getByPlaceholder(/calldata/i);
    await textarea.fill("invalid");

    await page.getByRole("button", { name: /decode/i }).click();

    await expect(page.getByTestId("decode-error")).toBeVisible();
    await expect(page.getByTestId("decode-error")).toContainText(/hex|0x/i);
  });

  test("validates JSON format", async ({ page }) => {
    await page.getByRole("button", { name: /json/i }).click();

    const textarea = page.getByPlaceholder(/targets/i);
    await textarea.fill("not valid json");

    await page.getByRole("button", { name: /decode/i }).click();

    await expect(page.getByTestId("decode-error")).toBeVisible();
    await expect(page.getByTestId("decode-error")).toContainText(/json/i);
  });
});
