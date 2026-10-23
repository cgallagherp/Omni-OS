/** Quarterly offsite: classify the last 90 days → carry forward → strategic issues → approve; previous plans retained. */
import { expect, test } from "@playwright/test";

test("the CEO runs the quarterly offsite and approves the next 90 days", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("sarah@kestrel.demo");
  await page.getByLabel("Password").fill("OmniDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto("/c/kestrel/quarterly-reset");
  const startButton = page.getByRole("button", { name: /Start the Q\d \d{4} offsite/ });
  const current = (await startButton.textContent())!.match(/Q\d \d{4}/)![0];
  await startButton.click();
  await expect(page.getByText(/Review the last 90 days/).first()).toBeVisible();

  // Approval is refused until every priority has a result
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Approve the Q\d \d{4} plan/ }).click();
  await expect(page.getByText(/Classify every priority/)).toBeVisible();

  // Stage 2: record a result and rationale for each priority
  const rows = page.locator('[data-testid^="outcome-"]');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const partly = (await row.textContent())!.includes("Reset subcontractor rate cards");
    await row.getByLabel("Result").selectOption(partly ? "partly_achieved" : "achieved");
    await row.getByLabel("Rationale").fill(partly ? "Two of three regions done; South slipped." : "Delivered as planned.");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Result recorded").first()).toBeVisible();
  }

  // Carry the partly achieved priority forward
  const sub = rows.filter({ hasText: "Reset subcontractor rate cards in the South region" });
  await sub.getByRole("button", { name: "Carry forward" }).click();
  await expect(sub.getByText("Carried forward")).toBeVisible();

  // Stage 7: a strategic issue
  await page.getByLabel("Strategic issue 1", { exact: true }).fill("Should we exit the low-margin South reactive work?");
  await page.getByLabel("Conclusion for strategic issue 1").fill("Yes — move it to planned maintenance over two quarters.");
  await page.getByRole("button", { name: "Save strategic issues" }).click();
  await expect(page.getByText("Strategic issues saved")).toBeVisible();

  // Stage 8: the carried priority is proposed for the next 90 days
  await expect(page.locator("#stage-8")).toContainText("Reset subcontractor rate cards in the South region");
  await expect(page.locator("#stage-8")).toContainText("Carried over");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Approve the Q\d \d{4} plan/ }).click();
  await expect(page.getByText("Next 90 days approved and now active")).toBeVisible();

  // The previous plan stays available, with its results
  const history = page.getByTestId("offsite-history");
  await expect(history).toContainText(current);
  await expect(history).toContainText("1 partly");

  await page.goto("/c/kestrel");
  await expect(page.getByText(/week 1 of/)).toBeVisible();
  await expect(page.locator("a", { hasText: "Reset subcontractor rate cards in the South region" }).first()).toBeVisible();
});
