import Link from "next/link";
import { Diamond } from "lucide-react";
import type { AnnualGoal, CrewMember, Milestone, QuarterlyPriority, WinningMove } from "@/lib/data/types";
import { formatDate } from "@/lib/domain/format";
import { Avatar } from "@/components/os/avatar";
import { cn } from "@/lib/utils";

const BAR: Record<string, string> = {
  on_track: "bg-on/80",
  at_risk: "bg-risk/85",
  off_track: "bg-off/80",
  missed: "bg-off/50",
  done: "bg-done/70",
  not_started: "bg-muted-foreground/30",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Annual roadmap: Three-Year Outcomes as swimlanes; goals and priorities as bars; milestones as diamonds. */
export function Roadmap({ slug, year, moves, goals, priorities, milestones, crew }: { slug: string; year: number; moves: WinningMove[]; goals: AnnualGoal[]; priorities: QuarterlyPriority[]; milestones: Milestone[]; crew: CrewMember[] }) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const pos = (d: string | null, fallback: number) => {
    const t = d ? new Date(`${d}T00:00:00Z`).getTime() : fallback;
    return Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100));
  };
  const today = pos(new Date().toISOString().slice(0, 10), start);
  const crewById = new Map(crew.map((c) => [c.id, c]));

  const Bar = ({ href, title, s, e, status, owner, thin }: { href: string; title: string; s: string | null; e: string | null; status: string; owner?: string; thin?: boolean }) => {
    const l = pos(s, start);
    const r = pos(e, end);
    const person = owner ? crewById.get(owner) : undefined;
    return (
      <div className="relative h-7">
        <Link
          href={href}
          title={`${title} · ${formatDate(s)} → ${formatDate(e)}`}
          className={cn("absolute top-0.5 flex items-center gap-1.5 overflow-hidden rounded px-1.5 text-[11.5px] font-medium whitespace-nowrap text-white shadow-xs transition-[filter] hover:brightness-110", thin ? "h-5" : "h-6", BAR[status] ?? BAR.not_started)}
          style={{ left: `${l}%`, width: `max(${Math.max(r - l, 1.5)}%, 24px)` }}
        >
          {person && <Avatar name={person.full_name} color={person.avatar_color} size="xs" className="ring-1 ring-white/50" />}
          <span className="truncate">{title}</span>
        </Link>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[220px_1fr] border-b text-[11px] text-muted-foreground">
          <div className="px-3 py-2 font-medium">FY{year}</div>
          <div className="relative grid grid-cols-12">
            {MONTHS.map((m, i) => (
              <div key={m} className={cn("border-l px-1.5 py-2", i % 3 === 0 && "font-medium text-foreground")}>
                {i % 3 === 0 ? `Q${i / 3 + 1} · ` : ""}
                {m}
              </div>
            ))}
          </div>
        </div>
        {moves.map((w) => {
          const gs = goals.filter((g) => g.winning_move_id === w.id);
          const ms = milestones.filter((m) => m.winning_move_id === w.id);
          return (
            <div key={w.id} className="grid grid-cols-[220px_1fr] border-b last:border-0">
              <div className="border-r px-3 py-2.5">
                <Link href={`/c/${slug}/flight-plan/winning_move/${w.id}`} className="text-[13px] leading-snug font-semibold hover:underline">
                  {w.title}
                </Link>
              </div>
              <div className="relative space-y-0.5 px-0 py-2">
                <div className="pointer-events-none absolute inset-0 grid grid-cols-12">
                  {MONTHS.map((m) => (
                    <div key={m} className="border-l border-dashed border-border/60" />
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-brand" style={{ left: `${today}%` }} />
                {ms.length > 0 && (
                  <div className="relative h-5">
                    {ms.map((m) => (
                      <span key={m.id} className="absolute -translate-x-1/2" style={{ left: `${pos(m.target_date, start)}%` }} title={`${m.title} · ${formatDate(m.target_date)}`}>
                        <Diamond className={cn("size-3.5", m.status === "done" ? "fill-done text-done-ink" : m.status === "at_risk" ? "fill-risk text-risk-ink" : "fill-card text-foreground")} />
                      </span>
                    ))}
                  </div>
                )}
                {gs.map((g) => (
                  <div key={g.id} className="relative">
                    <Bar href={`/c/${slug}/flight-plan/annual_goal/${g.id}`} title={g.title} s={g.start_date} e={g.due_date} status={g.status} owner={g.owner_id} />
                    {priorities
                      .filter((p) => p.annual_goal_id === g.id)
                      .map((p) => (
                        <Bar key={p.id} href={`/c/${slug}/flight-plan/quarterly_priority/${p.id}`} title={p.title} s={p.start_date} e={p.due_date} status={p.status} owner={p.owner_id} thin />
                      ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-on/80" /> On track</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-risk/85" /> At risk</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-off/80" /> Off track / missed</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-done/70" /> Done</span>
        <span className="flex items-center gap-1"><Diamond className="size-3" /> Milestone</span>
        <span className="flex items-center gap-1"><span className="h-3 w-px bg-brand" /> Today</span>
        <span>Thick bars: 12-month objectives · thin bars: 90-day priorities</span>
      </div>
    </div>
  );
}
