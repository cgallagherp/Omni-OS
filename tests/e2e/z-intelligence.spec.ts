/** Revenue & Cost Intelligence end to end: overview → period → ARR bridge that reconciles → drill to the customers behind a
 *  movement → filter → cohorts → customer detail → ask the CEO Agent to investigate → raise the exception in Mission Control;
 *  cost bridges and drill-down; and domain permissions for a revenue-only executive. */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("OmniDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("revenue: overview → bridge → drill → customer → investigate → Mission Control", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "hannah@civicline.demo");

  await page.goto("/c/civicline/revenue");
  await expect(page.getByRole("heading", { name: "Revenue Intelligence" })).toBeVisible();
  await expect(page.getByText("Synthetic demonstration data.")).toBeVisible();
  await expect(page.getByText("Validated", { exact: true })).toHaveCount(0); // synthetic data is never shown as verified
  await page.getByRole("radio", { name: "Quarter" }).click();
  await page.waitForURL(/g=quarter/);

  // the ARR bridge reconciles exactly, and every movement opens the customers behind it
  await page.goto("/c/civicline/revenue/bridge?g=ltm");
  await expect(page.getByText("Movements reconcile exactly to closing ARR")).toBeVisible();
  await page.goto("/c/civicline/revenue/bridge?g=ltm&drill=contraction");
  const customer = page.locator("table a[href*='/revenue/customers/']").first();
  await expect(customer).toBeVisible();
  const name = (await customer.textContent())!.trim();

  // filtering keeps the bridge reconciled
  await page.goto("/c/civicline/revenue/bridge?g=ltm&f_sector=police");
  await expect(page.getByText("Movements reconcile exactly to closing ARR")).toBeVisible();

  await page.goto("/c/civicline/revenue/cohorts");
  await expect(page.getByText(/cohort/i).first()).toBeVisible();

  await page.goto("/c/civicline/revenue/bridge?g=ltm&drill=contraction");
  await page.locator("table a[href*='/revenue/customers/']").first().click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // ask the CEO Agent to investigate a revenue exception
  await page.goto("/c/civicline/revenue");
  await page.getByRole("button", { name: "Investigate", exact: true }).first().click();
  await page.waitForURL(/agents\/investigations\/[0-9a-f-]{36}/);

  // raise an exception in Mission Control with a corrective action
  await page.goto("/c/civicline/revenue");
  await page.getByRole("button", { name: "Raise issue", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  const title = `E2E retention issue ${Date.now()}`;
  await dialog.locator("input[name=title]").fill(title);
  await dialog.locator("select[name=owner_id]").selectOption({ index: 1 });
  await dialog.getByText("Agree a corrective action now").click();
  await dialog.locator("input[name=action_title]").fill("Renewal plan for every police force due this quarter");
  await dialog.locator("select[name=action_owner_id]").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Add to Mission Control" }).click();
  await expect(dialog).toBeHidden();

  const { data: issue } = await admin.from("issues").select("id, analytics_ref").eq("title", title).single();
  expect((issue!.analytics_ref as { module: string }).module).toBe("revenue");
  const { data: action } = await admin.from("actions").select("analytics_ref").eq("issue_id", issue!.id).single();
  expect(action!.analytics_ref).not.toBeNull();
  // the Mission Control record links back to the evidence
  const { data: co } = await admin.from("companies").select("slug").eq("slug", "civicline").single();
  await page.goto(`/c/${co!.slug}/execution/issue/${issue!.id}`);
  await page.getByRole("link", { name: /^From Revenue Intelligence:/ }).click();
  await page.waitForURL(/\/revenue/);
  expect(errors).toEqual([]);
});

test("cost: bridges reconcile and drill down to transactions", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "marcus.o@civicline.demo");
  await page.goto("/c/civicline/cost");
  await expect(page.getByRole("heading", { name: "Cost Intelligence" })).toBeVisible();
  await page.goto("/c/civicline/cost/bridges?g=ltm&basis=prior");
  await expect(page.getByText("Steps sum exactly to the change").first()).toBeVisible();
  await expect(page.getByText("Does not reconcile")).toHaveCount(0);
  await expect(page.getByText(/Pricing/).first()).toBeVisible(); // shown as unavailable, never invented
  await page.goto("/c/civicline/cost/analysis?g=ltm&group=department");
  await page.locator("table a[href*='key=']").first().click();
  await page.waitForURL(/key=/);
  await expect(page.locator("table").first()).toBeVisible();
  for (const p of ["trends", "suppliers", "people", "quality", "definitions"]) {
    await page.goto(`/c/civicline/cost/${p}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Restricted")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("a revenue-only executive cannot open Cost Intelligence", async ({ page }) => {
  await login(page, "sophie@civicline.demo");
  await page.goto("/c/civicline/revenue");
  await expect(page.getByRole("heading", { name: "Revenue Intelligence" })).toBeVisible();
  await page.goto("/c/civicline/cost");
  await expect(page.getByText("Restricted")).toBeVisible();
  const res = await page.request.get("/c/civicline/cost/export?dataset=analysis");
  expect(res.status()).toBe(403);
});
