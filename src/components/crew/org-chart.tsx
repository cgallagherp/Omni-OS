import Link from "next/link";
import type { CrewMember } from "@/lib/data/types";
import { Avatar } from "@/components/os/avatar";
import { cn } from "@/lib/utils";

export interface Load {
  priorities: number;
  kpis: number;
  openActions: number;
  overdue: number;
  offTrack: number;
}

/** Accountability chart rendered as a top-down tree from reports_to. */
export function OrgChart({ crew, slug, load }: { crew: CrewMember[]; slug: string; load: Map<string, Load> }) {
  const children = new Map<string | null, CrewMember[]>();
  for (const c of crew) {
    const key = c.reports_to && crew.some((x) => x.id === c.reports_to) ? c.reports_to : null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const Node = ({ c }: { c: CrewMember }) => {
    const kids = children.get(c.id) ?? [];
    const l = load.get(c.id);
    return (
      <li className="org-li">
        <Link
          href={`/c/${slug}/crew/${c.id}`}
          className={cn(
            "w-44 rounded-lg border bg-card p-3 text-left shadow-xs transition-[border-color] hover:border-foreground/25",
            c.is_open_seat && "border-dashed bg-muted/40",
          )}
        >
          <div className="flex items-center gap-2">
            <Avatar name={c.full_name} color={c.avatar_color} size="md" open={c.is_open_seat} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{c.is_open_seat ? "Open seat" : c.full_name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{c.is_open_seat ? c.full_name : c.title}</p>
            </div>
          </div>
          {c.seat && <p className="mt-2 text-[11px] font-medium tracking-wide text-brand-ink uppercase">{c.seat}</p>}
          <ul className="mt-1 space-y-0.5 text-[11.5px] text-muted-foreground">
            {c.responsibilities.slice(0, 2).map((r) => (
              <li key={r} className="truncate">· {r}</li>
            ))}
          </ul>
          {l && !c.is_open_seat && (
            <p className="mt-2 border-t pt-1.5 text-[11px] text-muted-foreground">
              {plural(l.priorities, "priority", "priorities")} · {plural(l.kpis, "KPI")} · {plural(l.openActions, "action")}
              {l.overdue > 0 && <span className="text-off-ink"> · {l.overdue} overdue</span>}
            </p>
          )}
        </Link>
        {kids.length > 0 && (
          <ul className="org-ul">
            {kids.map((k) => (
              <Node key={k.id} c={k} />
            ))}
          </ul>
        )}
      </li>
    );
  };
  const roots = children.get(null) ?? [];
  return (
    <div className="org-tree overflow-x-auto pb-2">
      <ul className="org-ul mx-auto w-max">
        {roots.map((r) => (
          <Node key={r.id} c={r} />
        ))}
      </ul>
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
