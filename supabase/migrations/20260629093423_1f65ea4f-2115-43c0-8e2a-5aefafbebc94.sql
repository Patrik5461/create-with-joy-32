
DROP POLICY IF EXISTS "auth insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "auth update quotes" ON public.quotes;
DROP POLICY IF EXISTS "auth delete quotes" ON public.quotes;
DROP POLICY IF EXISTS "auth insert quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "auth update quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "auth delete quote_items" ON public.quote_items;

CREATE POLICY "quotes_insert_mgr_admin" ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "quotes_update_mgr_admin" ON public.quotes FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "quotes_delete_admin" ON public.quotes FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "quote_items_insert_mgr_admin" ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "quote_items_update_mgr_admin" ON public.quote_items FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "quote_items_delete_mgr_admin" ON public.quote_items FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role));
