/** Agents end to end: the worker follows up an overdue action → the owner replies in the inbox → the CEO approves a CRM proposal in the approval queue → the agent executes exactly that. */
import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tick = () => execSync("npx tsx --conditions=react-server scripts/agents/worker.ts --once --quiet", { stdio: "pipe", timeout: 120_000 });

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("OmniDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("agent follow-up, inbox reply and approval queue", async ({ page }) => {
  tick();
  const { data: company } = await admin.from("companies").select("id").eq("slug", "clinara").single();
  const { data: msg } = await admin.from("agent_messages").select("id, to_user_id, subject").eq("company_id", company!.id).eq("kind", "followup").order("created_at").limit(1).single();
  const { data: user } = await admin.auth.admin.getUserById(msg!.to_user_id!);

  // The owner answers in the Omni OS inbox
  await login(page, user.user!.email!);
  await page.goto("/c/clinara/inbox");
  const card = page.locator("article, li, div").filter({ hasText: msg!.subject }).filter({ has: page.getByRole("button", { name: "Send reply" }) }).last();
  await card.getByRole("radio", { name: "Progress update" }).click();
  await card.getByLabel("Update").fill("Evidence pack is with the QSA; expecting sign-off Friday.");
  await card.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Answered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reply" })).toHaveCount(0);
  expect((await admin.from("agent_messages").select("response_kind").eq("id", msg!.id).single()).data!.response_kind).toBe("update");

  // The CEO approves the Commercial Agent's CRM proposal
  await login(page, "daniel@clinara.demo");
  await page.goto("/c/clinara/agents/approvals");
  const proposal = page.locator("section, article, div").filter({ hasText: /Create \d+ CRM follow-up tasks/ }).filter({ has: page.getByRole("button", { name: "Approve this action" }) }).last();
  await expect(proposal).toBeVisible();
  await proposal.getByRole("button", { name: "Approve this action" }).click();
  await expect(page.getByRole("button", { name: "Approve this action" })).toHaveCount(0);
  tick();
  const { count } = await admin.from("crm_sandbox_tasks").select("id", { count: "exact", head: true }).eq("company_id", company!.id).eq("created_by_agent", true);
  expect(count).toBeGreaterThan(0);
  await page.goto("/c/clinara/agents/commercial");
  await expect(page.getByText(/Re-engage:/).first()).toBeVisible();
});
