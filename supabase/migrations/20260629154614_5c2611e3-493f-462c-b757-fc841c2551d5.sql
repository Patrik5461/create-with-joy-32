
-- RLS policies for warehouse-backups bucket: authenticated users can list/read; service role manages writes
CREATE POLICY "Authenticated can read warehouse backups"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'warehouse-backups');
