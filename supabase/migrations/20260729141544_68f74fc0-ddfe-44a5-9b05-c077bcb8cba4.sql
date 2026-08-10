-- ============ FASE 7: clima, chuva e PT dos taludes ============

-- 1) Observações meteorológicas
CREATE TABLE public.weather_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_station_id text,
  data_type text NOT NULL DEFAULT 'forecast',
  observed_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  distance_km numeric,
  precipitation_mm numeric NOT NULL DEFAULT 0,
  rain_rate_mm_h numeric,
  precipitation_probability numeric,
  weather_code integer,
  temperature_c numeric,
  humidity_pct numeric,
  wind_kmh numeric,
  confidence numeric NOT NULL DEFAULT 0.5,
  raw_payload jsonb,
  raw_expires_at timestamptz DEFAULT (now() + interval '30 days'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX weather_observations_observed_idx ON public.weather_observations (observed_at DESC);
CREATE INDEX weather_observations_source_idx ON public.weather_observations (source, observed_at DESC);

GRANT SELECT, INSERT ON public.weather_observations TO authenticated;
GRANT ALL ON public.weather_observations TO service_role;
ALTER TABLE public.weather_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weather_obs_read" ON public.weather_observations
  FOR SELECT TO authenticated
  USING (public.can_access_module('clima-tempo','read') OR public.can_access_module('taludes','read'));

CREATE POLICY "weather_obs_manual_insert" ON public.weather_observations
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'manual'
    AND created_by = auth.uid()
    AND (public.can_access_module('clima-tempo','create') OR public.can_access_module('taludes','create'))
  );

-- 2) Eventos de chuva
CREATE TABLE public.weather_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'aberto',
  max_intensity text,
  accumulated_mm numeric NOT NULL DEFAULT 0,
  sources text[] NOT NULL DEFAULT '{}',
  confidence numeric NOT NULL DEFAULT 0.5,
  confirmed_by uuid,
  confirmation_type text NOT NULL DEFAULT 'automatica',
  affected_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  release_required boolean NOT NULL DEFAULT true,
  wait_minutes integer NOT NULL DEFAULT 60,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weather_events_status_chk CHECK (status IN ('aberto','encerrado','descartado')),
  CONSTRAINT weather_events_conf_chk CHECK (confirmation_type IN ('automatica','manual','pluviometro'))
);
CREATE INDEX weather_events_started_idx ON public.weather_events (started_at DESC);
CREATE UNIQUE INDEX weather_events_one_open ON public.weather_events ((status)) WHERE status = 'aberto';

GRANT SELECT, INSERT, UPDATE ON public.weather_events TO authenticated;
GRANT ALL ON public.weather_events TO service_role;
ALTER TABLE public.weather_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weather_events_read" ON public.weather_events
  FOR SELECT TO authenticated
  USING (public.can_access_module('clima-tempo','read') OR public.can_access_module('taludes','read'));

CREATE POLICY "weather_events_insert" ON public.weather_events
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module('clima-tempo','create') OR public.can_access_module('taludes','create'));

CREATE POLICY "weather_events_update" ON public.weather_events
  FOR UPDATE TO authenticated
  USING (public.can_access_module('clima-tempo','update') OR public.can_access_module('taludes','update'))
  WITH CHECK (public.can_access_module('clima-tempo','update') OR public.can_access_module('taludes','update'));

CREATE TRIGGER weather_events_touch BEFORE UPDATE ON public.weather_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Saúde das fontes
CREATE TABLE public.weather_source_health (
  source text PRIMARY KEY,
  last_run_at timestamptz,
  last_success_at timestamptz,
  latency_ms integer,
  consecutive_errors integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'desconhecido',
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.weather_source_health TO authenticated;
GRANT ALL ON public.weather_source_health TO service_role;
ALTER TABLE public.weather_source_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weather_health_read" ON public.weather_source_health
  FOR SELECT TO authenticated
  USING (public.can_access_module('clima-tempo','read') OR public.can_access_module('taludes','read'));

-- 4) PT dos taludes
CREATE TABLE public.talude_pt_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pt text NOT NULL,
  map_id uuid REFERENCES public.talude_maps(id) ON DELETE SET NULL,
  marcacao_ids uuid[] NOT NULL DEFAULT '{}',
  taludes_label text,
  data_trabalho date NOT NULL,
  servico text NOT NULL,
  riscos text,
  equipe text,
  solicitante text NOT NULL,
  solicitante_id uuid,
  liberador_nome text,
  liberador_id uuid,
  status text NOT NULL DEFAULT 'solicitada',
  solicitada_em timestamptz NOT NULL DEFAULT now(),
  analise_em timestamptz,
  liberada_em timestamptz,
  suspensa_em timestamptz,
  retomada_em timestamptz,
  encerrada_em timestamptz,
  revogada_em timestamptz,
  weather_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  weather_event_id uuid REFERENCES public.weather_events(id) ON DELETE SET NULL,
  observacoes text,
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  assinatura_url text,
  assinatura_nome text,
  assinatura_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talude_pt_status_chk CHECK (status IN ('solicitada','em_analise','liberada','suspensa_chuva','revogada','encerrada'))
);
CREATE INDEX talude_pt_status_idx ON public.talude_pt_releases (status, data_trabalho DESC);

GRANT SELECT, INSERT, UPDATE ON public.talude_pt_releases TO authenticated;
GRANT ALL ON public.talude_pt_releases TO service_role;
ALTER TABLE public.talude_pt_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talude_pt_read" ON public.talude_pt_releases
  FOR SELECT TO authenticated
  USING (public.can_access_module('taludes','read') OR public.can_access_module('taludes-pt','read'));

CREATE POLICY "talude_pt_insert" ON public.talude_pt_releases
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module('taludes','create') OR public.can_access_module('taludes-pt','create'));

CREATE POLICY "talude_pt_update" ON public.talude_pt_releases
  FOR UPDATE TO authenticated
  USING (public.can_access_module('taludes-pt','update') OR public.can_access_module('taludes','update'))
  WITH CHECK (public.can_access_module('taludes-pt','update') OR public.can_access_module('taludes','update'));

CREATE TRIGGER talude_pt_touch BEFORE UPDATE ON public.talude_pt_releases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) Eventos imutáveis da PT
CREATE TABLE public.talude_pt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id uuid NOT NULL REFERENCES public.talude_pt_releases(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  motivo text,
  weather_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  weather_event_id uuid REFERENCES public.weather_events(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_nome text,
  origem text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX talude_pt_events_pt_idx ON public.talude_pt_events (pt_id, created_at DESC);

GRANT SELECT, INSERT ON public.talude_pt_events TO authenticated;
GRANT ALL ON public.talude_pt_events TO service_role;
ALTER TABLE public.talude_pt_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talude_pt_events_read" ON public.talude_pt_events
  FOR SELECT TO authenticated
  USING (public.can_access_module('taludes','read') OR public.can_access_module('taludes-pt','read'));

CREATE POLICY "talude_pt_events_insert" ON public.talude_pt_events
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module('taludes','read') OR public.can_access_module('taludes-pt','read'));

-- 6) Permissões do módulo PT
INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT 'taludes-pt:' || a, 'taludes-pt', a, 'PT de Taludes — ' || a
FROM unnest(ARRAY['read','create','update','delete','export','admin']) a
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r, 'taludes-pt:' || a
FROM unnest(ARRAY['proprietario','administrador','gestor_pcm','gestor_taludes','bombeiros_pt']) r,
     unnest(ARRAY['read','create','update','export']) a
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_taludes', 'taludes-pt:' || a
FROM unnest(ARRAY['read','create']) a
ON CONFLICT DO NOTHING;

-- Bombeiros/PT também enxergam clima e taludes (somente leitura)
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'bombeiros_pt', p
FROM unnest(ARRAY['taludes:read','clima-tempo:read']) p
WHERE EXISTS (SELECT 1 FROM public.pcm_permissions pp WHERE pp.key = p)
ON CONFLICT DO NOTHING;