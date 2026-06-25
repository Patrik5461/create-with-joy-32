
CREATE POLICY "Authenticated read furniture photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'furniture-photos');
CREATE POLICY "Admin/Warehouse upload furniture photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'furniture-photos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'warehouse')));
CREATE POLICY "Admin/Warehouse update furniture photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'furniture-photos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'warehouse')));
CREATE POLICY "Admin/Warehouse delete furniture photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'furniture-photos' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'warehouse')));
