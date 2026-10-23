import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];

export type Company = Row<"companies">;
export type CrewMember = Row<"crew_members">;
export type NorthStar = Row<"north_stars">;
export type WinningMove = Row<"winning_moves">;
export type AnnualGoal = Row<"annual_goals">;
export type Quarter = Row<"quarters">;
export type QuarterlyPriority = Row<"quarterly_priorities">;
export type Metric = Row<"metrics">;
export type MetricValue = Row<"metric_values">;
export type MetricLink = Row<"metric_links">;
export type Issue = Row<"issues">;
export type Decision = Row<"decisions">;
export type Action = Row<"actions">;
export type Meeting = Row<"meetings">;
export type AgendaItem = Row<"meeting_agenda_items">;
export type Milestone = Row<"milestones">;
export type SuccessCondition = Row<"success_conditions">;
export type OrgAction = Row<"org_actions">;
export type PriorityMilestone = Row<"priority_milestones">;
export type WeeklyScorecard = Row<"weekly_scorecards">;
export type BoardReport = Row<"board_reports">;
export type ListeningRound = Row<"listening_rounds">;
export type OnboardingMilestone = Row<"onboarding_milestones">;
export type GovernanceItem = Row<"governance_items">;
export type CompanyBrandingRow = Row<"company_branding">;
export type Comment = Row<"comments">;
export type AuditEntry = Row<"audit_log">;

export type RagStatus = Database["public"]["Enums"]["rag_status"];
export type MeetingType = Database["public"]["Enums"]["meeting_type"];
export type IssuePriority = Database["public"]["Enums"]["issue_priority"];
export type EntityType = "winning_move" | "annual_goal" | "quarterly_priority" | "action" | "issue" | "decision" | "metric" | "meeting" | "north_star";
