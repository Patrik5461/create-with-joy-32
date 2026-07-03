
-- =========================================================
-- CONTRACTS: restrict write to admin/manager
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert contracts" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated can update contracts" ON public.contracts;

CREATE POLICY "Admins/managers can insert contracts" ON public.contracts
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins/managers can update contracts" ON public.contracts
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

-- =========================================================
-- PROTOCOLS: restrict write to admin/manager/warehouse
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert protocols" ON public.protocols;
DROP POLICY IF EXISTS "Authenticated can update protocols" ON public.protocols;

CREATE POLICY "Staff can insert protocols" ON public.protocols
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  );

CREATE POLICY "Staff can update protocols" ON public.protocols
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  );

-- =========================================================
-- PROTOCOL_ITEMS: restrict write to admin/manager/warehouse
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert protocol_items" ON public.protocol_items;
DROP POLICY IF EXISTS "Authenticated can update protocol_items" ON public.protocol_items;
DROP POLICY IF EXISTS "Authenticated can delete protocol_items" ON public.protocol_items;

CREATE POLICY "Staff can insert protocol_items" ON public.protocol_items
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  );

CREATE POLICY "Staff can update protocol_items" ON public.protocol_items
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  );

CREATE POLICY "Staff can delete protocol_items" ON public.protocol_items
  FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  );

-- =========================================================
-- VEHICLES: restrict write to admin/manager
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated can delete vehicles" ON public.vehicles;

CREATE POLICY "Admins/managers can insert vehicles" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins/managers can update vehicles" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins/managers can delete vehicles" ON public.vehicles
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

-- =========================================================
-- INQUIRIES: add explicit admin/manager insert policy
-- Public submissions go through the backend (service role) which bypasses RLS.
-- =========================================================
CREATE POLICY "Admins/managers can insert inquiries" ON public.inquiries
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

-- =========================================================
-- CONVERSATION_PARTICIPANTS: only self-insert
-- Direct conversation creation happens via SECURITY DEFINER RPC that inserts
-- participants server-side, so tightening this policy does not break UX.
-- =========================================================
DROP POLICY IF EXISTS "insert participant (self or to direct conv)" ON public.conversation_participants;

CREATE POLICY "insert only self participant" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =========================================================
-- STORAGE chat-attachments: restrict read to conversation participants
-- Requires uploads to use path "<conversation_id>/<...>"
-- =========================================================
DROP POLICY IF EXISTS "chat-attachments authenticated read" ON storage.objects;

CREATE POLICY "chat-attachments participant read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      owner = auth.uid()
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_conversation_participant(((storage.foldername(name))[1])::uuid, auth.uid())
      )
    )
  );

-- =========================================================
-- SECURITY DEFINER functions: revoke public EXECUTE
-- =========================================================
-- Trigger functions: no one needs direct EXECUTE
REVOKE ALL ON FUNCTION public.add_profile_to_global_chat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_advance_reservation_on_quote() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_reservation_status_change() FROM PUBLIC, anon, authenticated;

-- Helper functions used by RLS: authenticated needs EXECUTE, anon does not
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;

-- RPC callable by signed-in users only
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;
