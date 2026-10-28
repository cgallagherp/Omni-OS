// Agent registry: what each agent is for, what it may use and how it is triggered.
// The four agents are configurations of one platform (runtime, tools, authority, ledger).

export type AgentKey = "ceo" | "commercial" | "ma" | "execution";
export const AGENT_KEYS: AgentKey[] = ["execution", "ceo", "commercial", "ma"];

export type Mode = "off" | "approval" | "auto";

/** Action categories, the authority level they represent and the most autonomy they may ever have. */
export const CATEGORIES = {
  record_findings: { level: 2, label: "Record findings", description: "Update its own investigation records and research notes.", cap: "auto", defaultMode: "auto" },
  internal_followup: { level: 4, label: "Internal follow-ups", description: "Ask an action owner for a progress update through an internal channel.", cap: "auto", defaultMode: "approval" },
  internal_task: { level: 4, label: "Internal tasks", description: "Create internal follow-up tasks in Mission Control or the CRM.", cap: "auto", defaultMode: "approval" },
  escalation: { level: 4, label: "Escalations", description: "Escalate an unresolved blocker to the owner's manager or the CEO.", cap: "auto", defaultMode: "approval" },
  crm_enrich: { level: 4, label: "CRM enrichment", description: "Add research to approved CRM records.", cap: "auto", defaultMode: "approval" },
  pipeline_update: { level: 4, label: "Acquisition pipeline", description: "Add researched targets to, and update, the acquisition pipeline.", cap: "auto", defaultMode: "approval" },
  propose_issue: { level: 5, label: "New issues", description: "Raise an issue in Mission Control.", cap: "approval", defaultMode: "approval" },
  commitment_change: { level: 5, label: "Changes to commitments", description: "Change an agreed action's status, due date or owner.", cap: "approval", defaultMode: "approval" },
  material_crm_change: { level: 5, label: "Material CRM changes", description: "Change opportunity values, stages or ownership.", cap: "approval", defaultMode: "approval" },
  external_communication: { level: 5, label: "External communication", description: "Customer outreach, campaigns and acquisition approaches.", cap: "approval", defaultMode: "approval" },
  commercial_terms: { level: 5, label: "Commercial terms", description: "Prices, discounts, offers and contractual terms.", cap: "off", defaultMode: "off" },
} as const satisfies Record<string, { level: number; label: string; description: string; cap: Mode; defaultMode: Mode }>;
export type Category = keyof typeof CATEGORIES;

export const APPROVER_LABEL = { ceo: "CEO", company_admin: "Company administrator", leadership: "Any member of the leadership team", omni: "Omni" } as const;
export type ApproverRole = keyof typeof APPROVER_LABEL;

export const AUTHORITY_LEVELS = [
  { level: 1, name: "Observe", description: "Read authorised information and identify issues." },
  { level: 2, name: "Investigate", description: "Research problems, query connected systems and record evidence-backed findings." },
  { level: 3, name: "Prepare", description: "Draft internal actions, CRM updates, outreach or interventions for approval." },
  { level: 4, name: "Execute within guardrails", description: "Perform predefined low-risk actions without individual approval, where management enables it." },
  { level: 5, name: "Approval-gated execution", description: "Consequential actions run only after a specific approval, re-checked before execution." },
] as const;

export interface ScheduleDef {
  key: string;
  label: string;
  kind: "event" | "daily" | "weekly";
}

export interface AgentDef {
  key: AgentKey;
  name: string;
  short: string;
  remit: string;
  /** Pillars it reads */
  context: string[];
  tools: string[];
  categories: Category[];
  schedules: ScheduleDef[];
  /** Agents it may commission work from (never its own permissions) */
  delegatesTo: AgentKey[];
  outcomes: string[];
}

export const AGENTS: Record<AgentKey, AgentDef> = {
  execution: {
    key: "execution",
    name: "Execution Agent",
    short: "Priorities, dependencies and accountability",
    remit: "Makes sure management commitments are followed through: detects overdue and blocked actions, follows up with owners, records responses, proposes changes for approval, escalates unresolved blockers and keeps monitoring until each item is resolved.",
    context: ["Flight Plan", "Crew", "Mission Control"],
    tools: ["mission_control.read_action", "mission_control.read_dependencies", "inbox.send_message", "mission_control.apply_approval", "mission_control.mark_executed", "mission_control.create_action"],
    categories: ["record_findings", "internal_followup", "escalation", "internal_task", "commitment_change", "propose_issue"],
    schedules: [
      { key: "overdue_actions", label: "Detect overdue actions (on change and hourly)", kind: "event" },
      { key: "daily_review", label: "Daily review of open follow-ups", kind: "daily" },
    ],
    delegatesTo: [],
    outcomes: ["Commitments followed up", "Responses received", "Overdue actions resolved", "Blockers escalated"],
  },
  ceo: {
    key: "ceo",
    name: "CEO Agent",
    short: "Strategic performance and orchestration",
    remit: "Assesses whether the business is progressing towards its North Star and delivering its Flight Plan. Investigates KPI exceptions against the strategy, separates confirmed findings from hypotheses and missing evidence, commissions specialist agents, proposes interventions and monitors whether they work.",
    context: ["North Star", "Flight Plan", "Crew", "Mission Control"],
    tools: ["context.kpi", "agents.delegate", "mission_control.apply_approval"],
    categories: ["record_findings", "propose_issue", "internal_task"],
    schedules: [
      { key: "kpi_exceptions", label: "Investigate off-track strategic KPIs (on change)", kind: "event" },
      { key: "weekly_review", label: "Weekly review of strategic KPIs and interventions", kind: "weekly" },
    ],
    delegatesTo: ["commercial", "execution", "ma"],
    outcomes: ["Material risks identified", "Investigations completed", "Interventions approved", "KPIs recovered"],
  },
  commercial: {
    key: "commercial",
    name: "Commercial Agent",
    short: "Revenue, pipeline and retention",
    remit: "Diagnoses pipeline, conversion and retention problems from the company's own CRM, identifies the opportunities and segments driving them, creates follow-up work through the CRM within its authority, and measures whether pipeline and conversion improve.",
    context: ["North Star", "Flight Plan", "Mission Control", "CRM"],
    tools: ["crm.list_opportunities", "crm.create_task", "crm.task_status", "context.kpi"],
    categories: ["record_findings", "internal_task", "crm_enrich", "material_crm_change", "external_communication", "commercial_terms"],
    schedules: [
      { key: "pipeline_review", label: "Weekly pipeline review", kind: "weekly" },
      { key: "delegated", label: "Investigations commissioned by the CEO Agent", kind: "event" },
    ],
    delegatesTo: ["execution"],
    outcomes: ["Opportunities needing attention found", "CRM follow-ups created", "Follow-ups completed", "Pipeline coverage change"],
  },
  ma: {
    key: "ma",
    name: "M&A Agent",
    short: "Acquisition strategy and execution",
    remit: "Advances the approved acquisition thesis: searches authorised sources, removes duplicates and rejected companies, scores strategic fit on transparent criteria, records evidence (unknown financials stay unknown), maintains the target pipeline and prepares approaches for management approval.",
    context: ["North Star", "Flight Plan", "Acquisition thesis", "Target pipeline"],
    tools: ["ma.read_thesis", "ma.search_sources", "ma.read_pipeline", "ma.add_target", "ma.set_stage", "mission_control.apply_approval"],
    categories: ["record_findings", "pipeline_update", "internal_task", "external_communication"],
    schedules: [{ key: "market_scan", label: "Weekly market scan against the thesis", kind: "weekly" }],
    delegatesTo: ["execution"],
    outcomes: ["Qualified targets identified", "Targets researched", "Approaches prepared", "Pipeline advanced"],
  },
};

export interface AgentConfig {
  agent_key: AgentKey;
  enabled: boolean;
  category_modes: Partial<Record<Category, Mode>>;
  approvers: Partial<Record<Category, ApproverRole>>;
  schedules: Record<string, { enabled: boolean }>;
  escalation: { reminder_after_days: number; max_reminders: number; escalate_after_days: number; escalate_to: "manager" | "ceo" };
  limits: { max_runs_per_day: number; max_actions_per_day: number; max_messages_per_day: number; monthly_ai_budget_gbp: number };
  notifications: Record<string, string>;
  allowed_connections: string[];
  instructions: string;
  allow_external_ai: boolean;
}

/** Effective mode for a category: never above its cap, 'off' when the agent is disabled. Mirrors app.agent_mode(). */
export function modeFor(config: Pick<AgentConfig, "enabled" | "category_modes"> | null, category: Category): Mode {
  const cat = CATEGORIES[category];
  if (!config?.enabled || cat.cap === "off") return "off";
  const m = config.category_modes[category] ?? "approval";
  if (cat.cap === "approval" && m === "auto") return "approval";
  return m;
}

export function approverFor(config: Pick<AgentConfig, "approvers"> | null, category: Category): ApproverRole {
  return config?.approvers[category] ?? "ceo";
}

/** Conservative defaults for a new company: observe and investigate; everything else needs approval. */
export function defaultConfig(agent: AgentKey): Omit<AgentConfig, "allowed_connections"> {
  return {
    agent_key: agent,
    enabled: false,
    category_modes: Object.fromEntries(AGENTS[agent].categories.map((c) => [c, CATEGORIES[c].defaultMode])),
    approvers: {},
    schedules: Object.fromEntries(AGENTS[agent].schedules.map((s) => [s.key, { enabled: true }])),
    escalation: { reminder_after_days: 2, max_reminders: 1, escalate_after_days: 5, escalate_to: "manager" },
    limits: { max_runs_per_day: 50, max_actions_per_day: 20, max_messages_per_day: 20, monthly_ai_budget_gbp: 0 },
    notifications: { approvals: "in_app", escalations: "in_app" },
    instructions: "",
    allow_external_ai: false,
  };
}

export const INVESTIGATION_STATUS_LABEL = {
  open: "Open",
  investigating: "Investigating",
  awaiting_approval: "Awaiting approval",
  awaiting_response: "Awaiting response",
  monitoring: "Monitoring",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
  failed: "Failed",
} as const;
export type InvestigationStatus = keyof typeof INVESTIGATION_STATUS_LABEL;
export const ACTIVE_STATUSES: InvestigationStatus[] = ["open", "investigating", "awaiting_approval", "awaiting_response", "monitoring", "escalated"];

export interface SourceRef {
  type: string;
  id: string;
  label: string;
  /** company-relative path */
  path?: string;
}

/** Findings are always classified: what the evidence confirms, what is a hypothesis, and what is missing. */
export interface Finding {
  kind: "confirmed" | "hypothesis" | "missing";
  text: string;
  sources?: SourceRef[];
  data?: Record<string, unknown>;
}
