CREATE TABLE public.agua_filtro_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'troca',
  prioridade text NOT NULL DEFAULT 'media',
  situacao text NOT NULL DEFAULT 'aberta',
  descricao text,
  foto_url text,
  prevista_para date,
  concluida_em timestamptz,
  atendimento text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agua_filtro_ponto ON public.agua_filtro_solicitacoes(ponto_id);
CREATE INDEX idx_agua_filtro_situacao ON public.agua_filtro_solicitacoes(situacao);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_filtro_solicitacoes TO authenticated;
GRANT ALL ON public.agua_filtro_solicitacoes TO service_role;

ALTER TABLE public.agua_filtro_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_filtro_select" ON public.agua_filtro_solicitacoes
  FOR SELECT TO authenticated USING (public.agua_can('read'));

CREATE POLICY "agua_filtro_insert" ON public.agua_filtro_solicitacoes
  FOR INSERT TO authenticated WITH CHECK (public.agua_can('create'));

CREATE POLICY "agua_filtro_update" ON public.agua_filtro_solicitacoes
  FOR UPDATE TO authenticated USING (public.agua_can('update')) WITH CHECK (public.agua_can('update'));

CREATE POLICY "agua_filtro_delete" ON public.agua_filtro_solicitacoes
  FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER trg_agua_filtro_updated_at
  BEFORE UPDATE ON public.agua_filtro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();