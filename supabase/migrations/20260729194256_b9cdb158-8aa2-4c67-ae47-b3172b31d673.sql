ALTER TABLE public.agua_pontos
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS frequencia text,
  ADD COLUMN IF NOT EXISTS bag_tipo text,
  ADD COLUMN IF NOT EXISTS bag_capacidade_litros numeric,
  ADD COLUMN IF NOT EXISTS estoque_minimo integer,
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS tempo_estimado_min integer,
  ADD COLUMN IF NOT EXISTS contato_telefone text,
  ADD COLUMN IF NOT EXISTS acesso_observacoes text,
  ADD COLUMN IF NOT EXISTS requer_epi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS epi_descricao text,
  ADD COLUMN IF NOT EXISTS veiculo_recomendado text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS imagem_url text,
  ADD COLUMN IF NOT EXISTS qr_code text,
  ADD COLUMN IF NOT EXISTS criado_por uuid,
  ADD COLUMN IF NOT EXISTS atualizado_por uuid,
  ADD COLUMN IF NOT EXISTS mesclado_em timestamptz,
  ADD COLUMN IF NOT EXISTS mesclado_para uuid REFERENCES public.agua_pontos(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agua_pontos_local_uniq
  ON public.agua_pontos (upper(btrim(predio)), upper(btrim(andar)), upper(btrim(espaco)));

CREATE TABLE IF NOT EXISTS public.agua_ponto_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_id uuid NOT NULL,
  destino_id uuid NOT NULL,
  origem_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  destino_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.agua_ponto_merges TO authenticated;
GRANT ALL ON public.agua_ponto_merges TO service_role;

ALTER TABLE public.agua_ponto_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_merges_select" ON public.agua_ponto_merges
  FOR SELECT TO authenticated USING (public.agua_can('read'));

CREATE POLICY "agua_merges_insert" ON public.agua_ponto_merges
  FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());