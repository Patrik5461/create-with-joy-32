import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanEmail, requireAdminOrManager, UUID_RE } from "./email-functions-support";

/** Get email settings (admin only). */
export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (role ?? []).map((r: any) => r.role);
    if (!roles.includes("admin")) throw new Error("Forbidden");
    const { data, error } = await supabase.from("email_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/** Update email settings (admin only). */
export const updateEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    from_email?: string;
    from_name?: string;
    reply_to_email?: string | null;
    notification_recipients?: string[];
    quote_subject_template?: string;
    survey_link_subject_template?: string;
    inquiry_notify_subject_template?: string;
    survey_filled_subject_template?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (role ?? []).map((r: any) => r.role);
    if (!roles.includes("admin")) throw new Error("Forbidden");

    const patch: Record<string, any> = {};
    if (typeof data.from_email === "string") {
      const v = cleanEmail(data.from_email);
      if (!v) throw new Error("Neplatná from adresa");
      patch.from_email = v;
    }
    if (typeof data.from_name === "string") patch.from_name = data.from_name.trim().slice(0, 120);
    if (data.reply_to_email !== undefined) {
      if (data.reply_to_email === null || data.reply_to_email === "") patch.reply_to_email = null;
      else {
        const v = cleanEmail(data.reply_to_email);
        if (!v) throw new Error("Neplatná reply-to adresa");
        patch.reply_to_email = v;
      }
    }
    if (Array.isArray(data.notification_recipients)) {
      const list = data.notification_recipients.map(cleanEmail).filter((x): x is string => !!x);
      patch.notification_recipients = Array.from(new Set(list)).slice(0, 20);
    }
    for (const k of ["quote_subject_template","survey_link_subject_template","inquiry_notify_subject_template","survey_filled_subject_template"] as const) {
      if (typeof data[k] === "string") patch[k] = (data[k] as string).trim().slice(0, 300);
    }

    const { error } = await supabase.from("email_settings").update(patch as any).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Send test email (admin only). */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string }) => {
    const to = cleanEmail(d?.to);
    if (!to) throw new Error("Neplatná adresa príjemcu");
    return { to };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(role ?? []).some((r: any) => r.role === "admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendResendEmail, formatSender, escapeHtml } = await import("./email.server");
    const { data: cfg } = await supabaseAdmin.from("email_settings").select("*").eq("id", 1).maybeSingle();
    if (!cfg) throw new Error("Chýbajú email nastavenia");

    const subject = "Testovací email z CRM";
    const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <h2>Test odosielania cez Resend</h2>
      <p>Ak tento email vidíš, integrácia funguje.</p>
      <p><strong>From:</strong> ${escapeHtml(cfg.from_email)}<br/>
      <strong>Reply-To:</strong> ${escapeHtml(cfg.reply_to_email ?? "(neuvedené)")}</p>
    </div>`;

    const result = await sendResendEmail({
      from: formatSender(cfg.from_name, cfg.from_email),
      to: data.to,
      reply_to: cfg.reply_to_email ?? undefined,
      subject,
      html,
      tags: [{ name: "kind", value: "test" }],
    });

    await supabaseAdmin.from("email_send_log").insert({
      kind: "test",
      recipient: data.to,
      subject,
      status: result.ok ? "sent" : "failed",
      error_message: result.error ?? null,
      provider_id: result.id ?? null,
    });

    if (!result.ok) throw new Error(result.error || "Odoslanie zlyhalo");
    return { ok: true, id: result.id };
  });

/**
 * Nahrá jeden kúsok PDF prílohy do súkromného úložiska.
 * Vďaka tomu nie je odosielanie limitované veľkosťou jednej HTTP požiadavky.
 */
export const uploadQuotePdfChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { uploadId: string; index: number; chunkBase64: string }) => {
    if (!d?.uploadId || !UUID_RE.test(d.uploadId)) throw new Error("Neplatné ID nahrávania");
    if (!Number.isInteger(d.index) || d.index < 0 || d.index > 5000) throw new Error("Neplatný index");
    if (typeof d.chunkBase64 !== "string" || !d.chunkBase64.length) throw new Error("Prázdny blok");
    return d;
  })
  .handler(async ({ data, context }) => {
    await requireAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `tmp/${data.uploadId}/${String(data.index).padStart(5, "0")}.part`;
    const { error } = await supabaseAdmin.storage
      .from("quote-pdfs")
      .upload(path, new Blob([data.chunkBase64], { type: "text/plain" }), { upsert: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Create a short-lived direct upload target so the PDF never crosses the app proxy. */
export const createQuotePdfUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { quoteId: string; uploadId: string }) => {
    if (!d?.quoteId || !UUID_RE.test(d.quoteId)) throw new Error("Neplatné ID kalkulácie");
    if (!d?.uploadId || !UUID_RE.test(d.uploadId)) throw new Error("Neplatné ID nahrávania");
    return d;
  })
  .handler(async ({ data, context }) => {
    await requireAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `tmp/${data.quoteId}/${data.uploadId}.pdf`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("quote-pdfs")
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !signed) throw new Error(error?.message || "Nepodarilo sa pripraviť nahrávanie PDF");
    return { path, token: signed.token };
  });

/** Send quote email to client, optionally with PDF attachment (base64). */
export const sendQuoteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    quoteId: string;
    to?: string;
    message?: string;
    pdfBase64?: string | null;
    pdfFilename?: string | null;
    publicUrl?: string | null;
    pdfUploadId?: string | null;
    pdfChunkCount?: number | null;
    pdfStoragePath?: string | null;
  }) => {
    if (!d?.quoteId || !UUID_RE.test(d.quoteId)) throw new Error("Neplatné ID kalkulácie");
    return d;
  })
  .handler(async ({ data, context }) => {
    await requireAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendResendEmail, formatSender, renderTemplate, escapeHtml } = await import("./email.server");

    const { data: q, error } = await supabaseAdmin
      .from("quotes")
      .select("id, quote_number, version_number, total_with_vat, valid_until, created_by, clients(id,company_name,email,contact_person), client_contacts(id,email,full_name)")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!q) throw new Error("Kalkulácia neexistuje");

    const to = cleanEmail(data.to) ?? cleanEmail((q as any).client_contacts?.email) ?? cleanEmail((q as any).clients?.email);
    if (!to) throw new Error("Chýba email príjemcu");

    const { data: cfg } = await supabaseAdmin.from("email_settings").select("*").eq("id", 1).maybeSingle();
    if (!cfg) throw new Error("Chýbajú email nastavenia");

    // Fetch creator profile for signature + Reply-To
    let creator: { full_name: string | null; email: string | null; work_email: string | null; phone: string | null; job_title: string | null } | null = null;
    const createdBy = (q as any).created_by as string | null;
    if (createdBy) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email, work_email, phone, job_title")
        .eq("id", createdBy)
        .maybeSingle();
      creator = (p as any) ?? null;
    }
    const creatorWorkEmail = cleanEmail(creator?.work_email) ?? null;
    const replyTo = creatorWorkEmail ?? cfg.reply_to_email ?? undefined;

    const subjectTpl = cfg.quote_subject_template || "Cenová ponuka {{quote_number}}";
    const subject = renderTemplate(subjectTpl, {
      quote_number: (q as any).quote_number,
      version: (q as any).version_number,
    });

    const total = Number((q as any).total_with_vat ?? 0).toLocaleString("sk-SK", { style: "currency", currency: "EUR" });
    const clientName = (q as any).client_contacts?.full_name ?? (q as any).clients?.contact_person ?? (q as any).clients?.company_name ?? "";
    const linkHtml = data.publicUrl
      ? `<p>Ponuku si môžete pozrieť online: <a href="${escapeHtml(data.publicUrl)}">${escapeHtml(data.publicUrl)}</a></p>`
      : "";
    const customMessage = (data.message ?? "").trim();
    const signerName = creator?.full_name?.trim() || cfg.from_name;
    const bodyMessage = customMessage
      ? `<p style="white-space:pre-wrap">${escapeHtml(customMessage)}</p>`
      : `<p>Dobrý deň${clientName ? " " + escapeHtml(clientName) : ""},</p>
         <p>zasielame Vám cenovú ponuku č. <strong>${escapeHtml((q as any).quote_number)}</strong> (v${(q as any).version_number}) v celkovej sume <strong>${escapeHtml(total)}</strong> s DPH.</p>
         ${ (q as any).valid_until ? `<p>Platnosť ponuky: ${escapeHtml((q as any).valid_until)}</p>` : "" }
         <p>V prípade otázok nás neváhajte kontaktovať.</p>
         <p>S pozdravom,<br/>${escapeHtml(signerName)}</p>`;

    // Signature footer with creator's contact info
    const sigRows: string[] = [];
    if (creator?.full_name) sigRows.push(`<div style="font-weight:600;color:#111">${escapeHtml(creator.full_name)}</div>`);
    if (creator?.job_title) sigRows.push(`<div style="color:#555">${escapeHtml(creator.job_title)}</div>`);
    const contactBits: string[] = [];
    if (creatorWorkEmail) contactBits.push(`<a href="mailto:${escapeHtml(creatorWorkEmail)}" style="color:#555;text-decoration:none">${escapeHtml(creatorWorkEmail)}</a>`);
    if (creator?.phone) contactBits.push(`<a href="tel:${escapeHtml(creator.phone)}" style="color:#555;text-decoration:none">${escapeHtml(creator.phone)}</a>`);
    if (contactBits.length) sigRows.push(`<div style="color:#555">${contactBits.join(" · ")}</div>`);
    const signatureHtml = sigRows.length
      ? `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.5">${sigRows.join("")}</div>`
      : "";

    const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;max-width:640px">
      ${bodyMessage}
      ${linkHtml}
      ${signatureHtml}
    </div>`;

    // Ak bola príloha nahraná po častiach, poskladaj ju späť.
    let pdfBase64 = data.pdfBase64 ?? null;
    let pdfRemoteUrl: string | null = null;
    let uploadedPdfPath: string | null = null;
    if (!pdfBase64 && data.pdfStoragePath) {
      const expectedPrefix = `tmp/${data.quoteId}/`;
      if (!data.pdfStoragePath.startsWith(expectedPrefix) || !data.pdfStoragePath.endsWith(".pdf")) {
        throw new Error("Neplatná cesta PDF prílohy");
      }
      // POZOR: Resend si prílohu zadanú cez `path` sťahuje asynchrónne, až po
      // tom, čo request prijme. Keďže súbor mažeme hneď po odoslaní, Resend
      // by našiel 404 a mail by tichuško zlyhal (status Failed).
      // Preto PDF stiahneme tu a pošleme ho ako base64 obsah.
      const { data: pdfBlob, error: downloadError } = await supabaseAdmin.storage
        .from("quote-pdfs")
        .download(data.pdfStoragePath);
      if (downloadError || !pdfBlob) {
        throw new Error(downloadError?.message || "Prílohu sa nepodarilo načítať");
      }
      pdfBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString("base64");
      uploadedPdfPath = data.pdfStoragePath;
    }
    if (!pdfBase64 && data.pdfUploadId && data.pdfChunkCount) {
      const parts: string[] = [];
      for (let i = 0; i < data.pdfChunkCount; i++) {
        const path = `tmp/${data.pdfUploadId}/${String(i).padStart(5, "0")}.part`;
        const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("quote-pdfs").download(path);
        if (dlErr || !blob) throw new Error("Prílohu sa nepodarilo načítať");
        parts.push(await blob.text());
      }
      pdfBase64 = parts.join("");
      await supabaseAdmin.storage.from("quote-pdfs").remove(
        Array.from({ length: data.pdfChunkCount }, (_, i) => `tmp/${data.pdfUploadId}/${String(i).padStart(5, "0")}.part`),
      );
    }

    const attachments = pdfRemoteUrl
      ? [{
          filename: data.pdfFilename || `ponuka-${(q as any).quote_number}.pdf`,
          path: pdfRemoteUrl,
        }]
      : pdfBase64
      ? [{
          filename: data.pdfFilename || `ponuka-${(q as any).quote_number}.pdf`,
          content: pdfBase64,
          content_type: "application/pdf",
        }]
      : undefined;

    const result = await sendResendEmail({
      from: formatSender(cfg.from_name, cfg.from_email),
      to,
      reply_to: replyTo,
      subject,
      html,
      attachments,
      tags: [{ name: "kind", value: "quote" }, { name: "quote_id", value: (q as any).id }],
    });

    if (uploadedPdfPath) {
      const { error: cleanupError } = await supabaseAdmin.storage.from("quote-pdfs").remove([uploadedPdfPath]);
      if (cleanupError) console.error("[quote-email] PDF cleanup failed", cleanupError.message);
    }

    await supabaseAdmin.from("email_send_log").insert({
      kind: "quote",
      recipient: to,
      subject,
      status: result.ok ? "sent" : "failed",
      error_message: result.error ?? null,
      provider_id: result.id ?? null,
      metadata: { quote_id: (q as any).id, has_attachment: !!attachments, reply_to: replyTo ?? null, creator_id: createdBy },
    });

    if (result.ok) {
      await supabaseAdmin.from("quotes").update({ status: "sent" }).eq("id", (q as any).id);
    } else {
      throw new Error(result.error || "Odoslanie zlyhalo");
    }
    return { ok: true, id: result.id, replyTo: replyTo ?? null, creatorMissingWorkEmail: !!createdBy && !creatorWorkEmail };
  });

/** Send survey link to client. */
export const sendSurveyLinkEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reservationId: string; to?: string; publicUrl: string }) => {
    if (!d?.reservationId || !UUID_RE.test(d.reservationId)) throw new Error("Neplatná rezervácia");
    if (!d?.publicUrl || !/^https?:\/\//.test(d.publicUrl)) throw new Error("Chýba verejný odkaz");
    return d;
  })
  .handler(async ({ data, context }) => {
    await requireAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendResendEmail, formatSender, renderTemplate, escapeHtml } = await import("./email.server");

    // Ensure survey exists (uses admin because we've authorized above)
    const { data: r, error } = await supabaseAdmin
      .from("reservations")
      .select("id,event_name,venue,event_start_at,email,contact_person,clients(company_name,email,contact_person)")
      .eq("id", data.reservationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Rezervácia neexistuje");

    const to = cleanEmail(data.to) ?? cleanEmail((r as any).email) ?? cleanEmail((r as any).clients?.email);
    if (!to) throw new Error("Chýba email príjemcu");

    const { data: cfg } = await supabaseAdmin.from("email_settings").select("*").eq("id", 1).maybeSingle();
    if (!cfg) throw new Error("Chýbajú email nastavenia");

    const subject = renderTemplate(cfg.survey_link_subject_template || "Logistický dotazník k akcii {{event_name}}", {
      event_name: (r as any).event_name ?? "",
    });
    const contactName = (r as any).contact_person ?? (r as any).clients?.contact_person ?? "";
    const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;max-width:640px">
      <p>Dobrý deň${contactName ? " " + escapeHtml(contactName) : ""},</p>
      <p>prosíme o vyplnenie krátkeho logistického dotazníka k akcii <strong>${escapeHtml((r as any).event_name ?? "")}</strong>${(r as any).venue ? " (" + escapeHtml((r as any).venue) + ")" : ""}. Pomôže nám to pripraviť logistiku a montáž.</p>
      <p><a href="${escapeHtml(data.publicUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Vyplniť dotazník</a></p>
      <p style="color:#666;font-size:12px">Alebo skopírujte tento odkaz:<br/>${escapeHtml(data.publicUrl)}</p>
      <p>Ďakujeme,<br/>${escapeHtml(cfg.from_name)}</p>
    </div>`;

    const result = await sendResendEmail({
      from: formatSender(cfg.from_name, cfg.from_email),
      to,
      reply_to: cfg.reply_to_email ?? undefined,
      subject,
      html,
      tags: [{ name: "kind", value: "survey_link" }, { name: "reservation_id", value: (r as any).id }],
    });

    await supabaseAdmin.from("email_send_log").insert({
      kind: "survey_link",
      recipient: to,
      subject,
      status: result.ok ? "sent" : "failed",
      error_message: result.error ?? null,
      provider_id: result.id ?? null,
      metadata: { reservation_id: (r as any).id },
    });

    // Mark logistics_survey as "sent" ak existuje
    if (result.ok) {
      await supabaseAdmin
        .from("logistics_surveys")
        .update({ status: "sent" })
        .eq("reservation_id", (r as any).id)
        .neq("status", "filled");
    }

    if (!result.ok) throw new Error(result.error || "Odoslanie zlyhalo");
    return { ok: true, id: result.id };
  });