/**
 * Server-only utilities pre helper (PIN) session.
 *
 * HMAC-SHA256 token cez WebCrypto — funguje na Cloudflare Workers aj Node.
 * Nikdy neimportuj z klienta.
 */

const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hodín

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.HELPER_SESSION_SECRET;
  if (!secret) throw new Error("HELPER_SESSION_SECRET nie je nastavený");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type HelperTokenPayload = {
  h: string; // helper_id
  n?: string; // name (informative)
  iat: number;
  exp: number;
};

export async function signHelperToken(helperId: string, name: string | null): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: HelperTokenPayload = {
    h: helperId,
    n: name ?? undefined,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyHelperToken(token: string | null | undefined): Promise<HelperTokenPayload | null> {
  if (!token || typeof token !== "string") return null;
  const [body, sigPart] = token.split(".");
  if (!body || !sigPart) return null;
  try {
    const key = await hmacKey();
    const sigBytes = b64urlDecode(sigPart);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      new TextEncoder().encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as HelperTokenPayload;
    if (!payload || typeof payload.h !== "string") return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Best-effort in-memory rate limit (per worker instance). */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) return false;
  return true;
}

export function generateNumericPin(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += (bytes[i] % 10).toString();
  return out;
}