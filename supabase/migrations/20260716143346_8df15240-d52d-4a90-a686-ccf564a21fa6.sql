
CREATE POLICY "talude-maps own or admin select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'talude-maps' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "talude-maps own or admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'talude-maps' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "talude-maps own or admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'talude-maps' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "talude-maps own or admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'talude-maps' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  ));
