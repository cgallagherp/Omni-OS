/** M&A integration end to end: generate the playbook from the seeded documents → management resolves and approves it →
 *  an acquisition and its plan → approve → the agent follows up a dependency risk → the owner proposes a new date in the
 *  inbox → the CEO approves the date change and escalation → the issue and corrective actions reach Mission Control. */
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

test("playbook → plan → agent follow-up → approved escalation", async ({ page }) => {
  test.setTimeout(300_000);
  const { data: company } = await admin.from("companies").select("id").eq("slug", "clinara").single();
  const cid = company!.id;
  // the test may run at any hour: let the agent message whenever it runs
  const { data: cfg } = await admin.from("agent_configs").select("escalation").eq("company_id", cid).eq("agent_key", "integration").single();
  await admin.from("agent_configs").update({ escalation: { ...(cfg!.escalation as object), working_hours: { start: 0, end: 24, weekdays_only: false } } }).eq("company_id", cid).eq("agent_key", "integration");

  // 1–4. Generate the master playbook from the selected knowledge
  await login(page, "daniel@clinara.demo");
  await page.goto("/c/clinara/integrations/knowledge");
  await page.getByRole("button", { name: /Generate Playbook with AI/ }).first().click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.waitForURL(/playbooks\/[0-9a-f-]{36}/);
  tick();
  await page.reload();
  await expect(page.getByText("Conflicting requirements")).toBeVisible();

  // 5–6. Management resolves conflicts, decides suggestions, saves and approves
  const conflicts = page.locator("div.space-y-3.p-4").filter({ has: page.getByRole("button", { name: "Adopt this" }) });
  const n = await conflicts.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await conflicts.nth(i).getByRole("button", { name: "Adopt this" }).first().click();
  while (await page.getByRole("button", { name: "Accept", exact: true }).count()) await page.getByRole("button", { name: "Accept", exact: true }).first().click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve playbook" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/authoritative template/)).toBeVisible();
  const { data: pb } = await admin.from("integration_playbooks").select("status, version").eq("company_id", cid).eq("status", "approved").single();
  expect(pb!.version).toBe(1);

  // 7–8. An acquisition, completed 52 days ago, and its tailored plan
  await page.goto("/c/clinara/integrations");
  await page.getByRole("button", { name: "New acquisition" }).click();
  const d = page.getByRole("dialog");
  await d.locator('input[name="name"]').fill("Vetora");
  await d.locator('input[name="completion_date"]').fill(new Date(Date.now() - 52 * 86400000).toISOString().slice(0, 10));
  await d.locator('input[name="integration_model"]').fill("Full integration");
  await d.locator('select[name="sponsor_crew_id"]').selectOption({ label: "Daniel Okafor" });
  await d.locator('select[name="leader_crew_id"]').selectOption({ label: "Rachel Lim" });
  await d.locator('textarea[name="operating_model"]').fill("Retain the Vetora brand for 12 months; integrate finance, CRM and sales onto Clinara.");
  await d.locator('textarea[name="expected_synergies"]').fill("£1m annual cross-selling revenue by month 18");
  await d.locator('textarea[name="diligence_findings"]').fill("Weak cybersecurity: no MFA on administrator accounts. Customer data quality is poor: duplicate clinic records.");
  await d.getByRole("button", { name: "Create acquisition" }).click();
  await page.waitForURL(/integrations\/[0-9a-f-]{36}/);
  const acqUrl = page.url().split("?")[0];
  await page.getByRole("button", { name: "Generate Integration Plan" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  tick();
  await page.goto(acqUrl + "?tab=plan");
  await expect(page.getByText("Deviations from the playbook")).toBeVisible();
  await expect(page.getByText(/Remediate cybersecurity findings/).first()).toBeVisible();

  // 9. Management approves the plan; nothing executes before this
  while (await page.getByRole("button", { name: "Reject", exact: true }).count()) await page.getByRole("button", { name: "Reject", exact: true }).first().click();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Plan saved").first()).toBeVisible();
  const acqId = acqUrl.split("/").pop()!;
  expect((await admin.from("integration_activities").select("id", { count: "exact", head: true }).eq("acquisition_id", acqId)).count).toBe(0);
  await page.getByRole("button", { name: "Approve plan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/Approved plan v1/)).toBeVisible();

  // 10. The agent detects the dependency risk and follows up the owner
  let msg: { id: string; to_user_id: string | null; subject: string } | null = null;
  for (let i = 0; i < 6 && !msg; i++) {
    tick();
    msg = (await admin.from("agent_messages").select("id, to_user_id, subject").eq("company_id", cid).eq("agent_key", "integration").eq("kind", "followup").ilike("subject", "%Customer data cleansing%").maybeSingle()).data;
  }
  expect(msg).not.toBeNull();
  const { data: user } = await admin.auth.admin.getUserById(msg!.to_user_id!);

  // 11. The owner proposes a new date
  await login(page, user.user!.email!);
  await page.goto("/c/clinara/inbox");
  const card = page.locator("article, li, div").filter({ hasText: msg!.subject }).filter({ has: page.getByRole("button", { name: "Send reply" }) }).last();
  await card.getByRole("radio", { name: "New completion date" }).click();
  await card.locator('input[name="date"]').fill(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
  await card.locator('textarea[name="text"]').fill("Duplicate records took longer than planned.");
  await card.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Answered")).toBeVisible();
  tick();

  // 12. The CEO approves the revised date and the escalation; the agent acts on exactly that
  await login(page, "daniel@clinara.demo");
  await page.goto(acqUrl + "?tab=issues");
  await expect(page.getByText(/Escalate to Mission Control: Customer data cleansing/)).toBeVisible();
  const { data: before } = await admin.from("integration_activities").select("id, due_date, baseline_due_date").eq("acquisition_id", acqId).eq("title", "Customer data cleansing").single();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Approve this action" }).first().click();
    await expect(page.getByRole("button", { name: "Approve this action" })).toHaveCount(1 - i);
  }
  tick();
  const { data: after } = await admin.from("integration_activities").select("due_date, baseline_due_date").eq("id", before!.id).single();
  expect(after!.due_date).not.toBe(before!.due_date);
  expect(after!.baseline_due_date).toBe(before!.baseline_due_date); // variance is kept

  // 13. Mission Control shows the exception, not the routine
  await page.goto("/c/clinara/mission-control");
  await expect(page.getByText("Integrations needing attention")).toBeVisible();
  await expect(page.getByText(/Vetora integration: "Customer data cleansing"/).first()).toBeVisible();
  const { count: actions } = await admin.from("actions").select("id", { count: "exact", head: true }).eq("acquisition_id", acqId);
  expect(actions).toBe(3);
});
