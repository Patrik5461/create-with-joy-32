
DROP POLICY IF EXISTS "Authenticated staff can insert surveys" ON public.logistics_surveys;
DROP POLICY IF EXISTS "Authenticated staff can update surveys" ON public.logistics_surveys;
DROP POLICY IF EXISTS "Authenticated staff can delete surveys" ON public.logistics_surveys;

CREATE POLICY "surveys_manage" ON public.logistics_surveys FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role) OR private.has_role(auth.uid(),'warehouse'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'manager'::app_role) OR private.has_role(auth.uid(),'warehouse'::app_role));
