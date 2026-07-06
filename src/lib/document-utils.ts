export const COMPANY_INFO = {
  name: "Mima Production",
  tagline: "Eventový nábytok a logistika",
  address: "Mima Production s.r.o.",
  email: "info@mimaproduction.sk",
  web: "mimaproduction.sk",
};

export const DEFAULT_CONTRACT_TERMS = {
  subject:
    "Predmetom prenájmu je dočasné poskytnutie nábytku a vybavenia uvedeného v prílohe tejto zmluvy za odplatu na dohodnutý termín a miesto eventu.",
  duration:
    "Doba prenájmu sa začína v termíne nakládky a končí termínom návratu nábytku do skladu prenajímateľa. Konkrétne termíny sú uvedené v tabuľke nižšie.",
  price:
    "Nájomné je stanovené dohodou zmluvných strán v celkovej sume uvedenej v tejto zmluve (vrátane DPH). Splatnosť je 14 dní od vystavenia faktúry, ak nie je dohodnuté inak. Záloha vo výške 50 % môže byť požadovaná pri potvrdení rezervácie.",
  liability:
    "Nájomca zodpovedá za prenajatý nábytok počas celej doby prenájmu od jeho prevzatia až po vrátenie. Akékoľvek poškodenie, znečistenie alebo strata sa zaznamenajú do preberacieho protokolu a vyúčtujú sa nájomcovi podľa cenníka oprav alebo plnej obstarávacej ceny.",
  return:
    "Nájomca je povinný vrátiť nábytok v dohodnutom termíne, čistý a v nepoškodenom stave. Pri omeškaní s vrátením má prenajímateľ právo účtovať poplatok vo výške denného nájmu za každý začatý deň omeškania.",
};

export type ContractTerms = typeof DEFAULT_CONTRACT_TERMS;

export function formatDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short" });
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("sk-SK");
}

export function formatEur(n: number | null | undefined): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}

/**
 * Zjednotené poradie údajov odberateľa (klienta) pre všetky generované dokumenty.
 * 1. Názov firmy  2. Adresa  3. IČO / DIČ / IČ DPH  4. Kontaktná osoba (+pozícia)  5. Email  6. Telefón
 * Chýbajúce údaje sa vynechávajú.
 */
export type ClientLine = { text: string; bold?: boolean };

export function buildClientLines(
  client: any,
  contact?: any,
  overrides?: { email?: string | null; phone?: string | null; contactName?: string | null },
): ClientLine[] {
  const c = client ?? {};
  const lines: ClientLine[] = [];
  if (c.company_name) lines.push({ text: String(c.company_name), bold: true });
  if (c.address) lines.push({ text: String(c.address) });
  if (c.ico) lines.push({ text: `IČO: ${c.ico}` });
  if (c.dic) lines.push({ text: `DIČ: ${c.dic}` });
  if (c.ic_dph) lines.push({ text: `IČ DPH: ${c.ic_dph}` });
  const contactName = overrides?.contactName ?? contact?.full_name ?? c.contact_person ?? null;
  const contactRole = contact?.role ?? null;
  if (contactName) {
    lines.push({ text: contactRole ? `${contactName} · ${contactRole}` : String(contactName) });
  }
  const email = overrides?.email ?? contact?.email ?? c.email ?? null;
  if (email) lines.push({ text: String(email) });
  const phone = overrides?.phone ?? contact?.phone ?? c.phone ?? null;
  if (phone) lines.push({ text: String(phone) });
  return lines;
}

/**
 * Zjednotené poradie údajov DODÁVATEĽA na dokumentoch:
 * 1. Názov  2. Adresa  3. IČO / DIČ / IČ DPH  4. Kontaktná osoba  5. Telefón  6. Email  7. IBAN
 */
export function buildCompanyLines(company: any | null | undefined): ClientLine[] {
  const c = company ?? {};
  const lines: ClientLine[] = [];
  if (c.company_name) lines.push({ text: String(c.company_name), bold: true });
  if (c.address) lines.push({ text: String(c.address) });
  if (c.ico) lines.push({ text: `IČO: ${c.ico}` });
  if (c.dic) lines.push({ text: `DIČ: ${c.dic}` });
  if (c.ic_dph) lines.push({ text: `IČ DPH: ${c.ic_dph}` });
  if (c.contact_person) lines.push({ text: String(c.contact_person) });
  if (c.phone) lines.push({ text: `Tel: ${c.phone}` });
  if (c.email) lines.push({ text: String(c.email) });
  if (c.iban) lines.push({ text: `IBAN: ${c.iban}` });
  return lines;
}