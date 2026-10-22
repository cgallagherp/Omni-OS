import { describe, expect, it } from "vitest";
import { buildAgenda } from "@/lib/domain/agenda";
import { buildMetricView } from "@/lib/domain/metric-view";
import { executionHealth } from "@/lib/domain/health";

const now = new Date(Date.UTC(2026, 9, 22));
const base = { name: "", unit: "ratio", decimals: 1, frequency: "weekly" as const, target_min: null, target_max: null, tolerance_pct: 15, owner_id: "o", is_key: true };
const pipeline = buildMetricView({ ...base, id: "pipe", name: "Pipeline coverage", direction: "higher_is_better" as const, target_value: 3 }, [
  { period_start: "2026-10-05", value: 2.9, target: null },
  { period_start: "2026-10-12", value: 2.3, target: null },
], now);
const healthy = buildMetricView({ ...base, id: "ok", name: "SQLs", direction: "higher_is_better" as const, target_value: 10 }, [
  { period_start: "2026-10-05", value: 12, target: null },
  { period_start: "2026-10-12", value: 13, target: null },
], now);

describe("weekly agenda", () => {
  const agenda = buildAgenda({
    meetingType: "weekly",
    metrics: [healthy, pipeline],
    priorities: [
      { id: "p1", title: "On track", status: "on_track", progress: 50, owner_id: "o", due_date: null },
      { id: "p2", title: "Off track", status: "off_track", progress: 10, owner_id: "o", due_date: null },
    ],
    openActions: [
      { id: "a1", title: "Later", owner_id: "o", due_date: "2026-11-01", meeting_id: null },
      { id: "a2", title: "Overdue from last meeting", owner_id: "o", due_date: "2026-10-01", meeting_id: "m0" },
    ],
    openIssues: [
      { id: "i1", title: "Medium", priority: "medium", owner_id: "o", status: "open", metric_id: null },
      { id: "i2", title: "Pipeline", priority: "critical", owner_id: "o", status: "open", metric_id: "pipe" },
    ],
    previouslyDiscussed: new Set(["i1"]),
    today: "2026-10-22",
  });
  const section = (s: string) => agenda.filter((i) => i.section === s);

  it("includes only KPI exceptions for weekly meetings", () => {
    expect(section("kpi_exceptions").map((i) => i.entity_id)).toEqual(["pipe"]);
    expect(section("kpi_exceptions")[0].snapshot).toMatchObject({ value: 2.3, status: "off_track", reason: "Off track" });
  });
  it("orders priorities off-track first", () => {
    expect(section("priorities").map((i) => i.entity_id)).toEqual(["p2", "p1"]);
  });
  it("brings outstanding actions forward, overdue first, flagged as carried over", () => {
    const actions = section("previous_actions");
    expect(actions.map((i) => i.entity_id)).toEqual(["a2", "a1"]);
    expect(actions[0]).toMatchObject({ carried_over: true, snapshot: { overdue: true } });
  });
  it("orders issues by priority and flags links to KPI exceptions and carry-over", () => {
    const issues = section("issues");
    expect(issues.map((i) => i.entity_id)).toEqual(["i2", "i1"]);
    expect(issues[0].snapshot).toMatchObject({ linked_exception: true });
    expect(issues[1].carried_over).toBe(true);
  });
  it("monthly reviews include every KPI", () => {
    const monthly = buildAgenda({ meetingType: "monthly", metrics: [healthy, pipeline], priorities: [], openActions: [], openIssues: [], previouslyDiscussed: new Set(), today: "2026-10-22" });
    expect(monthly.filter((i) => i.section === "kpi_exceptions").map((i) => i.entity_id)).toEqual(["pipe", "ok"]);
  });
});

describe("execution health", () => {
  const good = { revenueVariance: 0.02, ebitdaVariance: 0.01, priorities: { onTrack: 5, atRisk: 0, offTrack: 0, done: 1, total: 6 }, kpis: { onTrack: 10, atRisk: 1, offTrack: 0, withData: 11 }, weeklyMeetingsLast4Weeks: 4, openActions: 10, overdueActions: 0, criticalIssues: 0 };
  it("scores a well-run company as executing", () => {
    expect(executionHealth(good).band).toBe("executing");
  });
  it("flags missed financials, off-track priorities and lapsed cadence for intervention", () => {
    const r = executionHealth({ ...good, revenueVariance: -0.08, ebitdaVariance: -0.2, priorities: { onTrack: 1, atRisk: 2, offTrack: 3, done: 0, total: 6 }, kpis: { onTrack: 3, atRisk: 2, offTrack: 6, withData: 11 }, weeklyMeetingsLast4Weeks: 2, overdueActions: 6, criticalIssues: 2 });
    expect(r.band).toBe("intervene");
    expect(r.components.financial).toBeCloseTo(0.1);
  });
});
