"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Module tabs that keep the period and filters when moving between analyses. */
export function ModuleTabs({ base, tabs, label }: { base: string; tabs: Array<{ href: string; label: string }>; label: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const [k, v] of sp) if (k === "g" || k === "end" || k === "cmp" || k.startsWith("f_")) keep.set(k, v);
  const qs = keep.size ? `?${keep}` : "";
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b" aria-label={label}>
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link key={t.href} href={`${href}${qs}`} aria-current={active ? "page" : undefined} className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium", active ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
