
CREATE TABLE public.taludes_chuva_evidencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL,
  mensagem text NOT NULL,
  imagem_data_url text NOT NULL,
  temperatura numeric,
  condicao text,
  precipitacao_mm numeric,
  prob_chuva numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_taludes_chuva_evid_data ON public.taludes_chuva_evidencias(data DESC);
CREATE INDEX idx_taludes_chuva_evid_created_by ON public.taludes_chuva_evidencias(created_by);

GRANT SELECT, INSERT, DELETE ON public.taludes_chuva_evidencias TO authenticated;
GRANT ALL ON public.taludes_chuva_evidencias TO service_role;

ALTER TABLE public.taludes_chuva_evidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem evidências" ON public.taludes_chuva_evidencias
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados inserem evidências" ON public.taludes_chuva_evidencias
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Autor ou admin remove evidências" ON public.taludes_chuva_evidencias
  FOR DELETE TO authenticated USING (
    auth.uid() = created_by OR public.has_role(auth.uid(), 'admin')
  );
