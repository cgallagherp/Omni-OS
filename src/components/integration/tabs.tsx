"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function IntegrationTabs({ base, proposals }: { base: string; proposals: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Integrations", active: pathname === base || /\/integrations\/(?!playbooks|knowledge|new)[^/]+/.test(pathname) },
    { href: `${base}/playbooks`, label: "Playbooks", badge: proposals, active: pathname.startsWith(`${base}/playbooks`) },
    { href: `${base}/knowledge`, label: "Knowledge", active: pathname.startsWith(`${base}/knowledge`) },
  ];
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b" aria-label="Integrations">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium", t.active ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
          {t.badge ? <span className="rounded-full bg-risk px-1.5 text-[10.5px] font-semibold text-foreground tabular" title="Playbook improvements awaiting a decision">{t.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
