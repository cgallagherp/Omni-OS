/** Scoreboard definitions + CSV import, and North Star versioning. */
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("OmniDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("define a custom KPI, then import actuals by CSV", async ({ page }) => {
  const name = `Demo bookings ${Date.now().toString(36)}`;
  await signIn(page, "marcus@clinara.demo");
  await page.goto("/c/clinara/scoreboard?view=monthly");
  await page.getByRole("button", { name: "New KPI" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Name").fill(name);
  await d.getByLabel("Frequency").selectOption("monthly");
  await d.getByLabel("Target", { exact: true }).fill("10");
  await d.getByLabel("Owner").selectOption({ label: "Marcus Webb — Chief Revenue Officer" });
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("KPI created")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();

  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const prev2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().slice(0, 7);
  await page.getByRole("button", { name: "Import CSV" }).click();
  const imp = page.getByRole("dialog");
  await imp.locator("textarea").fill(`metric,period,value\n${name},${prev2},12\n${name},${prev},7\nNo such KPI,${prev},1`);
  await imp.getByRole("button", { name: "Validate" }).click();
  await expect(imp.getByText("2 valid")).toBeVisible();
  await expect(imp.getByText("Unknown KPI")).toBeVisible();
  await imp.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByText("Imported 2 observations")).toBeVisible();

  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByText("Off track").first()).toBeVisible(); // 7 vs ≥10
  await expect(page.getByText("2 observations")).toBeVisible();
});

test("editing the North Star saves a new permanent version", async ({ page }) => {
  await signIn(page, "daniel@clinara.demo");
  await page.goto("/c/clinara/north-star");
  await page.getByRole("button", { name: "Edit North Star" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Target EBITDA").fill("21000000");
  await d.getByLabel("Summary of this change").fill("Raised EBITDA target after board review");
  await d.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByText("North Star updated")).toBeVisible();
  await expect(page.getByText("£21.0m").first()).toBeVisible();
  await expect(page.getByText("Raised EBITDA target after board review")).toBeVisible();
  await expect(page.getByText("Agreed at the leadership offsite")).toBeVisible();
});
