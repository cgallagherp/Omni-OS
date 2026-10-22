// Execution health: a transparent composite used to rank portfolio companies.
// Each component is 0..1; the weights are shown in the UI so the score is explainable.

export interface HealthInput {
  revenueVariance: number | null; // (actual - plan) / plan, YTD
  ebitdaVariance: number | null;
  priorities: { onTrack: number; atRisk: number; offTrack: number; done: number; total: number };
  kpis: { onTrack: number; atRisk: number; offTrack: number; withData: number };
  weeklyMeetingsLast4Weeks: number;
  openActions: number;
  overdueActions: number;
  criticalIssues: number;
}

export const HEALTH_WEIGHTS = {
  financial: 0.3,
  priorities: 0.25,
  kpis: 0.2,
  cadence: 0.1,
  actions: 0.1,
  issues: 0.05,
} as const;

export type HealthBand = "executing" | "watch" | "intervene";

const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** 0% or better variance = 1; -10% or worse = 0. */
const varianceScore = (v: number | null) => (v === null ? null : clamp(1 + v / 0.1));

export function executionHealth(h: HealthInput) {
  const fin = [varianceScore(h.revenueVariance), varianceScore(h.ebitdaVariance)].filter((v): v is number => v !== null);
  const components = {
    financial: fin.length ? fin.reduce((a, b) => a + b, 0) / fin.length : 0.5,
    priorities: h.priorities.total ? (h.priorities.onTrack + h.priorities.done + 0.5 * h.priorities.atRisk) / h.priorities.total : 0.5,
    kpis: h.kpis.withData ? (h.kpis.onTrack + 0.5 * h.kpis.atRisk) / h.kpis.withData : 0.5,
    cadence: clamp(h.weeklyMeetingsLast4Weeks / 4),
    actions: h.openActions ? 1 - h.overdueActions / h.openActions : 1,
    issues: clamp(1 - h.criticalIssues / 3),
  };
  const score = Math.round(
    100 * (Object.keys(HEALTH_WEIGHTS) as Array<keyof typeof HEALTH_WEIGHTS>).reduce((s, k) => s + HEALTH_WEIGHTS[k] * components[k], 0),
  );
  const band: HealthBand = score >= 75 ? "executing" : score >= 60 ? "watch" : "intervene";
  return { score, band, components };
}

export const BAND_META: Record<HealthBand, { label: string; tone: "on" | "risk" | "off" }> = {
  executing: { label: "Executing well", tone: "on" },
  watch: { label: "Watch", tone: "risk" },
  intervene: { label: "Requires intervention", tone: "off" },
};
