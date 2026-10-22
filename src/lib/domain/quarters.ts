import { parseISODate } from "./metrics";

export function quarterLabel(q: { year: number; quarter: number }) {
  return `Q${q.quarter} ${q.year}`;
}

/** Week number within the quarter and the total number of weeks. */
export function quarterProgress(q: { start_date: string; end_date: string }, now = new Date()) {
  const start = parseISODate(q.start_date).getTime();
  const end = parseISODate(q.end_date).getTime() + 86400000;
  const total = Math.round((end - start) / (7 * 86400000));
  const week = Math.min(total, Math.max(1, Math.floor((now.getTime() - start) / (7 * 86400000)) + 1));
  const pct = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
  return { week, total, pct, daysLeft: Math.max(0, Math.ceil((end - now.getTime()) / 86400000)) };
}

export function nextQuarterOf(year: number, quarter: number) {
  return quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: quarter + 1 };
}

export function quarterDates(year: number, quarter: number) {
  const s = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const e = new Date(Date.UTC(year, quarter * 3, 0));
  return { start_date: s.toISOString().slice(0, 10), end_date: e.toISOString().slice(0, 10) };
}
