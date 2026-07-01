import { createServerFn } from "@tanstack/react-start";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_BUCKET = "furniture-photos";
const BACKUP_BUCKET = "warehouse-backups";

export type PublicCatalogItem = {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  dimensions: string | null;
  color: string | null;
  public_description: string | null;
  public_price: number | null;
  photo_url: string | null;
};

export type PublicCatalogCategory = { id: string; name: string; code: string };

export const getPublicCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cats, error: ce } = await supabaseAdmin
    .from("furniture_categories")
    .select("id,name,code,display_order")
    .order("display_order");
  if (ce) throw new Error(ce.message);

  const { data: items, error: ie } = await supabaseAdmin
    .from("furniture_items")
    .select("id,name,category_id,dimensions,color,public_description,public_price,photo_url,active,public_visible")
    .eq("public_visible", true)
    .eq("active", true)
    .order("name");
  if (ie) throw new Error(ie.message);

  const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const enriched: PublicCatalogItem[] = await Promise.all(
    (items ?? []).map(async (i: any) => {
      let url: string | null = null;
      if (i.photo_url) {
        if (i.photo_url.startsWith("http")) url = i.photo_url;
        else {
          const { data: signed, error: signError } = await supabaseAdmin.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(i.photo_url, 60 * 60);
          if (!signError && signed?.signedUrl) {
            url = signed.signedUrl;
          } else {
            const { data: backup } = await supabaseAdmin.storage
              .from(BACKUP_BUCKET)
              .createSignedUrl(`photos/${i.photo_url}`, 60 * 60);
            url = backup?.signedUrl ?? null;
          }
        }
      }
      return {
        id: i.id,
        name: i.name,
        category_id: i.category_id,
        category_name: catMap.get(i.category_id) ?? "",
        dimensions: i.dimensions,
        color: i.color,
        public_description: i.public_description,
        public_price: i.public_price == null ? null : Number(i.public_price),
        photo_url: url,
      };
    }),
  );

  const categories: PublicCatalogCategory[] = (cats ?? []).map((c) => ({ id: c.id, name: c.name, code: c.code }));
  return { categories, items: enriched };
});

export type InquiryItemInput = { furniture_item_id: string; qty: number };
export type SubmitInquiryInput = {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  event_start_at?: string | null;
  event_end_at?: string | null;
  venue?: string;
  message?: string;
  items: InquiryItemInput[];
  // Honeypot — must be empty
  website?: string;
};

function clean(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export const submitPublicInquiry = createServerFn({ method: "POST" })
  .inputValidator((d: SubmitInquiryInput) => {
    if (!d || typeof d !== "object") throw new Error("Invalid payload");
    if (d.website && d.website.trim() !== "") throw new Error("Spam detected");
    const name = clean(d.name, 200);
    const email = clean(d.email, 200).toLowerCase();
    if (!name) throw new Error("Meno je povinné");
    if (!EMAIL_RE.test(email)) throw new Error("Neplatný email");
    if (!Array.isArray(d.items) || d.items.length === 0) throw new Error("Pridajte aspoň jednu položku do dopytu");
    if (d.items.length > 100) throw new Error("Príliš veľa položiek");
    const items: InquiryItemInput[] = [];
    for (const it of d.items) {
      if (!it || typeof it !== "object") continue;
      if (!UUID_RE.test(it.furniture_item_id)) throw new Error("Neplatná položka");
      const qty = Math.floor(Number(it.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > 9999) throw new Error("Neplatný počet");
      items.push({ furniture_item_id: it.furniture_item_id, qty });
    }
    return {
      name,
      company: clean(d.company, 200),
      email,
      phone: clean(d.phone, 60),
      event_start_at: d.event_start_at || null,
      event_end_at: d.event_end_at || null,
      venue: clean(d.venue, 300),
      message: clean(d.message, 2000),
      items,
      website: "",
    } as SubmitInquiryInput;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Validate every item is publicly visible & active
    const ids = data.items.map((i) => i.furniture_item_id);
    const { data: validItems, error: vErr } = await supabaseAdmin
      .from("furniture_items")
      .select("id,name")
      .in("id", ids)
      .eq("public_visible", true)
      .eq("active", true);
    if (vErr) throw new Error(vErr.message);
    const validIds = new Set((validItems ?? []).map((i) => i.id));
    const items = data.items.filter((i) => validIds.has(i.furniture_item_id));
    if (items.length === 0) throw new Error("Žiadne platné položky v dopyte");

    // Find or create client by email match
    let clientId: string | null = null;
    const { data: existingClient } = await supabaseAdmin
      .from("clients")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    if (existingClient?.id) {
      clientId = existingClient.id;
    } else {
      const { data: newClient, error: cErr } = await supabaseAdmin
        .from("clients")
        .insert({
          company_name: data.company || data.name,
          contact_person: data.name,
          email: data.email,
          phone: data.phone || null,
          notes: "Vytvorené z verejného dopytu",
        })
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);
      clientId = newClient.id;
    }

    // Create reservation in 'inquiry' status
    const now = new Date();
    const start = data.event_start_at ? new Date(data.event_start_at) : new Date(now.getTime() + 24 * 3600 * 1000);
    const end = data.event_end_at ? new Date(data.event_end_at) : new Date(start.getTime() + 8 * 3600 * 1000);
    const note = [
      "Verejný dopyt z katalógu.",
      data.phone ? `Tel: ${data.phone}` : "",
      data.message ? `Správa: ${data.message}` : "",
    ].filter(Boolean).join("\n");

    const { data: reservation, error: rErr } = await supabaseAdmin
      .from("reservations")
      .insert({
        client_id: clientId,
        event_name: `Dopyt — ${data.name}${data.company ? ` (${data.company})` : ""}`,
        venue: data.venue || null,
        address: data.venue || null,
        event_start_at: start.toISOString(),
        event_end_at: end.toISOString(),
        load_at: start.toISOString(),
        available_from_at: end.toISOString(),
        contact_person: data.name,
        email: data.email,
        phone: data.phone || null,
        note,
        status: "inquiry",
      })
      .select("id")
      .single();
    if (rErr) throw new Error(rErr.message);

    // Insert reservation_items (skip validation triggers by setting non-overlapping availability? They use load_at/available_from_at and check overlapping reservations — inquiries are still validated. We accept the validation; if it fails, surface the error.)
    if (items.length > 0) {
      const rows = items.map((i) => ({
        reservation_id: reservation.id,
        furniture_item_id: i.furniture_item_id,
        qty: i.qty,
      }));
      const { error: riErr } = await supabaseAdmin.from("reservation_items").insert(rows);
      if (riErr) {
        // Don't block the inquiry just because stock is tight — keep note instead.
        await supabaseAdmin
          .from("reservations")
          .update({ note: `${note}\n[Pozn.] Položky neuložené automaticky: ${riErr.message}` })
          .eq("id", reservation.id);
      }
    }

    const { error: iErr } = await supabaseAdmin.from("inquiries").insert({
      name: data.name,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      event_start_at: start.toISOString(),
      event_end_at: end.toISOString(),
      venue: data.venue || null,
      message: data.message || null,
      items: items as any,
      reservation_id: reservation.id,
      client_id: clientId,
    });
    if (iErr) throw new Error(iErr.message);

    return { ok: true, reservationId: reservation.id };
  });