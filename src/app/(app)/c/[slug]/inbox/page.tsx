import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { getCompanyContext } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import { AGENTS, type AgentKey } from "@/lib/agents/registry";
import { PageHeader, EmptyState } from "@/components/os/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentIcon } from "@/components/agents/agent-ui";
import { ReplyForm } from "@/components/agents/controls";

export const metadata: Metadata = { title: "Requests" };

const RESPONSE_LABEL = { done: "Done", new_date: "New date", blocked: "Blocked", update: "Update" } as const;

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const cid = ctx.company.companyId;
  const { data: messages } = await ctx.supabase.from("agent_messages").select("*").eq("company_id", cid).eq("to_user_id", ctx.viewer.id).order("created_at", { ascending: false }).limit(50);
  const actionIds = (messages ?? []).map((m) => (m.context as { action_id?: string }).action_id).filter(Boolean) as string[];
  const { data: actions } = actionIds.length ? await ctx.supabase.from("actions").select("id, title, status, due_date").in("id", actionIds) : { data: [] };
  const actionById = new Map((actions ?? []).map((a) => [a.id, a]));
  const open = (messages ?? []).filter((m) => !m.responded_at);
  const answered = (messages ?? []).filter((m) => m.responded_at);

  return (
    <div className="fade-in max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Mission Control"
        title="Requests from agents"
        description="Follow-ups and escalations addressed to you. Reply here; your reply is recorded against the action and the agent carries on from it. Revised dates go to management for approval."
      />
      {!messages?.length && <EmptyState title="Nothing waiting for you" description="When an agent needs an update on one of your commitments, it appears here." />}
      {open.map((m) => {
        const a = actionById.get((m.context as { action_id?: string }).action_id ?? "");
        return (
          <Card key={m.id} className="p-4" data-testid="agent-request">
            <div className="flex items-start gap-3">
              <AgentIcon agent={m.agent_key as AgentKey} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{m.subject}</p>
                  <Badge variant={m.kind === "escalation" ? "off" : m.kind === "reminder" ? "risk" : "brand"}>{m.kind}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {AGENTS[m.agent_key as AgentKey].name} · {formatDateTime(m.created_at)}
                  {a && (
                    <>
                      {" · "}
                      <Link href={`/c/${slug}/execution?view=actions`} className="hover:underline">
                        {a.status === "open" ? `due ${formatDate(a.due_date)}` : a.status}
                      </Link>
                    </>
                  )}
                </p>
                <p className="mt-2 text-[13.5px] whitespace-pre-line">{m.body}</p>
                <div className="mt-3 border-t pt-3">
                  <ReplyForm companyId={cid} messageId={m.id} canMarkDone={ctx.can.write && a?.status === "open"} />
                </div>
              </div>
            </div>
          </Card>
        );
      })}
      {answered.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 border-b px-4 py-2.5 text-[13px] font-medium">
            <Inbox className="size-4 text-muted-foreground" /> Answered
          </div>
          <div className="divide-y">
            {answered.map((m) => (
              <div key={m.id} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:gap-3">
                <span className="min-w-0 flex-1 truncate">{m.subject}</span>
                <Badge variant="outline">{RESPONSE_LABEL[m.response_kind as keyof typeof RESPONSE_LABEL]}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(m.responded_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
