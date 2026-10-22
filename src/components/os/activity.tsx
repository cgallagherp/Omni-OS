"use client";
import { useState } from "react";
import { History, MessageSquare, Megaphone } from "lucide-react";
import { Textarea, NativeSelect } from "@/components/ui/input";
import { InlineForm, SubmitButton } from "./forms";
import { addComment } from "@/lib/actions/flight-plan";
import { formatDateTime } from "@/lib/domain/format";
import { RAG_OPTIONS } from "@/lib/domain/status";
import type { ActivityEntry } from "@/lib/data/activity";
import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";

type Commentable = Parameters<typeof addComment>[1];

export function Activity({
  entries,
  companyId,
  entityType,
  entityId,
  canWrite,
  allowStatus,
}: {
  entries: ActivityEntry[];
  companyId: string;
  entityType: Commentable;
  entityId: string;
  canWrite: boolean;
  allowStatus?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "comments" | "changes">("all");
  const shown = entries.filter((e) => filter === "all" || (filter === "comments" ? e.kind === "comment" || e.kind === "update" : e.kind === "change" || e.kind === "created" || e.kind === "deleted"));
  return (
    <div>
      {canWrite && (
        <InlineForm action={(fd) => addComment(companyId, entityType, entityId, fd)} className="mb-4">
          {({ pending, errors }) => (
            <div className="rounded-lg border bg-card p-2 focus-within:ring-2 focus-within:ring-ring/30">
              <Textarea name="body" rows={2} placeholder="Post an update or comment…" className="border-0 shadow-none focus-visible:ring-0" aria-invalid={Boolean(errors.body)} />
              <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
                <NativeSelect name="kind" defaultValue={allowStatus ? "update" : "comment"} className="h-7 w-32 text-xs">
                  <option value="update">Status update</option>
                  <option value="comment">Comment</option>
                </NativeSelect>
                {allowStatus && (
                  <>
                    <NativeSelect name="status" defaultValue="" className="h-7 w-36 text-xs" aria-label="Change status">
                      <option value="">Keep status</option>
                      {RAG_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect name="progress" defaultValue="" className="h-7 w-32 text-xs" aria-label="Change progress">
                      <option value="">Keep progress</option>
                      {Array.from({ length: 21 }, (_, i) => i * 5).map((v) => (
                        <option key={v} value={v}>
                          {v}%
                        </option>
                      ))}
                    </NativeSelect>
                  </>
                )}
                <SubmitButton pending={pending} size="sm" className="ml-auto">
                  Post
                </SubmitButton>
              </div>
            </div>
          )}
        </InlineForm>
      )}
      <div className="mb-2 flex gap-1 text-xs">
        {(["all", "comments", "changes"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-2 py-1 capitalize", filter === f ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
            {f === "changes" ? "History" : f}
          </button>
        ))}
      </div>
      <ol className="relative space-y-4 border-l pl-4">
        {shown.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute top-0.5 -left-[25px] flex size-[18px] items-center justify-center rounded-full border bg-card">
              {e.kind === "comment" ? <MessageSquare className="size-2.5" /> : e.kind === "update" ? <Megaphone className="size-2.5 text-brand" /> : <History className="size-2.5 text-muted-foreground" />}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {(e.kind === "comment" || e.kind === "update") && <Avatar name={e.actor} size="xs" />}
              <span className="font-medium text-foreground">{e.actor}</span>
              <span>{e.kind === "update" ? "posted an update" : e.kind === "comment" ? "commented" : e.kind === "created" ? "created" : e.kind === "deleted" ? "deleted" : "changed"}</span>
              {e.body && (e.kind === "change" || e.kind === "created") && <span className="truncate">{e.body}</span>}
              <span className="ml-auto shrink-0">{formatDateTime(e.at)}</span>
            </div>
            {(e.kind === "comment" || e.kind === "update") && <p className="mt-1 text-sm whitespace-pre-line">{e.body}</p>}
            {e.changes && (
              <ul className="mt-1 space-y-0.5 text-[13px]">
                {e.changes.map((c, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">{c.field}:</span> <span className="line-through decoration-muted-foreground/50">{c.from}</span> → <span className="font-medium">{c.to}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {!shown.length && <li className="text-sm text-muted-foreground">No activity yet.</li>}
      </ol>
    </div>
  );
}
