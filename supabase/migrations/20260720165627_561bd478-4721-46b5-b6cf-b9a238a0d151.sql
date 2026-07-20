
CREATE TABLE public.preventiva_ac_registros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag TEXT NOT NULL,
  tipo_equipamento TEXT,
  marca TEXT,
  modelo TEXT,
  numero_serie TEXT,
  capacidade_btu NUMERIC,
  fluido_refrigerante TEXT,
  ano_fabricacao INTEGER,
  data_instalacao DATE,
  predio TEXT,
  andar TEXT,
  local TEXT,
  ambiente TEXT,
  area_climatizada NUMERIC,
  ocupacao_max INTEGER,
  fabricante TEXT,
  responsavel_tecnico TEXT,
  data_manutencao DATE,
  tipo_servico TEXT,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  medicoes JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacoes TEXT,
  colaborador TEXT,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preventiva_ac_registros TO authenticated;
GRANT ALL ON public.preventiva_ac_registros TO service_role;

ALTER TABLE public.preventiva_ac_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preventiva_ac_select"
  ON public.preventiva_ac_registros FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.allowed_menus IS NOT NULL
        AND 'preventiva-ac' = ANY(p.allowed_menus)
    )
  );

CREATE POLICY "preventiva_ac_insert"
  ON public.preventiva_ac_registros FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.allowed_menus IS NOT NULL
        AND 'preventiva-ac' = ANY(p.allowed_menus)
    )
  );

CREATE POLICY "preventiva_ac_update"
  ON public.preventiva_ac_registros FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR criado_por = auth.uid()
  );

CREATE POLICY "preventiva_ac_delete"
  ON public.preventiva_ac_registros FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR criado_por = auth.uid()
  );

CREATE TRIGGER trg_preventiva_ac_updated
  BEFORE UPDATE ON public.preventiva_ac_registros
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_preventiva_ac_tag ON public.preventiva_ac_registros (tag);
CREATE INDEX idx_preventiva_ac_data ON public.preventiva_ac_registros (data_manutencao DESC);
