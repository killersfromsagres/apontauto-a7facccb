-- =============== BI STUDIO ===============
CREATE TABLE IF NOT EXISTS public.bi_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_key text NOT NULL DEFAULT 'custom',
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  shared boolean NOT NULL DEFAULT false,
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_dashboards TO authenticated;
GRANT ALL ON public.bi_dashboards TO service_role;
ALTER TABLE public.bi_dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_dashboards_select" ON public.bi_dashboards
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR shared OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "bi_dashboards_insert" ON public.bi_dashboards
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.can_access_module('bi-studio', 'create'));

CREATE POLICY "bi_dashboards_update" ON public.bi_dashboards
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "bi_dashboards_delete" ON public.bi_dashboards
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.bi_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.bi_dashboards(id) ON DELETE CASCADE,
  chart_type text NOT NULL DEFAULT 'bar',
  metric_key text NOT NULL,
  dimension_key text,
  aggregation text NOT NULL DEFAULT 'count',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  size text NOT NULL DEFAULT 'md',
  visual jsonb NOT NULL DEFAULT '{}'::jsonb,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bi_widgets_dashboard_idx ON public.bi_widgets(dashboard_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_widgets TO authenticated;
GRANT ALL ON public.bi_widgets TO service_role;
ALTER TABLE public.bi_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_widgets_select" ON public.bi_widgets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bi_dashboards d WHERE d.id = dashboard_id
    AND (d.owner_id = auth.uid() OR d.shared OR public.has_role(auth.uid(), 'admin'::public.app_role))));

CREATE POLICY "bi_widgets_write" ON public.bi_widgets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bi_dashboards d WHERE d.id = dashboard_id
    AND (d.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bi_dashboards d WHERE d.id = dashboard_id
    AND (d.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))));

CREATE TRIGGER bi_dashboards_touch BEFORE UPDATE ON public.bi_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER bi_widgets_touch BEFORE UPDATE ON public.bi_widgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =============== VIEWS DO CONECTOR (security_invoker: RLS do usuário) ===============
CREATE OR REPLACE VIEW public.vw_bi_work_orders
WITH (security_invoker = true) AS
  SELECT 'corretiva'::text AS modalidade, o.id, o.numero_os, o.nome_os AS descricao,
         o.equipe, o.predio, o.andar, o.local, o.ativo, o.equipamento,
         o.status::text AS status, o.data_sla, o.data_programada, o.inicio, o.fim,
         CASE WHEN o.inicio IS NOT NULL AND o.fim IS NOT NULL
              THEN EXTRACT(epoch FROM (o.fim - o.inicio)) / 3600.0 END AS horas_execucao,
         (o.data_sla IS NOT NULL AND o.fim IS NULL AND o.data_sla < current_date) AS sla_vencido,
         o.created_at, o.updated_at
    FROM public.corretiva_os o
  UNION ALL
  SELECT 'refrigeracao', r.id, r.numero_os, r.nome_os,
         r.equipe, r.predio, r.andar, r.local, r.ativo, r.equipamento,
         r.status::text, r.data_sla, r.data_programada, r.inicio, r.fim,
         CASE WHEN r.inicio IS NOT NULL AND r.fim IS NOT NULL
              THEN EXTRACT(epoch FROM (r.fim - r.inicio)) / 3600.0 END,
         (r.data_sla IS NOT NULL AND r.fim IS NULL AND r.data_sla < current_date),
         r.created_at, r.updated_at
    FROM public.refrigeracao_os r;

CREATE OR REPLACE VIEW public.vw_bi_backlog
WITH (security_invoker = true) AS
  SELECT b.os, b.ativo, b.predio, b.andar, b.espaco, b.atividade, b.equipe,
         b.criticidade, b.prioridade_nivel, b.is_prioridade,
         b.data_solicitacao, b.termino_sla, b.finalizado, b.data_finalizacao,
         GREATEST(0, EXTRACT(day FROM (COALESCE(b.data_finalizacao, now()) - b.data_solicitacao)))::int AS idade_dias,
         (NOT b.finalizado AND b.termino_sla IS NOT NULL AND b.termino_sla < now()) AS sla_vencido,
         b.criado_em, b.atualizado_em
    FROM public.backorder_os b;

CREATE OR REPLACE VIEW public.vw_bi_preventive_compliance
WITH (security_invoker = true) AS
  SELECT p.id, p.tag, p.tipo_equipamento, p.predio, p.andar, p.local,
         p.tipo_servico, p.data_manutencao, p.status_equipamento, p.colaborador,
         date_trunc('month', p.data_manutencao)::date AS competencia,
         p.created_at
    FROM public.preventiva_ac_registros p;

CREATE OR REPLACE VIEW public.vw_bi_assets
WITH (security_invoker = true) AS
  SELECT a.ativo, a.denominacao, a.nivel, a.codigo_pai, a.descricao_pai,
         a.unidade_negocio, a.updated_at
    FROM public.assets_ref a;

CREATE OR REPLACE VIEW public.vw_bi_taludes_weather_pt
WITH (security_invoker = true) AS
  SELECT pt.id, pt.numero_pt, pt.taludes_label, pt.data_trabalho, pt.servico,
         pt.equipe, pt.status, pt.solicitada_em, pt.liberada_em, pt.suspensa_em,
         pt.retomada_em, pt.encerrada_em, pt.revogada_em,
         CASE WHEN pt.suspensa_em IS NOT NULL
              THEN EXTRACT(epoch FROM (COALESCE(pt.retomada_em, pt.encerrada_em, now()) - pt.suspensa_em)) / 3600.0
         END AS horas_suspensas,
         w.max_intensity, w.accumulated_mm, w.started_at AS chuva_inicio, w.ended_at AS chuva_fim
    FROM public.talude_pt_releases pt
    LEFT JOIN public.weather_events w ON w.id = pt.weather_event_id;

CREATE OR REPLACE VIEW public.vw_bi_vehicle_checklists
WITH (security_invoker = true) AS
  SELECT c.id, c.protocol, c.checklist_type, v.prefix AS veiculo, v.plate AS placa,
         c.odometer_km, c.fuel_level_pct, c.overall_status, c.integrity_score,
         c.critical_block, c.location, c.submitted_at, c.created_at
    FROM public.vehicle_checklists c
    LEFT JOIN public.vehicles v ON v.id = c.vehicle_id;

CREATE OR REPLACE VIEW public.vw_bi_vehicle_fuelings
WITH (security_invoker = true) AS
  SELECT f.id, v.prefix AS veiculo, v.plate AS placa, f.fueled_at, f.fuel_type,
         f.liters, f.price_per_liter, f.total_value, f.odometer_km, f.full_tank,
         f.station, f.created_at
    FROM public.vehicle_fuelings f
    LEFT JOIN public.vehicles v ON v.id = f.vehicle_id;

GRANT SELECT ON public.vw_bi_work_orders, public.vw_bi_backlog,
  public.vw_bi_preventive_compliance, public.vw_bi_assets,
  public.vw_bi_taludes_weather_pt, public.vw_bi_vehicle_checklists,
  public.vw_bi_vehicle_fuelings TO authenticated;

-- =============== PERMISSÕES DO MÓDULO ===============
INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT 'bi-studio.' || a, 'bi-studio', a,
       'BI Studio — ' || a
  FROM unnest(ARRAY['read','create','update','delete','export']) a
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key
  FROM public.pcm_roles r
  CROSS JOIN public.pcm_permissions p
 WHERE p.module_key = 'bi-studio'
   AND r.key IN ('admin','gestor_pcm','planejador','analista_bi','gestor_manutencao')
ON CONFLICT DO NOTHING;