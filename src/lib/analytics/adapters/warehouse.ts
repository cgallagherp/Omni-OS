// The Snowflake/dbt adapter. Not connected yet: Snowflake and dbt have not been
// implemented, so every call says so rather than returning anything. When the warehouse
// exists, each method runs the documented query against the governed marts through a
// server-side service account scoped to the company (see docs/intelligence-data-contracts.md)
// and validates rows against src/lib/analytics/contracts.ts before returning them.
import type { SourceInfo } from "../contracts";
import { SourceUnavailable } from "../errors";
import type { AnalyticsSource } from "../source";

const NOT_CONNECTED = "The governed data warehouse (Snowflake/dbt) is not connected for this company yet.";

export class WarehouseSource implements AnalyticsSource {
  constructor(readonly companyId: string, readonly info: SourceInfo, private readonly config: Record<string, unknown>) {}
  private fail(): never {
    throw new SourceUnavailable(NOT_CONNECTED);
  }
  domains = async () => this.fail();
  datasets = async () => this.fail();
  definitions = async () => this.fail();
  definitionHistory = async () => this.fail();
  dimensions = async () => this.fail();
  periodStatus = async () => this.fail();
  targets = async () => this.fail();
  products = async () => this.fail();
  arrAt = async () => this.fail();
  movements = async () => this.fail();
  retention = async () => this.fail();
  cohorts = async () => this.fail();
  customers = async () => this.fail();
  movementCustomers = async () => this.fail();
  customer = async () => this.fail();
  reconciliation = async () => this.fail();
  dataQuality = async () => this.fail();
  restatements = async () => this.fail();
  closes = async () => this.fail();
  ledger = async () => this.fail();
  accounts = async () => this.fail();
  costCentres = async () => this.fail();
  suppliers = async () => this.fail();
  people = async () => this.fail();
  transactions = async () => this.fail();
}
