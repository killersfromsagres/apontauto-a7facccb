-- ============ 9.1 Tipos de bag ============
CREATE TABLE public.agua_bag_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  capacidade_label text,
  capacidade_litros numeric,
  unidade text NOT NULL DEFAULT 'un',
  estoque_atual integer NOT NULL DEFAULT 0,
  estoque_minimo integer NOT NULL DEFAULT 0,
  local_armazenamento text,
  fornecedor text,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agua_bag_tipos_codigo_uniq ON public.agua_bag_tipos (upper(btrim(codigo)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_bag_tipos TO authenticated;
GRANT ALL ON public.agua_bag_tipos TO service_role;
ALTER TABLE public.agua_bag_tipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_bag_tipos_select" ON public.agua_bag_tipos FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_bag_tipos_insert" ON public.agua_bag_tipos FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_bag_tipos_update" ON public.agua_bag_tipos FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_bag_tipos_delete" ON public.agua_bag_tipos FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_bag_tipos_touch BEFORE UPDATE ON public.agua_bag_tipos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ 9.2 Movimentações ============
CREATE TABLE public.agua_bag_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bag_tipo_id uuid NOT NULL REFERENCES public.agua_bag_tipos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN (
    'carga_rota','entrega','recolhimento_vazia','retorno',
    'perda','avaria','ajuste','entrada_fornecedor'
  )),
  quantidade integer NOT NULL CHECK (quantidade > 0),
  rota_id uuid REFERENCES public.agua_rotas(id) ON DELETE SET NULL,
  visita_id uuid REFERENCES public.agua_visitas(id) ON DELETE SET NULL,
  ponto_id uuid REFERENCES public.agua_pontos(id) ON DELETE SET NULL,
  veiculo text,
  responsavel text,
  motivo text,
  origem text NOT NULL DEFAULT 'app' CHECK (origem IN ('app','offline','importacao','automatico')),
  idempotency_key text,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid NOT NULL DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agua_bag_mov_idem_uniq ON public.agua_bag_movimentos (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX agua_bag_mov_data_idx ON public.agua_bag_movimentos (ocorrido_em DESC);
CREATE INDEX agua_bag_mov_rota_idx ON public.agua_bag_movimentos (rota_id);
CREATE INDEX agua_bag_mov_tipo_idx ON public.agua_bag_movimentos (bag_tipo_id, tipo);

GRANT SELECT, INSERT ON public.agua_bag_movimentos TO authenticated;
GRANT ALL ON public.agua_bag_movimentos TO service_role;
ALTER TABLE public.agua_bag_movimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_bag_mov_select" ON public.agua_bag_movimentos FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_bag_mov_insert" ON public.agua_bag_movimentos FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid() AND (public.agua_can('create') OR public.agua_can('update') OR public.agua_is_gestor()));

-- Estoque é derivado das movimentações (append-only).
CREATE OR REPLACE FUNCTION public.tg_agua_bag_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE delta integer;
BEGIN
  delta := CASE NEW.tipo
    WHEN 'entrada_fornecedor' THEN NEW.quantidade
    WHEN 'retorno' THEN NEW.quantidade
    WHEN 'recolhimento_vazia' THEN NEW.quantidade
    WHEN 'ajuste' THEN NEW.quantidade
    WHEN 'carga_rota' THEN -NEW.quantidade
    WHEN 'entrega' THEN -NEW.quantidade
    WHEN 'perda' THEN -NEW.quantidade
    WHEN 'avaria' THEN -NEW.quantidade
    ELSE 0 END;
  UPDATE public.agua_bag_tipos
     SET estoque_atual = estoque_atual + delta,
         atualizado_em = now()
   WHERE id = NEW.bag_tipo_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agua_bag_mov_estoque AFTER INSERT ON public.agua_bag_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_bag_estoque();

-- ============ 10. Evidências (metadados apenas) ============
CREATE TABLE public.agua_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid REFERENCES public.agua_rotas(id) ON DELETE SET NULL,
  visita_id uuid REFERENCES public.agua_visitas(id) ON DELETE SET NULL,
  ponto_id uuid REFERENCES public.agua_pontos(id) ON DELETE SET NULL,
  filtro_solicitacao_id uuid REFERENCES public.agua_filtro_solicitacoes(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'entrega',
  image_url text NOT NULL,
  thumbnail_url text,
  image_hash text,
  mime_type text,
  largura integer,
  altura integer,
  size_bytes integer,
  capturada_em timestamptz,
  enviada_em timestamptz NOT NULL DEFAULT now(),
  enviada_por uuid NOT NULL DEFAULT auth.uid(),
  origem text NOT NULL DEFAULT 'app',
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agua_fotos_rota_idx ON public.agua_fotos (rota_id);
CREATE INDEX agua_fotos_visita_idx ON public.agua_fotos (visita_id);
CREATE INDEX agua_fotos_data_idx ON public.agua_fotos (enviada_em DESC);
CREATE UNIQUE INDEX agua_fotos_hash_visita_uniq ON public.agua_fotos (visita_id, image_hash) WHERE image_hash IS NOT NULL AND visita_id IS NOT NULL;

GRANT SELECT, INSERT ON public.agua_fotos TO authenticated;
GRANT UPDATE, DELETE ON public.agua_fotos TO service_role;
GRANT ALL ON public.agua_fotos TO service_role;
ALTER TABLE public.agua_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_fotos_select" ON public.agua_fotos FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_fotos_insert" ON public.agua_fotos FOR INSERT TO authenticated
  WITH CHECK (enviada_por = auth.uid() AND (public.agua_can('create') OR public.agua_can('update') OR public.agua_is_gestor()));
CREATE POLICY "agua_fotos_delete" ON public.agua_fotos FOR DELETE TO authenticated USING (public.agua_is_gestor());

-- ============ 11. Compartilhamentos WhatsApp ============
CREATE TABLE public.agua_whatsapp_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo_tipo text NOT NULL CHECK (escopo_tipo IN ('rota','predio','parada','selecao')),
  escopo_id text,
  modo text NOT NULL DEFAULT 'nativo' CHECK (modo IN ('nativo','link','cloud_api')),
  destinatario_mascarado text,
  destinatario_hash text,
  mensagem_versao text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'compartilhamento_iniciado'
    CHECK (status IN ('compartilhamento_iniciado','confirmado_pelo_usuario','enviado','entregue','lido','falha','cancelado')),
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  qtd_fotos integer NOT NULL DEFAULT 0,
  iniciado_por uuid NOT NULL DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  entregue_em timestamptz,
  lido_em timestamptz
);
CREATE INDEX agua_wa_escopo_idx ON public.agua_whatsapp_envios (escopo_tipo, escopo_id);
CREATE INDEX agua_wa_data_idx ON public.agua_whatsapp_envios (criado_em DESC);

GRANT SELECT, INSERT, UPDATE ON public.agua_whatsapp_envios TO authenticated;
GRANT ALL ON public.agua_whatsapp_envios TO service_role;
ALTER TABLE public.agua_whatsapp_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_wa_select" ON public.agua_whatsapp_envios FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_wa_insert" ON public.agua_whatsapp_envios FOR INSERT TO authenticated
  WITH CHECK (iniciado_por = auth.uid() AND public.agua_can('read'));
CREATE POLICY "agua_wa_update" ON public.agua_whatsapp_envios FOR UPDATE TO authenticated
  USING (iniciado_por = auth.uid() OR public.agua_is_gestor())
  WITH CHECK (iniciado_por = auth.uid() OR public.agua_is_gestor());

-- Tipos de bag iniciais
INSERT INTO public.agua_bag_tipos (codigo, nome, capacidade_label, capacidade_litros, estoque_atual, estoque_minimo, local_armazenamento)
VALUES
  ('BAG20', 'Bag 20 litros', '20 L', 20, 0, 20, 'Almoxarifado Central'),
  ('BAG10', 'Bag 10 litros', '10 L', 10, 0, 10, 'Almoxarifado Central');