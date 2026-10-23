"use server";
import { z } from "zod";
import { requireCompanyPermission, type CompanyContext } from "@/lib/auth";
import { buildAgenda } from "@/lib/domain/agenda";
import { MEETING_TYPE_LABEL } from "@/lib/domain/status";
import { loadCompanySnapshot } from "@/lib/data/snapshot";
import { insertScoped, revalidateCompany, updateScoped } from "./common";
import { ActionError, dbError, formObject, run, zOptional, zRequired, type ActionResult } from "./result";

type MeetingKind = "weekly" | "monthly" | "quarterly" | "annual" | "board_monthly" | "board_quarterly";

const TITLES: Record<MeetingKind, string> = {
  weekly: "Weekly ELT meeting",
  monthly: "Monthly operating review",
  quarterly: "Quarterly offsite",
  annual: "Annual strategy reset",
  board_monthly: "Monthly Board",
  board_quarterly: "Quarterly Board",
};

const meetingSchema = z.object({
  type: z.enum(["weekly", "monthly", "quarterly", "annual", "board_monthly", "board_quarterly"]),
  title: zOptional(200),
  scheduled_at: z.string().min(1, "Choose a date and time"),
  facilitator_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function scheduleMeeting(companyId: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = meetingSchema.parse(formObject(fd));
    const when = new Date(data.scheduled_at);
    if (Number.isNaN(when.getTime())) throw new ActionError("Invalid date");
    const id = await insertScoped(ctx, "meetings", {
      type: data.type,
      title: data.title ?? TITLES[data.type],
      scheduled_at: when.toISOString(),
      facilitator_id: data.facilitator_id,
      status: "scheduled",
    });
    const attendees = fd.getAll("attendee").map(String);
    if (attendees.length) {
      const { error } = await ctx.supabase.from("meeting_attendees").insert(attendees.map((a) => ({ company_id: companyId, meeting_id: id, crew_member_id: a, present: true })));
      dbError(error);
    }
    revalidateCompany(ctx);
    return { ok: true, message: `${MEETING_TYPE_LABEL[data.type]} scheduled`, data: { id } };
  });
}

async function generateAgenda(ctx: CompanyContext, meetingId: string, type: MeetingKind) {
  const snap = await loadCompanySnapshot(ctx.supabase, ctx.company.companyId);
  if (!snap) throw new ActionError("Company not found");
  const { data: prior, error } = await ctx.supabase
    .from("meeting_agenda_items")
    .select("entity_id, meetings!inner(status)")
    .eq("company_id", ctx.company.companyId)
    .neq("meeting_id", meetingId)
    .eq("meetings.status", "completed")
    .not("entity_id", "is", null);
  dbError(error);
  const items = buildAgenda({
    meetingType: type,
    metrics: snap.metrics.map((v) => ({ ...v, metric: { ...v.metric, tolerance_pct: Number(v.metric.tolerance_pct) } })),
    priorities: snap.priorities,
    openActions: snap.openActions,
    openIssues: snap.openIssues,
    previouslyDiscussed: new Set((prior ?? []).map((p) => p.entity_id as string)),
    today: new Date().toISOString().slice(0, 10),
  });
  if (items.length) {
    const { error: e2 } = await ctx.supabase.from("meeting_agenda_items").insert(items.map((i) => ({ ...i, snapshot: i.snapshot as never, company_id: ctx.company.companyId, meeting_id: meetingId })));
    dbError(e2);
  }
  return snap;
}

/** Starts a meeting: snapshots the agenda from the live plan and records default attendees. */
export async function startMeeting(companyId: string, meetingId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const { data: m, error } = await ctx.supabase.from("meetings").select("*").eq("company_id", companyId).eq("id", meetingId).maybeSingle();
    dbError(error);
    if (!m) throw new ActionError("Meeting not found");
    if (m.status !== "scheduled") throw new ActionError("This meeting has already started.");
    const { data: live } = await ctx.supabase.from("meetings").select("id").eq("company_id", companyId).eq("status", "in_progress").limit(1);
    if (live?.length) throw new ActionError("Another meeting is already in progress. Finish it first.");

    const { count } = await ctx.supabase.from("meeting_agenda_items").select("id", { count: "exact", head: true }).eq("meeting_id", meetingId);
    const snap = !count ? await generateAgenda(ctx, meetingId, m.type) : null;

    const { count: attendeeCount } = await ctx.supabase.from("meeting_attendees").select("crew_member_id", { count: "exact", head: true }).eq("meeting_id", meetingId);
    if (!attendeeCount) {
      const crew = snap?.crew ?? (await ctx.supabase.from("crew_members").select("*").eq("company_id", companyId)).data ?? [];
      const leaders = crew.filter((c) => c.is_leadership && !c.is_open_seat && c.user_id);
      if (leaders.length) {
        const { error: e3 } = await ctx.supabase.from("meeting_attendees").insert(leaders.map((c) => ({ company_id: companyId, meeting_id: meetingId, crew_member_id: c.id, present: true })));
        dbError(e3);
      }
    }
    await updateScoped(ctx, "meetings", meetingId, { status: "in_progress", started_at: new Date().toISOString() });
    revalidateCompany(ctx);
    return { ok: true, message: "Meeting started" };
  });
}

/** Creates an ad-hoc meeting for now and starts it straight away. */
export async function startAdHocMeeting(companyId: string, type: MeetingKind): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const id = await insertScoped(ctx, "meetings", { type, title: TITLES[type], scheduled_at: new Date().toISOString(), status: "scheduled" });
    const res = await startMeeting(companyId, id);
    if (!res.ok) throw new ActionError(res.error);
    return { ok: true, message: "Meeting started", data: { id } };
  });
}

export async function refreshAgenda(companyId: string, meetingId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const { data: m } = await ctx.supabase.from("meetings").select("id, type, status").eq("company_id", companyId).eq("id", meetingId).maybeSingle();
    if (!m || m.status === "completed") throw new ActionError("Agenda can only be refreshed before or during a meeting.");
    // Keep items with notes or that were raised live; regenerate the rest.
    const { data: existing } = await ctx.supabase.from("meeting_agenda_items").select("*").eq("meeting_id", meetingId);
    const keep = new Set((existing ?? []).filter((i) => i.notes || i.reviewed || (i.snapshot as Record<string, unknown>)?.raised_live).map((i) => i.entity_id));
    const removable = (existing ?? []).filter((i) => !keep.has(i.entity_id)).map((i) => i.id);
    if (removable.length) dbError((await ctx.supabase.from("meeting_agenda_items").delete().in("id", removable)).error);
    const snap = await loadCompanySnapshot(ctx.supabase, companyId);
    if (!snap) throw new ActionError("Company not found");
    const items = buildAgenda({
      meetingType: m.type,
      metrics: snap.metrics.map((v) => ({ ...v, metric: { ...v.metric, tolerance_pct: Number(v.metric.tolerance_pct) } })),
      priorities: snap.priorities,
      openActions: snap.openActions,
      openIssues: snap.openIssues,
      previouslyDiscussed: new Set(),
      today: new Date().toISOString().slice(0, 10),
    }).filter((i) => !keep.has(i.entity_id));
    if (items.length) dbError((await ctx.supabase.from("meeting_agenda_items").insert(items.map((i) => ({ ...i, snapshot: i.snapshot as never, company_id: companyId, meeting_id: meetingId })))).error);
    revalidateCompany(ctx);
    return { ok: true, message: "Agenda refreshed from the latest plan" };
  });
}

export async function setAgendaItemReviewed(companyId: string, itemId: string, reviewed: boolean): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    await updateScoped(ctx, "meeting_agenda_items", itemId, { reviewed });
    revalidateCompany(ctx);
  });
}

export async function saveAgendaNote(companyId: string, itemId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const notes = z.string().max(4000).parse(fd.get("notes") ?? "");
    await updateScoped(ctx, "meeting_agenda_items", itemId, { notes: notes || null, reviewed: true });
    revalidateCompany(ctx);
    return { ok: true, message: "Note saved" };
  });
}

export async function setAttendance(companyId: string, meetingId: string, crewMemberId: string, present: boolean | null): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    if (present === null) {
      dbError((await ctx.supabase.from("meeting_attendees").delete().eq("meeting_id", meetingId).eq("crew_member_id", crewMemberId).eq("company_id", companyId)).error);
    } else {
      const { error } = await ctx.supabase
        .from("meeting_attendees")
        .upsert({ company_id: companyId, meeting_id: meetingId, crew_member_id: crewMemberId, present }, { onConflict: "meeting_id,crew_member_id" });
      dbError(error);
    }
    revalidateCompany(ctx);
  });
}

export async function saveMeetingNotes(companyId: string, meetingId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const notes = z.string().max(20000).parse(fd.get("notes") ?? "");
    await updateScoped(ctx, "meetings", meetingId, { notes: notes || null });
    revalidateCompany(ctx);
    return { ok: true, message: "Notes saved" };
  });
}

const finishSchema = z.object({
  summary: zRequired("Summary", 5000),
  rating: z.coerce.number().int().min(1).max(10).optional(),
  schedule_next: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

/** Finishes a meeting. Unresolved issues and open actions carry into the next meeting automatically. */
export async function finishMeeting(companyId: string, meetingId: string, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireCompanyPermission(companyId, "write");
    const data = finishSchema.parse(formObject(fd));
    const { data: m } = await ctx.supabase.from("meetings").select("*").eq("company_id", companyId).eq("id", meetingId).maybeSingle();
    if (!m) throw new ActionError("Meeting not found");
    if (m.status !== "in_progress") throw new ActionError("Only a meeting in progress can be finished.");
    await updateScoped(ctx, "meetings", meetingId, { status: "completed", ended_at: new Date().toISOString(), summary: data.summary, rating: data.rating ?? null });

    // Flag unresolved agenda issues so the record shows what was carried forward.
    const { data: items } = await ctx.supabase.from("meeting_agenda_items").select("id, entity_id, entity_type").eq("meeting_id", meetingId).in("entity_type", ["issue", "action"]);
    const ids = (items ?? []).map((i) => i.entity_id!).filter(Boolean);
    if (ids.length) {
      const [{ data: openIssues }, { data: openActions }] = await Promise.all([
        ctx.supabase.from("issues").select("id").in("id", ids).neq("status", "resolved"),
        ctx.supabase.from("actions").select("id").in("id", ids).eq("status", "open"),
      ]);
      const open = new Set([...(openIssues ?? []), ...(openActions ?? [])].map((r) => r.id));
      const carried = (items ?? []).filter((i) => open.has(i.entity_id!)).map((i) => i.id);
      if (carried.length) dbError((await ctx.supabase.from("meeting_agenda_items").update({ carried_over: true }).in("id", carried)).error);
    }

    if (data.schedule_next && m.type === "weekly") {
      const next = new Date(new Date(m.scheduled_at).getTime() + 7 * 86400000);
      const { data: existing } = await ctx.supabase
        .from("meetings")
        .select("id")
        .eq("company_id", companyId)
        .eq("type", "weekly")
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .limit(1);
      if (!existing?.length) {
        const nextId = await insertScoped(ctx, "meetings", { type: "weekly", title: m.title, scheduled_at: next.toISOString(), facilitator_id: m.facilitator_id, status: "scheduled" });
        const { data: att } = await ctx.supabase.from("meeting_attendees").select("crew_member_id").eq("meeting_id", meetingId);
        if (att?.length) await ctx.supabase.from("meeting_attendees").insert(att.map((a) => ({ company_id: companyId, meeting_id: nextId, crew_member_id: a.crew_member_id, present: true })));
      }
    }
    revalidateCompany(ctx);
    return { ok: true, message: "Meeting finished — summary saved" };
  });
}
