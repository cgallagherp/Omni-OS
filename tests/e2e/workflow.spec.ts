/**
 * The end-to-end management workflow from the product brief, run through the real UI:
 * KPI change → dashboard → exception on the weekly agenda → issue → decision →
 * action assigned → action carried into the next meeting → Omni portfolio view →
 * tenant isolation.
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "OmniDemo!2026";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function lastCompletedWeekLabel() {
  const d = new Date();
  const today = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (today.getUTCDay() + 6) % 7;
  today.setUTCDate(today.getUTCDate() - dow - 7);
  return `w/c ${today.getUTCDate()} ${MONTHS[today.getUTCMonth()]}`;
}

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const stamp = Date.now().toString(36);
const ACTION = `Rebuild enterprise pipeline plan ${stamp}`;
const DECISION = `Add two enterprise SDRs ${stamp}`;

test.describe.serial("weekly operating rhythm", () => {
  test("an executive updates a KPI and the dashboard reflects it", async ({ page }) => {
    await signIn(page, "marcus@clinara.demo");
    await page.goto("/c/clinara/scoreboard");
    await page.getByRole("button", { name: `Enterprise pipeline coverage ${lastCompletedWeekLabel()}` }).click();
    const pop = page.getByRole("dialog");
    await pop.getByLabel("Actual").fill("1.9");
    await pop.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Enterprise pipeline coverage updated")).toBeVisible();

    await page.goto("/c/clinara");
    const attention = page.getByText("Needs attention").locator("xpath=../..");
    await expect(attention).toContainText("Enterprise pipeline coverage");
    await expect(attention).toContainText("1.9x");
  });

  test("the off-track KPI appears as an exception in the weekly meeting, where an issue, decision and action are recorded", async ({ page }) => {
    await signIn(page, "marcus@clinara.demo");
    await page.goto("/c/clinara/meetings");
    await page.getByRole("button", { name: "Start", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Finish meeting" }).first()).toBeVisible();

    const row = page.getByTestId("kpi-row-Enterprise pipeline coverage");
    await expect(row).toContainText("1.9x");
    await expect(row).toContainText("Off track");

    // Raise an issue from the exception (prefilled from the KPI)
    await row.getByRole("button", { name: "Raise issue" }).click();
    const issueDialog = page.getByRole("dialog");
    await issueDialog.getByLabel("Issue").fill(`Enterprise pipeline coverage collapsed to 1.9x ${stamp}`);
    await issueDialog.getByRole("button", { name: "Raise issue" }).click();
    await expect(page.getByText("Issue raised")).toBeVisible();

    // Discuss it under Material issues
    await page.getByRole("button", { name: /^Issues \d/ }).click();
    const issue = page.getByTestId(`issue-Enterprise pipeline coverage collapsed to 1.9x ${stamp}`);
    await expect(issue).toContainText("Raised today");
    await issue.getByRole("button", { name: /Enterprise pipeline coverage collapsed/ }).click();

    await issue.getByRole("button", { name: "Record decision" }).click();
    const decisionDialog = page.getByRole("dialog");
    await decisionDialog.getByLabel("Decision", { exact: true }).fill(DECISION);
    await decisionDialog.getByLabel("Rationale").fill("Coverage is the binding constraint on Q1 bookings.");
    await decisionDialog.getByLabel("Mark the linked issue as resolved").uncheck();
    await decisionDialog.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByText("Decision recorded")).toBeVisible();

    await issue.getByRole("button", { name: "Assign action" }).click();
    const actionDialog = page.getByRole("dialog");
    await actionDialog.getByLabel("Action").fill(ACTION);
    await actionDialog.getByLabel("Owner").selectOption({ label: "Aisha Khan — Chief Product & Technology Officer" });
    await actionDialog.getByRole("button", { name: "Assign action" }).click();
    await expect(page.getByText("Action assigned")).toBeVisible();
    await expect(issue).toContainText(DECISION);
    await expect(issue).toContainText(ACTION);

    // Finish and record the summary
    await page.getByRole("button", { name: "Finish meeting" }).first().click();
    const finish = page.getByRole("dialog");
    await expect(finish.getByLabel("Summary")).toContainText(DECISION);
    await finish.getByRole("button", { name: "Finish & save summary" }).click();
    await expect(page.getByText("Meeting finished")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText(ACTION)).toBeVisible();
  });

  test("the action is owned by the assigned executive and carries into the next meeting", async ({ page }) => {
    await signIn(page, "aisha@clinara.demo");
    await page.goto("/c/clinara/execution?view=actions");
    const actionRow = page.getByText(ACTION).locator("xpath=ancestor::div[contains(@class,'sm:flex-row')][1]");
    await expect(actionRow).toContainText("Aisha");

    await page.goto("/c/clinara/meetings");
    await page.getByRole("link", { name: "Preview agenda" }).first().click();
    const previous = page.getByText("4. Actions carried over").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
    await expect(previous).toContainText(ACTION);
  });

  test("Omni sees the deterioration at portfolio level", async ({ page }) => {
    await signIn(page, "priya@omni.demo");
    await expect(page).toHaveURL(/\/portfolio$/);
    const card = page.locator("a", { hasText: "B2B Vertical SaaS" }).locator("xpath=..");
    await expect(card).toContainText("Clinara");
    await expect(card).toContainText("Enterprise pipeline coverage");
    await page.goto("/portfolio/compare");
    await expect(page.getByRole("row", { name: /Pipeline coverage/ })).toContainText("1.9x");
  });

  test("a Clinara user cannot reach Kestrel, by URL or export endpoint", async ({ page }) => {
    await signIn(page, "marcus@clinara.demo");
    const res = await page.goto("/c/kestrel");
    expect(res?.status()).toBe(404);
    const exp = await page.request.get("/c/kestrel/scoreboard/export");
    expect(exp.status()).toBe(404);
    const own = await page.request.get("/c/clinara/scoreboard/export");
    expect(own.status()).toBe(200);
    expect(await own.text()).not.toContain("Engineer utilisation");
    const portfolio = await page.goto("/portfolio");
    expect(new URL(page.url()).pathname).toBe("/c/clinara");
    void portfolio;
  });
});
