import { createFileRoute } from "@tanstack/react-router";
import { formatExtraItems, formatReservationItems, pickCalendarQuotes, type IcsExtraRow, type IcsQuoteRow } from "@/lib/ics-items";

export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token.replace(/\.ics$/i, "");
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRe.test(token)) {
          return new Response("Invalid token", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .eq("ics_token", token)
          .maybeSingle();

        if (!profile) {
          return new Response("Not found", { status: 404 });
        }

        const { data: reservations, error } = await supabaseAdmin
          .from("reservations")
          .select(
            // Nábytok patrí do popisu udalosti — bez neho sa v Apple/Google
            // kalendári nedalo zistiť, čo sa na akciu vlastne vezie.
            "id, event_name, venue, address, note, status, quote_group_id, load_at, depart_at, event_start_at, event_end_at, return_at, available_from_at, contact_person, phone, email, updated_at, created_at, clients(company_name), reservation_items(qty, furniture_items(name))"
          )
          .neq("status", "cancelled")
          .order("event_start_at", { ascending: true, nullsFirst: false });

        if (error) {
          return new Response(`Error: ${error.message}`, { status: 500 });
        }

        // Nábytok mimo skladu, služby a položky „Iné“ rezervácia nemá kde
        // držať — sú len na kalkulácii. Do kalendára pritom patria: dopožičaný
        // nábytok sa vezie rovnako ako vlastný.
        const rows = (reservations ?? []) as unknown as ReservationRow[];
        const groupIds = [...new Set(rows.map((r) => r.quote_group_id).filter(Boolean))] as string[];
        let extrasByGroup = new Map<string, IcsExtraRow[]>();
        if (groupIds.length > 0) {
          // Berú sa schválené aj aktuálne verzie; ktorá z nich platí, rozhodne
          // `pickCalendarQuotes` — rovnako ako pri zosúlaďovaní rezervácie.
          const { data: quoteRows } = await supabaseAdmin
            .from("quotes")
            .select("quote_group_id, version_number, status, is_current, quote_items(kind, name, qty, furniture_item_id)")
            .in("quote_group_id", groupIds)
            .is("deleted_at", null)
            .or("is_current.eq.true,status.eq.approved");
          extrasByGroup = pickCalendarQuotes((quoteRows ?? []) as unknown as IcsQuoteRow[]);
        }

        const ics = buildIcs(rows, profile.full_name ?? profile.id, extrasByGroup);

        return new Response(ics, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `inline; filename="mimaproduction-crm.ics"`,
            // Krátko, aby ručné obnovenie v kalendári ukázalo zmenu hneď.
            "Cache-Control": "public, max-age=60",
          },
        });
      },
    },
  },
});

// Musí sedieť s `RESERVATION_STATUSES` — staré názvy (prepared/loaded/delivered)
// v číselníku nikdy neboli a stav sa preto v kalendári ukazoval surový.
const STATUS_LABEL: Record<string, string> = {
  inquiry: "Dopyt",
  quote: "Ponuka",
  confirmed: "Potvrdené",
  in_progress: "Prebieha event",
  returned: "Vrátené",
  invoiced: "Fakturované",
  cancelled: "Zrušené",
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toIcsDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcs(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldLine(line: string): string {
  // RFC5545: lines must be <=75 octets; fold with CRLF + space.
  const out: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    out.push(remaining.slice(0, 75));
    remaining = " " + remaining.slice(75);
  }
  out.push(remaining);
  return out.join("\r\n");
}

type ReservationRow = {
  id: string;
  event_name: string | null;
  venue: string | null;
  address: string | null;
  note: string | null;
  status: string | null;
  load_at: string | null;
  depart_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  return_at: string | null;
  available_from_at: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  updated_at: string | null;
  created_at: string | null;
  quote_group_id: string | null;
  clients: { company_name: string | null } | null;
  reservation_items: { qty: number | null; furniture_items: { name: string | null } | null }[] | null;
};

function buildIcs(
  reservations: ReservationRow[],
  owner: string,
  extrasByGroup?: Map<string, IcsExtraRow[]>,
): string {
  const now = toIcsDate(new Date().toISOString())!;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mima Production//CRM//SK",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Mima Production CRM – ${escapeIcs(owner)}`,
    "X-WR-TIMEZONE:Europe/Bratislava",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const r of reservations) {
    // Build sub-events per reservation so each milestone shows up.
    const client = r.clients?.company_name ?? "";
    const title = r.event_name ?? "Rezervácia";
    const statusLabel = STATUS_LABEL[r.status ?? ""] ?? r.status ?? "";
    const location = [r.venue, r.address].filter(Boolean).join(", ");
    const itemsBlock = formatReservationItems(r.reservation_items);
    const extrasBlock = formatExtraItems(
      r.quote_group_id ? extrasByGroup?.get(r.quote_group_id) : null,
    );
    const descParts = [
      client ? `Klient: ${client}` : null,
      statusLabel ? `Stav: ${statusLabel}` : null,
      r.contact_person ? `Kontakt: ${r.contact_person}` : null,
      r.phone ? `Tel.: ${r.phone}` : null,
      r.email ? `Email: ${r.email}` : null,
      r.load_at ? `Nakládka: ${formatHuman(r.load_at)}` : null,
      r.depart_at ? `Odchod: ${formatHuman(r.depart_at)}` : null,
      r.event_start_at ? `Začiatok eventu: ${formatHuman(r.event_start_at)}` : null,
      r.event_end_at ? `Koniec eventu: ${formatHuman(r.event_end_at)}` : null,
      r.return_at ? `Návrat: ${formatHuman(r.return_at)}` : null,
      r.available_from_at ? `Dostupné od: ${formatHuman(r.available_from_at)}` : null,
      // Čo sa na akciu vezie — pri nakládke to je to hlavné, čo z kalendára treba.
      itemsBlock ? `\n${itemsBlock}` : null,
      extrasBlock ? `\n${extrasBlock}` : null,
      r.note ? `\nPoznámka: ${r.note}` : null,
    ].filter(Boolean);
    const description = descParts.join("\n");
    const stamp = toIcsDate(r.updated_at ?? r.created_at ?? new Date().toISOString())!;

    // Main event spans the actual event time (fallback to load → return window).
    const mainStart = r.event_start_at ?? r.load_at;
    const mainEnd = r.event_end_at ?? r.return_at ?? r.available_from_at;
    const eventBlock = makeBlock({
      uid: `${r.id}@mimaproduction-crm`,
      stamp,
      start: mainStart,
      end: mainEnd,
      summary: `${title}${client ? ` – ${client}` : ""}`,
      description,
      location,
    });
    if (eventBlock) lines.push(...eventBlock);

    // Loading milestone (short marker)
    if (r.load_at && r.depart_at) {
      const block = makeBlock({
        uid: `${r.id}-load@mimaproduction-crm`,
        stamp,
        start: r.load_at,
        end: r.depart_at,
        summary: `🚚 Nakládka: ${title}`,
        description,
        location,
      });
      if (block) lines.push(...block);
    }
    // Return milestone
    if (r.return_at && r.available_from_at) {
      const block = makeBlock({
        uid: `${r.id}-return@mimaproduction-crm`,
        stamp,
        start: r.return_at,
        end: r.available_from_at,
        summary: `📦 Návrat: ${title}`,
        description,
        location,
      });
      if (block) lines.push(...block);
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function makeBlock(input: {
  uid: string;
  stamp: string;
  start: string | null;
  end: string | null;
  summary: string;
  description: string;
  location: string;
}): string[] | null {
  const dtStart = toIcsDate(input.start);
  if (!dtStart) return null;
  const dtEnd = toIcsDate(input.end) ?? dtStart;
  return [
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${input.stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(input.summary)}`,
    `DESCRIPTION:${escapeIcs(input.description)}`,
    input.location ? `LOCATION:${escapeIcs(input.location)}` : "",
    "END:VEVENT",
  ].filter(Boolean);
}

function formatHuman(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("sk-SK", { timeZone: "Europe/Bratislava" });
}