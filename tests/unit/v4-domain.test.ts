import { describe, expect, it } from "vitest";
import { OMNI, brandWarnings, contrast, deriveBrandTokens, inkOn, isHex, normalizeHex } from "@/lib/domain/brand";
import { buildWeeklyScorecard, scorecardEmailHtml, weekStartOf, type ScorecardMetric } from "@/lib/domain/weekly-scorecard";
import { buildMetricView } from "@/lib/domain/metric-view";
import { fiscalQuarterStart, reportDue, reportingCompliance, reportingSchedule, workingDaysBefore } from "@/lib/domain/reporting";
import { attentionThisWeek } from "@/lib/domain/attention";
import { sniffLogo, validateLogo } from "@/lib/domain/logo-image";
import { flashDeadline, nextDueAfter, onboardingPlan } from "@/lib/domain/operating-system";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("brand tokens", () => {
  it("defaults to the official Omni identity", () => {
    const t = deriveBrandTokens();
    expect(t["--brand"]).toBe(OMNI.orange);
    expect(t["--brand-secondary"]).toBe(OMNI.blue);
    expect(t["--brand-accent"]).toBe(OMNI.teal);
  });
  it("derives readable text and hover shades instead of reusing the raw colour", () => {
    const t = deriveBrandTokens({ primary: "#F54E00" });
    expect(contrast(t["--brand-ink"], "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--brand"], t["--brand-foreground"])).toBeGreaterThanOrEqual(3);
    expect(t["--brand-hover"]).not.toBe(t["--brand"]);
  });
  it("deepens a very light primary so controls stay visible", () => {
    const t = deriveBrandTokens({ primary: "#F4F8FF" });
    expect(t["--brand"]).not.toBe("#F4F8FF");
    expect(contrast(t["--brand"], "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(brandWarnings({ primary: "#F4F8FF" }).length).toBeGreaterThan(0);
  });
  it("chooses dark text on a light fill such as yellow", () => {
    const t = deriveBrandTokens({ primary: OMNI.yellow });
    expect(contrast(t["--brand"], t["--brand-foreground"])).toBeGreaterThanOrEqual(4.5);
  });
  it("warns when the primary is close to a status colour", () => {
    expect(brandWarnings({ primary: "#E10505" }).some((w) => w.includes("off track"))).toBe(true);
  });
  it("validates and normalises hex", () => {
    expect(isHex("#abcdef")).toBe(true);
    expect(isHex("abc")).toBe(false);
    expect(normalizeHex("abcdef")).toBe("#ABCDEF");
    expect(contrast(inkOn("#FFC02B"), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
  it("ignores invalid input and falls back to Omni", () => {
    expect(deriveBrandTokens({ primary: "javascript:alert(1)" })["--brand"]).toBe(OMNI.orange);
  });
});

describe("Monday KPI scorecard", () => {
  const metric = (id: string, over: Partial<ScorecardMetric> = {}): ScorecardMetric => ({
    id, name: `KPI ${id}`, unit: "number", decimals: 0, direction: "higher_is_better", frequency: "monthly",
    target_value: 100, target_min: null, target_max: null, tolerance_pct: 10, in_weekly_scorecard: true, sort_order: Number(id.slice(1)), ...over,
  });
  const now = d("2026-10-19");
  const v = (m: ScorecardMetric, value: number | null, period = "2026-09-01") => buildMetricView(m, value === null ? [] : [{ period_start: period, value, target: null }], now);
  const views = [v(metric("m1"), 120), v(metric("m2"), 95), v(metric("m3"), 50), v(metric("m4"), 40), v(metric("m5"), null), v(metric("m6", { in_weekly_scorecard: false }), 10)];
  const actions = [
    { id: "a1", title: "Recover m3", owner_id: "p1", due_date: "2026-11-01", status: "open", metric_id: "m3" },
    { id: "a2", title: "Unrelated", owner_id: "p1", due_date: "2026-11-01", status: "open", metric_id: null },
    { id: "a3", title: "Fix m2", owner_id: "p1", due_date: "2026-11-01", status: "open", metric_id: "m2" },
  ];
  const rows = buildWeeklyScorecard(views, actions, () => "Alex", "GBP");

  it("includes only scorecard KPIs, in order", () => {
    expect(rows.map((r) => r.metricId)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });
  it("shows corrective actions only against off-track KPIs", () => {
    expect(rows[1].status).toBe("at_risk");
    expect(rows[1].actions).toEqual([]);
    expect(rows[2].status).toBe("off_track");
    expect(rows[2].actions.map((a) => a.title)).toEqual(["Recover m3"]);
    expect(rows[2].actions[0].owner).toBe("Alex");
  });
  it("flags off-track KPIs without an agreed action", () => {
    expect(rows[3].actionRequired).toBe(true);
    expect(rows[2].actionRequired).toBe(false);
  });
  it("never shows a missing result as on track", () => {
    expect(rows[4].status).toBe("not_reported");
    expect(rows[4].actual).toBe("—");
  });
  it("renders an email with the five columns and no commentary", () => {
    const html = scorecardEmailHtml({ company: "Acme <b>", weekStart: "2026-10-19", rows });
    for (const h of ["KPI", "Actual", "Target", "Status", "Agreed corrective action"]) expect(html).toContain(h);
    expect(html).toContain("Action required — no corrective action agreed.");
    expect(html).toContain("Acme &lt;b&gt;");
    expect(html).not.toMatch(/commentary|summary/i);
  });
  it("finds the Monday of the week", () => {
    expect(weekStartOf(d("2026-10-23"))).toBe("2026-10-19");
    expect(weekStartOf(d("2026-10-19"))).toBe("2026-10-19");
    expect(weekStartOf(d("2026-10-25"))).toBe("2026-10-19");
  });
});

describe("reporting deadlines", () => {
  it("flash is due five working days after month end", () => {
    expect(flashDeadline(d("2026-09-01")).toISOString().slice(0, 10)).toBe("2026-10-07");
    expect(reportDue("flash", "2026-09-01", [])).toBe("2026-10-07");
  });
  it("Board papers are due three working days before the Board", () => {
    expect(reportDue("monthly_board", "2026-09-01", [{ type: "board_monthly", scheduled_at: "2026-10-14T13:00:00Z" }])).toBe("2026-10-09");
    expect(workingDaysBefore(d("2026-10-12"), 3).toISOString().slice(0, 10)).toBe("2026-10-07");
  });
  it("falls back to the 21-day accounts deadline without a Board date", () => {
    expect(reportDue("monthly_board", "2026-09-01", [])).toBe("2026-10-21");
  });
  it("uses fiscal quarters", () => {
    expect(fiscalQuarterStart(d("2026-10-23"), 1).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(fiscalQuarterStart(d("2026-10-23"), 4).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(fiscalQuarterStart(d("2026-09-15"), 4).toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(fiscalQuarterStart(d("2026-09-15"), 2).toISOString().slice(0, 10)).toBe("2026-08-01");
  });
  it("marks overdue, late and on-time reports", () => {
    const items = reportingSchedule({
      today: d("2026-10-23"),
      fyStartMonth: 1,
      boardMeetings: [],
      reports: [
        { kind: "flash", period_start: "2026-09-01", status: "published", published_at: "2026-10-06T09:00:00Z" },
        { kind: "flash", period_start: "2026-08-01", status: "published", published_at: "2026-09-20T09:00:00Z" },
      ],
    });
    const get = (k: string, p: string) => items.find((i) => i.kind === k && i.periodStart === p)!;
    expect(get("flash", "2026-09-01").state).toBe("published");
    expect(get("flash", "2026-08-01").state).toBe("published_late");
    expect(get("monthly_board", "2026-08-01").state).toBe("overdue");
    expect(get("monthly_board", "2026-09-01").state).toBe("overdue"); // fallback due 21 Oct
    expect(get("quarterly_board", "2026-07-01").state).toBe("overdue");
    expect(reportingCompliance(items)).toMatchObject({ onTime: 1, late: 1 });
  });
  it("owes nothing before completion", () => {
    const items = reportingSchedule({ today: d("2026-10-23"), fyStartMonth: 1, boardMeetings: [], reports: [], since: "2026-09-15" });
    expect(items.every((i) => i.periodStart >= "2026-09-01")).toBe(true);
  });
});

describe("attention this week", () => {
  it("separates exceptions from routine", () => {
    const res = attentionThisWeek({
      today: "2026-10-23",
      scorecard: [
        { metricId: "m1", kpi: "Revenue", actual: "1", target: "2", period: "", status: "off_track", actions: [], actionRequired: true },
        { metricId: "m2", kpi: "NPS", actual: "50", target: "40", period: "", status: "on_track", actions: [], actionRequired: false },
        { metricId: "m3", kpi: "Churn", actual: "—", target: "", period: "Sep", status: "not_reported", actions: [], actionRequired: false },
      ],
      priorities: [
        { id: "p1", title: "Ship", status: "on_track", owner_id: "o", due_date: null },
        { id: "p2", title: "Hire", status: "at_risk", owner_id: "o", due_date: null },
      ],
      openIssues: [{ id: "i1", title: "Minor", priority: "low", owner_id: "o", escalated_to_omni: false }],
      overdueActions: [{ id: "a1", title: "Late", owner_id: "o", due_date: "2026-10-20" }],
      orgActions: [],
      reporting: [],
      scorecardApproved: true,
      onboarding: [],
    });
    expect(res.items.map((i) => i.kind)).toEqual(["kpi", "action", "kpi", "priority"]);
    expect(res.items[0].detail).toContain("action required");
    expect(res.routine).toMatchObject({ kpisOnTrack: 1, kpisTotal: 3, prioritiesOnTrack: 1, issuesRoutine: 1 });
  });
});

describe("logo validation", () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  it("reads PNG dimensions from the bytes", () => {
    expect(sniffLogo(png(960, 298))).toEqual({ mime: "image/png", width: 960, height: 298 });
  });
  it("rejects SVG, empty, tiny and oversized files", () => {
    expect("error" in validateLogo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBe(true);
    expect("error" in validateLogo(new Uint8Array())).toBe(true);
    expect("error" in validateLogo(png(10, 10))).toBe(true);
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(png(400, 200));
    expect("error" in validateLogo(big)).toBe(true);
    expect("info" in validateLogo(png(400, 200))).toBe(true);
  });
});

describe("operating system templates", () => {
  it("builds the 100-day plan from completion, with Mission Control from week 1", () => {
    const plan = onboardingPlan(d("2026-09-15"));
    expect(plan.length).toBe(12);
    expect(plan.find((m) => m.title === "Mission Control set-up")?.start_week).toBe(1);
    expect(plan.at(-1)?.due_date).toBe("2026-12-22");
  });
  it("rolls recurring requirements forward", () => {
    expect(nextDueAfter("2026-10-23", 1)).toBe("2026-11-23");
    expect(nextDueAfter("2026-10-23", null)).toBeNull();
  });
});
