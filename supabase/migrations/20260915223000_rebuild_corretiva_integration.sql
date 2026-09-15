-- Rebuild of the operational corrective workflow for Supabase project fbhpdqykoptxnrbdcspr.
-- Secrets are intentionally not stored in this migration. IMGBB_API_KEY lives in Supabase Vault.

DO $$ BEGIN CREATE TYPE public.corretiva_gravidade AS ENUM ('observacao','falha','critico'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.corretiva_os_status AS ENUM ('aberta','em_andamento','concluida','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.corretiva_status_gestor AS ENUM ('pendente','aprovado','rejeitado','concluido'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.corretiva_urgencia AS ENUM ('baixa','media','alta'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE IF NOT EXISTS public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  actions text[] NOT NULL DEFAULT ARRAY['read']::text[],
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_module_access_user_module_key UNIQUE (user_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.image_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text,
  entity_type text,
  entity_id text,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL,
  url text,
  delete_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.material_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL DEFAULT ('MAT-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8)),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  solicitante text NOT NULL,
  setor text,
  predio text,
  local text,
  centro_custo text,
  prioridade text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'rascunho',
  observacao text,
  enviada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.material_solicitacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.material_solicitacoes(id) ON DELETE CASCADE,
  catalogo_id uuid,
  codigo text,
  descricao text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'UN',
  justificativa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corretiva_os (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os text NOT NULL,
  ativo text,
  equipamento text,
  nome_os text,
  predio text,
  andar text,
  local text,
  equipe text,
  patrimonio text,
  solicitante text,
  status public.corretiva_os_status NOT NULL DEFAULT 'aberta',
  tipo text,
  tipo_importacao text,
  data_criacao text,
  data_programada text,
  data_sla text,
  inicio text,
  fim text,
  material_status text,
  pecas_solicitadas text,
  observacao_conclusao text,
  assinatura_url text,
  assinatura_nome text,
  assinatura_em text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corretiva_equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  colaboradores text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corretiva_pecas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.corretiva_os(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  urgencia public.corretiva_urgencia NOT NULL DEFAULT 'media',
  status_gestor public.corretiva_status_gestor NOT NULL DEFAULT 'pendente',
  material_request_date text,
  material_status text,
  modelo text,
  observacao text,
  client_uuid text,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corretiva_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.corretiva_os(id) ON DELETE CASCADE,
  image_url text,
  storage_path text,
  legenda text,
  client_uuid text,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corretiva_fotos_has_url CHECK (image_url IS NOT NULL OR storage_path IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.corretiva_problemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.corretiva_os(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  gravidade public.corretiva_gravidade NOT NULL DEFAULT 'falha',
  status_gestor public.corretiva_status_gestor NOT NULL DEFAULT 'pendente',
  client_uuid text,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corretiva_historico_verificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.corretiva_os(id) ON DELETE CASCADE,
  numero_os text NOT NULL,
  origem text NOT NULL DEFAULT 'corretiva',
  verificado_em timestamptz NOT NULL DEFAULT now(),
  verificado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.corretiva_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  solicitante text NOT NULL,
  email_destinatario text NOT NULL,
  assunto text,
  corpo_email text,
  status text NOT NULL DEFAULT 'pendente',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  respondido_em timestamptz,
  feedback_nota integer,
  feedback_comentario text
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_user_module ON public.user_module_access(user_id, module_key);
CREATE INDEX IF NOT EXISTS idx_image_uploads_user_created ON public.image_uploads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_solicitacoes_user_created ON public.material_solicitacoes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_itens_solicitacao ON public.material_solicitacao_itens(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_corretiva_os_status ON public.corretiva_os(status);
CREATE INDEX IF NOT EXISTS idx_corretiva_os_tipo_importacao ON public.corretiva_os(tipo_importacao);
CREATE INDEX IF NOT EXISTS idx_corretiva_os_updated_at ON public.corretiva_os(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_corretiva_os_numero ON public.corretiva_os(numero_os);
CREATE INDEX IF NOT EXISTS idx_corretiva_pecas_os ON public.corretiva_pecas(os_id);
CREATE INDEX IF NOT EXISTS idx_corretiva_fotos_os ON public.corretiva_fotos(os_id);
CREATE INDEX IF NOT EXISTS idx_corretiva_problemas_os ON public.corretiva_problemas(os_id);
CREATE INDEX IF NOT EXISTS idx_corretiva_hist_os ON public.corretiva_historico_verificacoes(os_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_corretiva_pecas_client_uuid ON public.corretiva_pecas(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_corretiva_fotos_client_uuid ON public.corretiva_fotos(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_corretiva_problemas_client_uuid ON public.corretiva_problemas(client_uuid) WHERE client_uuid IS NOT NULL;

DROP TRIGGER IF EXISTS trg_material_solicitacoes_updated_at ON public.material_solicitacoes;
CREATE TRIGGER trg_material_solicitacoes_updated_at BEFORE UPDATE ON public.material_solicitacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_material_itens_updated_at ON public.material_solicitacao_itens;
CREATE TRIGGER trg_material_itens_updated_at BEFORE UPDATE ON public.material_solicitacao_itens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_corretiva_os_updated_at ON public.corretiva_os;
CREATE TRIGGER trg_corretiva_os_updated_at BEFORE UPDATE ON public.corretiva_os FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_corretiva_equipes_updated_at ON public.corretiva_equipes;
CREATE TRIGGER trg_corretiva_equipes_updated_at BEFORE UPDATE ON public.corretiva_equipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_corretiva_pecas_updated_at ON public.corretiva_pecas;
CREATE TRIGGER trg_corretiva_pecas_updated_at BEFORE UPDATE ON public.corretiva_pecas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_corretiva_problemas_updated_at ON public.corretiva_problemas;
CREATE TRIGGER trg_corretiva_problemas_updated_at BEFORE UPDATE ON public.corretiva_problemas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_corretiva_hist_updated_at ON public.corretiva_historico_verificacoes;
CREATE TRIGGER trg_corretiva_hist_updated_at BEFORE UPDATE ON public.corretiva_historico_verificacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.user_can_access(_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND _module = ANY(COALESCE(p.allowed_menus, ARRAY[]::text[])))
    OR EXISTS (SELECT 1 FROM public.user_module_access uma WHERE uma.user_id = auth.uid() AND uma.module_key = _module)
  );
$$;
REVOKE ALL ON FUNCTION public.user_can_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_can_access_any(_modules text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.allowed_menus, ARRAY[]::text[]) && COALESCE(_modules, ARRAY[]::text[]))
    OR EXISTS (SELECT 1 FROM public.user_module_access uma WHERE uma.user_id = auth.uid() AND uma.module_key = ANY(COALESCE(_modules, ARRAY[]::text[])));
$$;
REVOKE ALL ON FUNCTION public.user_can_access_any(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_any(text[]) TO authenticated;

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_solicitacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_os ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_equipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_pecas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_problemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_historico_verificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_avaliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_module_access_select ON public.user_module_access;
CREATE POLICY user_module_access_select ON public.user_module_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS image_uploads_select ON public.image_uploads;
CREATE POLICY image_uploads_select ON public.image_uploads FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS material_solicitacoes_select ON public.material_solicitacoes;
CREATE POLICY material_solicitacoes_select ON public.material_solicitacoes FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.user_can_access_any(ARRAY['solicitacao-materiais','controle-materiais','central-materiais-unificada','corretiva-novo','corretiva','corretiva-pecas-status']));
DROP POLICY IF EXISTS material_solicitacoes_insert ON public.material_solicitacoes;
CREATE POLICY material_solicitacoes_insert ON public.material_solicitacoes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.user_can_access_any(ARRAY['solicitacao-materiais','corretiva-novo','corretiva']));
DROP POLICY IF EXISTS material_solicitacoes_update ON public.material_solicitacoes;
CREATE POLICY material_solicitacoes_update ON public.material_solicitacoes FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.user_can_access_any(ARRAY['controle-materiais','central-materiais-unificada','corretiva-novo','corretiva','corretiva-pecas-status'])) WITH CHECK (user_id = auth.uid() OR public.user_can_access_any(ARRAY['controle-materiais','central-materiais-unificada','corretiva-novo','corretiva','corretiva-pecas-status']));

DROP POLICY IF EXISTS material_itens_select ON public.material_solicitacao_itens;
CREATE POLICY material_itens_select ON public.material_solicitacao_itens FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.material_solicitacoes s WHERE s.id = solicitacao_id AND (s.user_id = auth.uid() OR public.user_can_access_any(ARRAY['controle-materiais','central-materiais-unificada','corretiva-novo','corretiva','corretiva-pecas-status']))));
DROP POLICY IF EXISTS material_itens_insert ON public.material_solicitacao_itens;
CREATE POLICY material_itens_insert ON public.material_solicitacao_itens FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.material_solicitacoes s WHERE s.id = solicitacao_id AND s.user_id = auth.uid()) OR public.user_can_access_any(ARRAY['controle-materiais','central-materiais-unificada','corretiva-novo','corretiva']));
DROP POLICY IF EXISTS material_itens_update ON public.material_solicitacao_itens;
CREATE POLICY material_itens_update ON public.material_solicitacao_itens FOR UPDATE TO authenticated USING (public.user_can_access_any(ARRAY['controle-materiais','central-materiais-unificada','corretiva-novo','corretiva'])) WITH CHECK (public.user_can_access_any(ARRAY['controle-materiais','central-materiais-unificada','corretiva-novo','corretiva']));

DROP POLICY IF EXISTS corretiva_os_select ON public.corretiva_os;
CREATE POLICY corretiva_os_select ON public.corretiva_os FOR SELECT TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','avaliacao-chamados','corretiva-pecas-status','corretiva-historico','dashboard','dashboard-chamados']));
DROP POLICY IF EXISTS corretiva_os_insert ON public.corretiva_os;
CREATE POLICY corretiva_os_insert ON public.corretiva_os FOR INSERT TO authenticated WITH CHECK (public.user_can_access_any(ARRAY['corretiva-novo','corretiva']));
DROP POLICY IF EXISTS corretiva_os_update ON public.corretiva_os;
CREATE POLICY corretiva_os_update ON public.corretiva_os FOR UPDATE TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','corretiva-pecas-status'])) WITH CHECK (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','corretiva-pecas-status']));
DROP POLICY IF EXISTS corretiva_os_delete ON public.corretiva_os;
CREATE POLICY corretiva_os_delete ON public.corretiva_os FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS corretiva_equipes_select ON public.corretiva_equipes;
CREATE POLICY corretiva_equipes_select ON public.corretiva_equipes FOR SELECT TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','corretiva-historico','dashboard','dashboard-chamados']));
DROP POLICY IF EXISTS corretiva_equipes_write ON public.corretiva_equipes;
CREATE POLICY corretiva_equipes_write ON public.corretiva_equipes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_can_access_any(ARRAY['corretiva-novo','corretiva'])) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.user_can_access_any(ARRAY['corretiva-novo','corretiva']));

DROP POLICY IF EXISTS corretiva_pecas_select ON public.corretiva_pecas;
CREATE POLICY corretiva_pecas_select ON public.corretiva_pecas FOR SELECT TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','corretiva-pecas-status','corretiva-historico']));
DROP POLICY IF EXISTS corretiva_pecas_insert ON public.corretiva_pecas;
CREATE POLICY corretiva_pecas_insert ON public.corretiva_pecas FOR INSERT TO authenticated WITH CHECK (public.user_can_access_any(ARRAY['corretiva-novo','corretiva']));
DROP POLICY IF EXISTS corretiva_pecas_update ON public.corretiva_pecas;
CREATE POLICY corretiva_pecas_update ON public.corretiva_pecas FOR UPDATE TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','corretiva-pecas-status'])) WITH CHECK (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','corretiva-pecas-status']));

DROP POLICY IF EXISTS corretiva_fotos_select ON public.corretiva_fotos;
CREATE POLICY corretiva_fotos_select ON public.corretiva_fotos FOR SELECT TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','corretiva-historico']));
DROP POLICY IF EXISTS corretiva_fotos_insert ON public.corretiva_fotos;
CREATE POLICY corretiva_fotos_insert ON public.corretiva_fotos FOR INSERT TO authenticated WITH CHECK (image_url IS NOT NULL AND storage_path IS NULL AND public.user_can_access_any(ARRAY['corretiva-novo','corretiva']));
DROP POLICY IF EXISTS corretiva_fotos_update ON public.corretiva_fotos;
CREATE POLICY corretiva_fotos_update ON public.corretiva_fotos FOR UPDATE TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva'])) WITH CHECK (image_url IS NOT NULL AND storage_path IS NULL AND public.user_can_access_any(ARRAY['corretiva-novo','corretiva']));

DROP POLICY IF EXISTS corretiva_problemas_select ON public.corretiva_problemas;
CREATE POLICY corretiva_problemas_select ON public.corretiva_problemas FOR SELECT TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva','corretiva-historico']));
DROP POLICY IF EXISTS corretiva_problemas_insert ON public.corretiva_problemas;
CREATE POLICY corretiva_problemas_insert ON public.corretiva_problemas FOR INSERT TO authenticated WITH CHECK (public.user_can_access_any(ARRAY['corretiva-novo','corretiva']));
DROP POLICY IF EXISTS corretiva_problemas_update ON public.corretiva_problemas;
CREATE POLICY corretiva_problemas_update ON public.corretiva_problemas FOR UPDATE TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-novo','corretiva'])) WITH CHECK (public.user_can_access_any(ARRAY['corretiva-novo','corretiva']));

DROP POLICY IF EXISTS corretiva_hist_select ON public.corretiva_historico_verificacoes;
CREATE POLICY corretiva_hist_select ON public.corretiva_historico_verificacoes FOR SELECT TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-historico','corretiva-novo','corretiva']));
DROP POLICY IF EXISTS corretiva_hist_insert ON public.corretiva_historico_verificacoes;
CREATE POLICY corretiva_hist_insert ON public.corretiva_historico_verificacoes FOR INSERT TO authenticated WITH CHECK (public.user_can_access_any(ARRAY['corretiva-historico','corretiva-novo','corretiva']));
DROP POLICY IF EXISTS corretiva_hist_update ON public.corretiva_historico_verificacoes;
CREATE POLICY corretiva_hist_update ON public.corretiva_historico_verificacoes FOR UPDATE TO authenticated USING (public.user_can_access_any(ARRAY['corretiva-historico','corretiva-novo','corretiva'])) WITH CHECK (public.user_can_access_any(ARRAY['corretiva-historico','corretiva-novo','corretiva']));

DROP POLICY IF EXISTS corretiva_avaliacoes_select ON public.corretiva_avaliacoes;
CREATE POLICY corretiva_avaliacoes_select ON public.corretiva_avaliacoes FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.user_can_access_any(ARRAY['avaliacao-chamados','corretiva','corretiva-historico']));
DROP POLICY IF EXISTS corretiva_avaliacoes_insert ON public.corretiva_avaliacoes;
CREATE POLICY corretiva_avaliacoes_insert ON public.corretiva_avaliacoes FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR public.user_can_access_any(ARRAY['avaliacao-chamados','corretiva']));
DROP POLICY IF EXISTS corretiva_avaliacoes_update ON public.corretiva_avaliacoes;
CREATE POLICY corretiva_avaliacoes_update ON public.corretiva_avaliacoes FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.user_can_access_any(ARRAY['avaliacao-chamados','corretiva'])) WITH CHECK (owner_id = auth.uid() OR public.user_can_access_any(ARRAY['avaliacao-chamados','corretiva']));

CREATE OR REPLACE FUNCTION public.finalize_corretiva_os(_os_id uuid, _observacao text DEFAULT NULL)
RETURNS public.corretiva_os LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.corretiva_os;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  IF NOT public.user_can_access_any(ARRAY['corretiva-novo','corretiva']) THEN RAISE EXCEPTION 'Sem permissão para finalizar este chamado'; END IF;
  UPDATE public.corretiva_os
     SET status = 'concluida'::public.corretiva_os_status,
         observacao_conclusao = COALESCE(NULLIF(trim(_observacao), ''), observacao_conclusao),
         fim = COALESCE(fim, now()::text),
         updated_at = now()
   WHERE id = _os_id RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Chamado não encontrado'; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_corretiva_os(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_corretiva_os(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_backend_secret(_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = _name ORDER BY created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_backend_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_backend_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_backend_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_backend_secret(text) TO service_role;
