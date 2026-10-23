"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronsUpDown,
  Compass,
  Ear,
  FileText,
  Flag,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Map as MapIcon,
  Menu,
  RotateCcw,
  Settings,
  Sparkles,
  Target,
  Users,
  Scale,
} from "lucide-react";
import { deriveBrandTokens, tokensToStyle, type BrandTokens } from "@/lib/domain/brand";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { CompanyLogo, CompanyMark, OmniMark } from "./logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type ShellCompany = {
  slug: string;
  name: string;
  brandColor: string;
  role: string;
  isDemo: boolean;
  sector: string | null;
  branding: { primary: string | null; secondary: string | null; accent: string | null; logoUrl: string | null };
};
export interface ShellViewer {
  fullName: string;
  email: string;
  title: string | null;
  isOmniStaff: boolean;
  isPlatformAdmin: boolean;
  companies: ShellCompany[];
}

type NavItem = { href: string; label: string; icon: typeof Target; exact?: boolean };
const COMPANY_NAV: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ href: "", label: "Blueprint", icon: LayoutDashboard, exact: true }] },
  {
    label: "Pillars",
    items: [
      { href: "/north-star", label: "North Star", icon: Compass },
      { href: "/flight-plan", label: "Flight Plan", icon: MapIcon },
      { href: "/crew", label: "Crew", icon: Users },
      { href: "/mission-control", label: "Mission Control", icon: Gauge, exact: true },
    ],
  },
  {
    label: "Mission Control",
    items: [
      { href: "/weekly-scorecard", label: "Monday scorecard", icon: Mail },
      { href: "/scoreboard", label: "KPIs", icon: BarChart3 },
      { href: "/meetings", label: "Meetings & Rhythm", icon: CalendarClock },
      { href: "/execution", label: "Issues & Actions", icon: ListChecks },
      { href: "/reporting", label: "Reporting", icon: FileText },
    ],
  },
  {
    label: "Cycles",
    items: [
      { href: "/quarterly-reset", label: "Quarterly offsite", icon: RotateCcw },
      { href: "/listening", label: "Listening", icon: Ear },
      { href: "/calendar", label: "Calendar & governance", icon: CalendarDays },
      { href: "/onboarding", label: "First 100 days", icon: Flag },
    ],
  },
  { items: [{ href: "/assistant", label: "Assistant", icon: Sparkles }] },
];

const ADMIN_ROLES = ["omni", "ceo", "company_admin"];

function currentCompany(viewer: ShellViewer, pathname: string) {
  const slug = pathname.startsWith("/c/") ? pathname.split("/")[2] : undefined;
  return viewer.companies.find((c) => c.slug === slug);
}

/**
 * Brand tokens for the current view: the company's saved branding inside a
 * company workspace, Omni's identity everywhere else (portfolio, admin).
 */
function useBrandTokens(company: ShellCompany | undefined): BrandTokens {
  const b = company?.branding;
  return useMemo(() => deriveBrandTokens(b ?? {}), [b]);
}

function NavLink({ href, label, icon: Icon, active, onNavigate }: { href: string; label: string; icon: typeof Target; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
        active ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,0.04)]" : "text-sidebar-foreground/80 hover:bg-black/[0.035] hover:text-foreground dark:hover:bg-white/5",
      )}
    >
      <Icon className={cn("size-4", active ? "text-brand-ink" : "text-muted-foreground group-hover:text-foreground")} />
      {label}
      {active && <span aria-hidden className="ml-auto h-3.5 w-0.5 rounded-full bg-brand" />}
    </Link>
  );
}

function SidebarBody({ viewer, onNavigate }: { viewer: ShellViewer; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = currentCompany(viewer, pathname);
  const slug = current?.slug;
  const base = current ? `/c/${current.slug}` : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center px-4">
        <Link href={base ?? "/"} onClick={onNavigate} className="flex min-w-0 items-center gap-2">
          {current?.branding.logoUrl ? (
            <>
              <CompanyLogo name={current.name} logoUrl={current.branding.logoUrl} className="h-6 max-w-[120px]" />
              <span className="shrink-0 border-l pl-2 text-[11px] font-medium text-muted-foreground">Omni OS</span>
            </>
          ) : (
            <OmniMark className="text-[15px]" />
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pt-1 pb-4 scrollbar-thin">
        {viewer.isOmniStaff && (
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">Omni</p>
            <NavLink href="/portfolio" label="Portfolio" icon={Briefcase} active={pathname === "/portfolio"} onNavigate={onNavigate} />
            <NavLink href="/portfolio/compare" label="Compare" icon={Scale} active={pathname.startsWith("/portfolio/compare")} onNavigate={onNavigate} />
            {viewer.isPlatformAdmin && <NavLink href="/admin" label="Administration" icon={Settings} active={pathname.startsWith("/admin")} onNavigate={onNavigate} />}
          </div>
        )}

        <div className="space-y-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mb-1.5 flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left shadow-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                {current ? <CompanyMark name={current.name} color={current.brandColor} logoUrl={current.branding.logoUrl} /> : <span className="size-5 rounded bg-muted" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{current?.name ?? "Select company"}</span>
                  {current?.sector && <span className="block truncate text-[11px] text-muted-foreground">{current.sector}</span>}
                </span>
                <ChevronsUpDown className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel>Companies</DropdownMenuLabel>
              {viewer.companies.map((c) => (
                <DropdownMenuItem key={c.slug} asChild>
                  <Link href={`/c/${c.slug}`} onClick={onNavigate}>
                    <CompanyMark name={c.name} color={c.brandColor} logoUrl={c.branding.logoUrl} />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.slug === slug && <Check className="!text-foreground" />}
                  </Link>
                </DropdownMenuItem>
              ))}
              {viewer.isOmniStaff && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/portfolio" onClick={onNavigate}>
                      <Briefcase /> Portfolio overview
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {base &&
          COMPANY_NAV.map((group, gi) => (
            <div key={gi} className="space-y-0.5">
              {group.label && <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>}
              {group.items.map((item) => {
                const href = `${base}${item.href}`;
                const active = item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                return <NavLink key={item.href} href={href} label={item.label} icon={item.icon} active={active} onNavigate={onNavigate} />;
              })}
            </div>
          ))}
        {base && ADMIN_ROLES.includes(current!.role) && (
          <div className="space-y-0.5">
            <NavLink href={`${base}/settings`} label="Settings" icon={Settings} active={pathname.startsWith(`${base}/settings`)} onNavigate={onNavigate} />
          </div>
        )}
      </nav>

      <div className="border-t p-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar name={viewer.fullName} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{viewer.fullName}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{viewer.title ?? viewer.email}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel className="truncate">{viewer.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOut()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function AppShell({ viewer, children }: { viewer: ShellViewer; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = currentCompany(viewer, pathname);
  const tokens = useBrandTokens(current);
  const style = useMemo(() => tokensToStyle(tokens), [tokens]);
  // Menus, dialogs and toasts render in portals outside this tree, so mirror
  // the tokens onto <html>. Switching company re-derives them without a reload.
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(style)) root.style.setProperty(k, v);
  }, [style]);
  const showDemo = current ? current.isDemo : pathname.startsWith("/portfolio") && viewer.companies.some((c) => c.isDemo);

  return (
    <div className="flex min-h-dvh" style={style} data-brand={current ? current.slug : "omni"}>
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 border-r bg-sidebar lg:block">
        <SidebarBody viewer={viewer} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody viewer={viewer} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="-ml-1 rounded-md p-1.5 hover:bg-accent" aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <OmniMark className="text-sm" />
          {current && <span className="truncate text-sm text-muted-foreground">/ {current.name}</span>}
        </header>
        {showDemo && (
          <div className="flex items-center justify-center gap-1.5 border-b bg-brand-subtle px-4 py-1 text-[11.5px] text-foreground/70">
            <FlaskConical className="size-3 text-brand-ink" />
            Demonstration data — fictional companies, people and results. Not live portfolio information.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
