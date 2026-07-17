
-- ==== sst_colaboradores ====
CREATE TABLE public.sst_colaboradores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa TEXT,
  filial TEXT,
  cliente TEXT,
  matricula TEXT,
  cpf TEXT UNIQUE,
  nome TEXT NOT NULL,
  funcao TEXT,
  situacao TEXT,
  supervisor TEXT,
  data_admissao DATE,
  data_exame_realizado DATE,
  tipo_exame TEXT,
  data_vencimento DATE,
  data_sugerida_agendamento DATE,
  agendamento_confirmado BOOLEAN NOT NULL DEFAULT false,
  exame_realizado BOOLEAN NOT NULL DEFAULT false,
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sst_colab_nome_idx ON public.sst_colaboradores(nome);
CREATE INDEX sst_colab_venc_idx ON public.sst_colaboradores(data_vencimento);
CREATE INDEX sst_colab_matricula_idx ON public.sst_colaboradores(matricula);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sst_colaboradores TO authenticated;
GRANT ALL ON public.sst_colaboradores TO service_role;
ALTER TABLE public.sst_colaboradores ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sst_can_access()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.allowed_menus IS NOT NULL
        AND 'seguranca-trabalho' = ANY(p.allowed_menus)
    );
$$;

CREATE POLICY "sst_colab_select" ON public.sst_colaboradores
  FOR SELECT TO authenticated USING (public.sst_can_access());
CREATE POLICY "sst_colab_insert" ON public.sst_colaboradores
  FOR INSERT TO authenticated WITH CHECK (public.sst_can_access());
CREATE POLICY "sst_colab_update" ON public.sst_colaboradores
  FOR UPDATE TO authenticated USING (public.sst_can_access()) WITH CHECK (public.sst_can_access());
CREATE POLICY "sst_colab_delete" ON public.sst_colaboradores
  FOR DELETE TO authenticated USING (public.sst_can_access());

CREATE TRIGGER sst_colab_updated_at
  BEFORE UPDATE ON public.sst_colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ==== sst_aso_historico ====
CREATE TABLE public.sst_aso_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES public.sst_colaboradores(id) ON DELETE CASCADE,
  data_exame DATE NOT NULL,
  tipo_exame TEXT,
  data_vencimento DATE,
  observacao TEXT,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sst_hist_colab_idx ON public.sst_aso_historico(colaborador_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sst_aso_historico TO authenticated;
GRANT ALL ON public.sst_aso_historico TO service_role;
ALTER TABLE public.sst_aso_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sst_hist_select" ON public.sst_aso_historico
  FOR SELECT TO authenticated USING (public.sst_can_access());
CREATE POLICY "sst_hist_insert" ON public.sst_aso_historico
  FOR INSERT TO authenticated WITH CHECK (public.sst_can_access());
CREATE POLICY "sst_hist_update" ON public.sst_aso_historico
  FOR UPDATE TO authenticated USING (public.sst_can_access()) WITH CHECK (public.sst_can_access());
CREATE POLICY "sst_hist_delete" ON public.sst_aso_historico
  FOR DELETE TO authenticated USING (public.sst_can_access());

-- ==== sst_audit_log ====
CREATE TABLE public.sst_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_id UUID,
  acao TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos JSONB,
  usuario_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sst_audit_colab_idx ON public.sst_audit_log(colaborador_id);

GRANT SELECT, INSERT ON public.sst_audit_log TO authenticated;
GRANT ALL ON public.sst_audit_log TO service_role;
ALTER TABLE public.sst_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sst_audit_select" ON public.sst_audit_log
  FOR SELECT TO authenticated USING (public.sst_can_access());
CREATE POLICY "sst_audit_insert" ON public.sst_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.sst_can_access());

-- Trigger de auditoria
CREATE OR REPLACE FUNCTION public.tg_sst_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.sst_audit_log(colaborador_id, acao, dados_anteriores, dados_novos, usuario_id)
    VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.sst_audit_log(colaborador_id, acao, dados_anteriores, usuario_id)
    VALUES (OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sst_colab_audit
  AFTER UPDATE OR DELETE ON public.sst_colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.tg_sst_audit();
