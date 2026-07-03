/**
 * Base URL for public/absolute links (QR codes, survey links, catalog, emails).
 *
 * Priority:
 *   1. VITE_PUBLIC_APP_URL — set at build time (e.g. https://crm.mimapro.sk)
 *   2. window.location.origin — runtime fallback in the browser
 *   3. "" — empty string on server without env set (last resort)
 */
export function getPublicAppUrl(): string {
  const configured =
    typeof import.meta !== "undefined"
      ? (import.meta as any).env?.VITE_PUBLIC_APP_URL
      : undefined;
  if (configured && typeof configured === "string") {
    return String(configured).replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "";
}

export function publicUrl(path: string): string {
  const base = getPublicAppUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}