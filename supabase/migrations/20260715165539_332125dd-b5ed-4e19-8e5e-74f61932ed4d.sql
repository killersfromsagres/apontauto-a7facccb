
-- 1) legal_items: novos campos
ALTER TABLE public.legal_items
  ADD COLUMN IF NOT EXISTS empresa TEXT,
  ADD COLUMN IF NOT EXISTS agendamento DATE,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS meses_status JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) execuções
CREATE TABLE IF NOT EXISTS public.legal_item_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.legal_items(id) ON DELETE CASCADE,
  data_execucao DATE NOT NULL,
  observacao TEXT,
  executado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_item_executions TO authenticated;
GRANT ALL ON public.legal_item_executions TO service_role;

ALTER TABLE public.legal_item_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Executions readable by authenticated" ON public.legal_item_executions;
CREATE POLICY "Executions readable by authenticated" ON public.legal_item_executions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Executions insertable by authenticated" ON public.legal_item_executions;
CREATE POLICY "Executions insertable by authenticated" ON public.legal_item_executions
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Executions updatable by authenticated" ON public.legal_item_executions;
CREATE POLICY "Executions updatable by authenticated" ON public.legal_item_executions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Executions deletable by authenticated" ON public.legal_item_executions;
CREATE POLICY "Executions deletable by authenticated" ON public.legal_item_executions
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_legal_exec_item ON public.legal_item_executions(item_id);
CREATE INDEX IF NOT EXISTS idx_legal_exec_data ON public.legal_item_executions(data_execucao);

-- 3) anexos
CREATE TABLE IF NOT EXISTS public.legal_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.legal_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_item_attachments TO authenticated;
GRANT ALL ON public.legal_item_attachments TO service_role;

ALTER TABLE public.legal_item_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attachments readable by authenticated" ON public.legal_item_attachments;
CREATE POLICY "Attachments readable by authenticated" ON public.legal_item_attachments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Attachments insertable by authenticated" ON public.legal_item_attachments;
CREATE POLICY "Attachments insertable by authenticated" ON public.legal_item_attachments
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Attachments deletable by authenticated" ON public.legal_item_attachments;
CREATE POLICY "Attachments deletable by authenticated" ON public.legal_item_attachments
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_legal_att_item ON public.legal_item_attachments(item_id);

-- 4) políticas de storage para o bucket legal-certificates
DROP POLICY IF EXISTS "Legal certs read auth" ON storage.objects;
CREATE POLICY "Legal certs read auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'legal-certificates');
DROP POLICY IF EXISTS "Legal certs insert auth" ON storage.objects;
CREATE POLICY "Legal certs insert auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'legal-certificates');
DROP POLICY IF EXISTS "Legal certs update auth" ON storage.objects;
CREATE POLICY "Legal certs update auth" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'legal-certificates') WITH CHECK (bucket_id = 'legal-certificates');
DROP POLICY IF EXISTS "Legal certs delete auth" ON storage.objects;
CREATE POLICY "Legal certs delete auth" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'legal-certificates');

-- Suporta a nova periodicidade "trimestral" mencionada na planilha
-- (a coluna é TEXT, portanto não precisa alterar tipo; documento aqui apenas).
