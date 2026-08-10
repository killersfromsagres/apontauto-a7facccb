-- Metadados de controle de materiais (peças e defeitos de Refrigeração/Corretiva)
CREATE TABLE public.controle_materiais_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL CHECK (origem IN ('refrigeracao','corretiva')),
  tipo text NOT NULL CHECK (tipo IN ('peca','problema')),
  item_id uuid NOT NULL,
  centro_custo text,
  numero_requisicao text,
  fornecedor text,
  valor_estimado numeric,
  status_compra text NOT NULL DEFAULT 'aguardando' CHECK (status_compra IN ('aguardando','solicitado','em_cotacao','comprado','recebido','cancelado')),
  data_solicitacao_facilities timestamptz,
  solicitado_por text,
  observacao text,
  atualizado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origem, tipo, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_materiais_meta TO authenticated;
GRANT ALL ON public.controle_materiais_meta TO service_role;
ALTER TABLE public.controle_materiais_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados gerenciam controle de materiais"
  ON public.controle_materiais_meta FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_controle_materiais_meta_updated_at
BEFORE UPDATE ON public.controle_materiais_meta
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Cadastro de centros de custo (preenchimento manual pelo usuário de controle)
CREATE TABLE public.controle_centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  descricao text,
  responsavel text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_centros_custo TO authenticated;
GRANT ALL ON public.controle_centros_custo TO service_role;
ALTER TABLE public.controle_centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados gerenciam centros de custo"
  ON public.controle_centros_custo FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_controle_centros_custo_updated_at
BEFORE UPDATE ON public.controle_centros_custo
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Histórico imutável de envios para Facilities (comprovação de data)
CREATE TABLE public.controle_envios_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  centro_custo text,
  destinatario text,
  canal text,
  observacao text,
  total_itens integer NOT NULL DEFAULT 0,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.controle_envios_facilities TO authenticated;
GRANT ALL ON public.controle_envios_facilities TO service_role;
ALTER TABLE public.controle_envios_facilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem envios" ON public.controle_envios_facilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados registram envios" ON public.controle_envios_facilities FOR INSERT TO authenticated WITH CHECK (true);