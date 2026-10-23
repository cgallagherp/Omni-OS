import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { brand, isDemoMode } from "@/config/brand";
import { OmniLogo, OmniMark } from "@/components/os/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const PERSONAS = [
  { group: "Omni", email: "priya@omni.demo", name: "Priya Raman", role: "Operating Partner · all three companies" },
  { group: "Omni", email: "tom@omni.demo", name: "Tom Becker", role: "Investment Director · Clinara only" },
  { group: "Omni", email: "sam@omni.demo", name: "Sam Ellis", role: "Platform administrator" },
  { group: "Clinara", email: "daniel@clinara.demo", name: "Daniel Okafor", role: "CEO" },
  { group: "Clinara", email: "marcus@clinara.demo", name: "Marcus Webb", role: "CRO · executive" },
  { group: "Clinara", email: "helen@clinara.demo", name: "Helen Fraser", role: "Chair · read-only observer" },
  { group: "Kestrel", email: "sarah@kestrel.demo", name: "Sarah Mitchell", role: "CEO" },
  { group: "Kestrel", email: "nadia@kestrel.demo", name: "Nadia Petrova", role: "COO · executive" },
  { group: "Ashworth", email: "imogen@ashworth.demo", name: "Imogen Clarke", role: "CEO · first 100 days" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getViewer()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-omni-charcoal p-10 text-white lg:flex">
        <span className="flex items-center gap-2.5">
          <OmniLogo onDark className="h-8" />
          <span className="border-l border-white/25 pl-2.5 text-lg text-white/70">OS</span>
        </span>
        <div className="max-w-md">
          <p className="text-[13px] font-medium tracking-wide text-omni-orange uppercase">The Omni Operating System</p>
          <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance">{brand.tagline}</h1>
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-white/10 text-sm">
            {[
              ["North Star", "Where are we going?"],
              ["Flight Plan", "How do we get there?"],
              ["Crew", "Who will deliver it?"],
              ["Mission Control", "How do we ensure execution?"],
            ].map(([t, d]) => (
              <div key={t} className="bg-omni-charcoal p-4">
                <div className="font-medium">{t}</div>
                <div className="mt-0.5 text-white/55">{d}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/40">Confidential. Access is restricted to authorised Omni and portfolio company users.</p>
      </aside>
      <main className="flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <OmniMark className="mb-8 lg:hidden" />
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your Omni OS account.</p>
          <LoginForm next={next} personas={isDemoMode ? PERSONAS : []} demoPassword={isDemoMode ? "OmniDemo!2026" : undefined} />
        </div>
      </main>
    </div>
  );
}
