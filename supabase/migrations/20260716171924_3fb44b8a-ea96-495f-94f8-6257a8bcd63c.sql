
-- assets_ref
CREATE TABLE public.assets_ref (
  ativo TEXT PRIMARY KEY,
  denominacao TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets_ref TO authenticated;
GRANT ALL ON public.assets_ref TO service_role;
ALTER TABLE public.assets_ref ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_ref auth read"  ON public.assets_ref FOR SELECT TO authenticated USING (true);
CREATE POLICY "assets_ref auth write" ON public.assets_ref FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- backorder_os
CREATE TABLE public.backorder_os (
  os TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  ativo TEXT NOT NULL DEFAULT '',
  predio TEXT NOT NULL DEFAULT '',
  andar TEXT NOT NULL DEFAULT '',
  espaco TEXT NOT NULL DEFAULT '',
  atividade TEXT NOT NULL DEFAULT 'Outros Serviços',
  atividade_manual BOOLEAN NOT NULL DEFAULT false,
  equipe TEXT NOT NULL DEFAULT '',
  termino_sla TIMESTAMPTZ,
  data_solicitacao TIMESTAMPTZ NOT NULL,
  outros TEXT NOT NULL DEFAULT '',
  finalizado BOOLEAN NOT NULL DEFAULT false,
  data_finalizacao TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backorder_os TO authenticated;
GRANT ALL ON public.backorder_os TO service_role;
ALTER TABLE public.backorder_os ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backorder_os auth read"  ON public.backorder_os FOR SELECT TO authenticated USING (true);
CREATE POLICY "backorder_os auth write" ON public.backorder_os FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX backorder_os_data_solic_idx ON public.backorder_os (data_solicitacao);
CREATE INDEX backorder_os_finalizado_idx ON public.backorder_os (finalizado);

CREATE OR REPLACE FUNCTION public.tg_backorder_os_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;
CREATE TRIGGER backorder_os_touch BEFORE UPDATE ON public.backorder_os
  FOR EACH ROW EXECUTE FUNCTION public.tg_backorder_os_touch();

-- backorder_atividade_override
CREATE TABLE public.backorder_atividade_override (
  os TEXT PRIMARY KEY,
  atividade TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backorder_atividade_override TO authenticated;
GRANT ALL ON public.backorder_atividade_override TO service_role;
ALTER TABLE public.backorder_atividade_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backorder_ovr auth read"  ON public.backorder_atividade_override FOR SELECT TO authenticated USING (true);
CREATE POLICY "backorder_ovr auth write" ON public.backorder_atividade_override FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER backorder_ovr_touch BEFORE UPDATE ON public.backorder_atividade_override
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
