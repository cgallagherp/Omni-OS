// Recomputes the current exception list for a company, with the caller's permissions.
import { getSource, type Db } from "./source";
import { loadRevenueBase } from "./revenue-service";
import { loadCostBase } from "./cost-service";
import { costExceptions, revenueExceptions, type FinancialException } from "./exceptions";

export async function currentExceptions(db: Db, companyId: string, slug: string): Promise<FinancialException[]> {
  const src = await getSource(db, companyId);
  if (!src) return [];
  const [{ data: co }, domains] = await Promise.all([db.from("companies").select("fiscal_year_start_month").eq("id", companyId).single(), src.domains()]);
  const fy = co?.fiscal_year_start_month ?? 1;
  const out: FinancialException[] = [];
  if (domains.includes("revenue")) {
    const rb = await loadRevenueBase(src, fy);
    out.push(...(await revenueExceptions(rb, rb.coverage.end, `/c/${slug}`)));
  }
  if (domains.includes("cost")) {
    const cb = await loadCostBase(src, fy);
    out.push(...(await costExceptions(cb, cb.coverage.end, `/c/${slug}`)));
  }
  return out;
}

export async function findException(db: Db, companyId: string, slug: string, key: string) {
  return (await currentExceptions(db, companyId, slug)).find((e) => e.key === key) ?? null;
}
