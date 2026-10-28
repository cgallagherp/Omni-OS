import type { WorkflowDef } from "../runtime";
import { ceoKpi } from "./ceo-kpi";
import { commercialPipeline } from "./commercial-pipeline";
import { executionOverdue } from "./execution-overdue";
import { maSourcing } from "./ma-sourcing";

export const WORKFLOWS: Record<string, WorkflowDef> = Object.fromEntries([executionOverdue, ceoKpi, commercialPipeline, maSourcing].map((w) => [w.key, w]));
