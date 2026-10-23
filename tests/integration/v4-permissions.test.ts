/**
 * v4 permission boundaries, enforced by Postgres RLS (tested through PostgREST
 * with real sessions): branding, the Monday scorecard and its outbox, and the
 * CEO role.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { admin, as, companyId, type Client } from "./helpers";

let clinara: string;
let kestrel: string;
let daniel: Client; // Clinara CEO
let marcus: Client; // Clinara executive
let helen: Client; // Clinara Chair / observer
let sarah: Client; // Kestrel CEO
let priya: Client; // Omni, all companies

beforeAll(async () => {
  clinara = await companyId("clinara");
  kestrel = await companyId("kestrel");
  [daniel, marcus, helen, sarah, priya] = await Promise.all([
    as("daniel@clinara.demo"),
    as("marcus@clinara.demo"),
    as("helen@clinara.demo"),
    as("sarah@kestrel.demo"),
    as("priya@omni.demo"),
  ]);
});

describe("company branding", () => {
  it("is readable by members of the company only", async () => {
    expect((await helen.from("company_branding").select("company_id").eq("company_id", clinara)).data).toHaveLength(1);
    expect((await helen.from("company_branding").select("company_id").eq("company_id", kestrel)).data).toEqual([]);
  });

  it("a company admin cannot change another company's branding", async () => {
    const before = (await admin.from("company_branding").select("primary_color").eq("company_id", kestrel).single()).data!.primary_color;
    const upd = await daniel.from("company_branding").update({ primary_color: "#FF00FF" }).eq("company_id", kestrel).select();
    expect(upd.data ?? []).toEqual([]);
    const ins = await daniel.from("company_branding").upsert({ company_id: kestrel, primary_color: "#FF00FF" }).select();
    expect(ins.error).not.toBeNull();
    const del = await daniel.from("company_branding").delete().eq("company_id", kestrel).select();
    expect(del.data ?? []).toEqual([]);
    expect((await admin.from("company_branding").select("primary_color").eq("company_id", kestrel).single()).data!.primary_color).toBe(before);
  });

  it("executives and observers cannot change their own company's branding", async () => {
    for (const c of [marcus, helen]) {
      const upd = await c.from("company_branding").update({ primary_color: "#FF00FF" }).eq("company_id", clinara).select();
      expect(upd.data ?? []).toEqual([]);
    }
    expect((await admin.from("company_branding").select("primary_color").eq("company_id", clinara).single()).data!.primary_color).not.toBe("#FF00FF");
  });

  it("the CEO and Omni can change it; invalid colours are rejected by the database", async () => {
    const ok = await daniel.from("company_branding").update({ primary_color: "#123456" }).eq("company_id", clinara).select();
    expect(ok.data).toHaveLength(1);
    const omni = await priya.from("company_branding").update({ primary_color: "#14325C" }).eq("company_id", clinara).select();
    expect(omni.data).toHaveLength(1);
    const bad = await daniel.from("company_branding").update({ primary_color: "red; background:url(x)" }).eq("company_id", clinara).select();
    expect(bad.error).not.toBeNull();
    const svg = await daniel.from("company_branding").update({ logo_mime: "image/svg+xml" }).eq("company_id", clinara).select();
    expect(svg.error).not.toBeNull();
  });

  it("logo bytes never reach the audit log", async () => {
    const { data } = await admin.from("audit_log").select("changes").eq("entity_type", "company_branding").limit(20);
    expect(JSON.stringify(data ?? [])).not.toMatch(/iVBORw0KGgo/); // PNG base64 signature
  });
});

describe("Monday scorecard", () => {
  it("is hidden from observers and other companies", async () => {
    expect((await helen.from("weekly_scorecards").select("id").eq("company_id", clinara)).data).toEqual([]);
    expect((await helen.from("email_outbox").select("id").eq("company_id", clinara)).data).toEqual([]);
    expect((await sarah.from("weekly_scorecards").select("id").eq("company_id", clinara)).data).toEqual([]);
  });

  it("is visible to company leadership and Omni recipients", async () => {
    expect((await marcus.from("weekly_scorecards").select("id").eq("company_id", clinara)).data!.length).toBeGreaterThan(0);
    expect((await priya.from("weekly_scorecards").select("id").eq("company_id", clinara)).data!.length).toBeGreaterThan(0);
  });

  it("only the CEO or a company admin can approve it", async () => {
    const row = { company_id: clinara, week_start: "2030-01-07", rows: [], recipients: [] };
    expect((await marcus.from("weekly_scorecards").insert(row).select()).error).not.toBeNull();
    expect((await priya.from("weekly_scorecards").insert(row).select()).error).not.toBeNull();
    expect((await sarah.from("weekly_scorecards").insert(row).select()).error).not.toBeNull();
    const ok = await daniel.from("weekly_scorecards").insert(row).select("id").single();
    expect(ok.error).toBeNull();
    await admin.from("weekly_scorecards").delete().eq("id", ok.data!.id);
  });

  it("outbox entries cannot be forged in another user's name", async () => {
    const { data: sarahProfile } = await admin.from("profiles").select("id").eq("email", "sarah@kestrel.demo").single();
    const res = await daniel.from("email_outbox").insert({ company_id: clinara, kind: "weekly_scorecard", subject: "x", html: "x", recipients: [], status: "queued", created_by: sarahProfile!.id }).select();
    expect(res.error).not.toBeNull();
  });
});

describe("CEO role and priorities", () => {
  it("the CEO can manage settings for their own company only", async () => {
    expect((await daniel.from("companies").update({ headquarters: "Bristol, UK" }).eq("id", clinara).select()).data).toHaveLength(1);
    expect((await daniel.from("companies").update({ headquarters: "x" }).eq("id", kestrel).select()).data ?? []).toEqual([]);
  });

  it("enforces the hard limit on 90-day priorities in the database", async () => {
    const { data: q } = await admin.from("quarters").select("id").eq("company_id", clinara).eq("status", "active").single();
    const { data: p } = await admin.from("quarterly_priorities").select("annual_goal_id, owner_id").eq("company_id", clinara).eq("quarter_id", q!.id).limit(1).single();
    const created: string[] = [];
    let error: unknown = null;
    for (let i = 0; i < 6 && !error; i++) {
      const r = await marcus.from("quarterly_priorities").insert({ company_id: clinara, quarter_id: q!.id, annual_goal_id: p!.annual_goal_id, owner_id: p!.owner_id, title: `Extra ${i}`, status: "on_track" }).select("id").single();
      if (r.error) error = r.error;
      else created.push(r.data.id);
    }
    expect(error).not.toBeNull();
    if (created.length) await admin.from("quarterly_priorities").delete().in("id", created);
  });

  it("organisational actions cannot reference another company's priority", async () => {
    const { data: kp } = await admin.from("quarterly_priorities").select("id").eq("company_id", kestrel).limit(1).single();
    const { data: owner } = await admin.from("crew_members").select("id").eq("company_id", clinara).limit(1).single();
    const r = await daniel.from("org_actions").insert({ company_id: clinara, type: "hire", title: "x", owner_id: owner!.id, quarterly_priority_id: kp!.id }).select();
    expect(r.error).not.toBeNull();
  });
});
