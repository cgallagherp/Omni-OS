import type { MetricStatus } from "./metrics";

export type AnyStatus = MetricStatus | "done" | "missed" | "not_started";
export type Tone = "on" | "risk" | "off" | "done" | "none";

export const STATUS_META: Record<AnyStatus, { label: string; tone: Tone }> = {
  on_track: { label: "On track", tone: "on" },
  at_risk: { label: "At risk", tone: "risk" },
  off_track: { label: "Off track", tone: "off" },
  done: { label: "Done", tone: "done" },
  missed: { label: "Missed", tone: "off" },
  not_started: { label: "Not started", tone: "none" },
  no_data: { label: "No data", tone: "none" },
};

export const RAG_OPTIONS = [
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "off_track", label: "Off track" },
  { value: "done", label: "Done" },
  { value: "missed", label: "Missed" },
  { value: "not_started", label: "Not started" },
] as const;

export const PRIORITY_META = {
  critical: { label: "Critical", tone: "off" as Tone },
  high: { label: "High", tone: "risk" as Tone },
  medium: { label: "Medium", tone: "none" as Tone },
  low: { label: "Low", tone: "none" as Tone },
};

export const MEETING_TYPE_LABEL = {
  weekly: "Weekly leadership",
  monthly: "Monthly operating review",
  quarterly: "Quarterly reset",
  annual: "Annual planning",
} as const;

export const CATEGORY_LABEL = {
  financial: "Financial",
  commercial: "Commercial",
  operational: "Operational",
  customer: "Customer",
  people: "People",
} as const;
