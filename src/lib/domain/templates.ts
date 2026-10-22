// Standard Omni templates used when onboarding a new portfolio company.
// Comparable keys let the portfolio view compare like-for-like where it makes sense.

type Unit = "currency" | "percent" | "number" | "days" | "ratio" | "score";
type Category = "financial" | "commercial" | "operational" | "customer" | "people";

export interface TemplateMetric {
  name: string;
  category: Category;
  unit: Unit;
  frequency: "weekly" | "monthly";
  direction: "higher_is_better" | "lower_is_better" | "range";
  target: number | null;
  min?: number;
  max?: number;
  tolerance: number;
  aggregation?: "flow" | "stock";
  comparable?: string;
  isKey?: boolean;
  decimals?: number;
}

export interface CompanyTemplate {
  key: string;
  label: string;
  description: string;
  metrics: TemplateMetric[];
  winningMovePrompts: string[];
}

const CORE: TemplateMetric[] = [
  { name: "Revenue", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", target: null, tolerance: 5, aggregation: "flow", comparable: "revenue", isKey: true },
  { name: "EBITDA", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", target: null, tolerance: 8, aggregation: "flow", comparable: "ebitda", isKey: true },
  { name: "Gross margin", category: "financial", unit: "percent", frequency: "monthly", direction: "higher_is_better", target: null, tolerance: 3, comparable: "gross_margin", decimals: 1 },
  { name: "Cash conversion", category: "financial", unit: "percent", frequency: "monthly", direction: "higher_is_better", target: 85, tolerance: 8, comparable: "cash_conversion" },
  { name: "Customer NPS", category: "customer", unit: "score", frequency: "monthly", direction: "higher_is_better", target: 40, tolerance: 10, comparable: "nps" },
  { name: "Employee NPS", category: "people", unit: "score", frequency: "monthly", direction: "higher_is_better", target: 30, tolerance: 15, comparable: "enps" },
];

export const TEMPLATES: CompanyTemplate[] = [
  {
    key: "saas",
    label: "B2B software (SaaS)",
    description: "Recurring revenue, retention and go-to-market efficiency.",
    metrics: [
      ...CORE,
      { name: "Annual recurring revenue", category: "financial", unit: "currency", frequency: "monthly", direction: "higher_is_better", target: null, tolerance: 3, comparable: "arr", isKey: true },
      { name: "Net revenue retention", category: "customer", unit: "percent", frequency: "monthly", direction: "higher_is_better", target: 110, tolerance: 4, comparable: "nrr", isKey: true },
      { name: "Gross logo churn (monthly)", category: "customer", unit: "percent", frequency: "monthly", direction: "lower_is_better", target: 1, tolerance: 15, comparable: "logo_churn", decimals: 2 },
      { name: "Pipeline coverage", category: "commercial", unit: "ratio", frequency: "weekly", direction: "higher_is_better", target: 3, tolerance: 15, comparable: "pipeline_coverage", isKey: true, decimals: 1 },
      { name: "New ARR booked", category: "commercial", unit: "currency", frequency: "monthly", direction: "higher_is_better", target: null, tolerance: 15, aggregation: "flow", comparable: "new_arr" },
    ],
    winningMovePrompts: ["Accelerate organic ARR growth", "Improve net revenue retention", "Professionalise go-to-market"],
  },
  {
    key: "services",
    label: "Technology-enabled services",
    description: "Contracted revenue, delivery margin, utilisation and service quality.",
    metrics: [
      ...CORE,
      { name: "Contracted revenue share", category: "commercial", unit: "percent", frequency: "monthly", direction: "higher_is_better", target: 60, tolerance: 8, comparable: "recurring_revenue_pct", isKey: true },
      { name: "Utilisation", category: "operational", unit: "percent", frequency: "weekly", direction: "range", target: null, min: 78, max: 88, tolerance: 30, isKey: true },
      { name: "SLA compliance", category: "customer", unit: "percent", frequency: "weekly", direction: "higher_is_better", target: 95, tolerance: 3, isKey: true, decimals: 1 },
      { name: "Debtor days", category: "financial", unit: "days", frequency: "monthly", direction: "lower_is_better", target: 45, tolerance: 10, comparable: "debtor_days" },
      { name: "Staff attrition (annualised)", category: "people", unit: "percent", frequency: "monthly", direction: "lower_is_better", target: 18, tolerance: 12, comparable: "attrition" },
    ],
    winningMovePrompts: ["Improve gross margin", "Increase recurring contracted revenue", "Expand delivery capacity"],
  },
  {
    key: "blank",
    label: "Core financials only",
    description: "Revenue, EBITDA, margin, cash, customer and employee NPS. Add operational KPIs later.",
    metrics: CORE,
    winningMovePrompts: [],
  },
];

export const templateByKey = (k: string) => TEMPLATES.find((t) => t.key === k) ?? TEMPLATES[2];
