"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "General & access" },
    { href: `${base}/branding`, label: "Appearance & Branding" },
  ];
  return (
    <nav className="mb-5 flex gap-1 border-b" aria-label="Settings sections">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
              active ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
