-- ============ 26. Ciclo de vida unificado ============
CREATE TABLE public.work_order_transitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  modalidade TEXT NOT NULL,
  work_order_id UUID,
  numero_os TEXT NOT NULL,
  de_status TEXT,
  para_status TEXT NOT NULL,
  motivo TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wot_numero ON public.work_order_transitions (modalidade, numero_os, created_at DESC);
CREATE INDEX idx_wot_wo ON public.work_order_transitions (work_order_id, created_at DESC);
GRANT SELECT, INSERT ON public.work_order_transitions TO authenticated;
GRANT ALL ON public.work_order_transitions TO service_role;
ALTER TABLE public.work_order_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wot_read" ON public.work_order_transitions FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read') OR public.can_access_refrigeracao('read') OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "wot_insert" ON public.work_order_transitions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- ============ 27. Planejamento de capacidade ============
CREATE TABLE public.capacity_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipe TEXT NOT NULL UNIQUE,
  tecnicos INTEGER NOT NULL DEFAULT 1 CHECK (tecnicos >= 0 AND tecnicos <= 200),
  minutos_dia INTEGER NOT NULL DEFAULT 480 CHECK (minutos_dia > 0 AND minutos_dia <= 1440),
  dias_semana INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  eficiencia NUMERIC(4,2) NOT NULL DEFAULT 0.85 CHECK (eficiencia > 0 AND eficiencia <= 1),
  minutos_por_os INTEGER NOT NULL DEFAULT 60 CHECK (minutos_por_os > 0),
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_settings TO authenticated;
GRANT ALL ON public.capacity_settings TO service_role;
ALTER TABLE public.capacity_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capacity_settings_read" ON public.capacity_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "capacity_settings_write" ON public.capacity_settings FOR ALL TO authenticated
  USING (public.can_access_module('capacidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.can_access_module('capacidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER capacity_settings_touch BEFORE UPDATE ON public.capacity_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.team_absences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipe TEXT NOT NULL,
  tecnico TEXT NOT NULL,
  inicio DATE NOT NULL,
  fim DATE NOT NULL,
  motivo TEXT NOT NULL DEFAULT 'ferias',
  observacao TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_team_absences_periodo ON public.team_absences (equipe, inicio, fim);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_absences TO authenticated;
GRANT ALL ON public.team_absences TO service_role;
ALTER TABLE public.team_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_absences_read" ON public.team_absences FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "team_absences_write" ON public.team_absences FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.can_access_module('capacidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.can_access_module('capacidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER team_absences_touch BEFORE UPDATE ON public.team_absences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ 28. Criticidade e saúde de ativos ============
CREATE TABLE public.asset_criticality (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_code TEXT NOT NULL UNIQUE,
  asset_name TEXT,
  classe_abc TEXT NOT NULL DEFAULT 'C' CHECK (classe_abc IN ('A','B','C')),
  impacto_seguranca SMALLINT NOT NULL DEFAULT 0 CHECK (impacto_seguranca BETWEEN 0 AND 5),
  impacto_operacional SMALLINT NOT NULL DEFAULT 0 CHECK (impacto_operacional BETWEEN 0 AND 5),
  impacto_ambiental SMALLINT NOT NULL DEFAULT 0 CHECK (impacto_ambiental BETWEEN 0 AND 5),
  redundancia BOOLEAN NOT NULL DEFAULT false,
  custo_parada_hora NUMERIC(14,2),
  lead_time_dias INTEGER,
  proxima_preventiva DATE,
  observacao TEXT,
  updated_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_criticality TO authenticated;
GRANT ALL ON public.asset_criticality TO service_role;
ALTER TABLE public.asset_criticality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asset_criticality_read" ON public.asset_criticality FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "asset_criticality_write" ON public.asset_criticality FOR ALL TO authenticated
  USING (public.can_access_module('base-ativos','update') OR public.can_access_module('confiabilidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.can_access_module('base-ativos','update') OR public.can_access_module('confiabilidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER asset_criticality_touch BEFORE UPDATE ON public.asset_criticality
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ 29. Confiabilidade e causa raiz ============
CREATE TABLE public.rca_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  asset_code TEXT,
  asset_name TEXT,
  modalidade TEXT,
  numero_os TEXT,
  modo_falha TEXT,
  ocorrencias INTEGER NOT NULL DEFAULT 1,
  porques JSONB NOT NULL DEFAULT '[]'::jsonb,
  ishikawa JSONB NOT NULL DEFAULT '{}'::jsonb,
  causa_raiz TEXT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_analise','plano_definido','concluida','cancelada')),
  eficacia_validada BOOLEAN NOT NULL DEFAULT false,
  eficacia_observacao TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rca_analyses TO authenticated;
GRANT ALL ON public.rca_analyses TO service_role;
ALTER TABLE public.rca_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rca_analyses_read" ON public.rca_analyses FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "rca_analyses_write" ON public.rca_analyses FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.can_access_module('confiabilidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.can_access_module('confiabilidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER rca_analyses_touch BEFORE UPDATE ON public.rca_analyses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.rca_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES public.rca_analyses(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  responsavel TEXT,
  prazo DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  evidencia_url TEXT,
  eficaz BOOLEAN,
  observacao TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rca_actions_analysis ON public.rca_actions (analysis_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rca_actions TO authenticated;
GRANT ALL ON public.rca_actions TO service_role;
ALTER TABLE public.rca_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rca_actions_read" ON public.rca_actions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "rca_actions_write" ON public.rca_actions FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.can_access_module('confiabilidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.can_access_module('confiabilidade','update') OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER rca_actions_touch BEFORE UPDATE ON public.rca_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ 31. Materiais integrados à OS ============
CREATE TABLE public.material_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  modalidade TEXT NOT NULL DEFAULT 'corretiva',
  numero_os TEXT NOT NULL,
  descricao TEXT NOT NULL,
  codigo TEXT,
  unidade TEXT NOT NULL DEFAULT 'un',
  qtd_solicitada NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qtd_solicitada >= 0),
  qtd_separada NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qtd_separada >= 0),
  qtd_entregue NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qtd_entregue >= 0),
  qtd_consumida NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qtd_consumida >= 0),
  estoque_minimo NUMERIC(12,2),
  critico BOOLEAN NOT NULL DEFAULT false,
  lead_time_dias INTEGER,
  afeta_sla BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado','reservado','separado','entregue','consumido','cancelado')),
  centro_custo TEXT,
  observacao TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_material_reservations_os ON public.material_reservations (modalidade, numero_os);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_reservations TO authenticated;
GRANT ALL ON public.material_reservations TO service_role;
ALTER TABLE public.material_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_reservations_read" ON public.material_reservations FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "material_reservations_write" ON public.material_reservations FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.can_access_module('controle-materiais','update') OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.can_access_module('controle-materiais','update') OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER material_reservations_touch BEFORE UPDATE ON public.material_reservations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.material_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES public.material_reservations(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  quantidade NUMERIC(12,2) NOT NULL DEFAULT 0,
  de_status TEXT,
  para_status TEXT,
  observacao TEXT,
  user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_material_movements_res ON public.material_movements (reservation_id, created_at DESC);
GRANT SELECT, INSERT ON public.material_movements TO authenticated;
GRANT ALL ON public.material_movements TO service_role;
ALTER TABLE public.material_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_movements_read" ON public.material_movements FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "material_movements_insert" ON public.material_movements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- ============ 32. Qualidade de dados ============
CREATE TABLE public.data_quality_fixes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  antes JSONB NOT NULL DEFAULT '{}'::jsonb,
  depois JSONB NOT NULL DEFAULT '{}'::jsonb,
  acao TEXT NOT NULL DEFAULT 'corrigido',
  observacao TEXT,
  user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dq_fixes_issue ON public.data_quality_fixes (issue_key, created_at DESC);
GRANT SELECT, INSERT ON public.data_quality_fixes TO authenticated;
GRANT ALL ON public.data_quality_fixes TO service_role;
ALTER TABLE public.data_quality_fixes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dq_fixes_read" ON public.data_quality_fixes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "dq_fixes_insert" ON public.data_quality_fixes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- ============ Catálogo de permissões dos novos módulos ============
INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT m.k || ':' || a.k, m.k, a.k, m.lbl || ' — ' || a.k
FROM (VALUES ('capacidade','Capacidade'), ('confiabilidade','Confiabilidade'), ('qualidade-dados','Qualidade de dados'), ('ativo-qr','Ficha de ativo')) AS m(k,lbl)
CROSS JOIN (VALUES ('read'),('create'),('update'),('delete'),('export')) AS a(k)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.k, p.key FROM (VALUES ('proprietario'),('administrador'),('gestor_pcm'),('planejador')) AS r(k)
CROSS JOIN public.pcm_permissions p
WHERE p.module_key IN ('capacidade','confiabilidade','qualidade-dados','ativo-qr')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.k, p.key FROM (VALUES ('supervisor'),('auditor'),('visualizador'),('tecnico'),('almoxarifado')) AS r(k)
CROSS JOIN public.pcm_permissions p
WHERE p.module_key IN ('capacidade','confiabilidade','qualidade-dados','ativo-qr') AND p.action = 'read'
ON CONFLICT DO NOTHING;