import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SurveyPayload = {
  address_override?: string | null;
  floor?: string | null;
  has_elevator?: boolean | null;
  elevator_info?: string | null;
  access_type?: string | null;
  access_note?: string | null;
  parking_available?: boolean | null;
  parking_note?: string | null;
  distance_info?: string | null;
  door_width?: string | null;
  time_restrictions?: string | null;
  onsite_contact_name?: string | null;
  onsite_contact_phone?: string | null;
  prearrival_contact_name?: string | null;
  prearrival_contact_phone?: string | null;
  notes?: string | null;
};

const SURVEY_FIELDS: (keyof SurveyPayload)[] = [
  "address_override","floor","has_elevator","elevator_info","access_type","access_note",
  "parking_available","parking_note","distance_info","door_width","time_restrictions",
  "onsite_contact_name","onsite_contact_phone","prearrival_contact_name","prearrival_contact_phone","notes",
];

function sanitize(input: SurveyPayload): SurveyPayload {
  const out: any = {};
  for (const k of SURVEY_FIELDS) {
    let v: any = (input as any)[k];
    if (typeof v === "string") {
      v = v.trim().slice(0, 2000);
      if (v === "") v = null;
    }
    if (v === undefined) v = null;
    out[k] = v;
  }
  return out;
}

/** PUBLIC — load survey + reservation summary by token (no auth) */
export const getSurveyByToken = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => {
    if (!d?.token || !UUID_RE.test(d.token)) throw new Error("Invalid token");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: survey, error } = await supabaseAdmin
      .from("logistics_surveys")
      .select("*, reservations(id,event_name,venue,address,event_start_at,load_at,clients(company_name))")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!survey) throw new Error("NOT_FOUND");
    return survey as any;
  });

/** PUBLIC — submit/update survey by token (no auth) */
export const submitSurveyByToken = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; payload: SurveyPayload }) => {
    if (!d?.token || !UUID_RE.test(d.token)) throw new Error("Invalid token");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clean = sanitize(data.payload ?? {});
    const { data: existing, error: e0 } = await supabaseAdmin
      .from("logistics_surveys")
      .select("id, reservation_id")
      .eq("token", data.token)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!existing) throw new Error("NOT_FOUND");

    const { error } = await supabaseAdmin
      .from("logistics_surveys")
      .update({ ...clean, status: "filled", submitted_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);

    // Best-effort: pošli internú notifikáciu firme.
    try {
      const { data: cfg } = await supabaseAdmin.from("email_settings").select("*").eq("id", 1).maybeSingle();
      const recipients: string[] = (cfg?.notification_recipients as any) ?? [];
      if (cfg && recipients.length > 0) {
        const { data: r } = await supabaseAdmin
          .from("reservations")
          .select("event_name,venue,event_start_at,clients(company_name)")
          .eq("id", existing.reservation_id)
          .maybeSingle();
        const { sendResendEmail, formatSender, renderTemplate, escapeHtml } = await import("./email.server");
        const subject = renderTemplate(cfg.survey_filled_subject_template || "Logistický dotazník vyplnený — {{event_name}}", {
          event_name: (r as any)?.event_name ?? "",
        });
        const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
          <p>Klient vyplnil logistický dotazník.</p>
          <p><strong>Akcia:</strong> ${escapeHtml((r as any)?.event_name ?? "")}<br/>
          <strong>Miesto:</strong> ${escapeHtml((r as any)?.venue ?? "")}<br/>
          <strong>Klient:</strong> ${escapeHtml((r as any)?.clients?.company_name ?? "")}</p>
        </div>`;
        const result = await sendResendEmail({
          from: formatSender(cfg.from_name, cfg.from_email),
          to: recipients,
          reply_to: cfg.reply_to_email ?? undefined,
          subject,
          html,
          tags: [{ name: "kind", value: "survey_filled" }],
        });
        await supabaseAdmin.from("email_send_log").insert({
          kind: "survey_filled",
          recipient: recipients.join(","),
          subject,
          status: result.ok ? "sent" : "failed",
          error_message: result.error ?? null,
          provider_id: result.id ?? null,
          metadata: { reservation_id: existing.reservation_id },
        });
      }
    } catch (e) {
      console.warn("[logistics-survey] notify failed", e);
    }

    return { ok: true };
  });

/** AUTH — create (or fetch) survey for a reservation, returns token */
export const ensureSurveyForReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reservationId: string }) => {
    if (!d?.reservationId || !UUID_RE.test(d.reservationId)) throw new Error("Invalid id");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.some((r) => r === "admin" || r === "manager")) {
      throw new Error("Forbidden");
    }
    const { data: existing } = await supabase
      .from("logistics_surveys")
      .select("token")
      .eq("reservation_id", data.reservationId)
      .maybeSingle();
    if (existing) return { token: existing.token as string };

    const { data: created, error } = await supabase
      .from("logistics_surveys")
      .insert({ reservation_id: data.reservationId })
      .select("token")
      .single();
    if (error) throw new Error(error.message);
    return { token: created.token as string };
  });