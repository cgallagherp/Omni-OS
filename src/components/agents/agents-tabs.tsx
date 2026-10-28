"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AgentsTabs({ base, pending, admin }: { base: string; pending: number; admin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/approvals`, label: "Approvals", badge: pending },
    { href: `${base}/activity`, label: "Activity" },
    ...(admin ? [{ href: `${base}/settings`, label: "Configuration" }] : []),
  ];
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b" aria-label="Agents">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href || /\/agents\/(execution|ceo|commercial|ma|investigations)/.test(pathname) : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium", active ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
            {t.badge ? <span className="rounded-full bg-risk px-1.5 text-[10.5px] font-semibold text-foreground tabular">{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
