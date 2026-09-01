/**
 * Testy podpísaného tokenu, ktorým sa brigádnik preukazuje. Odkedy cez neho
 * vidí aj rozpis akcií a hlási sa na ne, je to jediná vec, ktorá stojí medzi
 * cudzím človekom a dátami — musí sedieť.
 */
import { beforeAll, describe, expect, it } from "bun:test";

const SECRET = "test-secret-nech-je-dost-dlhy-123456";

let signHelperToken: typeof import("../src/lib/helper.server").signHelperToken;
let verifyHelperToken: typeof import("../src/lib/helper.server").verifyHelperToken;
let checkRateLimit: typeof import("../src/lib/helper.server").checkRateLimit;

beforeAll(async () => {
  process.env.HELPER_SESSION_SECRET = SECRET;
  ({ signHelperToken, verifyHelperToken, checkRateLimit } = await import("../src/lib/helper.server"));
});

const HELPER_ID = "11111111-2222-3333-4444-555555555555";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Podpíše ľubovoľný payload — nech vieme vyrobiť aj token po expirácii. */
async function signPayload(payload: object, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

describe("token brigádnika", () => {
  it("po podpísaní sa dá overiť a nesie správneho brigádnika", async () => {
    const token = await signHelperToken(HELPER_ID, "Jozef");
    const payload = await verifyHelperToken(token);
    expect(payload?.h).toBe(HELPER_ID);
    expect(payload?.n).toBe("Jozef");
  });

  it("platí osem hodín", async () => {
    const token = await signHelperToken(HELPER_ID, null);
    const p = (await verifyHelperToken(token))!;
    expect(p.exp - p.iat).toBe(8 * 60 * 60);
  });

  it("prepísaný obsah neprejde — nedá sa vydávať za iného brigádnika", async () => {
    const token = await signHelperToken(HELPER_ID, "Jozef");
    const [, sig] = token.split(".");
    const podvrh = b64url(new TextEncoder().encode(JSON.stringify({
      h: "99999999-9999-9999-9999-999999999999",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })));
    expect(await verifyHelperToken(`${podvrh}.${sig}`)).toBeNull();
  });

  it("prepísaný podpis neprejde", async () => {
    const token = await signHelperToken(HELPER_ID, null);
    const [body] = token.split(".");
    expect(await verifyHelperToken(`${body}.${b64url(new Uint8Array(32))}`)).toBeNull();
  });

  it("token podpísaný iným tajomstvom neprejde", async () => {
    const cudzi = await signPayload(
      { h: HELPER_ID, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
      "uplne-ine-tajomstvo",
    );
    expect(await verifyHelperToken(cudzi)).toBeNull();
  });

  it("token po expirácii neprejde", async () => {
    const now = Math.floor(Date.now() / 1000);
    const stary = await signPayload({ h: HELPER_ID, iat: now - 9 * 3600, exp: now - 3600 });
    expect(await verifyHelperToken(stary)).toBeNull();
  });

  it("nezmysly neprejdú a nespadnú", async () => {
    for (const junk of [null, undefined, "", "abc", "a.b.c", "..", "eyJ.x"]) {
      expect(await verifyHelperToken(junk as any)).toBeNull();
    }
  });
});

describe("brzda na opakované pokusy", () => {
  it("po ôsmich pokusoch v minúte zastaví", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 8; i++) expect(checkRateLimit(key)).toBe(true);
    expect(checkRateLimit(key)).toBe(false);
  });

  it("každý brigádnik má vlastný limit", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 9; i++) checkRateLimit(a);
    expect(checkRateLimit(a)).toBe(false);
    expect(checkRateLimit(b)).toBe(true);
  });
});
