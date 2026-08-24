-- Helper RPC funkcie majú byť volateľné IBA service-role klientom zo server
-- funkcií (src/lib/helper.functions.ts). Živá databáza mala napriek pôvodnej
-- migrácii `anon` aj `authenticated` s EXECUTE — čím sa dal obísť celý PIN
-- a HMAC token flow priamym volaním /rest/v1/rpc/*.
--
-- Overené v logoch: za 24 h tieto funkcie volal výhradne service_role
-- (helper_status 9x, verify_helper_pin 4x, helper_punch 4x). Web (mimapro.sk)
-- ich nevolá vôbec, beží len nad anon a verejnými tabuľkami.

REVOKE EXECUTE ON FUNCTION public.helper_punch(uuid, text)      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_helper_pin(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hash_helper_pin(uuid, text)   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.helper_status(uuid)           FROM anon, authenticated;

-- has_permission() sa vyhodnocuje vnútri RLS politík, ktoré cielia na
-- `authenticated` — tomu EXECUTE zostáva. Anonymný prístup k nej dôvod nemá,
-- žiadna verejná politika (galleries, site_settings, site_slides,
-- web_visibility, gallery_images, insert do inquiries) ju nepoužíva.
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, public.app_permission) FROM anon;

-- Poznámka pre budúcnosť: Supabase má na schéme public nastavené
-- ALTER DEFAULT PRIVILEGES, ktoré novým funkciám EXECUTE pre anon/authenticated
-- vracia. Po každom DROP + CREATE týchto funkcií treba REVOKE zopakovať.
