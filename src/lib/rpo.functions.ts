import { createServerFn } from "@tanstack/react-start";

export type RpoCompany = {
  ico: string;
  name: string;
  street: string | null;
  buildingNumber: string | null;
  postalCode: string | null;
  municipality: string | null;
  country: string | null;
  addressLine: string;
  legalForm: string | null;
};

function isCurrent(v: { validFrom?: string; validTo?: string }) {
  return !v.validTo;
}

function pickCurrent<T extends { validFrom?: string; validTo?: string }>(arr: T[] | undefined): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr.find(isCurrent) ?? arr[arr.length - 1];
}

function mapResult(r: any): RpoCompany {
  const idObj = pickCurrent(r.identifiers) ?? r.identifiers?.[0];
  const nameObj = pickCurrent(r.fullNames) ?? r.fullNames?.[0];
  const addr = pickCurrent(r.addresses) ?? r.addresses?.[0];
  const legal = (pickCurrent(r.legalForms) as any)?.value?.value ?? null;
  const street = addr?.street ?? null;
  const buildingNumber = addr?.buildingNumber != null ? String(addr.buildingNumber) : null;
  const postal = addr?.postalCodes?.[0] ?? null;
  const municipality = addr?.municipality?.value ?? null;
  const country = addr?.country?.value ?? null;
  const streetLine = [street, buildingNumber && buildingNumber !== "0" ? buildingNumber : null].filter(Boolean).join(" ");
  const cityLine = [postal, municipality].filter(Boolean).join(" ");
  const addressLine = [streetLine, cityLine, country && country !== "Slovenská republika" ? country : null].filter(Boolean).join(", ");
  return {
    ico: idObj?.value ?? "",
    name: nameObj?.value ?? "",
    street,
    buildingNumber,
    postalCode: postal,
    municipality,
    country,
    addressLine,
    legalForm: legal,
  };
}

async function fetchWithTimeout(url: string, ms = 8000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`RPO API vrátilo ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export const lookupCompanyByIco = createServerFn({ method: "GET" })
  .inputValidator((data: { ico: string }) => {
    const ico = String(data?.ico ?? "").replace(/\s+/g, "");
    if (!/^\d{8}$/.test(ico)) throw new Error("IČO musí obsahovať 8 číslic");
    return { ico };
  })
  .handler(async ({ data }): Promise<RpoCompany | null> => {
    const json = await fetchWithTimeout(`https://api.statistics.sk/rpo/v1/search?identifier=${data.ico}`);
    const first = json?.results?.[0];
    return first ? mapResult(first) : null;
  });

export const searchCompaniesByName = createServerFn({ method: "GET" })
  .inputValidator((data: { query: string }) => {
    const query = String(data?.query ?? "").trim();
    if (query.length < 3) throw new Error("Zadajte aspoň 3 znaky");
    return { query };
  })
  .handler(async ({ data }): Promise<RpoCompany[]> => {
    const url = `https://api.statistics.sk/rpo/v1/search?fullName=${encodeURIComponent(data.query)}`;
    const json = await fetchWithTimeout(url);
    const results: any[] = Array.isArray(json?.results) ? json.results : [];
    return results.slice(0, 20).map(mapResult).filter((r) => r.ico && r.name);
  });