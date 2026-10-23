/** Platform admin onboards a company from an Omni template; Omni access is explicit. */
import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const slug = `northgate-${Date.now().toString(36)}`;

test.afterAll(async () => {
  await admin.from("companies").delete().eq("slug", slug);
  const { data } = await admin.from("profiles").select("id").eq("email", `ceo@${slug}.demo`);
  for (const p of data ?? []) await admin.auth.admin.deleteUser(p.id);
});

async function signIn(page: import("@playwright/test").Page, email: string, password = "OmniDemo!2026") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("onboard a company, then the new CEO signs in to their own workspace only", async ({ page }) => {
  await signIn(page, "sam@omni.demo");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Onboard company" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Company name").fill("Northgate Labs");
  await d.getByLabel("URL slug").fill(slug);
  await d.getByLabel("Sector").fill("Lab software");
  await d.getByLabel("Omni template").selectOption("saas");
  await d.getByLabel("CEO name").fill("Jo Bright");
  await d.getByLabel("CEO email (creates login)").fill(`ceo@${slug}.demo`);
  await d.getByRole("button", { name: "Create company" }).click();

  const temp = page.getByRole("dialog").locator("code");
  await expect(temp).toBeVisible();
  const password = (await temp.textContent())!;
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForURL(`**/c/${slug}`);
  await expect(page.getByRole("heading", { name: "Northgate Labs" })).toBeVisible();

  await page.goto(`/c/${slug}/scoreboard?view=monthly`);
  await expect(page.getByText("Net revenue retention")).toBeVisible();
  await page.goto(`/c/${slug}/meetings`);
  await expect(page.getByText("Weekly ELT meeting").first()).toBeVisible();

  // Priya (Omni) is not assigned yet → cannot see it
  await signIn(page, "priya@omni.demo");
  expect((await page.goto(`/c/${slug}`))?.status()).toBe(404);

  // The new CEO lands in their company and cannot see others
  await signIn(page, `ceo@${slug}.demo`, password);
  await expect(page).toHaveURL(new RegExp(`/c/${slug}$`));
  expect((await page.goto("/c/clinara"))?.status()).toBe(404);
});
