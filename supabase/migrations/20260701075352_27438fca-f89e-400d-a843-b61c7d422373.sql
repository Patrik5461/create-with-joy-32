CREATE POLICY "Authenticated can mirror photos to backups"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'warehouse-backups'
  AND (storage.foldername(name))[1] = 'photos'
);