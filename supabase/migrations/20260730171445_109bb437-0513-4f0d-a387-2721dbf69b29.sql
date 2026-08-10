-- ============ Catálogo de materiais ============
CREATE TABLE public.materiais_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  categoria text,
  unidade text NOT NULL DEFAULT 'UN',
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais_catalogo TO authenticated;
GRANT ALL ON public.materiais_catalogo TO service_role;

ALTER TABLE public.materiais_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_select_auth" ON public.materiais_catalogo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogo_insert_admin" ON public.materiais_catalogo
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "catalogo_update_admin" ON public.materiais_catalogo
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "catalogo_delete_admin" ON public.materiais_catalogo
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ Solicitações ============
CREATE SEQUENCE IF NOT EXISTS public.material_solicitacao_seq;

CREATE OR REPLACE FUNCTION public.gen_material_solicitacao_numero()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'SM-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.material_solicitacao_seq')::text, 6, '0');
$$;

CREATE TABLE public.material_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE DEFAULT public.gen_material_solicitacao_numero(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitante text NOT NULL,
  setor text,
  centro_custo text,
  predio text,
  local text,
  prioridade text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'rascunho',
  observacao text,
  enviada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_solicitacoes_prioridade_chk
    CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  CONSTRAINT material_solicitacoes_status_chk
    CHECK (status IN ('rascunho','enviada','em_analise','aprovada','atendida','cancelada'))
);

CREATE INDEX material_solicitacoes_user_idx ON public.material_solicitacoes (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_solicitacoes TO authenticated;
GRANT ALL ON public.material_solicitacoes TO service_role;

ALTER TABLE public.material_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solic_select_own_or_admin" ON public.material_solicitacoes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "solic_insert_own" ON public.material_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "solic_update_own_or_admin" ON public.material_solicitacoes
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'rascunho')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "solic_delete_own_or_admin" ON public.material_solicitacoes
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'rascunho')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ============ Itens ============
CREATE TABLE public.material_solicitacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.material_solicitacoes(id) ON DELETE CASCADE,
  catalogo_id uuid REFERENCES public.materiais_catalogo(id) ON DELETE SET NULL,
  codigo text,
  descricao text NOT NULL,
  unidade text NOT NULL DEFAULT 'UN',
  quantidade numeric NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  justificativa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX material_solicitacao_itens_sol_idx ON public.material_solicitacao_itens (solicitacao_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_solicitacao_itens TO authenticated;
GRANT ALL ON public.material_solicitacao_itens TO service_role;

ALTER TABLE public.material_solicitacao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solic_itens_select" ON public.material_solicitacao_itens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.material_solicitacoes s
    WHERE s.id = solicitacao_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
CREATE POLICY "solic_itens_insert" ON public.material_solicitacao_itens
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.material_solicitacoes s
    WHERE s.id = solicitacao_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
CREATE POLICY "solic_itens_update" ON public.material_solicitacao_itens
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.material_solicitacoes s
    WHERE s.id = solicitacao_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.material_solicitacoes s
    WHERE s.id = solicitacao_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
CREATE POLICY "solic_itens_delete" ON public.material_solicitacao_itens
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.material_solicitacoes s
    WHERE s.id = solicitacao_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

-- ============ updated_at ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_materiais_catalogo_updated
  BEFORE UPDATE ON public.materiais_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_material_solicitacoes_updated
  BEFORE UPDATE ON public.material_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_material_solicitacao_itens_updated
  BEFORE UPDATE ON public.material_solicitacao_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Catálogo inicial ============
INSERT INTO public.materiais_catalogo (codigo, nome, categoria, unidade, descricao) VALUES
  ('HID-0001','Torneira de pressão 1/2"','Hidráulica','UN','Torneira cromada para lavatório'),
  ('HID-0002','Veda rosca 18mm x 50m','Hidráulica','RL','Fita veda rosca em PTFE'),
  ('HID-0003','Sifão sanfonado universal','Hidráulica','UN','Sifão flexível para pia'),
  ('ELE-0001','Lâmpada LED bulbo 9W','Elétrica','UN','Bivolt, luz branca 6500K'),
  ('ELE-0002','Disjuntor monopolar 16A','Elétrica','UN','Padrão DIN'),
  ('ELE-0003','Cabo flexível 2,5mm² preto','Elétrica','M','Cabo de cobre 750V'),
  ('REF-0001','Gás refrigerante R-410A','Refrigeração','KG','Cilindro fracionado'),
  ('REF-0002','Filtro de ar split 12.000 BTU','Refrigeração','UN','Filtro lavável'),
  ('REF-0003','Capacitor 35uF 440V','Refrigeração','UN','Capacitor permanente'),
  ('CIV-0001','Cimento CP-II 50kg','Civil','SC','Saco de 50 quilos'),
  ('CIV-0002','Massa corrida PVA 18L','Civil','GL','Galão para acabamento interno'),
  ('PIN-0001','Tinta acrílica fosca branca 18L','Pintura','GL','Uso interno e externo'),
  ('PIN-0002','Rolo de lã 23cm','Pintura','UN','Com cabo'),
  ('CHA-0001','Cilindro de fechadura 60mm','Chaveiro','UN','Latão, 3 chaves'),
  ('EPI-0001','Luva de segurança tamanho G','EPI','PAR','Vaqueta com CA'),
  ('EPI-0002','Óculos de proteção incolor','EPI','UN','Antirrisco com CA'),
  ('LIM-0001','Detergente neutro 5L','Limpeza','GL','Concentrado'),
  ('FER-0001','Broca de aço rápido 8mm','Ferramentas','UN','Para metal');