/**
 * Server-only Resend email helper.
 *
 * Reads RESEND_API_KEY z process.env — funguje aj na self-hosted serveri
 * (nepoužíva Lovable connector gateway). Volá priamo Resend REST API.
 *
 * IMPORTANT: nikdy nepoužívať v client kóde.
 */

export type EmailAttachment = {
  filename: string;
  /** base64-encoded súbor (bez data: prefixu) */
  content: string;
  content_type?: string;
};

export type SendEmailInput = {
  from: string; // "Meno <email@domain>" alebo len email
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: EmailAttachment[];
  tags?: { name: string; value: string }[];
};

export type SendEmailResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendResendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY nie je nastavený na serveri" };
  }

  const body: Record<string, unknown> = {
    from: input.from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
  };
  if (input.text) body.text = input.text;
  if (input.reply_to) body.reply_to = input.reply_to;
  if (input.cc) body.cc = input.cc;
  if (input.bcc) body.bcc = input.bcc;
  if (input.attachments?.length) body.attachments = input.attachments;
  if (input.tags?.length) body.tags = input.tags;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok) {
      const msg = json?.message || json?.error || text || `HTTP ${res.status}`;
      return { ok: false, error: String(msg).slice(0, 500) };
    }
    return { ok: true, id: json?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Network error" };
  }
}

export function formatSender(fromName: string | null | undefined, fromEmail: string): string {
  const name = (fromName ?? "").trim();
  if (!name) return fromEmail;
  // Escape uvodzoviek v mene
  const safeName = name.replace(/"/g, "'");
  return `"${safeName}" <${fromEmail}>`;
}

export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}