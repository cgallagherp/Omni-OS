import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { AGENT_KEYS, AGENTS } from "@/lib/agents/registry";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Timeline } from "@/components/agents/agent-ui";

export const metadata: Metadata = { title: "Agent activity" };

const KINDS = ["trigger", "finding", "proposal", "approval", "message", "response", "escalation", "outcome", "delegation", "tool_call", "error", "config"];
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; agent?: string; kind?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const q = (sp.q ?? "").trim().slice(0, 100);
  let query = ctx.supabase.from("agent_events").select("*").eq("company_id", cid).order("id", { ascending: false }).limit(200);
  if (q) query = query.ilike("summary", like(q));
  if (sp.agent && AGENT_KEYS.includes(sp.agent as never)) query = query.eq("agent_key", sp.agent);
  if (sp.kind && KINDS.includes(sp.kind)) query = query.eq("kind", sp.kind);
  else if (!q) query = query.neq("kind", "tool_call");
  const [{ data: events }, { data: invs }] = await Promise.all([
    query,
    ctx.supabase.from("agent_investigations").select("id, title, agent_key, status, opened_at").eq("company_id", cid).order("opened_at", { ascending: false }).limit(200),
  ]);
  const matching = q ? (invs ?? []).filter((i) => i.title.toLowerCase().includes(q.toLowerCase())) : [];
  return (
    <div className="space-y-5">
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search findings, actions, replies, approvals…" aria-label="Search agent activity" className="pl-8" />
        </div>
        <NativeSelect name="agent" defaultValue={sp.agent ?? ""} aria-label="Agent" className="sm:w-44">
          <option value="">All agents</option>
          {AGENT_KEYS.map((k) => (
            <option key={k} value={k}>
              {AGENTS[k].name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="kind" defaultValue={sp.kind ?? ""} aria-label="Type" className="sm:w-40">
          <option value="">All types</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k.replace("_", " ")}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {matching.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Investigations</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {matching.map((i) => (
              <Link key={i.id} href={`/c/${slug}/agents/investigations/${i.id}`} className="block px-4 py-2 text-[13px] hover:bg-accent/40">
                {i.title} <span className="text-xs text-muted-foreground">· {AGENTS[i.agent_key as keyof typeof AGENTS].name} · {i.status}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <span className="text-xs text-muted-foreground">{events?.length ?? 0} entries{!q && !sp.kind ? " (tool calls hidden)" : ""}</span>
        </CardHeader>
        <Timeline events={events ?? []} base={`/c/${slug}`} linkInvestigation />
      </Card>
    </div>
  );
}
