/** Quarterly reset: review → carry forward → reflect → propose → approve, with history retained. */
import { expect, test } from "@playwright/test";

test("a company admin runs the quarterly reset and approves the next plan", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("sarah@kestrel.demo");
  await page.getByLabel("Password").fill("OmniDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto("/c/kestrel/quarterly-reset");
  const startButton = page.getByRole("button", { name: /Start Q\d \d{4} reset/ });
  const current = (await startButton.textContent())!.match(/Q\d \d{4}/)![0];
  await startButton.click();
  await expect(page.getByText(/Review Q\d \d{4} commitments/)).toBeVisible();

  // Carry an unfinished priority forward
  const row = page.locator("#step-1 div.px-4", { hasText: "Reset subcontractor rate cards in the South region" });
  await row.getByRole("button", { name: "Carry forward" }).click();
  await expect(row.getByText("Carried forward")).toBeVisible();

  // Reflections
  await page.getByLabel("What went well").fill("FSM live in Midlands; 40 PPM conversions.");
  await page.getByRole("button", { name: "Save reflections" }).click();
  await expect(page.getByText("Reflections saved")).toBeVisible();

  // The carried priority is proposed for next quarter
  await expect(page.locator("#step-5")).toContainText("Reset subcontractor rate cards in the South region");
  await expect(page.locator("#step-5")).toContainText("Carried over");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Approve Q\d \d{4} plan/ }).click();
  await expect(page.getByText("New quarterly plan approved")).toBeVisible();

  // The new quarter is active; the previous reset is retained in history
  await expect(page.getByRole("heading", { name: new RegExp(`Close Q\\d \\d{4}`) })).not.toContainText(current);
  await expect(page.getByText(new RegExp(`${current} → Q\\d \\d{4}`))).toBeVisible();

  await page.goto("/c/kestrel");
  await expect(page.getByText(/week 1 of/)).toBeVisible();
  await expect(page.locator("a", { hasText: "Reset subcontractor rate cards in the South region" }).first()).toBeVisible();
});
