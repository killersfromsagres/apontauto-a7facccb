DO $$ BEGIN
  BEGIN CREATE POLICY "talude_maps_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'talude-maps'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "talude_maps_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'talude-maps'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "talude_maps_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'talude-maps'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "talude_maps_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'talude-maps'); EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;