-- Restrict EXECUTE on SECURITY DEFINER functions to least privilege
-- Trigger functions: no role needs direct EXECUTE
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_reservation_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revalidate_reservation_on_time_change() FROM PUBLIC, anon, authenticated;

-- has_role is used inside RLS policies; keep available to authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- check_item_availability is called via RPC by signed-in users only
REVOKE EXECUTE ON FUNCTION public.check_item_availability(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_item_availability(uuid, timestamptz, timestamptz, uuid) TO authenticated;