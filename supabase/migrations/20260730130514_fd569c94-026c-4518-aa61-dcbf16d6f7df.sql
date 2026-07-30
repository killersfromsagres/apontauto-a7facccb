CREATE POLICY "agua_fotos_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agua-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "agua_fotos_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agua-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "agua_fotos_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agua-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE UNIQUE INDEX IF NOT EXISTS agua_prog_entregas_ponto_data_key
  ON public.agua_prog_entregas (ponto_id, data);