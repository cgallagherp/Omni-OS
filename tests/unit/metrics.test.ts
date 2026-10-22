import { describe, expect, it } from "vitest";
import { evaluateMetric, isDeteriorating, lastCompletedPeriod, periodRange, periodStart, trendOf, varianceToTarget, ytd } from "@/lib/domain/metrics";
import { buildMetricView, isException } from "@/lib/domain/metric-view";

describe("evaluateMetric", () => {
  const higher = { direction: "higher_is_better" as const, target: 100, tolerancePct: 10 };
  const lower = { direction: "lower_is_better" as const, target: 4, tolerancePct: 25 };
  const range = { direction: "range" as const, target: null, targetMin: 78, targetMax: 88, tolerancePct: 20 };

  it("higher is better", () => {
    expect(evaluateMetric(105, higher)).toBe("on_track");
    expect(evaluateMetric(100, higher)).toBe("on_track");
    expect(evaluateMetric(91, higher)).toBe("at_risk");
    expect(evaluateMetric(89, higher)).toBe("off_track");
  });
  it("lower is better", () => {
    expect(evaluateMetric(3.5, lower)).toBe("on_track");
    expect(evaluateMetric(4.8, lower)).toBe("at_risk");
    expect(evaluateMetric(5.5, lower)).toBe("off_track");
  });
  it("within a range", () => {
    expect(evaluateMetric(80, range)).toBe("on_track");
    expect(evaluateMetric(76.5, range)).toBe("at_risk"); // band = 10 * 20% = 2
    expect(evaluateMetric(89.5, range)).toBe("at_risk");
    expect(evaluateMetric(75, range)).toBe("off_track");
    expect(evaluateMetric(91, range)).toBe("off_track");
  });
  it("handles missing data and negative targets", () => {
    expect(evaluateMetric(null, higher)).toBe("no_data");
    expect(evaluateMetric(5, { ...higher, target: null })).toBe("no_data");
    expect(evaluateMetric(-90, { direction: "higher_is_better", target: -100, tolerancePct: 10 })).toBe("on_track");
    expect(evaluateMetric(-105, { direction: "higher_is_better", target: -100, tolerancePct: 10 })).toBe("at_risk");
  });
  it("variance is signed so positive is better", () => {
    expect(varianceToTarget(110, higher)).toBe(10);
    expect(varianceToTarget(5, lower)).toBe(-1);
    expect(varianceToTarget(90, range)).toBe(-2);
  });
});

describe("trends", () => {
  it("is direction aware", () => {
    expect(trendOf([1, 2, 3], "higher_is_better")).toBe("improving");
    expect(trendOf([3, 2, 1], "higher_is_better")).toBe("declining");
    expect(trendOf([3, 2, 1], "lower_is_better")).toBe("improving");
    expect(trendOf([5], "higher_is_better")).toBe("unknown");
  });
  it("detects deterioration in status", () => {
    expect(isDeteriorating(["on_track", "at_risk"])).toBe(true);
    expect(isDeteriorating(["at_risk", "on_track"])).toBe(false);
  });
});

describe("periods", () => {
  it("weekly periods start on Monday, monthly on the 1st", () => {
    expect(periodStart("2026-10-22", "weekly")).toBe("2026-10-19");
    expect(periodStart("2026-10-19", "weekly")).toBe("2026-10-19");
    expect(periodStart("2026-10-25", "weekly")).toBe("2026-10-19");
    expect(periodStart("2026-10-22", "monthly")).toBe("2026-10-01");
  });
  it("last completed period", () => {
    const now = new Date(Date.UTC(2026, 9, 22));
    expect(lastCompletedPeriod(now, "weekly")).toBe("2026-10-12");
    expect(lastCompletedPeriod(now, "monthly")).toBe("2026-09-01");
  });
  it("ranges across year boundaries", () => {
    expect(periodRange("2026-02-01", "monthly", 3)).toEqual(["2025-12-01", "2026-01-01", "2026-02-01"]);
  });
  it("year-to-date uses per-period budget targets", () => {
    const r = ytd(
      [
        { period_start: "2025-12-01", value: 999, target: 999 },
        { period_start: "2026-01-01", value: 90, target: 100 },
        { period_start: "2026-02-01", value: 110, target: null },
        { period_start: "2026-03-01", value: null, target: 100 },
      ],
      "2026-01-01",
      100,
    );
    expect(r).toMatchObject({ actual: 200, plan: 200, periods: 2, variancePct: 0 });
  });
});

describe("metric views and exceptions", () => {
  const metric = { id: "m", direction: "higher_is_better" as const, frequency: "weekly" as const, target_value: 3, target_min: null, target_max: null, tolerance_pct: 15 };
  const now = new Date(Date.UTC(2026, 9, 22));
  it("flags an off-track latest observation as an exception", () => {
    const v = buildMetricView(metric, [
      { period_start: "2026-09-28", value: 2.8, target: null },
      { period_start: "2026-10-05", value: 2.6, target: null },
      { period_start: "2026-10-12", value: 2.3, target: null },
    ], now);
    expect(v.status).toBe("off_track");
    expect(v.deteriorating).toBe(true);
    expect(v.trend).toBe("declining");
    expect(isException(v)).toBe(true);
  });
  it("flags a missing report for the last completed period", () => {
    const v = buildMetricView(metric, [{ period_start: "2026-10-05", value: 3.2, target: null }], now);
    expect(v.status).toBe("on_track");
    expect(v.missingLatest).toBe(true);
    expect(isException(v)).toBe(true);
  });
  it("a healthy, reported metric is not an exception", () => {
    const v = buildMetricView(metric, [
      { period_start: "2026-10-05", value: 3.1, target: null },
      { period_start: "2026-10-12", value: 3.3, target: null },
    ], now);
    expect(isException(v)).toBe(false);
  });
});
