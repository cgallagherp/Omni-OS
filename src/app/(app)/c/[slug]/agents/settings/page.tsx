import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCompanyContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain/format";
import { AGENT_KEYS, AGENTS, AUTHORITY_LEVELS, defaultConfig, type AgentKey } from "@/lib/agents/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentConfigForm, ConnectionDialog, DisconnectButton } from "@/components/agents/controls";
import { AgentIcon, Timeline } from "@/components/agents/agent-ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agent configuration" };

export default async function AgentSettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ agent?: string }> }) {
  const { slug } = await params;
  const { agent: raw } = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can.admin) redirect(`/c/${slug}/agents`);
  const cid = ctx.company.companyId;
  const agent = (AGENT_KEYS.includes(raw as AgentKey) ? raw : "execution") as AgentKey;
  const [{ data: cfg }, { data: connections }, { data: history }] = await Promise.all([
    ctx.supabase.from("agent_configs").select("*").eq("company_id", cid).eq("agent_key", agent).maybeSingle(),
    ctx.supabase.from("integration_connections").select("*").eq("company_id", cid).order("created_at"),
    ctx.supabase.from("agent_events").select("*").eq("company_id", cid).eq("kind", "config").order("id", { ascending: false }).limit(20),
  ]);
  const config = (cfg ?? { ...defaultConfig(agent), allowed_connections: [] }) as Parameters<typeof AgentConfigForm>[0]["config"];

  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {AGENT_KEYS.map((k) => (
            <Link key={k} href={`/c/${slug}/agents/settings?agent=${k}`} className={cn("flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-[13px] font-medium", k === agent ? "border-brand ring-1 ring-brand" : "hover:bg-accent/40")}>
              <AgentIcon agent={k} className="size-6" /> {AGENTS[k].name}
            </Link>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{AGENTS[agent].name}</CardTitle>
            {cfg?.updated_at && <span className="text-xs text-muted-foreground">Last changed {formatDateTime(cfg.updated_at)}</span>}
          </CardHeader>
          <CardContent>
            <AgentConfigForm key={agent} companyId={cid} def={AGENTS[agent]} config={config} connections={(connections ?? []).map((c) => ({ id: c.id, display_name: c.display_name, mode: c.mode, status: c.status }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Connected systems</CardTitle>
            <ConnectionDialog companyId={cid} />
          </CardHeader>
          <div className="divide-y">
            {(connections ?? []).map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{c.display_name}</span>
                  <span className="block text-xs text-muted-foreground">{c.scopes.join(", ") || "—"} · connected {formatDateTime(c.connected_at)}</span>
                </span>
                <Badge variant={c.mode === "live" ? "brand" : "outline"}>{c.mode}</Badge>
                <Badge variant={c.status === "connected" ? "on" : c.status === "needs_authorisation" ? "risk" : "none"}>{c.status.replace("_", " ")}</Badge>
                {c.provider !== "omni_inbox" && c.status !== "disconnected" && <DisconnectButton companyId={cid} id={c.id} />}
              </div>
            ))}
          </div>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">Each company connects its own systems with least-privilege credentials, encrypted at rest and never readable back. Access to a system&apos;s data never implies authority to change it: what an agent may do is set above.</p>
        </Card>
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Levels of authority</CardTitle>
          </CardHeader>
          <ol className="divide-y">
            {AUTHORITY_LEVELS.map((l) => (
              <li key={l.level} className="px-4 py-2.5 text-[13px]">
                <span className="font-medium">
                  {l.level}. {l.name}
                </span>
                <span className="block text-xs text-muted-foreground">{l.description}</span>
              </li>
            ))}
          </ol>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">New companies start conservatively: agents off, everything beyond investigation needs approval. Approvals are re-checked immediately before execution.</p>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Configuration changes</CardTitle>
          </CardHeader>
          <Timeline events={history ?? []} base={`/c/${slug}`} />
        </Card>
      </div>
    </div>
  );
}
