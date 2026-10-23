/** Per-company branding with Omni defaults, and the Monday scorecard approve → Omni flow. */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("OmniDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const brandVar = (page: Page) => page.locator("[data-brand]").first().evaluate((el) => getComputedStyle(el).getPropertyValue("--brand").trim().toUpperCase());

test("a company admin brands the workspace; Omni views keep the Omni identity", async ({ page, browser }) => {
  await signIn(page, "daniel@clinara.demo");
  await page.goto("/c/clinara/settings/branding");
  await page.getByLabel("Primary colour", { exact: true }).fill("#7A1FA2");
  await expect(page.getByTestId("brand-preview")).toHaveAttribute("style", /--brand: #7A1FA2/i);

  // Unsupported files are refused before upload
  await page.locator('input[type="file"]').setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByText(/SVG and other formats are not supported/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "public/brand/omni-mark.png"));
  await expect(page.getByTestId("logo-preview")).toBeVisible();

  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByText("Branding saved")).toBeVisible();
  await page.goto("/c/clinara");
  expect(await brandVar(page)).toBe("#7A1FA2");

  // Omni: the company workspace shows its branding; the portfolio is always Omni
  const omni = await browser.newPage();
  await signIn(omni, "priya@omni.demo");
  await omni.goto("/c/clinara");
  expect(await brandVar(omni)).toBe("#7A1FA2");
  await omni.getByRole("link", { name: "Portfolio" }).first().click();
  await expect(omni).toHaveURL(/\/portfolio$/);
  await expect(omni.locator("[data-brand]")).toHaveAttribute("data-brand", "omni");
  expect(await brandVar(omni)).toBe("#F54E00");
  // Kestrel keeps its own branding
  await omni.goto("/c/kestrel");
  expect(await brandVar(omni)).toBe("#0F7B4F");
  await omni.close();

  // Executives cannot reach the branding settings
  const exec = await browser.newPage();
  await signIn(exec, "marcus@clinara.demo");
  await exec.goto("/c/clinara/settings/branding");
  await expect(exec).toHaveURL(/\/c\/clinara$/);
  await exec.close();

  // Restore Omni defaults
  await page.goto("/c/clinara/settings/branding");
  await page.getByRole("button", { name: "Restore Omni defaults" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore defaults" }).click();
  await expect(page.getByText("Omni defaults restored")).toBeVisible();
  await page.goto("/c/clinara");
  expect(await brandVar(page)).toBe("#F54E00");
});

test("the CEO approves the Monday scorecard and Omni sees it on the portfolio", async ({ page, browser }) => {
  await signIn(page, "daniel@clinara.demo");
  await page.goto("/c/clinara/weekly-scorecard");
  await expect(page.getByTestId("scorecard-state")).toContainText("Draft");
  const table = page.getByTestId("scorecard-table").first();
  await expect(table).toContainText("Agreed corrective action");
  await expect(table.locator('tr[data-status="at_risk"]').first()).toContainText("—");
  await page.getByRole("button", { name: "Approve and send" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/Priya Raman/)).toBeChecked();
  await dialog.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByText(/Approved and (emailed|shared in Omni OS)/)).toBeVisible();
  await expect(page.getByTestId("scorecard-state")).toContainText("Approved");

  const omni = await browser.newPage();
  await signIn(omni, "priya@omni.demo");
  await omni.goto("/portfolio");
  const row = omni.getByTestId("portfolio-scorecards").locator("div.grid", { hasText: "Clinara" }).first();
  await expect(row).toContainText("This week");
  await omni.close();

  // The Chair (observer) cannot see the scorecard
  const chair = await browser.newPage();
  await signIn(chair, "helen@clinara.demo");
  await chair.goto("/c/clinara/weekly-scorecard");
  await expect(chair.getByText("Restricted")).toBeVisible();
  await chair.close();
});
