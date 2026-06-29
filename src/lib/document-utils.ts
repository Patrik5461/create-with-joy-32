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