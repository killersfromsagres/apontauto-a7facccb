
CREATE POLICY "corretiva_fotos_bucket_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'corretiva-fotos');
CREATE POLICY "corretiva_fotos_bucket_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'corretiva-fotos');
CREATE POLICY "corretiva_fotos_bucket_delete_admin" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'corretiva-fotos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
