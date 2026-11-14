import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { collectExtraItems, pickBestQuote, type ExtraItem, type IcsQuoteRow } from "@/lib/ics-items";

/**
 * Doplnenie rezervácie pre toho, kto ju smie vidieť, ale nemá práva na
 * klientov alebo kalkulácie.
 *
 * Rezervácia sa skladá z viacerých tabuliek a každá má vlastné právo. Kto má
 * `reservations.view`, no nemá `clients.view` / `quotes.view` (napr. Ľuboš),
 * dostal z RLS ticho prázdneho klienta aj prázdnu kalkuláciu — rezervácia
 * vyzerala nekompletne: chýbal klient a „Ďalšie položky" (služby, prenájmy
 * mimo skladu).
 *
 * Odtiaľto ide len to, čo k rezervácii patrí: meno a kontakt klienta, číslo
 * kalkulácie a jej položky **bez cien**. Ceny, zľavy ani iné kalkulácie sa
 * neposielajú. Ktoré rezervácie smie vidieť, rozhoduje RLS cez jeho vlastné
 * prihlásenie — service kľúč sa použije až na doplnenie tých, ktoré prešli.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 500;

export interface ReservationClientInfo {
  id: string;
  company_name: string | null;
  ico: string | null;
  dic: string | null;
  ic_dph: string | null;
  address: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
}

export interface ReservationQuoteInfo {
  id: string;
  quote_number: string | null;
  version_number: number | null;
  status: string | null;
  client_name: string | null;
  extras: ExtraItem[];
}

export interface ReservationContext {
  client: ReservationClientInfo | null;
  quote: ReservationQuoteInfo | null;
}

export const getReservationContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; withQuote?: boolean }) => {
    if (!d || !Array.isArray(d.ids)) throw new Error("Invalid input");
    const ids = [...new Set(d.ids)].filter((x) => typeof x === "string" && UUID_RE.test(x));
    if (ids.length > MAX_IDS) throw new Error("Too many ids");
    return { ids, withQuote: d.withQuote === true };
  })
  .handler(async ({ data, context }): Promise<Record<string, ReservationContext>> => {
    const { supabase, userId } = context;
    if (data.ids.length === 0) return {};

    const { data: allowed, error: permErr } = await supabase.rpc("has_permission", {
      _uid: userId,
      _perm: "reservations.view",
    });
    if (permErr) throw new Error(permErr.message);
    if (!allowed) throw new Error("Forbidden");

    // RLS používateľa: vráti len rezervácie, ktoré naozaj smie vidieť.
    const { data: visible, error: resErr } = await supabase
      .from("reservations")
      .select("id, client_id, quote_group_id")
      .in("id", data.ids);
    if (resErr) throw new Error(resErr.message);
    const rows = (visible ?? []) as { id: string; client_id: string | null; quote_group_id: string | null }[];
    if (rows.length === 0) return {};

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[];
    const clients = new Map<string, ReservationClientInfo>();
    if (clientIds.length > 0) {
      const { data: cs, error } = await supabaseAdmin
        .from("clients")
        .select("id, company_name, ico, dic, ic_dph, address, contact_person, email, phone")
        .in("id", clientIds);
      if (error) throw new Error(error.message);
      for (const c of (cs ?? []) as ReservationClientInfo[]) clients.set(c.id, c);
    }

    const out: Record<string, ReservationContext> = {};
    for (const r of rows) {
      out[r.id] = { client: r.client_id ? clients.get(r.client_id) ?? null : null, quote: null };
    }
    if (!data.withQuote) return out;

    // Kalkulácia, ktorou sa rezervácia riadi — rovnaké pravidlo ako na detaile
    // a v kalendári: podľa skupiny, inak podľa starého priameho prepojenia.
    const groupIds = [...new Set(rows.map((r) => r.quote_group_id).filter(Boolean))] as string[];
    const resIds = rows.map((r) => r.id);
    const select =
      "id, quote_number, version_number, status, is_current, quote_group_id, reservation_id, clients(company_name), quote_items(kind, name, qty, furniture_item_id)";
    const [byGroup, byRes] = await Promise.all([
      groupIds.length
        ? supabaseAdmin.from("quotes").select(select).is("deleted_at", null).in("quote_group_id", groupIds)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin.from("quotes").select(select).is("deleted_at", null).in("reservation_id", resIds),
    ]);
    if (byGroup.error) throw new Error(byGroup.error.message);
    if (byRes.error) throw new Error(byRes.error.message);
    const quotes = [...(byGroup.data ?? []), ...(byRes.data ?? [])] as any[];

    for (const r of rows) {
      const candidates = r.quote_group_id
        ? quotes.filter((q) => q.quote_group_id === r.quote_group_id)
        : quotes.filter((q) => q.reservation_id === r.id);
      const best = pickBestQuote(candidates as unknown as IcsQuoteRow[]) as any;
      if (!best) continue;
      out[r.id].quote = {
        id: best.id,
        quote_number: best.quote_number ?? null,
        version_number: best.version_number ?? null,
        status: best.status ?? null,
        client_name: best.clients?.company_name ?? null,
        extras: collectExtraItems(best.quote_items),
      };
    }
    return out;
  });
