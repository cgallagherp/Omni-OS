import type { WorkflowDef } from "../runtime";
import { ceoKpi } from "./ceo-kpi";
import { ceoIntegration } from "./ceo-integration";
import { ceoFinancial } from "./ceo-financial";
import { commercialRetention } from "./commercial-retention";
import { commercialPipeline } from "./commercial-pipeline";
import { executionOverdue } from "./execution-overdue";
import { integrationGeneratePlan, integrationGeneratePlaybook, integrationReview } from "./integration-generate";
import { integrationActivityWatch, integrationSynergy, integrationWeeklyStatus } from "./integration-monitor";
import { maSourcing } from "./ma-sourcing";

export const WORKFLOWS: Record<string, WorkflowDef> = Object.fromEntries(
  [
    executionOverdue, ceoKpi, ceoIntegration, ceoFinancial, commercialPipeline, commercialRetention, maSourcing,
    integrationGeneratePlaybook, integrationGeneratePlan, integrationReview, integrationActivityWatch, integrationSynergy, integrationWeeklyStatus,
  ].map((w) => [w.key, w]),
);
