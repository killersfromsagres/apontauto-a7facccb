
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- APP SETTINGS (single row, shared)
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings readable by authenticated"
  ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Settings writable by authenticated"
  ON public.app_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Settings updatable by authenticated"
  ON public.app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- REMINDERS
CREATE TABLE public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  data DATE NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'media',
  observacoes TEXT,
  anexos JSONB NOT NULL DEFAULT '[]'::jsonb,
  concluido BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reminders readable by authenticated"
  ON public.reminders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Reminders insertable by authenticated"
  ON public.reminders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Reminders updatable by authenticated"
  ON public.reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Reminders deletable by authenticated"
  ON public.reminders FOR DELETE TO authenticated USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_reminders_updated BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TABLE public.legal_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  periodicidade TEXT NOT NULL CHECK (periodicidade IN ('bimestral','semestral','anual')),
  ultima_execucao DATE,
  proxima_execucao DATE NOT NULL,
  responsavel TEXT,
  concluido BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_items TO authenticated;
GRANT ALL ON public.legal_items TO service_role;

ALTER TABLE public.legal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Legal items readable by authenticated" ON public.legal_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Legal items insertable by authenticated" ON public.legal_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Legal items updatable by authenticated" ON public.legal_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Legal items deletable by authenticated" ON public.legal_items FOR DELETE TO authenticated USING (true);

CREATE TRIGGER legal_items_set_updated_at
BEFORE UPDATE ON public.legal_items
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Seed admin role for the owner account
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE lower(email) = 'gabrielvlp33@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 1) legal_items: novos campos
ALTER TABLE public.legal_items
  ADD COLUMN IF NOT EXISTS empresa TEXT,
  ADD COLUMN IF NOT EXISTS agendamento DATE,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS meses_status JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) execuções
CREATE TABLE IF NOT EXISTS public.legal_item_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.legal_items(id) ON DELETE CASCADE,
  data_execucao DATE NOT NULL,
  observacao TEXT,
  executado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_item_executions TO authenticated;
GRANT ALL ON public.legal_item_executions TO service_role;

ALTER TABLE public.legal_item_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Executions readable by authenticated" ON public.legal_item_executions;
CREATE POLICY "Executions readable by authenticated" ON public.legal_item_executions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Executions insertable by authenticated" ON public.legal_item_executions;
CREATE POLICY "Executions insertable by authenticated" ON public.legal_item_executions
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Executions updatable by authenticated" ON public.legal_item_executions;
CREATE POLICY "Executions updatable by authenticated" ON public.legal_item_executions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Executions deletable by authenticated" ON public.legal_item_executions;
CREATE POLICY "Executions deletable by authenticated" ON public.legal_item_executions
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_legal_exec_item ON public.legal_item_executions(item_id);
CREATE INDEX IF NOT EXISTS idx_legal_exec_data ON public.legal_item_executions(data_execucao);

-- 3) anexos
CREATE TABLE IF NOT EXISTS public.legal_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.legal_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_item_attachments TO authenticated;
GRANT ALL ON public.legal_item_attachments TO service_role;

ALTER TABLE public.legal_item_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attachments readable by authenticated" ON public.legal_item_attachments;
CREATE POLICY "Attachments readable by authenticated" ON public.legal_item_attachments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Attachments insertable by authenticated" ON public.legal_item_attachments;
CREATE POLICY "Attachments insertable by authenticated" ON public.legal_item_attachments
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Attachments deletable by authenticated" ON public.legal_item_attachments;
CREATE POLICY "Attachments deletable by authenticated" ON public.legal_item_attachments
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_legal_att_item ON public.legal_item_attachments(item_id);

-- 4) políticas de storage para o bucket legal-certificates
DROP POLICY IF EXISTS "Legal certs read auth" ON storage.objects;
CREATE POLICY "Legal certs read auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'legal-certificates');
DROP POLICY IF EXISTS "Legal certs insert auth" ON storage.objects;
CREATE POLICY "Legal certs insert auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'legal-certificates');
DROP POLICY IF EXISTS "Legal certs update auth" ON storage.objects;
CREATE POLICY "Legal certs update auth" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'legal-certificates') WITH CHECK (bucket_id = 'legal-certificates');
DROP POLICY IF EXISTS "Legal certs delete auth" ON storage.objects;
CREATE POLICY "Legal certs delete auth" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'legal-certificates');

-- Suporta a nova periodicidade "trimestral" mencionada na planilha
-- (a coluna é TEXT, portanto não precisa alterar tipo; documento aqui apenas).
ALTER TABLE public.legal_items ADD COLUMN IF NOT EXISTS predio TEXT;
-- Add allowed_menus to profiles: NULL = all allowed, array = only these keys allowed
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_menus text[] DEFAULT NULL;

-- Function callable by authenticated users to fetch their own allowed_menus
CREATE OR REPLACE FUNCTION public.get_my_allowed_menus()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT allowed_menus FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_allowed_menus() TO authenticated;

CREATE TABLE public.lavanderia_colaboradores (
  matricula text PRIMARY KEY,
  nome text NOT NULL,
  setor text,
  tipo_peca_padrao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lavanderia_colaboradores TO authenticated;
GRANT ALL ON public.lavanderia_colaboradores TO service_role;
ALTER TABLE public.lavanderia_colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lav_colab_auth_all" ON public.lavanderia_colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_lav_colab_updated_at BEFORE UPDATE ON public.lavanderia_colaboradores FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.lavanderia_pecas (
  codigo text PRIMARY KEY,
  matricula text REFERENCES public.lavanderia_colaboradores(matricula) ON DELETE SET NULL,
  tipo_peca text NOT NULL DEFAULT 'Não informado',
  setor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lavanderia_pecas TO authenticated;
GRANT ALL ON public.lavanderia_pecas TO service_role;
ALTER TABLE public.lavanderia_pecas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lav_pecas_auth_all" ON public.lavanderia_pecas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_lav_pecas_matricula ON public.lavanderia_pecas(matricula);
CREATE TRIGGER trg_lav_pecas_updated_at BEFORE UPDATE ON public.lavanderia_pecas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.lavanderia_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('saida','entrada')),
  data date NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (codigo, tipo, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lavanderia_eventos TO authenticated;
GRANT ALL ON public.lavanderia_eventos TO service_role;
ALTER TABLE public.lavanderia_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lav_eventos_auth_all" ON public.lavanderia_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_lav_eventos_codigo_data ON public.lavanderia_eventos(codigo, data);
CREATE INDEX idx_lav_eventos_tipo_data ON public.lavanderia_eventos(tipo, data);

-- 1) Novos campos em backorder_os
ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS is_prioridade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_prioridade text,
  ADD COLUMN IF NOT EXISTS prioridade_nivel integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prioridade_scanned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_backorder_os_prioridade ON public.backorder_os (is_prioridade) WHERE is_prioridade = true;

-- 2) Configuração do motor (singleton — id=1)
CREATE TABLE IF NOT EXISTS public.backorder_prioridade_config (
  id smallint PRIMARY KEY DEFAULT 1,
  predios_sensiveis jsonb NOT NULL DEFAULT '[]'::jsonb,
  keyword_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  dias_forca_prioridade integer NOT NULL DEFAULT 60,
  familias_habilitadas jsonb NOT NULL DEFAULT '{"higiene":true,"cozinha":true,"seguranca":true,"criticidade":true,"tempo":true}'::jsonb,
  last_scan_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backorder_prioridade_config TO authenticated;
GRANT ALL ON public.backorder_prioridade_config TO service_role;

ALTER TABLE public.backorder_prioridade_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read config" ON public.backorder_prioridade_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write config" ON public.backorder_prioridade_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Semente padrão
INSERT INTO public.backorder_prioridade_config (id, predios_sensiveis, keyword_rules)
VALUES (
  1,
  '[{"predio":"C70","motivo":"Área de Cozinha","nivel":3}]'::jsonb,
  '[
    {"familia":"higiene","nivel":3,"label":"Higiene/Saúde","keywords":["sanitario entupido","entupimento","vazamento de esgoto","esgoto","mau cheiro","falta de agua","contaminacao","banheiro entupido"]},
    {"familia":"seguranca","nivel":3,"label":"Risco Operacional","keywords":["fio exposto","cabo exposto","curto circuito","principio de incendio","vazamento de gas","estrutura comprometida","porta de emergencia","risco de queda"]},
    {"familia":"cozinha","nivel":2,"label":"Área de Cozinha","keywords":["cozinha","refeitorio","copa","restaurante","camara fria"]}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Programação de Taludes tables
CREATE TYPE public.talude_tipo_servico AS ENUM ('rocada','contencao','drenagem','inspecao','plantio','outro');
CREATE TYPE public.talude_situacao AS ENUM ('programado','realizado','adiado_chuva','cancelado');

CREATE TABLE public.taludes_programacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  os_atividade text NOT NULL,
  talude text NOT NULL,
  tipo_servico public.talude_tipo_servico NOT NULL DEFAULT 'inspecao',
  data_programada date NOT NULL,
  equipe text NOT NULL DEFAULT '',
  situacao public.talude_situacao NOT NULL DEFAULT 'programado',
  observacoes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taludes_programacao TO authenticated;
GRANT ALL ON public.taludes_programacao TO service_role;
ALTER TABLE public.taludes_programacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read taludes_programacao" ON public.taludes_programacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert taludes_programacao" ON public.taludes_programacao FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth update taludes_programacao" ON public.taludes_programacao FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete taludes_programacao" ON public.taludes_programacao FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_taludes_programacao_updated BEFORE UPDATE ON public.taludes_programacao FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.taludes_clima_snapshot (
  data date PRIMARY KEY,
  temp_max numeric,
  temp_min numeric,
  precipitacao_mm_prev numeric,
  precipitacao_mm_real numeric,
  prob_chuva_prev numeric,
  condicao text,
  choveu boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.taludes_clima_snapshot TO authenticated;
GRANT ALL ON public.taludes_clima_snapshot TO service_role;
ALTER TABLE public.taludes_clima_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read clima snapshot" ON public.taludes_clima_snapshot FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth upsert clima snapshot" ON public.taludes_clima_snapshot FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update clima snapshot" ON public.taludes_clima_snapshot FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.taludes_clima_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  latitude numeric NOT NULL DEFAULT -23.6939,
  longitude numeric NOT NULL DEFAULT -46.5650,
  limite_prob_chuva numeric NOT NULL DEFAULT 60,
  limite_mm_chuva numeric NOT NULL DEFAULT 1.0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.taludes_clima_config TO authenticated;
GRANT ALL ON public.taludes_clima_config TO service_role;
ALTER TABLE public.taludes_clima_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read clima config" ON public.taludes_clima_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write clima config" ON public.taludes_clima_config FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.taludes_clima_config (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TRIGGER trg_taludes_clima_config_updated BEFORE UPDATE ON public.taludes_clima_config FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 1) has_role: remove EXECUTE público/anon; mantém para authenticated (RLS precisa)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Revoga grants desnecessários do papel anon em tabelas sensíveis (defense in depth)
REVOKE ALL ON public.user_roles                    FROM anon;
REVOKE ALL ON public.profiles                      FROM anon;
REVOKE ALL ON public.reminders                     FROM anon;
REVOKE ALL ON public.legal_items                   FROM anon;
REVOKE ALL ON public.legal_item_executions         FROM anon;
REVOKE ALL ON public.legal_item_attachments        FROM anon;
REVOKE ALL ON public.app_settings                  FROM anon;
REVOKE ALL ON public.assets_ref                    FROM anon;
REVOKE ALL ON public.backorder_os                  FROM anon;
REVOKE ALL ON public.backorder_atividade_override  FROM anon;
REVOKE ALL ON public.backorder_prioridade_config   FROM anon;
REVOKE ALL ON public.lavanderia_colaboradores      FROM anon;
REVOKE ALL ON public.lavanderia_pecas              FROM anon;
REVOKE ALL ON public.lavanderia_eventos            FROM anon;
REVOKE ALL ON public.taludes                       FROM anon;
REVOKE ALL ON public.talude_maps                   FROM anon;
REVOKE ALL ON public.taludes_programacao           FROM anon;
REVOKE ALL ON public.taludes_clima_config          FROM anon;
REVOKE ALL ON public.taludes_clima_snapshot        FROM anon;

-- 3) user_roles: políticas explícitas admin-only para INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins update roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins delete roles" ON public.user_roles;

CREATE POLICY "admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) profiles: SELECT restrito a próprio ou admin
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "own or admin select profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5) reminders: ownership em INSERT/UPDATE/DELETE (SELECT continua compartilhado com a equipe)
DROP POLICY IF EXISTS "Reminders insertable by authenticated" ON public.reminders;
DROP POLICY IF EXISTS "Reminders updatable by authenticated" ON public.reminders;
DROP POLICY IF EXISTS "Reminders deletable by authenticated" ON public.reminders;

CREATE POLICY "reminders insert own" ON public.reminders
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "reminders update own or admin" ON public.reminders
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "reminders delete own or admin" ON public.reminders
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 6) taludes_programacao: UPDATE/DELETE restritos a dono ou admin
DROP POLICY IF EXISTS "auth update taludes_programacao" ON public.taludes_programacao;
DROP POLICY IF EXISTS "auth delete taludes_programacao" ON public.taludes_programacao;

CREATE POLICY "programacao update own or admin" ON public.taludes_programacao
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "programacao delete own or admin" ON public.taludes_programacao
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 7) legal_items: SELECT permanece compartilhado; INSERT/UPDATE/DELETE restritos
DROP POLICY IF EXISTS "Legal items insertable by authenticated" ON public.legal_items;
DROP POLICY IF EXISTS "Legal items updatable by authenticated" ON public.legal_items;
DROP POLICY IF EXISTS "Legal items deletable by authenticated" ON public.legal_items;

CREATE POLICY "legal_items insert own" ON public.legal_items
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "legal_items update own or admin" ON public.legal_items
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "legal_items delete admin" ON public.legal_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 8) legal_item_executions: ownership por executado_por
DROP POLICY IF EXISTS "Executions insertable by authenticated" ON public.legal_item_executions;
DROP POLICY IF EXISTS "Executions updatable by authenticated" ON public.legal_item_executions;
DROP POLICY IF EXISTS "Executions deletable by authenticated" ON public.legal_item_executions;

CREATE POLICY "executions insert own" ON public.legal_item_executions
  FOR INSERT TO authenticated
  WITH CHECK (executado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "executions update own or admin" ON public.legal_item_executions
  FOR UPDATE TO authenticated
  USING (executado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (executado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "executions delete own or admin" ON public.legal_item_executions
  FOR DELETE TO authenticated
  USING (executado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 9) legal_item_attachments: ownership por uploaded_by; SELECT segue compartilhado
DROP POLICY IF EXISTS "Attachments insertable by authenticated" ON public.legal_item_attachments;
DROP POLICY IF EXISTS "Attachments deletable by authenticated" ON public.legal_item_attachments;

CREATE POLICY "attachments insert own" ON public.legal_item_attachments
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "attachments delete own or admin" ON public.legal_item_attachments
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 10) Storage bucket legal-certificates: exige anexo correspondente para acesso
DROP POLICY IF EXISTS "Legal certs read auth" ON storage.objects;
DROP POLICY IF EXISTS "Legal certs insert auth" ON storage.objects;
DROP POLICY IF EXISTS "Legal certs update auth" ON storage.objects;
DROP POLICY IF EXISTS "Legal certs delete auth" ON storage.objects;

CREATE POLICY "legal-certs read via attachment" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'legal-certificates'
    AND EXISTS (
      SELECT 1 FROM public.legal_item_attachments a
      WHERE a.storage_path = storage.objects.name
    )
  );

-- INSERT: qualquer autenticado pode subir; a linha em legal_item_attachments
-- exige uploaded_by = auth.uid(), então o arquivo fica "vinculado" pelo caminho.
CREATE POLICY "legal-certs insert auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'legal-certificates');

CREATE POLICY "legal-certs update own or admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'legal-certificates'
    AND EXISTS (
      SELECT 1 FROM public.legal_item_attachments a
      WHERE a.storage_path = storage.objects.name
        AND (a.uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  )
  WITH CHECK (bucket_id = 'legal-certificates');

CREATE POLICY "legal-certs delete own or admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'legal-certificates'
    AND EXISTS (
      SELECT 1 FROM public.legal_item_attachments a
      WHERE a.storage_path = storage.objects.name
        AND (a.uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

-- 11) Índices de performance em colunas de filtro/ordenação usadas com frequência
CREATE INDEX IF NOT EXISTS idx_backorder_os_finalizado_data      ON public.backorder_os (finalizado, data_solicitacao);
CREATE INDEX IF NOT EXISTS idx_backorder_os_prioridade           ON public.backorder_os (is_prioridade) WHERE is_prioridade = true;
CREATE INDEX IF NOT EXISTS idx_reminders_data                    ON public.reminders (data);
CREATE INDEX IF NOT EXISTS idx_reminders_created_by              ON public.reminders (created_by);
CREATE INDEX IF NOT EXISTS idx_legal_items_created_by            ON public.legal_items (created_by);
CREATE INDEX IF NOT EXISTS idx_legal_item_executions_item        ON public.legal_item_executions (item_id, data_execucao DESC);
CREATE INDEX IF NOT EXISTS idx_legal_item_attachments_item       ON public.legal_item_attachments (item_id);
CREATE INDEX IF NOT EXISTS idx_taludes_programacao_user_data     ON public.taludes_programacao (user_id, data_programada);
CREATE INDEX IF NOT EXISTS idx_taludes_owner                     ON public.taludes (owner_id);
CREATE INDEX IF NOT EXISTS idx_taludes_map                       ON public.taludes (map_id);
CREATE INDEX IF NOT EXISTS idx_lavanderia_eventos_data           ON public.lavanderia_eventos (data DESC);
CREATE INDEX IF NOT EXISTS idx_lavanderia_eventos_codigo         ON public.lavanderia_eventos (codigo);
CREATE INDEX IF NOT EXISTS idx_user_roles_user                   ON public.user_roles (user_id);

CREATE TABLE public.taludes_chuva_evidencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL,
  mensagem text NOT NULL,
  imagem_data_url text NOT NULL,
  temperatura numeric,
  condicao text,
  precipitacao_mm numeric,
  prob_chuva numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_taludes_chuva_evid_data ON public.taludes_chuva_evidencias(data DESC);
CREATE INDEX idx_taludes_chuva_evid_created_by ON public.taludes_chuva_evidencias(created_by);

GRANT SELECT, INSERT, DELETE ON public.taludes_chuva_evidencias TO authenticated;
GRANT ALL ON public.taludes_chuva_evidencias TO service_role;

ALTER TABLE public.taludes_chuva_evidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem evidências" ON public.taludes_chuva_evidencias
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados inserem evidências" ON public.taludes_chuva_evidencias
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Autor ou admin remove evidências" ON public.taludes_chuva_evidencias
  FOR DELETE TO authenticated USING (
    auth.uid() = created_by OR public.has_role(auth.uid(), 'admin')
  );

ALTER TABLE public.backorder_os ADD COLUMN IF NOT EXISTS criticidade text NOT NULL DEFAULT '';

UPDATE public.backorder_os
SET criticidade = outros,
    outros = ''
WHERE criticidade = ''
  AND translate(upper(outros), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
      ~ '^(MEDIA|ALTA|BAIXA|URGENTE|EMERGENCIAL|EMERGENCIA|CRITICA|CRITICO|NORMAL|MEDIA/ALTA|MEDIA/BAIXA)$';
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      _role = 'admin'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = _user_id
          AND lower(coalesce(u.email, '')) = 'gabrielvlp33@gmail.com'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = _role
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'gabrielvlp33@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_my_allowed_menus()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN NULL::text[]
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN (
      SELECT p.allowed_menus FROM public.profiles p WHERE p.id = auth.uid()
    )
    ELSE ARRAY[]::text[]
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_allowed_menus() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_allowed_menus() TO authenticated, service_role;
-- 1) assets_ref: novas colunas hierárquicas
ALTER TABLE public.assets_ref
  ADD COLUMN IF NOT EXISTS nivel text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS codigo_pai text,
  ADD COLUMN IF NOT EXISTS descricao_pai text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unidade_negocio text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS assets_ref_codigo_pai_idx ON public.assets_ref (codigo_pai);
CREATE INDEX IF NOT EXISTS assets_ref_nivel_idx ON public.assets_ref (nivel);

-- 2) backorder_os: flag de revisão manual
ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS revisao_manual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS backorder_os_revisao_idx
  ON public.backorder_os (revisao_manual) WHERE revisao_manual = true;

-- 3) Tabela de regras de classificação (editável)
CREATE TABLE IF NOT EXISTS public.regras_classificacao_equipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe text NOT NULL,
  palavra_chave text NOT NULL,
  prioridade integer NOT NULL DEFAULT 100,
  fonte text NOT NULL DEFAULT 'descricao', -- 'descricao' | 'categoria'
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipe, palavra_chave, fonte)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_classificacao_equipe TO authenticated;
GRANT ALL ON public.regras_classificacao_equipe TO service_role;

ALTER TABLE public.regras_classificacao_equipe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regras auth read" ON public.regras_classificacao_equipe
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "regras auth write" ON public.regras_classificacao_equipe
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER regras_touch
  BEFORE UPDATE ON public.regras_classificacao_equipe
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed de regras (ordem de prioridade menor = avaliado antes)
INSERT INTO public.regras_classificacao_equipe (equipe, palavra_chave, prioridade, fonte) VALUES
  ('Chaveiro', 'fechadura', 10, 'descricao'),
  ('Chaveiro', 'chave', 10, 'descricao'),
  ('Chaveiro', 'macaneta', 10, 'descricao'),
  ('Chaveiro', 'cadeado', 10, 'descricao'),
  ('Chaveiro', 'trinco', 10, 'descricao'),
  ('Chaveiro', 'miolo', 10, 'descricao'),
  ('Chaveiro', 'cilindro', 10, 'descricao'),
  ('Chaveiro', 'segredo', 10, 'descricao'),
  ('Pintura', 'pintura', 20, 'descricao'),
  ('Pintura', 'pintar', 20, 'descricao'),
  ('Pintura', 'repintura', 20, 'descricao'),
  ('Pintura', 'demarcacao', 20, 'descricao'),
  ('Pintura', 'demarcar', 20, 'descricao'),
  ('Pintura', 'sinalizacao de piso', 20, 'descricao'),
  ('Pintura', 'faixa de piso', 20, 'descricao'),
  ('Pintura', 'tinta', 20, 'descricao'),
  ('Pintura', 'verniz', 20, 'descricao'),
  ('Refrigeração', 'ar condicionado', 30, 'descricao'),
  ('Refrigeração', 'ar-condicionado', 30, 'descricao'),
  ('Refrigeração', 'climatiza', 30, 'descricao'),
  ('Refrigeração', 'split', 30, 'descricao'),
  ('Refrigeração', 'chiller', 30, 'descricao'),
  ('Refrigeração', 'refrigera', 30, 'descricao'),
  ('Refrigeração', 'geladeira', 30, 'descricao'),
  ('Refrigeração', 'freezer', 30, 'descricao'),
  ('Refrigeração', 'exaustor', 30, 'descricao'),
  ('Refrigeração', 'climat', 30, 'categoria'),
  ('Refrigeração', 'refrig', 30, 'categoria'),
  ('Elétrica', 'eletr', 40, 'categoria'),
  ('Elétrica', 'tomada', 40, 'descricao'),
  ('Elétrica', 'disjuntor', 40, 'descricao'),
  ('Elétrica', 'curto', 40, 'descricao'),
  ('Elétrica', 'iluminacao', 40, 'descricao'),
  ('Elétrica', 'lampada', 40, 'descricao'),
  ('Elétrica', 'luminaria', 40, 'descricao'),
  ('Elétrica', 'interruptor', 40, 'descricao'),
  ('Elétrica', 'quadro eletrico', 40, 'descricao'),
  ('Elétrica', 'fiacao', 40, 'descricao'),
  ('Hidráulica', 'hidr', 50, 'categoria'),
  ('Hidráulica', 'vazamento', 50, 'descricao'),
  ('Hidráulica', 'valvula', 50, 'descricao'),
  ('Hidráulica', 'descarga', 50, 'descricao'),
  ('Hidráulica', 'torneira', 50, 'descricao'),
  ('Hidráulica', 'encanamento', 50, 'descricao'),
  ('Hidráulica', 'esgoto', 50, 'descricao'),
  ('Hidráulica', 'ralo', 50, 'descricao'),
  ('Hidráulica', 'bomba', 50, 'descricao'),
  ('Hidráulica', 'sifao', 50, 'descricao'),
  ('Hidráulica', 'mictorio', 50, 'descricao'),
  ('Hidráulica', 'vaso sanitario', 50, 'descricao'),
  ('Hidráulica', 'entupimento', 50, 'descricao'),
  ('Civil', 'civil', 90, 'categoria'),
  ('Civil', 'marcen', 90, 'categoria'),
  ('Civil', 'alvenaria', 90, 'descricao'),
  ('Civil', 'piso', 90, 'descricao'),
  ('Civil', 'parede', 90, 'descricao'),
  ('Civil', 'teto', 90, 'descricao'),
  ('Civil', 'forro', 90, 'descricao'),
  ('Civil', 'porta', 90, 'descricao'),
  ('Civil', 'janela', 90, 'descricao'),
  ('Civil', 'esquadria', 90, 'descricao'),
  ('Civil', 'drywall', 90, 'descricao'),
  ('Civil', 'gesso', 90, 'descricao'),
  ('Civil', 'reboco', 90, 'descricao'),
  ('Civil', 'trinca', 90, 'descricao'),
  ('Civil', 'telha', 90, 'descricao'),
  ('Civil', 'revestimento', 90, 'descricao')
ON CONFLICT (equipe, palavra_chave, fonte) DO NOTHING;

CREATE TABLE public.regras_aprendidas_localizacao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_ativo text NOT NULL,
  predio text NOT NULL DEFAULT '',
  andar text NOT NULL DEFAULT '',
  espaco text NOT NULL DEFAULT '',
  origem_chamado_os text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_regras_aprend_loc_ativo ON public.regras_aprendidas_localizacao(codigo_ativo) WHERE ativo;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_aprendidas_localizacao TO authenticated;
GRANT ALL ON public.regras_aprendidas_localizacao TO service_role;
ALTER TABLE public.regras_aprendidas_localizacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read learned loc" ON public.regras_aprendidas_localizacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write learned loc" ON public.regras_aprendidas_localizacao FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update learned loc" ON public.regras_aprendidas_localizacao FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete learned loc" ON public.regras_aprendidas_localizacao FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_regras_aprend_loc_updated BEFORE UPDATE ON public.regras_aprendidas_localizacao
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.regras_aprendidas_equipe (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_ativo text,
  equipe text NOT NULL,
  origem_chamado_os text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_regras_aprend_equipe_ativo ON public.regras_aprendidas_equipe(codigo_ativo) WHERE ativo;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_aprendidas_equipe TO authenticated;
GRANT ALL ON public.regras_aprendidas_equipe TO service_role;
ALTER TABLE public.regras_aprendidas_equipe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read learned team" ON public.regras_aprendidas_equipe FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write learned team" ON public.regras_aprendidas_equipe FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update learned team" ON public.regras_aprendidas_equipe FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete learned team" ON public.regras_aprendidas_equipe FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_regras_aprend_equipe_updated BEFORE UPDATE ON public.regras_aprendidas_equipe
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS origem_predio_andar_espaco text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS origem_equipe text NOT NULL DEFAULT 'classificacao_automatica';

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

ALTER TABLE public.sst_colaboradores
  ADD COLUMN IF NOT EXISTS regional text,
  ADD COLUMN IF NOT EXISTS descricao_filial text,
  ADD COLUMN IF NOT EXISTS gerente text,
  ADD COLUMN IF NOT EXISTS gerente_regional text,
  ADD COLUMN IF NOT EXISTS diretor text,
  ADD COLUMN IF NOT EXISTS diretor_executivo text,
  ADD COLUMN IF NOT EXISTS negocio text,
  ADD COLUMN IF NOT EXISTS cod_funcao text,
  ADD COLUMN IF NOT EXISTS descricao_funcao text,
  ADD COLUMN IF NOT EXISTS escala text,
  ADD COLUMN IF NOT EXISTS sexo text,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS pis text,
  ADD COLUMN IF NOT EXISTS ctps text,
  ADD COLUMN IF NOT EXISTS serie_ctps text,
  ADD COLUMN IF NOT EXISTS horario_trabalho text,
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS cr text,
  ADD COLUMN IF NOT EXISTS tipo_contrato text,
  ADD COLUMN IF NOT EXISTS data_demissao date,
  ADD COLUMN IF NOT EXISTS dados_extras jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.refrigeracao_os_status AS ENUM ('aberta','em_andamento','resolvida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refrigeracao_urgencia AS ENUM ('baixa','media','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refrigeracao_gravidade AS ENUM ('falha','parcial','parado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refrigeracao_status_gestor AS ENUM ('novo','visto','andamento','resolvido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OS catálogo
CREATE TABLE public.refrigeracao_os (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os TEXT NOT NULL UNIQUE,
  ativo TEXT NOT NULL,
  equipamento TEXT NOT NULL,
  patrimonio TEXT NOT NULL,
  localizacao TEXT,
  status public.refrigeracao_os_status NOT NULL DEFAULT 'aberta',
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.refrigeracao_os (patrimonio);
CREATE INDEX ON public.refrigeracao_os (ativo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_os TO authenticated;
GRANT ALL ON public.refrigeracao_os TO service_role;
ALTER TABLE public.refrigeracao_os ENABLE ROW LEVEL SECURITY;

CREATE POLICY "OS: read for authenticated" ON public.refrigeracao_os
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "OS: admin insert" ON public.refrigeracao_os
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "OS: admin update" ON public.refrigeracao_os
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "OS: admin delete" ON public.refrigeracao_os
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_refrigeracao_os_updated
  BEFORE UPDATE ON public.refrigeracao_os
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Fotos
CREATE TABLE public.refrigeracao_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES public.refrigeracao_os(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  thumb_path TEXT,
  legenda TEXT,
  client_uuid UUID NOT NULL,
  enviado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enviado_por, client_uuid)
);
CREATE INDEX ON public.refrigeracao_fotos (os_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_fotos TO authenticated;
GRANT ALL ON public.refrigeracao_fotos TO service_role;
ALTER TABLE public.refrigeracao_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fotos: read own or admin" ON public.refrigeracao_fotos
  FOR SELECT TO authenticated USING (enviado_por = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Fotos: insert own" ON public.refrigeracao_fotos
  FOR INSERT TO authenticated WITH CHECK (enviado_por = auth.uid());
CREATE POLICY "Fotos: admin update" ON public.refrigeracao_fotos
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Fotos: owner or admin delete" ON public.refrigeracao_fotos
  FOR DELETE TO authenticated USING (enviado_por = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Peças
CREATE TABLE public.refrigeracao_pecas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES public.refrigeracao_os(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  urgencia public.refrigeracao_urgencia NOT NULL DEFAULT 'media',
  observacao TEXT,
  status_gestor public.refrigeracao_status_gestor NOT NULL DEFAULT 'novo',
  client_uuid UUID NOT NULL,
  enviado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enviado_por, client_uuid)
);
CREATE INDEX ON public.refrigeracao_pecas (os_id);
CREATE INDEX ON public.refrigeracao_pecas (urgencia);
CREATE INDEX ON public.refrigeracao_pecas (status_gestor);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_pecas TO authenticated;
GRANT ALL ON public.refrigeracao_pecas TO service_role;
ALTER TABLE public.refrigeracao_pecas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pecas: read own or admin" ON public.refrigeracao_pecas
  FOR SELECT TO authenticated USING (enviado_por = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Pecas: insert own" ON public.refrigeracao_pecas
  FOR INSERT TO authenticated WITH CHECK (enviado_por = auth.uid());
CREATE POLICY "Pecas: admin update" ON public.refrigeracao_pecas
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Pecas: owner or admin delete" ON public.refrigeracao_pecas
  FOR DELETE TO authenticated USING (enviado_por = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_refrigeracao_pecas_updated
  BEFORE UPDATE ON public.refrigeracao_pecas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Problemas
CREATE TABLE public.refrigeracao_problemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES public.refrigeracao_os(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  gravidade public.refrigeracao_gravidade NOT NULL DEFAULT 'falha',
  status_gestor public.refrigeracao_status_gestor NOT NULL DEFAULT 'novo',
  client_uuid UUID NOT NULL,
  enviado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enviado_por, client_uuid)
);
CREATE INDEX ON public.refrigeracao_problemas (os_id);
CREATE INDEX ON public.refrigeracao_problemas (gravidade);
CREATE INDEX ON public.refrigeracao_problemas (status_gestor);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_problemas TO authenticated;
GRANT ALL ON public.refrigeracao_problemas TO service_role;
ALTER TABLE public.refrigeracao_problemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Probl: read own or admin" ON public.refrigeracao_problemas
  FOR SELECT TO authenticated USING (enviado_por = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Probl: insert own" ON public.refrigeracao_problemas
  FOR INSERT TO authenticated WITH CHECK (enviado_por = auth.uid());
CREATE POLICY "Probl: admin update" ON public.refrigeracao_problemas
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Probl: owner or admin delete" ON public.refrigeracao_problemas
  FOR DELETE TO authenticated USING (enviado_por = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_refrigeracao_problemas_updated
  BEFORE UPDATE ON public.refrigeracao_problemas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Storage: policies do bucket refrigeracao-fotos (o bucket é criado via ferramenta).
-- Usuário lê apenas objetos que anexou (path: <uid>/...); admin lê tudo.
CREATE POLICY "refrigeracao-fotos read own or admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'refrigeracao-fotos'
    AND (
      public.has_role(auth.uid(),'admin')
      OR (auth.uid()::text = split_part(name, '/', 1))
    )
  );
CREATE POLICY "refrigeracao-fotos insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'refrigeracao-fotos'
    AND auth.uid()::text = split_part(name, '/', 1)
  );
CREATE POLICY "refrigeracao-fotos delete own or admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'refrigeracao-fotos'
    AND (
      public.has_role(auth.uid(),'admin')
      OR (auth.uid()::text = split_part(name, '/', 1))
    )
  );

-- Rebaixa climatizacao: remove role admin e restringe menus
DELETE FROM public.user_roles
  WHERE user_id = (SELECT id FROM auth.users WHERE lower(email) = 'climatizacao@apontauto.local');

INSERT INTO public.profiles (id, allowed_menus)
  SELECT id, ARRAY['refrigeracao']::text[]
  FROM auth.users WHERE lower(email) = 'climatizacao@apontauto.local'
ON CONFLICT (id) DO UPDATE SET allowed_menus = ARRAY['refrigeracao']::text[], updated_at = now();
-- Seed do usuário de campo dedicado à Refrigeração.
-- Login: climatizacao / Senha inicial: 123456 (recomendado trocar depois).
DO $$
DECLARE
  uid uuid;
  existing_uid uuid;
BEGIN
  SELECT id INTO existing_uid FROM auth.users WHERE email = 'climatizacao@apontauto.local';
  IF existing_uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
    ) VALUES (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'climatizacao@apontauto.local',
      crypt('123456', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Climatização"}'::jsonb,
      false, false
    );
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at
    ) VALUES (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', 'climatizacao@apontauto.local'),
      'email', now(), now(), now()
    );
  ELSE
    uid := existing_uid;
  END IF;

  INSERT INTO public.profiles (id, full_name, allowed_menus)
  VALUES (uid, 'Climatização', ARRAY['refrigeracao'])
  ON CONFLICT (id) DO UPDATE SET allowed_menus = ARRAY['refrigeracao'];
END $$;-- 1) Conserta o bug "converting NULL to string is unsupported" em auth.users.
--    O GoTrue exige string vazia (não NULL) nessas colunas.
UPDATE auth.users
SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change               = COALESCE(email_change, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE
     confirmation_token IS NULL
  OR recovery_token IS NULL
  OR email_change_token_new IS NULL
  OR email_change_token_current IS NULL
  OR email_change IS NULL
  OR phone_change IS NULL
  OR phone_change_token IS NULL
  OR reauthentication_token IS NULL;

-- 2) Garante que o usuário `climatizacao` existe com a senha correta.
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'climatizacao@apontauto.local';
  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user,
      confirmation_token, recovery_token,
      email_change_token_new, email_change_token_current,
      email_change, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'climatizacao@apontauto.local',
      crypt('123456', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Climatização"}'::jsonb,
      false, false,
      '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at
    ) VALUES (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', 'climatizacao@apontauto.local'),
      'email', now(), now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('123456', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = uid;
  END IF;

  INSERT INTO public.profiles (id, full_name, allowed_menus)
  VALUES (uid, 'Climatização', ARRAY['refrigeracao'])
  ON CONFLICT (id) DO UPDATE SET allowed_menus = ARRAY['refrigeracao'];
END $$;

-- 3) Remove o antigo login `colaboradores` (não é mais usado).
DELETE FROM auth.users WHERE email = 'colaboradores@apontauto.local';
-- Recria módulo Refrigeração do zero com colunas novas (Prédio/Andar/Local/Tipo/Equipe/SLA/Programada/Início/Fim/Nome OS) e patrimônio opcional.
DROP TABLE IF EXISTS public.refrigeracao_fotos CASCADE;
DROP TABLE IF EXISTS public.refrigeracao_pecas CASCADE;
DROP TABLE IF EXISTS public.refrigeracao_problemas CASCADE;
DROP TABLE IF EXISTS public.refrigeracao_os CASCADE;

DO $$ BEGIN
  CREATE TYPE public.refrig_os_status AS ENUM ('aberta','em_andamento','concluida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.refrig_urgencia AS ENUM ('baixa','media','alta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.refrig_gravidade AS ENUM ('observacao','falha','critico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.refrig_status_gestor AS ENUM ('pendente','em_analise','aprovado','rejeitado','concluido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OS
CREATE TABLE public.refrigeracao_os (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os TEXT NOT NULL UNIQUE,
  nome_os TEXT,
  predio TEXT,
  andar TEXT,
  local TEXT,
  tipo TEXT,
  equipe TEXT,
  data_sla DATE,
  data_programada DATE,
  inicio TIMESTAMPTZ,
  fim TIMESTAMPTZ,
  ativo TEXT NOT NULL,
  equipamento TEXT NOT NULL,
  patrimonio TEXT,
  status public.refrig_os_status NOT NULL DEFAULT 'aberta',
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_os TO authenticated;
GRANT ALL ON public.refrigeracao_os TO service_role;
ALTER TABLE public.refrigeracao_os ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refrig_os_read" ON public.refrigeracao_os FOR SELECT TO authenticated USING (true);
CREATE POLICY "refrig_os_insert" ON public.refrigeracao_os FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "refrig_os_update" ON public.refrigeracao_os FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "refrig_os_delete_admin" ON public.refrigeracao_os FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_refrig_os_updated BEFORE UPDATE ON public.refrigeracao_os FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_refrig_os_status ON public.refrigeracao_os(status);
CREATE INDEX idx_refrig_os_data_prog ON public.refrigeracao_os(data_programada);

-- Fotos
CREATE TABLE public.refrigeracao_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES public.refrigeracao_os(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  legenda TEXT,
  client_uuid UUID UNIQUE,
  enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_fotos TO authenticated;
GRANT ALL ON public.refrigeracao_fotos TO service_role;
ALTER TABLE public.refrigeracao_fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refrig_fotos_read" ON public.refrigeracao_fotos FOR SELECT TO authenticated USING (true);
CREATE POLICY "refrig_fotos_insert" ON public.refrigeracao_fotos FOR INSERT TO authenticated WITH CHECK (auth.uid() = enviado_por);
CREATE POLICY "refrig_fotos_delete_admin" ON public.refrigeracao_fotos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- Peças
CREATE TABLE public.refrigeracao_pecas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES public.refrigeracao_os(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  urgencia public.refrig_urgencia NOT NULL DEFAULT 'media',
  observacao TEXT,
  status_gestor public.refrig_status_gestor NOT NULL DEFAULT 'pendente',
  client_uuid UUID UNIQUE,
  enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_pecas TO authenticated;
GRANT ALL ON public.refrigeracao_pecas TO service_role;
ALTER TABLE public.refrigeracao_pecas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refrig_pecas_read" ON public.refrigeracao_pecas FOR SELECT TO authenticated USING (true);
CREATE POLICY "refrig_pecas_insert" ON public.refrigeracao_pecas FOR INSERT TO authenticated WITH CHECK (auth.uid() = enviado_por);
CREATE POLICY "refrig_pecas_update_admin" ON public.refrigeracao_pecas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "refrig_pecas_delete_admin" ON public.refrigeracao_pecas FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_refrig_pecas_updated BEFORE UPDATE ON public.refrigeracao_pecas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Problemas
CREATE TABLE public.refrigeracao_problemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES public.refrigeracao_os(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  gravidade public.refrig_gravidade NOT NULL DEFAULT 'falha',
  status_gestor public.refrig_status_gestor NOT NULL DEFAULT 'pendente',
  client_uuid UUID UNIQUE,
  enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_problemas TO authenticated;
GRANT ALL ON public.refrigeracao_problemas TO service_role;
ALTER TABLE public.refrigeracao_problemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refrig_probl_read" ON public.refrigeracao_problemas FOR SELECT TO authenticated USING (true);
CREATE POLICY "refrig_probl_insert" ON public.refrigeracao_problemas FOR INSERT TO authenticated WITH CHECK (auth.uid() = enviado_por);
CREATE POLICY "refrig_probl_update_admin" ON public.refrigeracao_problemas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "refrig_probl_delete_admin" ON public.refrigeracao_problemas FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_refrig_probl_updated BEFORE UPDATE ON public.refrigeracao_problemas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = 'colaboradores@apontauto.local';
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      'colaboradores@apontauto.local', crypt('123456', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Colaboradores"}'::jsonb, false,
      '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', 'colaboradores@apontauto.local', 'email_verified', true), 'email', now(), now(), now());
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt('123456', gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           confirmation_token = '', recovery_token = '',
           email_change_token_new = '', email_change = '',
           email_change_token_current = '', reauthentication_token = '',
           phone_change = '', phone_change_token = '',
           updated_at = now()
     WHERE id = v_id;
  END IF;

  -- Ensure profile exists with all menus allowed (full access, non-admin).
  INSERT INTO public.profiles (id, full_name, allowed_menus)
  VALUES (v_id, 'Colaboradores', NULL)
  ON CONFLICT (id) DO UPDATE SET allowed_menus = NULL;
END $$;

-- Also normalize any NULL auth tokens across the board (fixes GoTrue scan bug).
UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, '');

CREATE TABLE public.preventiva_ac_registros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag TEXT NOT NULL,
  tipo_equipamento TEXT,
  marca TEXT,
  modelo TEXT,
  numero_serie TEXT,
  capacidade_btu NUMERIC,
  fluido_refrigerante TEXT,
  ano_fabricacao INTEGER,
  data_instalacao DATE,
  predio TEXT,
  andar TEXT,
  local TEXT,
  ambiente TEXT,
  area_climatizada NUMERIC,
  ocupacao_max INTEGER,
  fabricante TEXT,
  responsavel_tecnico TEXT,
  data_manutencao DATE,
  tipo_servico TEXT,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  medicoes JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacoes TEXT,
  colaborador TEXT,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preventiva_ac_registros TO authenticated;
GRANT ALL ON public.preventiva_ac_registros TO service_role;

ALTER TABLE public.preventiva_ac_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preventiva_ac_select"
  ON public.preventiva_ac_registros FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.allowed_menus IS NOT NULL
        AND 'preventiva-ac' = ANY(p.allowed_menus)
    )
  );

CREATE POLICY "preventiva_ac_insert"
  ON public.preventiva_ac_registros FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.allowed_menus IS NOT NULL
        AND 'preventiva-ac' = ANY(p.allowed_menus)
    )
  );

CREATE POLICY "preventiva_ac_update"
  ON public.preventiva_ac_registros FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR criado_por = auth.uid()
  );

CREATE POLICY "preventiva_ac_delete"
  ON public.preventiva_ac_registros FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR criado_por = auth.uid()
  );

CREATE TRIGGER trg_preventiva_ac_updated
  BEFORE UPDATE ON public.preventiva_ac_registros
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_preventiva_ac_tag ON public.preventiva_ac_registros (tag);
CREATE INDEX idx_preventiva_ac_data ON public.preventiva_ac_registros (data_manutencao DESC);

ALTER TABLE public.preventiva_ac_registros
  ADD COLUMN IF NOT EXISTS status_equipamento TEXT,
  ADD COLUMN IF NOT EXISTS quantidade_fluido TEXT;

UPDATE public.profiles
SET allowed_menus = ARRAY['refrigeracao','refrigeracao-historico','preventiva-ac']
WHERE id = 'fbda7bd9-924d-4f8d-8264-cb74853ae676';
ALTER TABLE public.backorder_os REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.backorder_os;ALTER TABLE public.taludes ADD COLUMN IF NOT EXISTS cor TEXT;ALTER TABLE public.app_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.app_settings ALTER COLUMN id TYPE text USING id::text;ALTER TABLE public.app_settings ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;ALTER TABLE public.taludes
  ADD COLUMN IF NOT EXISTS area_m2 numeric,
  ADD COLUMN IF NOT EXISTS perimetro_m numeric;

ALTER TABLE public.talude_maps
  ADD COLUMN IF NOT EXISTS escala_m_por_px numeric;
-- ENUMs (reaproveitando semântica do módulo refrigeração)
CREATE TYPE public.corretiva_os_status AS ENUM ('aberta', 'em_andamento', 'concluida', 'cancelada');
CREATE TYPE public.corretiva_urgencia AS ENUM ('baixa', 'media', 'alta');
CREATE TYPE public.corretiva_gravidade AS ENUM ('observacao', 'falha', 'critico');
CREATE TYPE public.corretiva_status_gestor AS ENUM ('pendente', 'aprovado', 'rejeitado', 'concluido');

-- Tabela de equipes (nome + colaboradores)
CREATE TABLE public.corretiva_equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  colaboradores text NOT NULL DEFAULT '',
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.corretiva_equipes TO authenticated, anon;
GRANT ALL ON public.corretiva_equipes TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.corretiva_equipes TO authenticated;
ALTER TABLE public.corretiva_equipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretiva_equipes_read" ON public.corretiva_equipes FOR SELECT USING (true);
CREATE POLICY "corretiva_equipes_admin_write" ON public.corretiva_equipes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "corretiva_equipes_admin_update" ON public.corretiva_equipes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "corretiva_equipes_admin_delete" ON public.corretiva_equipes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_corretiva_equipes_updated BEFORE UPDATE ON public.corretiva_equipes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.corretiva_equipes (nome, colaboradores, ordem) VALUES ('Hidráulica', 'Emerson - William', 1);

-- OS
CREATE TABLE public.corretiva_os (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os text NOT NULL UNIQUE,
  nome_os text,
  predio text,
  andar text,
  local text,
  tipo text DEFAULT 'Corretiva',
  equipe text,
  data_sla date,
  data_programada date,
  inicio timestamptz,
  fim timestamptz,
  ativo text NOT NULL,
  equipamento text NOT NULL,
  patrimonio text,
  status public.corretiva_os_status NOT NULL DEFAULT 'aberta',
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_corretiva_os_status ON public.corretiva_os(status);
CREATE INDEX idx_corretiva_os_data_prog ON public.corretiva_os(data_programada);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_os TO authenticated;
GRANT ALL ON public.corretiva_os TO service_role;
ALTER TABLE public.corretiva_os ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretiva_os_read" ON public.corretiva_os FOR SELECT USING (true);
CREATE POLICY "corretiva_os_insert" ON public.corretiva_os FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "corretiva_os_update" ON public.corretiva_os FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "corretiva_os_delete_admin" ON public.corretiva_os FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_corretiva_os_updated BEFORE UPDATE ON public.corretiva_os FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Fotos
CREATE TABLE public.corretiva_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.corretiva_os(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  legenda text,
  client_uuid uuid UNIQUE,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.corretiva_fotos TO authenticated;
GRANT ALL ON public.corretiva_fotos TO service_role;
ALTER TABLE public.corretiva_fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretiva_fotos_read" ON public.corretiva_fotos FOR SELECT USING (true);
CREATE POLICY "corretiva_fotos_insert" ON public.corretiva_fotos FOR INSERT TO authenticated WITH CHECK (auth.uid() = enviado_por);
CREATE POLICY "corretiva_fotos_delete_admin" ON public.corretiva_fotos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Peças
CREATE TABLE public.corretiva_pecas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.corretiva_os(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  urgencia public.corretiva_urgencia NOT NULL DEFAULT 'media',
  observacao text,
  status_gestor public.corretiva_status_gestor NOT NULL DEFAULT 'pendente',
  client_uuid uuid UNIQUE,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.corretiva_pecas TO authenticated;
GRANT ALL ON public.corretiva_pecas TO service_role;
ALTER TABLE public.corretiva_pecas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretiva_pecas_read" ON public.corretiva_pecas FOR SELECT USING (true);
CREATE POLICY "corretiva_pecas_insert" ON public.corretiva_pecas FOR INSERT TO authenticated WITH CHECK (auth.uid() = enviado_por);
CREATE POLICY "corretiva_pecas_update_admin" ON public.corretiva_pecas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "corretiva_pecas_delete_admin" ON public.corretiva_pecas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_corretiva_pecas_updated BEFORE UPDATE ON public.corretiva_pecas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Problemas
CREATE TABLE public.corretiva_problemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.corretiva_os(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  gravidade public.corretiva_gravidade NOT NULL DEFAULT 'falha',
  status_gestor public.corretiva_status_gestor NOT NULL DEFAULT 'pendente',
  client_uuid uuid UNIQUE,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.corretiva_problemas TO authenticated;
GRANT ALL ON public.corretiva_problemas TO service_role;
ALTER TABLE public.corretiva_problemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretiva_problemas_read" ON public.corretiva_problemas FOR SELECT USING (true);
CREATE POLICY "corretiva_problemas_insert" ON public.corretiva_problemas FOR INSERT TO authenticated WITH CHECK (auth.uid() = enviado_por);
CREATE POLICY "corretiva_problemas_update_admin" ON public.corretiva_problemas FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "corretiva_problemas_delete_admin" ON public.corretiva_problemas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_corretiva_problemas_updated BEFORE UPDATE ON public.corretiva_problemas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "corretiva_fotos_bucket_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'corretiva-fotos');
CREATE POLICY "corretiva_fotos_bucket_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'corretiva-fotos');
CREATE POLICY "corretiva_fotos_bucket_delete_admin" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'corretiva-fotos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP INDEX IF EXISTS public.taludes_map_numero_uk;INSERT INTO public.profiles (id, allowed_menus)
SELECT u.id, ARRAY['corretiva','corretiva-historico']::text[]
FROM auth.users u
WHERE u.email = 'hidraulica@apontauto.local'
ON CONFLICT (id) DO UPDATE SET allowed_menus = EXCLUDED.allowed_menus;
-- Enums
DO $$ BEGIN
  CREATE TYPE public.prisma_lote_categoria AS ENUM ('refrigeracao', 'geral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prisma_lote_status AS ENUM ('rascunho', 'pendente', 'em_execucao', 'concluido', 'erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prisma_os_status AS ENUM ('pendente', 'em_execucao', 'concluido', 'erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tecnicos
CREATE TABLE public.prisma_tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  matricula TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_tecnicos TO authenticated;
GRANT ALL ON public.prisma_tecnicos TO service_role;
ALTER TABLE public.prisma_tecnicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_tecnicos" ON public.prisma_tecnicos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_tecnicos_user ON public.prisma_tecnicos(user_id);

-- equipes
CREATE TABLE public.prisma_equipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipes TO authenticated;
GRANT ALL ON public.prisma_equipes TO service_role;
ALTER TABLE public.prisma_equipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_equipes" ON public.prisma_equipes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_equipes_user ON public.prisma_equipes(user_id);

-- equipe_tecnicos
CREATE TABLE public.prisma_equipe_tecnicos (
  equipe_id UUID NOT NULL REFERENCES public.prisma_equipes(id) ON DELETE CASCADE,
  tecnico_id UUID NOT NULL REFERENCES public.prisma_tecnicos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (equipe_id, tecnico_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipe_tecnicos TO authenticated;
GRANT ALL ON public.prisma_equipe_tecnicos TO service_role;
ALTER TABLE public.prisma_equipe_tecnicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_equipe_tecnicos" ON public.prisma_equipe_tecnicos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- lotes
CREATE TABLE public.prisma_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  categoria public.prisma_lote_categoria NOT NULL DEFAULT 'geral',
  data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  hora_limite_jornada TIME NOT NULL DEFAULT '17:00',
  duracao_padrao_horas NUMERIC(4,2) NOT NULL DEFAULT 1,
  status public.prisma_lote_status NOT NULL DEFAULT 'rascunho',
  total_os INT NOT NULL DEFAULT 0,
  os_concluidas INT NOT NULL DEFAULT 0,
  os_com_erro INT NOT NULL DEFAULT 0,
  iniciado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lotes TO authenticated;
GRANT ALL ON public.prisma_lotes TO service_role;
ALTER TABLE public.prisma_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_lotes" ON public.prisma_lotes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_lotes_user_status ON public.prisma_lotes(user_id, status);
CREATE INDEX idx_prisma_lotes_criado ON public.prisma_lotes(criado_em DESC);

-- os_itens
CREATE TABLE public.prisma_os_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID NOT NULL REFERENCES public.prisma_lotes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_os TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  status public.prisma_os_status NOT NULL DEFAULT 'pendente',
  mensagem_erro TEXT,
  iniciado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_os_itens TO authenticated;
GRANT ALL ON public.prisma_os_itens TO service_role;
ALTER TABLE public.prisma_os_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_os_itens" ON public.prisma_os_itens FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_os_itens_lote ON public.prisma_os_itens(lote_id, ordem);

-- lote_tecnicos
CREATE TABLE public.prisma_lote_tecnicos (
  lote_id UUID NOT NULL REFERENCES public.prisma_lotes(id) ON DELETE CASCADE,
  tecnico_id UUID NOT NULL REFERENCES public.prisma_tecnicos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (lote_id, tecnico_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lote_tecnicos TO authenticated;
GRANT ALL ON public.prisma_lote_tecnicos TO service_role;
ALTER TABLE public.prisma_lote_tecnicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_lote_tecnicos" ON public.prisma_lote_tecnicos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- execucao_logs
CREATE TABLE public.prisma_execucao_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.prisma_lotes(id) ON DELETE CASCADE,
  os_item_id UUID REFERENCES public.prisma_os_itens(id) ON DELETE SET NULL,
  etapa TEXT NOT NULL,
  status TEXT NOT NULL,
  mensagem TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_execucao_logs TO authenticated;
GRANT ALL ON public.prisma_execucao_logs TO service_role;
ALTER TABLE public.prisma_execucao_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_logs" ON public.prisma_execucao_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_logs_lote ON public.prisma_execucao_logs(lote_id, criado_em);

-- extensao_status
CREATE TABLE public.prisma_extensao_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ultima_atividade TIMESTAMPTZ NOT NULL DEFAULT now(),
  versao TEXT,
  info JSONB
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_extensao_status TO authenticated;
GRANT ALL ON public.prisma_extensao_status TO service_role;
ALTER TABLE public.prisma_extensao_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ext_status" ON public.prisma_extensao_status FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger reuse
CREATE OR REPLACE FUNCTION public.prisma_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_prisma_tecnicos_upd BEFORE UPDATE ON public.prisma_tecnicos
  FOR EACH ROW EXECUTE FUNCTION public.prisma_touch_updated_at();
CREATE TRIGGER trg_prisma_equipes_upd BEFORE UPDATE ON public.prisma_equipes
  FOR EACH ROW EXECUTE FUNCTION public.prisma_touch_updated_at();
CREATE TRIGGER trg_prisma_lotes_upd BEFORE UPDATE ON public.prisma_lotes
  FOR EACH ROW EXECUTE FUNCTION public.prisma_touch_updated_at();
CREATE TRIGGER trg_prisma_os_itens_upd BEFORE UPDATE ON public.prisma_os_itens
  FOR EACH ROW EXECUTE FUNCTION public.prisma_touch_updated_at();

-- Progress counter trigger on os_itens
CREATE OR REPLACE FUNCTION public.prisma_recalc_lote()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_lote UUID;
BEGIN
  v_lote := COALESCE(NEW.lote_id, OLD.lote_id);
  UPDATE public.prisma_lotes l SET
    total_os = (SELECT count(*) FROM public.prisma_os_itens WHERE lote_id = v_lote),
    os_concluidas = (SELECT count(*) FROM public.prisma_os_itens WHERE lote_id = v_lote AND status = 'concluido'),
    os_com_erro = (SELECT count(*) FROM public.prisma_os_itens WHERE lote_id = v_lote AND status = 'erro')
  WHERE l.id = v_lote;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_prisma_os_progress
AFTER INSERT OR UPDATE OR DELETE ON public.prisma_os_itens
FOR EACH ROW EXECUTE FUNCTION public.prisma_recalc_lote();

-- Realtime
ALTER TABLE public.prisma_lotes REPLICA IDENTITY FULL;
ALTER TABLE public.prisma_os_itens REPLICA IDENTITY FULL;
ALTER TABLE public.prisma_execucao_logs REPLICA IDENTITY FULL;
ALTER TABLE public.prisma_extensao_status REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.prisma_lotes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prisma_os_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prisma_execucao_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prisma_extensao_status;

-- Remove login hidraulica
DELETE FROM auth.users WHERE email = 'hidraulica@apontauto.local';

-- Cria login corretivas / senha 123456 com acesso apenas ao módulo Corretiva
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'corretivas@apontauto.local',
    crypt('123456', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('login','corretivas','full_name','Equipe Corretivas'),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'corretivas@apontauto.local'),
    'email', new_user_id::text, now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, allowed_menus)
  VALUES (new_user_id, 'Equipe Corretivas', ARRAY['corretiva','corretiva-historico'])
  ON CONFLICT (id) DO UPDATE
    SET allowed_menus = EXCLUDED.allowed_menus,
        full_name = EXCLUDED.full_name;
END $$;

-- Adiciona colunas faltantes ao esquema Prisma para bater com a spec do painel

-- Renomeia matricula -> codigo_prisma para clareza (mantém tipo text)
ALTER TABLE public.prisma_tecnicos RENAME COLUMN matricula TO codigo_prisma;

-- Hora de início da jornada (defaults 08:00)
ALTER TABLE public.prisma_lotes
  ADD COLUMN IF NOT EXISTS hora_inicio_jornada time NOT NULL DEFAULT '08:00';

-- Horários calculados por OS (agendamento previsto)
ALTER TABLE public.prisma_os_itens
  ADD COLUMN IF NOT EXISTS data_hora_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS data_hora_fim timestamptz;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_tecnicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipe_tecnicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_os_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lote_tecnicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_execucao_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_extensao_status TO authenticated;
GRANT ALL ON public.prisma_tecnicos, public.prisma_equipes, public.prisma_equipe_tecnicos, public.prisma_lotes, public.prisma_os_itens, public.prisma_lote_tecnicos, public.prisma_execucao_logs, public.prisma_extensao_status TO service_role;GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_tecnicos TO authenticated;
GRANT ALL ON public.prisma_tecnicos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipes TO authenticated;
GRANT ALL ON public.prisma_equipes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipe_tecnicos TO authenticated;
GRANT ALL ON public.prisma_equipe_tecnicos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lotes TO authenticated;
GRANT ALL ON public.prisma_lotes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_os_itens TO authenticated;
GRANT ALL ON public.prisma_os_itens TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lote_tecnicos TO authenticated;
GRANT ALL ON public.prisma_lote_tecnicos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_execucao_logs TO authenticated;
GRANT ALL ON public.prisma_execucao_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_extensao_status TO authenticated;
GRANT ALL ON public.prisma_extensao_status TO service_role;ALTER TABLE public.refrigeracao_pecas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.refrigeracao_pecas;ALTER PUBLICATION supabase_realtime ADD TABLE public.corretiva_pecas;
ALTER TABLE public.refrigeracao_pecas
  ADD COLUMN IF NOT EXISTS patrimonio TEXT,
  ADD COLUMN IF NOT EXISTS modelo TEXT,
  ADD COLUMN IF NOT EXISTS btus TEXT;

CREATE INDEX IF NOT EXISTS idx_refrig_os_ativo_equip
  ON public.refrigeracao_os (ativo, equipamento);

CREATE OR REPLACE FUNCTION public.tg_refrig_os_propagate_patrimonio()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.patrimonio IS NOT NULL
     AND btrim(NEW.patrimonio) <> ''
     AND (OLD.patrimonio IS DISTINCT FROM NEW.patrimonio)
  THEN
    UPDATE public.refrigeracao_os
       SET patrimonio = NEW.patrimonio
     WHERE id <> NEW.id
       AND ativo = NEW.ativo
       AND equipamento = NEW.equipamento
       AND (patrimonio IS NULL OR btrim(patrimonio) = '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refrig_os_propagate_patrim ON public.refrigeracao_os;
CREATE TRIGGER trg_refrig_os_propagate_patrim
AFTER UPDATE OF patrimonio ON public.refrigeracao_os
FOR EACH ROW
EXECUTE FUNCTION public.tg_refrig_os_propagate_patrimonio();
update public.profiles set allowed_menus = array(select distinct unnest(allowed_menus || array['refrigeracao-pecas-status'])) where id='fbda7bd9-924d-4f8d-8264-cb74853ae676';
update public.profiles set allowed_menus = array(select distinct unnest(allowed_menus || array['corretiva-pecas-status'])) where id='dcb87318-32eb-4313-9267-c71baa798bc7';ALTER TABLE public.refrigeracao_fotos ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.refrigeracao_fotos ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE public.corretiva_fotos ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.corretiva_fotos ALTER COLUMN storage_path DROP NOT NULL;DROP TABLE IF EXISTS public.prisma_execucao_logs CASCADE;
DROP TABLE IF EXISTS public.prisma_os_itens CASCADE;
DROP TABLE IF EXISTS public.prisma_lote_tecnicos CASCADE;
DROP TABLE IF EXISTS public.prisma_lotes CASCADE;
DROP TABLE IF EXISTS public.prisma_equipe_tecnicos CASCADE;
DROP TABLE IF EXISTS public.prisma_equipes CASCADE;
DROP TABLE IF EXISTS public.prisma_tecnicos CASCADE;
DROP TABLE IF EXISTS public.prisma_extensao_status CASCADE;

UPDATE public.profiles
SET allowed_menus = array_remove(allowed_menus, 'prisma')
WHERE allowed_menus IS NOT NULL AND 'prisma' = ANY(allowed_menus);-- Drop legacy tables
DROP TABLE IF EXISTS public.taludes_chuva_evidencias CASCADE;
DROP TABLE IF EXISTS public.taludes_clima_snapshot CASCADE;
DROP TABLE IF EXISTS public.taludes_clima_config CASCADE;
DROP TABLE IF EXISTS public.taludes_programacao CASCADE;
DROP TABLE IF EXISTS public.taludes CASCADE;
DROP TABLE IF EXISTS public.talude_maps CASCADE;
DROP TYPE IF EXISTS public.talude_tipo_servico CASCADE;
DROP TYPE IF EXISTS public.talude_situacao CASCADE;

-- New: talude_maps
CREATE TABLE public.talude_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  observacao text,
  image_url text NOT NULL,
  image_width integer NOT NULL,
  image_height integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;
ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select maps" ON public.talude_maps FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner insert maps" ON public.talude_maps FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner update maps" ON public.talude_maps FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner delete maps" ON public.talude_maps FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER trg_talude_maps_updated_at BEFORE UPDATE ON public.talude_maps
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_talude_maps_owner ON public.talude_maps(owner_id, created_at DESC);

-- New: talude_marcacoes
CREATE TABLE public.talude_marcacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  rotulo text,
  observacao text,
  cor text NOT NULL DEFAULT '#f59e0b',
  polygon jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;
ALTER TABLE public.talude_marcacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select marc" ON public.talude_marcacoes FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner insert marc" ON public.talude_marcacoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner update marc" ON public.talude_marcacoes FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner delete marc" ON public.talude_marcacoes FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER trg_talude_marc_updated_at BEFORE UPDATE ON public.talude_marcacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_talude_marc_map ON public.talude_marcacoes(map_id, numero);
-- Limpa módulo antigo (mapas + programação + evidências clima)
DROP TABLE IF EXISTS public.taludes CASCADE;
DROP TABLE IF EXISTS public.taludes_programacao CASCADE;
DROP TABLE IF EXISTS public.taludes_chuva_evidencias CASCADE;
DROP TABLE IF EXISTS public.taludes_clima_snapshot CASCADE;
DROP TABLE IF EXISTS public.taludes_clima_config CASCADE;
DROP TABLE IF EXISTS public.talude_marcacoes CASCADE;
DROP TABLE IF EXISTS public.talude_maps CASCADE;
DROP TYPE IF EXISTS public.talude_tipo_servico CASCADE;
DROP TYPE IF EXISTS public.talude_situacao CASCADE;

-- Mapas
CREATE TABLE public.talude_maps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  observacao TEXT,
  image_url TEXT NOT NULL,
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;
ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own maps: select" ON public.talude_maps FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Own maps: insert" ON public.talude_maps FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Own maps: update" ON public.talude_maps FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Own maps: delete" ON public.talude_maps FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER talude_maps_touch BEFORE UPDATE ON public.talude_maps FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Marcações
CREATE TABLE public.talude_marcacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id UUID NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  data DATE NOT NULL DEFAULT (now()::date),
  rotulo TEXT,
  observacao TEXT,
  cor TEXT NOT NULL DEFAULT '#f59e0b',
  polygon JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (map_id, numero)
);
CREATE INDEX talude_marcacoes_map_idx ON public.talude_marcacoes(map_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;
ALTER TABLE public.talude_marcacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own marc: select" ON public.talude_marcacoes FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Own marc: insert" ON public.talude_marcacoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Own marc: update" ON public.talude_marcacoes FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Own marc: delete" ON public.talude_marcacoes FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER talude_marcacoes_touch BEFORE UPDATE ON public.talude_marcacoes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DO $$ BEGIN
  BEGIN CREATE POLICY "talude_maps_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'talude-maps'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "talude_maps_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'talude-maps'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "talude_maps_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'talude-maps'); EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "talude_maps_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'talude-maps'); EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;-- Allow public read of talude-maps bucket; authenticated users can upload/manage their own files
CREATE POLICY "talude_maps_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'talude-maps');

CREATE POLICY "talude_maps_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'talude-maps');

CREATE POLICY "talude_maps_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'talude-maps');

CREATE POLICY "talude_maps_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'talude-maps');

-- 1) has_role sem backdoor de e-mail
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$function$;

-- 2) storage: remover políticas amplas do bucket talude-maps
DROP POLICY IF EXISTS talude_maps_public_read ON storage.objects;
DROP POLICY IF EXISTS talude_maps_auth_insert ON storage.objects;
DROP POLICY IF EXISTS talude_maps_auth_update ON storage.objects;
DROP POLICY IF EXISTS talude_maps_auth_delete ON storage.objects;

-- 3) corretiva: leitura apenas para autenticados
DROP POLICY IF EXISTS corretiva_equipes_read ON public.corretiva_equipes;
CREATE POLICY corretiva_equipes_read ON public.corretiva_equipes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS corretiva_fotos_read ON public.corretiva_fotos;
CREATE POLICY corretiva_fotos_read ON public.corretiva_fotos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS corretiva_os_read ON public.corretiva_os;
CREATE POLICY corretiva_os_read ON public.corretiva_os FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS corretiva_pecas_read ON public.corretiva_pecas;
CREATE POLICY corretiva_pecas_read ON public.corretiva_pecas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS corretiva_problemas_read ON public.corretiva_problemas;
CREATE POLICY corretiva_problemas_read ON public.corretiva_problemas FOR SELECT TO authenticated USING (true);
ALTER TABLE public.corretiva_pecas ADD COLUMN IF NOT EXISTS modelo text;

ALTER TABLE public.corretiva_os ADD COLUMN IF NOT EXISTS assinatura_url text;
ALTER TABLE public.corretiva_os ADD COLUMN IF NOT EXISTS assinatura_nome text;
ALTER TABLE public.corretiva_os ADD COLUMN IF NOT EXISTS assinatura_em timestamptz;ALTER TABLE public.corretiva_os
  ADD COLUMN IF NOT EXISTS solicitante text,
  ADD COLUMN IF NOT EXISTS data_criacao date;DROP POLICY IF EXISTS "refrigeracao-fotos read own or admin" ON storage.objects;
CREATE POLICY "refrigeracao-fotos read auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'refrigeracao-fotos');-- Metadados de controle de materiais (peças e defeitos de Refrigeração/Corretiva)
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
CREATE POLICY "Autenticados registram envios" ON public.controle_envios_facilities FOR INSERT TO authenticated WITH CHECK (true);-- =========================================================
-- Catálogo versionado de ativos (PCM)
-- Idempotente: pode ser reexecutado com segurança.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.asset_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_unit text,
  version integer NOT NULL DEFAULT 1,
  source_filename text,
  total_assets integer DEFAULT 0,
  is_active boolean DEFAULT false,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.asset_catalogs(id) ON DELETE CASCADE,
  code text NOT NULL,
  normalized_code text NOT NULL,
  name text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT '',
  parent_code text,
  parent_name text NOT NULL DEFAULT '',
  business_unit text NOT NULL DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assets_catalog_code_unique UNIQUE (catalog_id, normalized_code)
);

CREATE INDEX IF NOT EXISTS assets_normalized_code_idx ON public.assets (normalized_code);
CREATE INDEX IF NOT EXISTS assets_parent_code_idx ON public.assets (parent_code);
CREATE INDEX IF NOT EXISTS assets_level_idx ON public.assets (level);
CREATE INDEX IF NOT EXISTS assets_catalog_id_idx ON public.assets (catalog_id);
CREATE UNIQUE INDEX IF NOT EXISTS asset_catalogs_single_active_idx
  ON public.asset_catalogs (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.spreadsheet_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_id uuid REFERENCES public.asset_catalogs(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'asset-import',
  file_name text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  file_type text NOT NULL DEFAULT '',
  sheet_name text,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  matched_rows integer NOT NULL DEFAULT 0,
  unmatched_rows integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spreadsheet_jobs_user_idx ON public.spreadsheet_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.spreadsheet_unmatched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.spreadsheet_jobs(id) ON DELETE CASCADE,
  sheet_name text NOT NULL DEFAULT '',
  row_number integer NOT NULL DEFAULT 0,
  code text NOT NULL DEFAULT '',
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  resolved_code text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spreadsheet_unmatched_job_idx ON public.spreadsheet_unmatched (job_id);

-- ---------- grants ----------
GRANT SELECT ON public.asset_catalogs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.asset_catalogs TO authenticated;
GRANT ALL ON public.asset_catalogs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spreadsheet_jobs TO authenticated;
GRANT ALL ON public.spreadsheet_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spreadsheet_unmatched TO authenticated;
GRANT ALL ON public.spreadsheet_unmatched TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.asset_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spreadsheet_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spreadsheet_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_catalogs_select_authenticated" ON public.asset_catalogs;
CREATE POLICY "asset_catalogs_select_authenticated" ON public.asset_catalogs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "asset_catalogs_admin_write" ON public.asset_catalogs;
CREATE POLICY "asset_catalogs_admin_write" ON public.asset_catalogs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "assets_select_authenticated" ON public.assets;
CREATE POLICY "assets_select_authenticated" ON public.assets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "assets_admin_write" ON public.assets;
CREATE POLICY "assets_admin_write" ON public.assets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "spreadsheet_jobs_own_or_admin" ON public.spreadsheet_jobs;
CREATE POLICY "spreadsheet_jobs_own_or_admin" ON public.spreadsheet_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "spreadsheet_jobs_insert_own" ON public.spreadsheet_jobs;
CREATE POLICY "spreadsheet_jobs_insert_own" ON public.spreadsheet_jobs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "spreadsheet_jobs_update_own" ON public.spreadsheet_jobs;
CREATE POLICY "spreadsheet_jobs_update_own" ON public.spreadsheet_jobs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "spreadsheet_jobs_delete_own" ON public.spreadsheet_jobs;
CREATE POLICY "spreadsheet_jobs_delete_own" ON public.spreadsheet_jobs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "spreadsheet_unmatched_own_or_admin" ON public.spreadsheet_unmatched;
CREATE POLICY "spreadsheet_unmatched_own_or_admin" ON public.spreadsheet_unmatched
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.spreadsheet_jobs j
    WHERE j.id = job_id
      AND (j.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.spreadsheet_jobs j
    WHERE j.id = job_id
      AND (j.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS tg_asset_catalogs_updated_at ON public.asset_catalogs;
CREATE TRIGGER tg_asset_catalogs_updated_at BEFORE UPDATE ON public.asset_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_assets_updated_at ON public.assets;
CREATE TRIGGER tg_assets_updated_at BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_spreadsheet_jobs_updated_at ON public.spreadsheet_jobs;
CREATE TRIGGER tg_spreadsheet_jobs_updated_at BEFORE UPDATE ON public.spreadsheet_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Ativar um catálogo desativa os demais (evita corrida com o índice único parcial).
CREATE OR REPLACE FUNCTION public.tg_asset_catalog_single_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.asset_catalogs SET is_active = false
     WHERE id <> NEW.id AND is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_asset_catalogs_single_active ON public.asset_catalogs;
CREATE TRIGGER tg_asset_catalogs_single_active BEFORE INSERT OR UPDATE OF is_active ON public.asset_catalogs
  FOR EACH ROW WHEN (NEW.is_active) EXECUTE FUNCTION public.tg_asset_catalog_single_active();

-- ---------- migração da base legada assets_ref ----------
DO $$
DECLARE v_catalog uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.asset_catalogs) THEN
    INSERT INTO public.asset_catalogs (name, source_filename, is_active, version, metadata)
    VALUES ('Base inicial (assets_ref)', 'assets_ref', true, 1, jsonb_build_object('origin', 'legacy-assets_ref'))
    RETURNING id INTO v_catalog;

    INSERT INTO public.assets (catalog_id, code, normalized_code, name, level, parent_code, parent_name, business_unit)
    SELECT
      v_catalog,
      a.ativo,
      upper(btrim(a.ativo)),
      coalesce(a.denominacao, ''),
      coalesce(a.nivel, ''),
      nullif(upper(btrim(coalesce(a.codigo_pai, ''))), ''),
      coalesce(a.descricao_pai, ''),
      coalesce(a.unidade_negocio, '')
    FROM public.assets_ref a
    WHERE btrim(coalesce(a.ativo, '')) <> ''
    ON CONFLICT (catalog_id, normalized_code) DO NOTHING;

    UPDATE public.asset_catalogs c
       SET total_assets = (SELECT count(*) FROM public.assets WHERE catalog_id = c.id)
     WHERE c.id = v_catalog;
  END IF;
END $$;CREATE OR REPLACE FUNCTION public.pcm_fill_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'files', (SELECT count(*) FROM public.spreadsheet_jobs),
    'files_completed', (SELECT count(*) FROM public.spreadsheet_jobs WHERE status = 'completed'),
    'files_30d', (SELECT count(*) FROM public.spreadsheet_jobs WHERE created_at > now() - interval '30 days'),
    'rows_total', (SELECT coalesce(sum(total_rows), 0) FROM public.spreadsheet_jobs),
    'rows_matched', (SELECT coalesce(sum(matched_rows), 0) FROM public.spreadsheet_jobs),
    'rows_unmatched', (SELECT coalesce(sum(unmatched_rows), 0) FROM public.spreadsheet_jobs),
    'pending_unmatched', (SELECT count(*) FROM public.spreadsheet_unmatched WHERE status = 'pending'),
    'last_job_at', (SELECT max(created_at) FROM public.spreadsheet_jobs)
  );
$$;

GRANT EXECUTE ON FUNCTION public.pcm_fill_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pcm_fill_metrics() TO service_role;-- ============ RBAC ============
CREATE TABLE IF NOT EXISTS public.pcm_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  rank integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pcm_permissions (
  key text PRIMARY KEY,
  module_key text NOT NULL,
  action text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pcm_role_permissions (
  role_key text NOT NULL REFERENCES public.pcm_roles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.pcm_permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS public.user_pcm_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_key text NOT NULL REFERENCES public.pcm_roles(key) ON DELETE CASCADE,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL,
  actions text[] NOT NULL DEFAULT ARRAY['read']::text[],
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text,
  module_key text,
  action text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON public.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON public.audit_events (entity_type, entity_id);

GRANT SELECT ON public.pcm_roles TO authenticated;
GRANT SELECT ON public.pcm_permissions TO authenticated;
GRANT SELECT ON public.pcm_role_permissions TO authenticated;
GRANT SELECT ON public.user_pcm_roles TO authenticated;
GRANT SELECT ON public.user_module_access TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.pcm_roles, public.pcm_permissions, public.pcm_role_permissions,
              public.user_pcm_roles, public.user_module_access, public.audit_events TO service_role;

ALTER TABLE public.pcm_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcm_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcm_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_pcm_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- ============ Seeds ============
INSERT INTO public.pcm_roles (key, label, rank) VALUES
  ('proprietario','Proprietário',1),
  ('administrador','Administrador',2),
  ('gestor_pcm','Gestor PCM',3),
  ('planejador','Planejador',4),
  ('supervisor','Supervisor',5),
  ('tecnico','Técnico',6),
  ('almoxarifado','Almoxarifado',7),
  ('sst','Segurança do Trabalho',8),
  ('auditor','Auditor',9),
  ('visualizador','Visualizador',10)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT m.k || ':' || a.k, m.k, a.k, m.k || ' — ' || a.k
FROM (VALUES
  ('dashboard'),('dashboard-chamados'),('programacao'),('preventiva'),('taludes'),
  ('apontamentos'),('clima-tempo'),('backorder'),('corretiva'),('corretiva-pecas-status'),
  ('corretiva-historico'),('corretiva-gestor'),('refrigeracao'),('refrigeracao-pecas-status'),
  ('refrigeracao-historico'),('refrigeracao-gestor'),('preventiva-ac'),('assets-fill'),
  ('assets-catalog'),('assets-unmatched'),('assets-history'),('seguranca-trabalho'),
  ('painel-legal'),('lavanderia'),('controle-materiais'),('configuracoes')
) AS m(k)
CROSS JOIN (VALUES ('read'),('create'),('update'),('delete'),('export'),('admin')) AS a(k)
ON CONFLICT (key) DO NOTHING;

-- Proprietário e administrador: tudo
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key FROM public.pcm_roles r
CROSS JOIN public.pcm_permissions p
WHERE r.key IN ('proprietario','administrador')
ON CONFLICT DO NOTHING;

-- Auditor e visualizador: somente leitura/exportação
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key FROM public.pcm_roles r
CROSS JOIN public.pcm_permissions p
WHERE r.key = 'auditor' AND p.action IN ('read','export')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'visualizador', p.key FROM public.pcm_permissions p WHERE p.action = 'read'
ON CONFLICT DO NOTHING;

-- Almoxarifado
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'almoxarifado', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('controle-materiais','corretiva-pecas-status','refrigeracao-pecas-status')
ON CONFLICT DO NOTHING;

-- Segurança do trabalho
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'sst', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('seguranca-trabalho','painel-legal')
ON CONFLICT DO NOTHING;

-- Gestor PCM / planejador / supervisor: operação ampla, sem admin
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key FROM public.pcm_roles r
CROSS JOIN public.pcm_permissions p
WHERE r.key IN ('gestor_pcm','planejador','supervisor')
  AND p.action <> 'admin'
  AND p.module_key <> 'configuracoes'
ON CONFLICT DO NOTHING;

-- Técnico: campo
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('corretiva','refrigeracao','preventiva-ac','corretiva-historico','refrigeracao-historico')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

-- ============ Função central de autorização ============
CREATE OR REPLACE FUNCTION public.can_access_module(module_key text, required_action text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := coalesce(nullif(btrim(required_action), ''), 'read');
  v_menus text[];
  v_has_profile boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- administrador legado
  IF public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  -- perfil RBAC
  IF EXISTS (
    SELECT 1
      FROM public.user_pcm_roles ur
      JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
      JOIN public.pcm_permissions p ON p.key = rp.permission_key
     WHERE ur.user_id = v_uid
       AND p.module_key = can_access_module.module_key
       AND p.action = v_action
  ) THEN
    RETURN true;
  END IF;

  -- liberação individual de módulo
  IF EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = v_uid
       AND uma.module_key = can_access_module.module_key
       AND (v_action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
  ) THEN
    RETURN true;
  END IF;

  -- compatibilidade com allowed_menus (não remove acesso de quem já usa o sistema)
  SELECT p.allowed_menus, true INTO v_menus, v_has_profile
    FROM public.profiles p WHERE p.id = v_uid;

  IF coalesce(v_has_profile, false) THEN
    IF v_menus IS NULL THEN
      RETURN true;
    END IF;
    IF can_access_module.module_key = ANY (v_menus) THEN
      RETURN v_action <> 'admin';
    END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_module(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_module(text, text) TO authenticated, service_role;

-- ============ Auditoria genérica ============
CREATE OR REPLACE FUNCTION public.tg_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_module text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, new_data)
    VALUES (auth.uid(), 'insert', TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), v_module, 'create', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, old_data, new_data)
    VALUES (auth.uid(), 'update', TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), v_module, 'update', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, old_data)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, (to_jsonb(OLD)->>'id'), v_module, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_user_pcm_roles ON public.user_pcm_roles;
CREATE TRIGGER audit_user_pcm_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_pcm_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('usuarios');

DROP TRIGGER IF EXISTS audit_user_module_access ON public.user_module_access;
CREATE TRIGGER audit_user_module_access
AFTER INSERT OR UPDATE OR DELETE ON public.user_module_access
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('usuarios');

DROP TRIGGER IF EXISTS audit_controle_materiais_meta ON public.controle_materiais_meta;
CREATE TRIGGER audit_controle_materiais_meta
AFTER INSERT OR UPDATE OR DELETE ON public.controle_materiais_meta
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('controle-materiais');

-- ============ Políticas RBAC ============
DROP POLICY IF EXISTS "pcm_roles_read" ON public.pcm_roles;
CREATE POLICY "pcm_roles_read" ON public.pcm_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pcm_permissions_read" ON public.pcm_permissions;
CREATE POLICY "pcm_permissions_read" ON public.pcm_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pcm_role_permissions_read" ON public.pcm_role_permissions;
CREATE POLICY "pcm_role_permissions_read" ON public.pcm_role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "user_pcm_roles_read_self_or_admin" ON public.user_pcm_roles;
CREATE POLICY "user_pcm_roles_read_self_or_admin" ON public.user_pcm_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "user_module_access_read_self_or_admin" ON public.user_module_access;
CREATE POLICY "user_module_access_read_self_or_admin" ON public.user_module_access
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "audit_events_read" ON public.audit_events;
CREATE POLICY "audit_events_read" ON public.audit_events
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.user_pcm_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key IN ('auditor','proprietario'))
);

DROP POLICY IF EXISTS "audit_events_insert_self" ON public.audit_events;
CREATE POLICY "audit_events_insert_self" ON public.audit_events
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ============ Endurecimento de políticas amplas ============
-- Controle de materiais
DROP POLICY IF EXISTS "Autenticados gerenciam controle de materiais" ON public.controle_materiais_meta;
CREATE POLICY "controle_materiais_read" ON public.controle_materiais_meta
FOR SELECT TO authenticated USING (public.can_access_module('controle-materiais','read'));
CREATE POLICY "controle_materiais_write" ON public.controle_materiais_meta
FOR ALL TO authenticated
USING (public.can_access_module('controle-materiais','update'))
WITH CHECK (public.can_access_module('controle-materiais','update'));

DROP POLICY IF EXISTS "Autenticados gerenciam centros de custo" ON public.controle_centros_custo;
CREATE POLICY "centros_custo_read" ON public.controle_centros_custo
FOR SELECT TO authenticated USING (public.can_access_module('controle-materiais','read'));
CREATE POLICY "centros_custo_write" ON public.controle_centros_custo
FOR ALL TO authenticated
USING (public.can_access_module('controle-materiais','update'))
WITH CHECK (public.can_access_module('controle-materiais','update'));

DROP POLICY IF EXISTS "Autenticados leem envios" ON public.controle_envios_facilities;
DROP POLICY IF EXISTS "Autenticados registram envios" ON public.controle_envios_facilities;
CREATE POLICY "envios_facilities_read" ON public.controle_envios_facilities
FOR SELECT TO authenticated USING (public.can_access_module('controle-materiais','read'));
CREATE POLICY "envios_facilities_insert" ON public.controle_envios_facilities
FOR INSERT TO authenticated WITH CHECK (public.can_access_module('controle-materiais','create'));

-- Itens legais
DROP POLICY IF EXISTS "Legal items readable by authenticated" ON public.legal_items;
CREATE POLICY "legal_items_read" ON public.legal_items
FOR SELECT TO authenticated USING (public.can_access_module('painel-legal','read'));

DROP POLICY IF EXISTS "Executions readable by authenticated" ON public.legal_item_executions;
CREATE POLICY "legal_executions_read" ON public.legal_item_executions
FOR SELECT TO authenticated USING (public.can_access_module('painel-legal','read'));

DROP POLICY IF EXISTS "Attachments readable by authenticated" ON public.legal_item_attachments;
CREATE POLICY "legal_attachments_read" ON public.legal_item_attachments
FOR SELECT TO authenticated USING (public.can_access_module('painel-legal','read'));

-- Lavanderia
DROP POLICY IF EXISTS "lav_colab_auth_all" ON public.lavanderia_colaboradores;
CREATE POLICY "lav_colab_read" ON public.lavanderia_colaboradores
FOR SELECT TO authenticated USING (public.can_access_module('lavanderia','read'));
CREATE POLICY "lav_colab_write" ON public.lavanderia_colaboradores
FOR ALL TO authenticated
USING (public.can_access_module('lavanderia','update'))
WITH CHECK (public.can_access_module('lavanderia','update'));

DROP POLICY IF EXISTS "lav_pecas_auth_all" ON public.lavanderia_pecas;
CREATE POLICY "lav_pecas_read" ON public.lavanderia_pecas
FOR SELECT TO authenticated USING (public.can_access_module('lavanderia','read'));
CREATE POLICY "lav_pecas_write" ON public.lavanderia_pecas
FOR ALL TO authenticated
USING (public.can_access_module('lavanderia','update'))
WITH CHECK (public.can_access_module('lavanderia','update'));

DROP POLICY IF EXISTS "lav_eventos_auth_all" ON public.lavanderia_eventos;
CREATE POLICY "lav_eventos_read" ON public.lavanderia_eventos
FOR SELECT TO authenticated USING (public.can_access_module('lavanderia','read'));
CREATE POLICY "lav_eventos_write" ON public.lavanderia_eventos
FOR ALL TO authenticated
USING (public.can_access_module('lavanderia','update'))
WITH CHECK (public.can_access_module('lavanderia','update'));CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text NULL,
  ip_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terms_acceptances_unique_version UNIQUE (user_id, terms_version, privacy_version)
);

GRANT SELECT, INSERT ON public.terms_acceptances TO authenticated;
GRANT ALL ON public.terms_acceptances TO service_role;

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "terms_acceptances_select_own" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_select_own"
  ON public.terms_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "terms_acceptances_insert_own" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_insert_own"
  ON public.terms_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS terms_acceptances_user_idx ON public.terms_acceptances (user_id, accepted_at DESC);INSERT INTO public.pcm_roles (key, label, rank) VALUES
  ('tecnico_corretiva','Técnico de Corretiva',6),
  ('tecnico_climatizacao','Técnico de Climatização',6),
  ('tecnico_multidisciplinar','Técnico Multidisciplinar',6),
  ('gestor_taludes','Gestor de Taludes',5),
  ('operador_taludes','Operador de Taludes',6),
  ('bombeiros_pt','Bombeiros / PT',6),
  ('gestor_frota','Gestor de Frota',5),
  ('operador_frota','Operador de Frota',6)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT m.k || ':' || a.k, m.k, a.k, m.k || ' — ' || a.k
FROM (VALUES
  ('abastecimento'),('frota-checklist'),('frota-historico'),('frota-gestao'),
  ('taludes-editor'),('taludes-clima'),('taludes-pt'),
  ('bi-studio'),('notificacoes-admin'),('auditoria'),('confiabilidade')
) AS m(k)
CROSS JOIN (VALUES ('read'),('create'),('update'),('delete'),('export'),('admin')) AS a(k)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key FROM public.pcm_roles r
CROSS JOIN public.pcm_permissions p
WHERE r.key IN ('proprietario','administrador')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'gestor_pcm', p.key FROM public.pcm_permissions p
WHERE p.action <> 'admin' AND p.module_key <> 'configuracoes'
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'gestor_frota', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('abastecimento','frota-checklist','frota-historico','frota-gestao')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_frota', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('abastecimento','frota-checklist','frota-historico')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico_corretiva', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('corretiva','corretiva-pecas-status','corretiva-historico')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico_climatizacao', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('refrigeracao','refrigeracao-pecas-status','refrigeracao-historico','preventiva-ac')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico_multidisciplinar', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('corretiva','corretiva-historico','refrigeracao','refrigeracao-historico','preventiva-ac')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'gestor_taludes', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('taludes','taludes-editor','taludes-clima','taludes-pt','clima-tempo')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_taludes', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('taludes','taludes-clima')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'bombeiros_pt', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('taludes-pt','taludes-clima')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'auditor', p.key FROM public.pcm_permissions p
WHERE p.action IN ('read','export')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_module(module_key text, required_action text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := coalesce(nullif(btrim(required_action), ''), 'read');
  v_menus text[];
  v_has_profile boolean;
  v_restricted text[] := ARRAY[
    'abastecimento','frota-checklist','frota-historico','frota-gestao',
    'bi-studio','notificacoes-admin','auditoria','confiabilidade'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_pcm_roles ur
      JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
      JOIN public.pcm_permissions p ON p.key = rp.permission_key
     WHERE ur.user_id = v_uid
       AND p.module_key = can_access_module.module_key
       AND p.action = v_action
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = v_uid
       AND uma.module_key = can_access_module.module_key
       AND (v_action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
  ) THEN
    RETURN true;
  END IF;

  IF can_access_module.module_key = ANY (v_restricted) THEN
    RETURN false;
  END IF;

  SELECT p.allowed_menus, true INTO v_menus, v_has_profile
    FROM public.profiles p WHERE p.id = v_uid;

  IF coalesce(v_has_profile, false) THEN
    IF v_menus IS NULL THEN
      RETURN true;
    END IF;
    IF can_access_module.module_key = ANY (v_menus) THEN
      RETURN v_action <> 'admin';
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.frota_veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL UNIQUE,
  modelo text,
  marca text,
  tipo text,
  ano integer,
  hodometro_atual numeric(12,1) NOT NULL DEFAULT 0,
  situacao text NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frota_veiculos TO authenticated;
GRANT ALL ON public.frota_veiculos TO service_role;
ALTER TABLE public.frota_veiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frota_veiculos_read" ON public.frota_veiculos
  FOR SELECT TO authenticated
  USING (public.can_access_module('frota-gestao','read') OR public.can_access_module('abastecimento','read'));

CREATE POLICY "frota_veiculos_insert" ON public.frota_veiculos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module('frota-gestao','create'));

CREATE POLICY "frota_veiculos_update" ON public.frota_veiculos
  FOR UPDATE TO authenticated
  USING (public.can_access_module('frota-gestao','update'))
  WITH CHECK (public.can_access_module('frota-gestao','update'));

CREATE POLICY "frota_veiculos_delete" ON public.frota_veiculos
  FOR DELETE TO authenticated
  USING (public.can_access_module('frota-gestao','delete'));

CREATE TABLE IF NOT EXISTS public.frota_abastecimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid REFERENCES public.frota_veiculos(id) ON DELETE SET NULL,
  placa text NOT NULL,
  data_abastecimento timestamptz NOT NULL DEFAULT now(),
  motorista text,
  hodometro numeric(12,1),
  litros numeric(10,2) NOT NULL,
  valor_litro numeric(10,3),
  valor_total numeric(12,2),
  combustivel text NOT NULL DEFAULT 'diesel',
  posto text,
  cupom text,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frota_abast_data_idx ON public.frota_abastecimentos (data_abastecimento DESC);
CREATE INDEX IF NOT EXISTS frota_abast_veiculo_idx ON public.frota_abastecimentos (veiculo_id);
CREATE INDEX IF NOT EXISTS frota_abast_placa_idx ON public.frota_abastecimentos (placa);
CREATE INDEX IF NOT EXISTS frota_abast_created_by_idx ON public.frota_abastecimentos (created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frota_abastecimentos TO authenticated;
GRANT ALL ON public.frota_abastecimentos TO service_role;
ALTER TABLE public.frota_abastecimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frota_abast_read" ON public.frota_abastecimentos
  FOR SELECT TO authenticated
  USING (public.can_access_module('abastecimento','read'));

CREATE POLICY "frota_abast_insert" ON public.frota_abastecimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module('abastecimento','create') AND created_by = auth.uid());

CREATE POLICY "frota_abast_update" ON public.frota_abastecimentos
  FOR UPDATE TO authenticated
  USING (public.can_access_module('abastecimento','update'))
  WITH CHECK (public.can_access_module('abastecimento','update'));

CREATE POLICY "frota_abast_delete" ON public.frota_abastecimentos
  FOR DELETE TO authenticated
  USING (public.can_access_module('abastecimento','delete'));

CREATE TRIGGER frota_veiculos_updated_at BEFORE UPDATE ON public.frota_veiculos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER frota_abast_updated_at BEFORE UPDATE ON public.frota_abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();-- Helpers de acesso por família de módulo
CREATE OR REPLACE FUNCTION public.can_access_corretiva(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('corretiva', required_action)
      OR public.can_access_module('corretiva-gestor', required_action)
      OR public.can_access_module('corretiva-historico', required_action)
      OR public.can_access_module('corretiva-pecas-status', required_action);
$$;

CREATE OR REPLACE FUNCTION public.can_write_corretiva(required_action text DEFAULT 'update')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('corretiva', required_action)
      OR public.can_access_module('corretiva-gestor', required_action);
$$;

CREATE OR REPLACE FUNCTION public.can_access_refrigeracao(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('refrigeracao', required_action)
      OR public.can_access_module('refrigeracao-gestor', required_action)
      OR public.can_access_module('refrigeracao-historico', required_action)
      OR public.can_access_module('refrigeracao-pecas-status', required_action)
      OR public.can_access_module('preventiva-ac', required_action);
$$;

CREATE OR REPLACE FUNCTION public.can_write_refrigeracao(required_action text DEFAULT 'update')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('refrigeracao', required_action)
      OR public.can_access_module('refrigeracao-gestor', required_action)
      OR public.can_access_module('preventiva-ac', required_action);
$$;

CREATE OR REPLACE FUNCTION public.can_access_backorder(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('backorder', required_action)
      OR public.can_access_module('corretiva-gestor', required_action);
$$;

-- ============ CORRETIVA ============
DROP POLICY IF EXISTS "corretiva_os_read" ON public.corretiva_os;
CREATE POLICY "corretiva_os_read" ON public.corretiva_os FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "corretiva_os_insert" ON public.corretiva_os;
CREATE POLICY "corretiva_os_insert" ON public.corretiva_os FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('create'));
DROP POLICY IF EXISTS "corretiva_os_update" ON public.corretiva_os;
CREATE POLICY "corretiva_os_update" ON public.corretiva_os FOR UPDATE TO authenticated
  USING (public.can_write_corretiva('update')) WITH CHECK (public.can_write_corretiva('update'));

DROP POLICY IF EXISTS "corretiva_fotos_read" ON public.corretiva_fotos;
CREATE POLICY "corretiva_fotos_read" ON public.corretiva_fotos FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "corretiva_fotos_insert" ON public.corretiva_fotos;
CREATE POLICY "corretiva_fotos_insert" ON public.corretiva_fotos FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('create'));

DROP POLICY IF EXISTS "corretiva_pecas_read" ON public.corretiva_pecas;
CREATE POLICY "corretiva_pecas_read" ON public.corretiva_pecas FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "corretiva_pecas_insert" ON public.corretiva_pecas;
CREATE POLICY "corretiva_pecas_insert" ON public.corretiva_pecas FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('create'));

DROP POLICY IF EXISTS "corretiva_problemas_read" ON public.corretiva_problemas;
CREATE POLICY "corretiva_problemas_read" ON public.corretiva_problemas FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "corretiva_problemas_insert" ON public.corretiva_problemas;
CREATE POLICY "corretiva_problemas_insert" ON public.corretiva_problemas FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('create'));

DROP POLICY IF EXISTS "corretiva_equipes_read" ON public.corretiva_equipes;
CREATE POLICY "corretiva_equipes_read" ON public.corretiva_equipes FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));

-- ============ REFRIGERAÇÃO ============
DROP POLICY IF EXISTS "refrig_os_read" ON public.refrigeracao_os;
CREATE POLICY "refrig_os_read" ON public.refrigeracao_os FOR SELECT TO authenticated
  USING (public.can_access_refrigeracao('read'));
DROP POLICY IF EXISTS "refrig_os_insert" ON public.refrigeracao_os;
CREATE POLICY "refrig_os_insert" ON public.refrigeracao_os FOR INSERT TO authenticated
  WITH CHECK (public.can_write_refrigeracao('create'));
DROP POLICY IF EXISTS "refrig_os_update" ON public.refrigeracao_os;
CREATE POLICY "refrig_os_update" ON public.refrigeracao_os FOR UPDATE TO authenticated
  USING (public.can_write_refrigeracao('update')) WITH CHECK (public.can_write_refrigeracao('update'));

DROP POLICY IF EXISTS "refrig_fotos_read" ON public.refrigeracao_fotos;
CREATE POLICY "refrig_fotos_read" ON public.refrigeracao_fotos FOR SELECT TO authenticated
  USING (public.can_access_refrigeracao('read'));
DROP POLICY IF EXISTS "refrig_fotos_insert" ON public.refrigeracao_fotos;
CREATE POLICY "refrig_fotos_insert" ON public.refrigeracao_fotos FOR INSERT TO authenticated
  WITH CHECK (public.can_write_refrigeracao('create'));

DROP POLICY IF EXISTS "refrig_pecas_read" ON public.refrigeracao_pecas;
CREATE POLICY "refrig_pecas_read" ON public.refrigeracao_pecas FOR SELECT TO authenticated
  USING (public.can_access_refrigeracao('read'));
DROP POLICY IF EXISTS "refrig_pecas_insert" ON public.refrigeracao_pecas;
CREATE POLICY "refrig_pecas_insert" ON public.refrigeracao_pecas FOR INSERT TO authenticated
  WITH CHECK (public.can_write_refrigeracao('create'));

DROP POLICY IF EXISTS "refrig_probl_read" ON public.refrigeracao_problemas;
CREATE POLICY "refrig_probl_read" ON public.refrigeracao_problemas FOR SELECT TO authenticated
  USING (public.can_access_refrigeracao('read'));
DROP POLICY IF EXISTS "refrig_probl_insert" ON public.refrigeracao_problemas;
CREATE POLICY "refrig_probl_insert" ON public.refrigeracao_problemas FOR INSERT TO authenticated
  WITH CHECK (public.can_write_refrigeracao('create'));

-- ============ BACKORDER ============
DROP POLICY IF EXISTS "backorder_os auth read" ON public.backorder_os;
CREATE POLICY "backorder_os auth read" ON public.backorder_os FOR SELECT TO authenticated
  USING (public.can_access_backorder('read'));
DROP POLICY IF EXISTS "backorder_os auth write" ON public.backorder_os;
CREATE POLICY "backorder_os auth write" ON public.backorder_os FOR ALL TO authenticated
  USING (public.can_access_backorder('update')) WITH CHECK (public.can_access_backorder('update'));

DROP POLICY IF EXISTS "backorder_ovr auth read" ON public.backorder_atividade_override;
CREATE POLICY "backorder_ovr auth read" ON public.backorder_atividade_override FOR SELECT TO authenticated
  USING (public.can_access_backorder('read'));
DROP POLICY IF EXISTS "backorder_ovr auth write" ON public.backorder_atividade_override;
CREATE POLICY "backorder_ovr auth write" ON public.backorder_atividade_override FOR ALL TO authenticated
  USING (public.can_access_backorder('update')) WITH CHECK (public.can_access_backorder('update'));

DROP POLICY IF EXISTS "auth read config" ON public.backorder_prioridade_config;
CREATE POLICY "auth read config" ON public.backorder_prioridade_config FOR SELECT TO authenticated
  USING (public.can_access_backorder('read'));
DROP POLICY IF EXISTS "auth write config" ON public.backorder_prioridade_config;
CREATE POLICY "auth write config" ON public.backorder_prioridade_config FOR ALL TO authenticated
  USING (public.can_access_backorder('update')) WITH CHECK (public.can_access_backorder('update'));

-- Regras de classificação e aprendizado
DROP POLICY IF EXISTS "auth read learned team" ON public.regras_aprendidas_equipe;
CREATE POLICY "auth read learned team" ON public.regras_aprendidas_equipe FOR SELECT TO authenticated
  USING (public.can_access_backorder('read') OR public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "auth write learned team" ON public.regras_aprendidas_equipe;
CREATE POLICY "auth write learned team" ON public.regras_aprendidas_equipe FOR INSERT TO authenticated
  WITH CHECK (public.can_access_backorder('create') OR public.can_write_corretiva('create'));
DROP POLICY IF EXISTS "auth update learned team" ON public.regras_aprendidas_equipe;
CREATE POLICY "auth update learned team" ON public.regras_aprendidas_equipe FOR UPDATE TO authenticated
  USING (public.can_access_backorder('update') OR public.can_write_corretiva('update'))
  WITH CHECK (public.can_access_backorder('update') OR public.can_write_corretiva('update'));
DROP POLICY IF EXISTS "auth delete learned team" ON public.regras_aprendidas_equipe;
CREATE POLICY "auth delete learned team" ON public.regras_aprendidas_equipe FOR DELETE TO authenticated
  USING (public.can_access_backorder('delete') OR public.can_write_corretiva('delete'));

DROP POLICY IF EXISTS "auth read learned loc" ON public.regras_aprendidas_localizacao;
CREATE POLICY "auth read learned loc" ON public.regras_aprendidas_localizacao FOR SELECT TO authenticated
  USING (public.can_access_backorder('read') OR public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "auth write learned loc" ON public.regras_aprendidas_localizacao;
CREATE POLICY "auth write learned loc" ON public.regras_aprendidas_localizacao FOR INSERT TO authenticated
  WITH CHECK (public.can_access_backorder('create') OR public.can_write_corretiva('create'));
DROP POLICY IF EXISTS "auth update learned loc" ON public.regras_aprendidas_localizacao;
CREATE POLICY "auth update learned loc" ON public.regras_aprendidas_localizacao FOR UPDATE TO authenticated
  USING (public.can_access_backorder('update') OR public.can_write_corretiva('update'))
  WITH CHECK (public.can_access_backorder('update') OR public.can_write_corretiva('update'));
DROP POLICY IF EXISTS "auth delete learned loc" ON public.regras_aprendidas_localizacao;
CREATE POLICY "auth delete learned loc" ON public.regras_aprendidas_localizacao FOR DELETE TO authenticated
  USING (public.can_access_backorder('delete') OR public.can_write_corretiva('delete'));

DROP POLICY IF EXISTS "regras auth write" ON public.regras_classificacao_equipe;
CREATE POLICY "regras auth write" ON public.regras_classificacao_equipe FOR ALL TO authenticated
  USING (public.can_access_backorder('update') OR public.can_write_corretiva('update'))
  WITH CHECK (public.can_access_backorder('update') OR public.can_write_corretiva('update'));

-- ============ BASE DE ATIVOS DE REFERÊNCIA ============
DROP POLICY IF EXISTS "assets_ref auth write" ON public.assets_ref;
CREATE POLICY "assets_ref auth write" ON public.assets_ref FOR ALL TO authenticated
  USING (public.can_access_module('assets-catalog', 'update') OR public.can_access_backorder('update'))
  WITH CHECK (public.can_access_module('assets-catalog', 'update') OR public.can_access_backorder('update'));

-- ============ CONFIGURAÇÕES GLOBAIS ============
DROP POLICY IF EXISTS "Settings writable by authenticated" ON public.app_settings;
CREATE POLICY "Settings insert by managers" ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module('configuracoes', 'update'));
DROP POLICY IF EXISTS "Settings updatable by authenticated" ON public.app_settings;
CREATE POLICY "Settings update by managers" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module('configuracoes', 'update'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module('configuracoes', 'update'));REVOKE EXECUTE ON FUNCTION public.can_access_corretiva(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_corretiva(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_refrigeracao(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_refrigeracao(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_backorder(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_corretiva(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_corretiva(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_refrigeracao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_refrigeracao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_backorder(text) TO authenticated, service_role;CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  module_key text,
  severity text NOT NULL DEFAULT 'info',
  link_url text,
  target_user_id uuid,
  created_by uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE INDEX notifications_created_at_idx ON public.notifications (created_at DESC);
CREATE INDEX notifications_target_user_idx ON public.notifications (target_user_id);
CREATE INDEX notification_reads_user_idx ON public.notification_reads (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_destinatario" ON public.notifications
FOR SELECT TO authenticated
USING (
  target_user_id = auth.uid()
  OR (
    target_user_id IS NULL
    AND (module_key IS NULL OR public.can_access_module(module_key, 'read'))
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "notifications_insert_admin" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_module('notificacoes-admin', 'read')
);

CREATE POLICY "notifications_update_admin" ON public.notifications
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_module('notificacoes-admin', 'read')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_module('notificacoes-admin', 'read')
);

CREATE POLICY "notifications_delete_admin" ON public.notifications
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_module('notificacoes-admin', 'read')
);

CREATE POLICY "notification_reads_select_own" ON public.notification_reads
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notification_reads_insert_own" ON public.notification_reads
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_reads_delete_own" ON public.notification_reads
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER trg_notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();CREATE OR REPLACE FUNCTION public.can_access_module(module_key text, required_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := coalesce(nullif(btrim(required_action), ''), 'read');
  v_menus text[];
  v_restricted text[] := ARRAY[
    'abastecimento','frota-checklist','frota-historico','frota-gestao',
    'bi-studio','notificacoes-admin','auditoria','confiabilidade'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_pcm_roles ur
      JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
      JOIN public.pcm_permissions p ON p.key = rp.permission_key
     WHERE ur.user_id = v_uid
       AND p.module_key = can_access_module.module_key
       AND p.action = v_action
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = v_uid
       AND uma.module_key = can_access_module.module_key
       AND (v_action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
  ) THEN
    RETURN true;
  END IF;

  IF can_access_module.module_key = ANY (v_restricted) THEN
    RETURN false;
  END IF;

  -- Negação por padrão: sem lista explícita de menus, não há acesso.
  SELECT p.allowed_menus INTO v_menus
    FROM public.profiles p WHERE p.id = v_uid;

  IF v_menus IS NOT NULL AND can_access_module.module_key = ANY (v_menus) THEN
    RETURN v_action <> 'admin';
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_allowed_menus()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN NULL::text[]
    ELSE COALESCE(
      (SELECT p.allowed_menus FROM public.profiles p WHERE p.id = auth.uid()),
      ARRAY[]::text[]
    )
  END;
$function$;

CREATE INDEX IF NOT EXISTS user_module_access_user_module_idx
  ON public.user_module_access (user_id, module_key);
CREATE INDEX IF NOT EXISTS user_pcm_roles_user_idx
  ON public.user_pcm_roles (user_id);
CREATE INDEX IF NOT EXISTS user_roles_user_role_idx
  ON public.user_roles (user_id, role);CREATE TABLE public.image_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  module_key text,
  entity_type text,
  entity_id text,
  sha256 text NOT NULL,
  size_bytes integer NOT NULL,
  mime_type text NOT NULL,
  url text,
  delete_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.image_uploads TO authenticated;
GRANT ALL ON public.image_uploads TO service_role;

ALTER TABLE public.image_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "image_uploads_select_own_or_admin"
  ON public.image_uploads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX image_uploads_user_created_idx ON public.image_uploads (user_id, created_at DESC);
CREATE INDEX image_uploads_sha_idx ON public.image_uploads (sha256);CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON public.audit_events (created_at DESC);CREATE OR REPLACE FUNCTION public.audit_noop() RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$ SELECT true; $function$;CREATE OR REPLACE FUNCTION public.can_access_module(module_key text, required_action text DEFAULT 'read'::text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := coalesce(nullif(btrim(required_action), ''), 'read');
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF public.has_role(v_uid, 'admin'::public.app_role) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_pcm_roles ur
      JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
      JOIN public.pcm_permissions p ON p.key = rp.permission_key
     WHERE ur.user_id = v_uid AND p.module_key = can_access_module.module_key AND p.action = v_action
  ) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = v_uid AND uma.module_key = can_access_module.module_key
       AND (v_action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
  ) THEN RETURN true; END IF;
  RETURN false;
END;
$function$;DROP FUNCTION IF EXISTS public.audit_noop();

CREATE OR REPLACE FUNCTION public.sst_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.can_access_module('seguranca-trabalho', 'read'); $function$;

CREATE OR REPLACE FUNCTION public.get_my_allowed_menus()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN NULL::text[]
  ELSE COALESCE((SELECT array_agg(DISTINCT s.m) FROM (
      SELECT uma.module_key AS m FROM public.user_module_access uma WHERE uma.user_id = auth.uid()
      UNION
      SELECT p.module_key FROM public.user_pcm_roles ur
        JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
        JOIN public.pcm_permissions p ON p.key = rp.permission_key
       WHERE ur.user_id = auth.uid() AND p.action = 'read') s), ARRAY[]::text[]) END;
$function$;DELETE FROM public.pcm_role_permissions rp
 USING public.pcm_permissions p
 WHERE p.key = rp.permission_key
   AND p.module_key IN ('abastecimento','frota-checklist','frota-historico','frota-gestao')
   AND rp.role_key NOT IN ('proprietario','administrador','gestor_pcm','gestor_frota','operador_frota');

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.role_key, p.key FROM public.pcm_permissions p
  CROSS JOIN (VALUES ('proprietario'),('administrador'),('gestor_pcm'),('gestor_frota')) AS r(role_key)
 WHERE p.module_key IN ('abastecimento','frota-checklist','frota-historico','frota-gestao')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_frota', p.key FROM public.pcm_permissions p
 WHERE p.module_key IN ('abastecimento','frota-checklist','frota-historico')
   AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

DELETE FROM public.user_module_access uma
 WHERE uma.module_key IN ('abastecimento','frota-checklist','frota-historico','frota-gestao')
   AND EXISTS (SELECT 1 FROM public.user_module_access o
      WHERE o.user_id = uma.user_id
        AND o.module_key IN ('corretiva','refrigeracao','preventiva-ac','corretiva-historico','refrigeracao-historico'));CREATE OR REPLACE FUNCTION public.audit_redact(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE k text; v jsonb; out_j jsonb := '{}'::jsonb; t text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN RETURN payload; END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(payload) LOOP
    IF k ~* '(senha|password|token|secret|segredo|api[_-]?key|chave|delete_url|authorization|credential)' THEN
      out_j := out_j || jsonb_build_object(k, '[REDACTED]');
    ELSIF k ~* '^cpf$' THEN
      t := nullif(regexp_replace(coalesce(v #>> '{}', ''), '\D', '', 'g'), '');
      out_j := out_j || jsonb_build_object(k, CASE WHEN t IS NULL THEN NULL
        ELSE repeat('*', greatest(length(t) - 3, 0)) || right(t, 3) END);
    ELSIF jsonb_typeof(v) = 'string' AND length(v #>> '{}') > 2000 THEN
      out_j := out_j || jsonb_build_object(k, '[TRUNCATED]');
    ELSIF jsonb_typeof(v) = 'string' AND (v #>> '{}') ~ '^data:[^;]+;base64,' THEN
      out_j := out_j || jsonb_build_object(k, '[BINARY]');
    ELSE
      out_j := out_j || jsonb_build_object(k, v);
    END IF;
  END LOOP;
  RETURN out_j;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.audit_redact(jsonb) FROM anon, public;CREATE OR REPLACE FUNCTION public.tg_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_module text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
  v_origin text := coalesce(nullif(current_setting('app.origin', true), ''), 'web');
  v_meta jsonb := jsonb_build_object('origin', v_origin);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, new_data, metadata)
    VALUES (auth.uid(), 'insert', TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), v_module, 'create', public.audit_redact(to_jsonb(NEW)), v_meta);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, old_data, new_data, metadata)
    VALUES (auth.uid(), 'update', TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), v_module, 'update', public.audit_redact(to_jsonb(OLD)), public.audit_redact(to_jsonb(NEW)), v_meta);
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, old_data, metadata)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, (to_jsonb(OLD)->>'id'), v_module, 'delete', public.audit_redact(to_jsonb(OLD)), v_meta);
    RETURN OLD;
  END IF;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_audit_events_user ON public.audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_module ON public.audit_events (module_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_uma_user_module ON public.user_module_access (user_id, module_key);
CREATE INDEX IF NOT EXISTS idx_user_pcm_roles_user ON public.user_pcm_roles (user_id, role_key);DROP POLICY IF EXISTS audit_events_read ON public.audit_events;
CREATE POLICY audit_events_read ON public.audit_events
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_access_module('auditoria', 'read')
  OR EXISTS (SELECT 1 FROM public.user_pcm_roles ur
              WHERE ur.user_id = auth.uid()
                AND ur.role_key = ANY (ARRAY['auditor','proprietario']))
);-- 1) Extensão da tabela notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'informacao',
  ADD COLUMN IF NOT EXISTS target_mode text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS deep_link text,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS requires_ack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_mode_chk,
  DROP CONSTRAINT IF EXISTS notifications_status_chk,
  DROP CONSTRAINT IF EXISTS notifications_category_chk;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_mode_chk
    CHECK (target_mode IN ('all','users','roles','modules','teams')),
  ADD CONSTRAINT notifications_status_chk
    CHECK (status IN ('draft','scheduled','published','paused','cancelled')),
  ADD CONSTRAINT notifications_category_chk
    CHECK (category IN ('informacao','sucesso','atencao','critico','manutencao','clima','pt','seguranca'));

-- 2) Público-alvo
CREATE TABLE IF NOT EXISTS public.notification_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid,
  role_key text,
  module_key text,
  team_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_targets_notif_idx ON public.notification_targets (notification_id);
CREATE INDEX IF NOT EXISTS notification_targets_user_idx ON public.notification_targets (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_targets TO authenticated;
GRANT ALL ON public.notification_targets TO service_role;
ALTER TABLE public.notification_targets ENABLE ROW LEVEL SECURITY;

-- 3) Recibos
CREATE TABLE IF NOT EXISTS public.notification_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  UNIQUE (notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS notification_receipts_user_idx ON public.notification_receipts (user_id);

GRANT SELECT, INSERT, UPDATE ON public.notification_receipts TO authenticated;
GRANT ALL ON public.notification_receipts TO service_role;
ALTER TABLE public.notification_receipts ENABLE ROW LEVEL SECURITY;

-- 4) Função de visibilidade (security definer)
CREATE OR REPLACE FUNCTION public.notification_is_for_me(_notification_id uuid, _target_mode text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _target_mode = 'all' THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.notification_targets t
       WHERE t.notification_id = _notification_id
         AND (
           t.user_id = auth.uid()
           OR (t.role_key IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.user_pcm_roles ur
                 WHERE ur.user_id = auth.uid() AND ur.role_key = t.role_key))
           OR (t.module_key IS NOT NULL AND public.can_access_module(t.module_key, 'read'))
           OR (t.team_key IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.maintenance_teams mt
                 WHERE mt.user_id = auth.uid() AND lower(mt.name) = lower(t.team_key)))
         )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_notifications()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.can_access_module('notificacoes-admin', 'read');
$$;

-- 5) Políticas
DROP POLICY IF EXISTS "notifications_select_destinatario" ON public.notifications;
CREATE POLICY "notifications_select_destinatario" ON public.notifications
FOR SELECT TO authenticated
USING (
  public.can_manage_notifications()
  OR (
    status = 'published'
    AND starts_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
    AND (target_user_id IS NULL OR target_user_id = auth.uid())
    AND public.notification_is_for_me(id, target_mode)
  )
);

DROP POLICY IF EXISTS "notification_targets_select" ON public.notification_targets;
CREATE POLICY "notification_targets_select" ON public.notification_targets
FOR SELECT TO authenticated
USING (public.can_manage_notifications() OR user_id = auth.uid());

DROP POLICY IF EXISTS "notification_targets_write" ON public.notification_targets;
CREATE POLICY "notification_targets_write" ON public.notification_targets
FOR ALL TO authenticated
USING (public.can_manage_notifications())
WITH CHECK (public.can_manage_notifications());

DROP POLICY IF EXISTS "notification_receipts_select_own" ON public.notification_receipts;
CREATE POLICY "notification_receipts_select_own" ON public.notification_receipts
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_notifications());

DROP POLICY IF EXISTS "notification_receipts_insert_own" ON public.notification_receipts;
CREATE POLICY "notification_receipts_insert_own" ON public.notification_receipts
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_receipts_update_own" ON public.notification_receipts;
CREATE POLICY "notification_receipts_update_own" ON public.notification_receipts
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 6) Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;-- Colunas de calibração no mapa
ALTER TABLE public.talude_maps
  ADD COLUMN IF NOT EXISTS calibration jsonb,
  ADD COLUMN IF NOT EXISTS meters_per_unit numeric,
  ADD COLUMN IF NOT EXISTS calibrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS calibrated_by uuid;

-- Dados profissionais do polígono
ALTER TABLE public.talude_marcacoes
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS setor text,
  ADD COLUMN IF NOT EXISTS risco text,
  ADD COLUMN IF NOT EXISTS inclinacao numeric,
  ADD COLUMN IF NOT EXISTS tipo_solo text,
  ADD COLUMN IF NOT EXISTS vegetacao text,
  ADD COLUMN IF NOT EXISTS servico_atual text,
  ADD COLUMN IF NOT EXISTS equipe text,
  ADD COLUMN IF NOT EXISTS data_prevista date,
  ADD COLUMN IF NOT EXISTS data_executada date,
  ADD COLUMN IF NOT EXISTS estado_operacional text,
  ADD COLUMN IF NOT EXISTS ultima_inspecao date,
  ADD COLUMN IF NOT EXISTS proxima_inspecao date,
  ADD COLUMN IF NOT EXISTS opacidade numeric NOT NULL DEFAULT 0.32,
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visivel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rascunho boolean NOT NULL DEFAULT false;

-- Versões do mapa
CREATE TABLE IF NOT EXISTS public.talude_map_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, version_number)
);

GRANT SELECT, INSERT ON public.talude_map_versions TO authenticated;
GRANT ALL ON public.talude_map_versions TO service_role;
ALTER TABLE public.talude_map_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talude_versions_select" ON public.talude_map_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.talude_maps m WHERE m.id = map_id AND m.owner_id = auth.uid())
  );

CREATE POLICY "talude_versions_insert" ON public.talude_map_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.talude_maps m WHERE m.id = map_id AND m.owner_id = auth.uid())
    )
  );

-- Eventos de geometria
CREATE TABLE IF NOT EXISTS public.talude_geometry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  marcacao_id uuid,
  action text NOT NULL,
  old_polygon jsonb,
  new_polygon jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS talude_geometry_events_map_idx
  ON public.talude_geometry_events(map_id, created_at DESC);

GRANT SELECT, INSERT ON public.talude_geometry_events TO authenticated;
GRANT ALL ON public.talude_geometry_events TO service_role;
ALTER TABLE public.talude_geometry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talude_geo_events_select" ON public.talude_geometry_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.talude_maps m WHERE m.id = map_id AND m.owner_id = auth.uid())
  );

CREATE POLICY "talude_geo_events_insert" ON public.talude_geometry_events
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.talude_maps m WHERE m.id = map_id AND m.owner_id = auth.uid())
    )
  );-- ============ FASE 7: clima, chuva e PT dos taludes ============

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
ON CONFLICT DO NOTHING;-- =========================================================
-- FASE 8 — FROTA, CHECKLIST E ABASTECIMENTO
-- =========================================================

CREATE OR REPLACE FUNCTION public.frota_can(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_module('abastecimento', required_action)
      OR public.can_access_module('frota-checklist', required_action)
      OR public.can_access_module('frota-historico', required_action)
      OR public.can_access_module('frota-gestao', required_action);
$$;

CREATE OR REPLACE FUNCTION public.frota_is_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.can_access_module('frota-gestao', 'read');
$$;

-- ---------- VEÍCULOS ----------
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL UNIQUE,
  plate text UNIQUE,
  brand text NOT NULL,
  model text NOT NULL,
  version text,
  year_model integer,
  year_manufacture integer,
  color text,
  renavam text,
  chassis_last6 text,
  fuel_type text NOT NULL DEFAULT 'flex',
  current_odometer_km numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'disponivel',
  block_reason text,
  thumbnail_url text,
  model_glb_url text,
  model_poster_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicles_status_chk CHECK (status IN ('disponivel','em_uso','bloqueado','manutencao','inativo'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_read" ON public.vehicles FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vehicles_insert" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (public.frota_is_gestor());
CREATE POLICY "vehicles_update" ON public.vehicles FOR UPDATE TO authenticated USING (public.frota_can('update')) WITH CHECK (public.frota_can('update'));
CREATE POLICY "vehicles_delete" ON public.vehicles FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE TRIGGER vehicles_updated_at BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER vehicles_audit AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('frota-gestao');

INSERT INTO public.vehicles (prefix, brand, model, version, year_model, year_manufacture, fuel_type, status)
VALUES
  ('FRT-01', 'Fiat', 'Fiorino', 'Endurance', 2025, 2025, 'flex', 'disponivel'),
  ('FRT-02', 'Fiat', 'Fiorino', 'Endurance', 2025, 2025, 'flex', 'disponivel'),
  ('FRT-03', 'Volkswagen', 'Saveiro', 'Robust', 2021, 2021, 'flex', 'disponivel');

-- ---------- CHECKLISTS ----------
CREATE TABLE public.vehicle_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol text NOT NULL UNIQUE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  checklist_type text NOT NULL DEFAULT 'pre_uso',
  odometer_km numeric NOT NULL,
  fuel_level_pct integer,
  location text,
  purpose text,
  work_order_number text,
  overall_status text NOT NULL DEFAULT 'conforme',
  integrity_score integer NOT NULL DEFAULT 100,
  critical_block boolean NOT NULL DEFAULT false,
  declaration_accepted boolean NOT NULL DEFAULT false,
  signature_url text,
  notes text,
  integrity_hash text,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  synced_from_offline boolean NOT NULL DEFAULT false,
  device_id_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_type_chk CHECK (checklist_type IN ('pre_uso','pos_uso','periodico','devolucao')),
  CONSTRAINT vc_status_chk CHECK (overall_status IN ('conforme','com_ressalvas','nao_conforme'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_checklists TO authenticated;
GRANT ALL ON public.vehicle_checklists TO service_role;
ALTER TABLE public.vehicle_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vc_read" ON public.vehicle_checklists FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vc_insert" ON public.vehicle_checklists FOR INSERT TO authenticated
  WITH CHECK (public.frota_can('create') AND submitted_by = auth.uid());
CREATE POLICY "vc_update" ON public.vehicle_checklists FOR UPDATE TO authenticated
  USING (public.frota_is_gestor()) WITH CHECK (public.frota_is_gestor());
CREATE POLICY "vc_delete" ON public.vehicle_checklists FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE INDEX vc_vehicle_idx ON public.vehicle_checklists (vehicle_id, submitted_at DESC);
CREATE TRIGGER vc_audit AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_checklists
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('frota-checklist');

-- ---------- COLABORADORES DO CHECKLIST ----------
CREATE TABLE public.vehicle_checklist_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.vehicle_checklists(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.sst_colaboradores(id) ON DELETE SET NULL,
  role_in_checklist text NOT NULL DEFAULT 'principal',
  full_name_snapshot text NOT NULL,
  cpf_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vcc_role_chk CHECK (role_in_checklist IN ('principal','acompanhante'))
);
GRANT SELECT, INSERT, DELETE ON public.vehicle_checklist_collaborators TO authenticated;
GRANT ALL ON public.vehicle_checklist_collaborators TO service_role;
ALTER TABLE public.vehicle_checklist_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vcc_read" ON public.vehicle_checklist_collaborators FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vcc_insert" ON public.vehicle_checklist_collaborators FOR INSERT TO authenticated WITH CHECK (public.frota_can('create'));
CREATE POLICY "vcc_delete" ON public.vehicle_checklist_collaborators FOR DELETE TO authenticated USING (public.frota_is_gestor());

-- CPF completo isolado: só gestores de frota/admin conseguem ler.
CREATE TABLE public.vehicle_checklist_collaborator_pii (
  collaborator_id uuid PRIMARY KEY REFERENCES public.vehicle_checklist_collaborators(id) ON DELETE CASCADE,
  cpf_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.vehicle_checklist_collaborator_pii TO authenticated;
GRANT ALL ON public.vehicle_checklist_collaborator_pii TO service_role;
ALTER TABLE public.vehicle_checklist_collaborator_pii ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vccp_read" ON public.vehicle_checklist_collaborator_pii FOR SELECT TO authenticated USING (public.frota_is_gestor());
CREATE POLICY "vccp_insert" ON public.vehicle_checklist_collaborator_pii FOR INSERT TO authenticated WITH CHECK (public.frota_can('create'));

-- ---------- ITENS ----------
CREATE TABLE public.vehicle_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.vehicle_checklists(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  status text NOT NULL,
  severity text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vci_status_chk CHECK (status IN ('conforme','nao_conforme','nao_se_aplica')),
  CONSTRAINT vci_sev_chk CHECK (severity IS NULL OR severity IN ('baixa','media','alta','critica'))
);
GRANT SELECT, INSERT, DELETE ON public.vehicle_checklist_items TO authenticated;
GRANT ALL ON public.vehicle_checklist_items TO service_role;
ALTER TABLE public.vehicle_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vci_read" ON public.vehicle_checklist_items FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vci_insert" ON public.vehicle_checklist_items FOR INSERT TO authenticated WITH CHECK (public.frota_can('create'));
CREATE POLICY "vci_delete" ON public.vehicle_checklist_items FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE INDEX vci_checklist_idx ON public.vehicle_checklist_items (checklist_id);

-- ---------- FOTOS ----------
CREATE TABLE public.vehicle_checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.vehicle_checklists(id) ON DELETE CASCADE,
  checklist_item_id uuid REFERENCES public.vehicle_checklist_items(id) ON DELETE SET NULL,
  photo_slot text NOT NULL,
  url text NOT NULL,
  thumbnail_url text,
  image_hash text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid,
  removed_at timestamptz,
  removed_by uuid,
  removal_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.vehicle_checklist_photos TO authenticated;
GRANT ALL ON public.vehicle_checklist_photos TO service_role;
ALTER TABLE public.vehicle_checklist_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vcp_read" ON public.vehicle_checklist_photos FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vcp_insert" ON public.vehicle_checklist_photos FOR INSERT TO authenticated
  WITH CHECK (public.frota_can('create') AND uploaded_by = auth.uid());
-- Exclusão lógica com motivo: apenas gestor/admin.
CREATE POLICY "vcp_soft_delete" ON public.vehicle_checklist_photos FOR UPDATE TO authenticated
  USING (public.frota_is_gestor()) WITH CHECK (public.frota_is_gestor());
CREATE INDEX vcp_checklist_idx ON public.vehicle_checklist_photos (checklist_id);
CREATE TRIGGER vcp_audit AFTER UPDATE ON public.vehicle_checklist_photos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('frota-checklist');

-- ---------- ABASTECIMENTOS ----------
CREATE TABLE public.vehicle_fuelings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  fueled_at timestamptz NOT NULL DEFAULT now(),
  driver_name text,
  odometer_km numeric NOT NULL,
  fuel_type text NOT NULL DEFAULT 'gasolina',
  liters numeric NOT NULL CHECK (liters > 0),
  price_per_liter numeric,
  total_value numeric,
  station text,
  receipt_number text,
  odometer_photo_url text,
  receipt_photo_url text,
  full_tank boolean NOT NULL DEFAULT true,
  notes text,
  anomalies jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_fuelings TO authenticated;
GRANT ALL ON public.vehicle_fuelings TO service_role;
ALTER TABLE public.vehicle_fuelings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vf_read" ON public.vehicle_fuelings FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vf_insert" ON public.vehicle_fuelings FOR INSERT TO authenticated
  WITH CHECK (public.frota_can('create') AND created_by = auth.uid());
CREATE POLICY "vf_update" ON public.vehicle_fuelings FOR UPDATE TO authenticated
  USING (public.frota_is_gestor()) WITH CHECK (public.frota_is_gestor());
CREATE POLICY "vf_delete" ON public.vehicle_fuelings FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE INDEX vf_vehicle_idx ON public.vehicle_fuelings (vehicle_id, fueled_at DESC);
CREATE TRIGGER vf_updated_at BEFORE UPDATE ON public.vehicle_fuelings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER vf_audit AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_fuelings
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento');

-- ---------- OCORRÊNCIAS ----------
CREATE TABLE public.vehicle_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  checklist_id uuid REFERENCES public.vehicle_checklists(id) ON DELETE SET NULL,
  occurrence_type text NOT NULL DEFAULT 'nao_conformidade',
  severity text NOT NULL DEFAULT 'media',
  description text NOT NULL,
  state text NOT NULL DEFAULT 'aberta',
  assignee text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_notes text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vo_state_chk CHECK (state IN ('aberta','em_analise','resolvida','cancelada')),
  CONSTRAINT vo_sev_chk CHECK (severity IN ('baixa','media','alta','critica'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_occurrences TO authenticated;
GRANT ALL ON public.vehicle_occurrences TO service_role;
ALTER TABLE public.vehicle_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vo_read" ON public.vehicle_occurrences FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vo_insert" ON public.vehicle_occurrences FOR INSERT TO authenticated WITH CHECK (public.frota_can('create'));
CREATE POLICY "vo_update" ON public.vehicle_occurrences FOR UPDATE TO authenticated
  USING (public.frota_is_gestor()) WITH CHECK (public.frota_is_gestor());
CREATE POLICY "vo_delete" ON public.vehicle_occurrences FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE INDEX vo_vehicle_idx ON public.vehicle_occurrences (vehicle_id, opened_at DESC);
CREATE TRIGGER vo_updated_at BEFORE UPDATE ON public.vehicle_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER vo_audit AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('frota-gestao');

-- Bloqueio automático do veículo em não conformidade crítica.
CREATE OR REPLACE FUNCTION public.tg_vehicle_checklist_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.vehicles
     SET current_odometer_km = GREATEST(current_odometer_km, NEW.odometer_km),
         status = CASE WHEN NEW.critical_block THEN 'bloqueado' ELSE status END,
         block_reason = CASE WHEN NEW.critical_block
           THEN 'Aguardando avaliação — checklist ' || NEW.protocol ELSE block_reason END
   WHERE id = NEW.vehicle_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER vc_block_vehicle AFTER INSERT ON public.vehicle_checklists
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicle_checklist_block();-- =============== BI STUDIO ===============
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
ON CONFLICT DO NOTHING;-- ============ 26. Ciclo de vida unificado ============
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
ON CONFLICT DO NOTHING;CREATE TABLE public.client_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  origin text NOT NULL DEFAULT 'client',
  level text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  detail text,
  route text,
  module_key text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_error_logs TO authenticated;
GRANT ALL ON public.client_error_logs TO service_role;

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can log errors" ON public.client_error_logs
  FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "tech panel can read errors" ON public.client_error_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.can_access_module('observabilidade', 'read'));

CREATE INDEX idx_client_error_logs_created ON public.client_error_logs (created_at DESC);
CREATE INDEX idx_client_error_logs_level ON public.client_error_logs (level, created_at DESC);

CREATE TABLE public.integration_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  message text,
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.integration_heartbeats TO authenticated;
GRANT ALL ON public.integration_heartbeats TO service_role;

ALTER TABLE public.integration_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can send heartbeat" ON public.integration_heartbeats
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tech panel can read heartbeats" ON public.integration_heartbeats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.can_access_module('observabilidade', 'read'));

CREATE INDEX idx_integration_heartbeats_recent ON public.integration_heartbeats (integration, created_at DESC);

INSERT INTO public.pcm_permissions (key, module_key, action, label)
VALUES ('observabilidade:read', 'observabilidade', 'read', 'Painel técnico — leitura')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, 'observabilidade:read' FROM public.pcm_roles r WHERE r.key IN ('admin','pcm_gestor')
ON CONFLICT DO NOTHING;-- ============ Módulo Entrega de Água (Frota e Abastecimento) ============

CREATE OR REPLACE FUNCTION public.agua_can(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.frota_can(required_action)
      OR public.can_access_module('abastecimento-agua', required_action);
$$;

CREATE OR REPLACE FUNCTION public.agua_is_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.frota_is_gestor()
      OR public.can_access_module('abastecimento-agua', 'update');
$$;

-- ---------- Lotes de importação ----------
CREATE TABLE IF NOT EXISTS public.agua_import_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_nome text NOT NULL,
  arquivo_hash text NOT NULL,
  total_linhas integer NOT NULL DEFAULT 0,
  total_pontos integer NOT NULL DEFAULT 0,
  total_visitas integer NOT NULL DEFAULT 0,
  divergencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'aplicado',
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  desfeito_em timestamptz,
  desfeito_por uuid
);
CREATE INDEX IF NOT EXISTS agua_import_lotes_hash_idx ON public.agua_import_lotes(arquivo_hash);

GRANT SELECT, INSERT, UPDATE ON public.agua_import_lotes TO authenticated;
GRANT ALL ON public.agua_import_lotes TO service_role;
ALTER TABLE public.agua_import_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_lotes_select" ON public.agua_import_lotes FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_lotes_insert" ON public.agua_import_lotes FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_lotes_update" ON public.agua_import_lotes FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());

-- ---------- Pontos ----------
CREATE TABLE IF NOT EXISTS public.agua_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  predio text NOT NULL,
  andar text NOT NULL DEFAULT '',
  espaco text NOT NULL DEFAULT '',
  bags_padrao integer NOT NULL DEFAULT 1 CHECK (bags_padrao >= 0),
  janela_inicio time,
  janela_fim time,
  ordem integer NOT NULL DEFAULT 0,
  responsavel text,
  veiculo text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  lote_id uuid REFERENCES public.agua_import_lotes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_pontos_lote_idx ON public.agua_pontos(lote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_pontos TO authenticated;
GRANT ALL ON public.agua_pontos TO service_role;
ALTER TABLE public.agua_pontos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_pontos_select" ON public.agua_pontos FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_pontos_insert" ON public.agua_pontos FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_pontos_update" ON public.agua_pontos FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_pontos_delete" ON public.agua_pontos FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_pontos_touch BEFORE UPDATE ON public.agua_pontos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Programação semanal ----------
CREATE TABLE IF NOT EXISTS public.agua_programacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  ordem integer NOT NULL DEFAULT 0,
  bags integer NOT NULL DEFAULT 1 CHECK (bags >= 0),
  origem text NOT NULL DEFAULT 'aba_diaria',
  ativo boolean NOT NULL DEFAULT true,
  lote_id uuid REFERENCES public.agua_import_lotes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ponto_id, dia_semana)
);
CREATE INDEX IF NOT EXISTS agua_programacao_dia_idx ON public.agua_programacao(dia_semana) WHERE ativo;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_programacao TO authenticated;
GRANT ALL ON public.agua_programacao TO service_role;
ALTER TABLE public.agua_programacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_prog_select" ON public.agua_programacao FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_prog_insert" ON public.agua_programacao FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_prog_update" ON public.agua_programacao FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_prog_delete" ON public.agua_programacao FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_prog_touch BEFORE UPDATE ON public.agua_programacao
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Visitas executadas ----------
CREATE TABLE IF NOT EXISTS public.agua_visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  data date NOT NULL,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','concluida','parcial','nao_realizada','cancelada')),
  motivo text,
  bags_previstas integer NOT NULL DEFAULT 1 CHECK (bags_previstas >= 0),
  bags_entregues integer CHECK (bags_entregues >= 0),
  foto_url text,
  observacao text,
  responsavel text,
  veiculo text,
  executado_por uuid,
  executado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ponto_id, data)
);
CREATE INDEX IF NOT EXISTS agua_visitas_data_idx ON public.agua_visitas(data DESC);
CREATE INDEX IF NOT EXISTS agua_visitas_status_idx ON public.agua_visitas(status);

GRANT SELECT, INSERT, UPDATE ON public.agua_visitas TO authenticated;
GRANT ALL ON public.agua_visitas TO service_role;
ALTER TABLE public.agua_visitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_visitas_select" ON public.agua_visitas FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_visitas_insert" ON public.agua_visitas FOR INSERT TO authenticated WITH CHECK (public.agua_can('create') OR public.agua_can('update') OR public.agua_is_gestor());
CREATE POLICY "agua_visitas_update" ON public.agua_visitas FOR UPDATE TO authenticated USING (public.agua_can('update') OR public.agua_is_gestor()) WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());

CREATE TRIGGER agua_visitas_touch BEFORE UPDATE ON public.agua_visitas
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Eventos (auditoria imutável) ----------
CREATE TABLE IF NOT EXISTS public.agua_visita_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid NOT NULL REFERENCES public.agua_visitas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_visita_eventos_visita_idx ON public.agua_visita_eventos(visita_id, criado_em DESC);

GRANT SELECT, INSERT ON public.agua_visita_eventos TO authenticated;
GRANT ALL ON public.agua_visita_eventos TO service_role;
ALTER TABLE public.agua_visita_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_eventos_select" ON public.agua_visita_eventos FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_eventos_insert" ON public.agua_visita_eventos FOR INSERT TO authenticated WITH CHECK (public.agua_can('read'));

-- ---------- Permissão do módulo no catálogo PCM ----------
INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT 'abastecimento-agua:' || a, 'abastecimento-agua', a,
       'Entrega de Água — ' || a
FROM unnest(ARRAY['read','create','update','delete']) AS a
ON CONFLICT (key) DO NOTHING;CREATE TABLE public.agua_filtro_solicitacoes (
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
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();ALTER TABLE public.agua_pontos
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
  FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());ALTER TABLE public.agua_programacao
  ADD COLUMN IF NOT EXISTS turno text NOT NULL DEFAULT 'manha',
  ADD COLUMN IF NOT EXISTS equipe text,
  ADD COLUMN IF NOT EXISTS template_key text NOT NULL DEFAULT 'padrao';

CREATE TABLE IF NOT EXISTS public.agua_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  descricao text NOT NULL,
  tipo text NOT NULL DEFAULT 'feriado' CHECK (tipo IN ('feriado','bloqueio')),
  bloqueia_geracao boolean NOT NULL DEFAULT true,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, descricao)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_feriados TO authenticated;
GRANT ALL ON public.agua_feriados TO service_role;
ALTER TABLE public.agua_feriados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_feriados_select" ON public.agua_feriados FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_feriados_insert" ON public.agua_feriados FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_feriados_update" ON public.agua_feriados FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_feriados_delete" ON public.agua_feriados FOR DELETE TO authenticated USING (public.agua_is_gestor());
CREATE TRIGGER agua_feriados_touch BEFORE UPDATE ON public.agua_feriados FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.agua_excecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('remover','extra')),
  bags integer NOT NULL DEFAULT 1 CHECK (bags >= 0),
  turno text NOT NULL DEFAULT 'manha',
  motivo text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ponto_id, data, tipo)
);
CREATE INDEX IF NOT EXISTS agua_excecoes_data_idx ON public.agua_excecoes (data);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_excecoes TO authenticated;
GRANT ALL ON public.agua_excecoes TO service_role;
ALTER TABLE public.agua_excecoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_excecoes_select" ON public.agua_excecoes FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_excecoes_insert" ON public.agua_excecoes FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_excecoes_update" ON public.agua_excecoes FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_excecoes_delete" ON public.agua_excecoes FOR DELETE TO authenticated USING (public.agua_is_gestor());
CREATE TRIGGER agua_excecoes_touch BEFORE UPDATE ON public.agua_excecoes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.agua_rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  turno text NOT NULL DEFAULT 'manha',
  equipe text NOT NULL DEFAULT 'geral',
  template_key text NOT NULL DEFAULT 'padrao',
  colaborador_principal text,
  colaborador_secundario text,
  veiculo text,
  supervisor text,
  horario_previsto time,
  bags_carregadas integer CHECK (bags_carregadas >= 0),
  observacao text,
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','pronta','em_andamento','concluida','cancelada')),
  motivo_cancelamento text,
  versao integer NOT NULL DEFAULT 1,
  iniciada_em timestamptz,
  finalizada_em timestamptz,
  criado_por uuid,
  atualizado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, turno, equipe, template_key)
);
CREATE INDEX IF NOT EXISTS agua_rotas_data_idx ON public.agua_rotas (data DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_rotas TO authenticated;
GRANT ALL ON public.agua_rotas TO service_role;
ALTER TABLE public.agua_rotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_rotas_select" ON public.agua_rotas FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_rotas_insert" ON public.agua_rotas FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rotas_update" ON public.agua_rotas FOR UPDATE TO authenticated USING (public.agua_can('update') OR public.agua_is_gestor()) WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());
CREATE POLICY "agua_rotas_delete" ON public.agua_rotas FOR DELETE TO authenticated USING (public.agua_is_gestor());
CREATE TRIGGER agua_rotas_touch BEFORE UPDATE ON public.agua_rotas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.agua_rota_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.agua_rotas(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  snapshot jsonb NOT NULL,
  motivo text,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_rota_versoes_rota_idx ON public.agua_rota_versoes (rota_id, versao DESC);
GRANT SELECT, INSERT ON public.agua_rota_versoes TO authenticated;
GRANT ALL ON public.agua_rota_versoes TO service_role;
ALTER TABLE public.agua_rota_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_rota_versoes_select" ON public.agua_rota_versoes FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_rota_versoes_insert" ON public.agua_rota_versoes FOR INSERT TO authenticated WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());

CREATE TABLE IF NOT EXISTS public.agua_geracao_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_alvo date NOT NULL,
  origem text NOT NULL DEFAULT 'cron',
  status text NOT NULL DEFAULT 'ok',
  rotas_criadas integer NOT NULL DEFAULT 0,
  visitas_criadas integer NOT NULL DEFAULT 0,
  ignoradas integer NOT NULL DEFAULT 0,
  mensagem text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_geracao_jobs_criado_idx ON public.agua_geracao_jobs (criado_em DESC);
GRANT SELECT ON public.agua_geracao_jobs TO authenticated;
GRANT ALL ON public.agua_geracao_jobs TO service_role;
ALTER TABLE public.agua_geracao_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_geracao_jobs_select" ON public.agua_geracao_jobs FOR SELECT TO authenticated USING (public.agua_can('read'));

ALTER TABLE public.agua_visitas
  ADD COLUMN IF NOT EXISTS rota_id uuid REFERENCES public.agua_rotas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turno text NOT NULL DEFAULT 'manha',
  ADD COLUMN IF NOT EXISTS excepcional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS agua_visitas_rota_idx ON public.agua_visitas (rota_id);

CREATE OR REPLACE FUNCTION public.agua_gerar_rotas(p_data date DEFAULT NULL, p_origem text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_data date := COALESCE(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_dia smallint;
  v_rotas int := 0;
  v_visitas int := 0;
  v_feriado text;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.agua_can('read') THEN
    RAISE EXCEPTION 'sem permissao';
  END IF;

  v_dia := EXTRACT(isodow FROM v_data)::smallint;

  SELECT descricao INTO v_feriado FROM public.agua_feriados
   WHERE data = v_data AND bloqueia_geracao LIMIT 1;

  IF v_feriado IS NOT NULL THEN
    INSERT INTO public.agua_geracao_jobs(data_alvo, origem, status, mensagem, usuario_id)
    VALUES (v_data, p_origem, 'ignorado', 'Data bloqueada: ' || v_feriado, v_uid);
    RETURN jsonb_build_object('data', v_data, 'status', 'ignorado', 'motivo', v_feriado);
  END IF;

  WITH grupos AS (
    SELECT DISTINCT coalesce(g.turno,'manha') AS turno,
                    coalesce(g.equipe,'geral') AS equipe,
                    coalesce(g.template_key,'padrao') AS template_key
      FROM public.agua_programacao g
     WHERE g.ativo AND g.dia_semana = v_dia
  ), ins AS (
    INSERT INTO public.agua_rotas (data, turno, equipe, template_key, criado_por)
    SELECT v_data, turno, equipe, template_key, v_uid FROM grupos
    ON CONFLICT (data, turno, equipe, template_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_rotas FROM ins;

  WITH base AS (
    SELECT g.ponto_id,
           coalesce(g.turno,'manha') AS turno,
           coalesce(g.equipe,'geral') AS equipe,
           coalesce(g.template_key,'padrao') AS template_key,
           g.bags, g.ordem, false AS excepcional
      FROM public.agua_programacao g
      JOIN public.agua_pontos pt ON pt.id = g.ponto_id AND pt.ativo
     WHERE g.ativo AND g.dia_semana = v_dia
       AND NOT EXISTS (
         SELECT 1 FROM public.agua_excecoes e
          WHERE e.ponto_id = g.ponto_id AND e.data = v_data AND e.tipo = 'remover')
    UNION ALL
    SELECT e.ponto_id, coalesce(e.turno,'manha'), 'geral', 'padrao', e.bags, 999, true
      FROM public.agua_excecoes e
      JOIN public.agua_pontos pt ON pt.id = e.ponto_id AND pt.ativo
     WHERE e.data = v_data AND e.tipo = 'extra'
  ), ins AS (
    INSERT INTO public.agua_visitas (ponto_id, data, dia_semana, status, bags_previstas, turno, ordem, excepcional, rota_id)
    SELECT b.ponto_id, v_data, v_dia, 'pendente', b.bags, b.turno, b.ordem, b.excepcional,
           (SELECT r.id FROM public.agua_rotas r
             WHERE r.data = v_data AND r.turno = b.turno AND r.equipe = b.equipe
               AND r.template_key = b.template_key LIMIT 1)
      FROM base b
    ON CONFLICT (ponto_id, data) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_visitas FROM ins;

  INSERT INTO public.agua_geracao_jobs(data_alvo, origem, status, rotas_criadas, visitas_criadas, usuario_id, mensagem)
  VALUES (v_data, p_origem, 'ok', v_rotas, v_visitas, v_uid,
          format('%s rota(s) e %s parada(s) criadas', v_rotas, v_visitas));

  RETURN jsonb_build_object('data', v_data, 'status', 'ok', 'rotas', v_rotas, 'visitas', v_visitas);
END;
$$;

GRANT EXECUTE ON FUNCTION public.agua_gerar_rotas(date, text) TO authenticated, service_role, anon;REVOKE EXECUTE ON FUNCTION public.agua_gerar_rotas(date, text) FROM anon;ALTER TABLE public.agua_visitas
  ADD COLUMN IF NOT EXISTS bags_recolhidas integer,
  ADD COLUMN IF NOT EXISTS estoque_antes integer,
  ADD COLUMN IF NOT EXISTS estoque_depois integer,
  ADD COLUMN IF NOT EXISTS condicao text,
  ADD COLUMN IF NOT EXISTS recebido_por text,
  ADD COLUMN IF NOT EXISTS fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assinatura_url text,
  ADD COLUMN IF NOT EXISTS local_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS deslocamento_em timestamptz,
  ADD COLUMN IF NOT EXISTS atendimento_em timestamptz;

ALTER TABLE public.agua_visitas DROP CONSTRAINT IF EXISTS agua_visitas_status_check;
ALTER TABLE public.agua_visitas ADD CONSTRAINT agua_visitas_status_check CHECK (status = ANY (ARRAY[
  'pendente','em_deslocamento','em_atendimento','concluida','parcial','nao_realizada',
  'sem_necessidade','acesso_bloqueado','local_fechado','falta_bags','endereco_divergente',
  'reprogramada','cancelada']));

ALTER TABLE public.agua_visitas DROP CONSTRAINT IF EXISTS agua_visitas_bags_recolhidas_check;
ALTER TABLE public.agua_visitas ADD CONSTRAINT agua_visitas_bags_recolhidas_check CHECK (bags_recolhidas IS NULL OR bags_recolhidas >= 0);

CREATE TABLE IF NOT EXISTS public.agua_retificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid NOT NULL REFERENCES public.agua_visitas(id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_anterior jsonb,
  valor_novo jsonb,
  motivo text NOT NULL,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_retificacoes_visita_idx ON public.agua_retificacoes (visita_id, criado_em DESC);
GRANT SELECT, INSERT ON public.agua_retificacoes TO authenticated;
GRANT ALL ON public.agua_retificacoes TO service_role;
ALTER TABLE public.agua_retificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agua_retificacoes_select ON public.agua_retificacoes;
CREATE POLICY agua_retificacoes_select ON public.agua_retificacoes FOR SELECT TO authenticated USING (public.agua_can('read'));
DROP POLICY IF EXISTS agua_retificacoes_insert ON public.agua_retificacoes;
CREATE POLICY agua_retificacoes_insert ON public.agua_retificacoes FOR INSERT TO authenticated WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());

ALTER TABLE public.agua_rotas
  ADD COLUMN IF NOT EXISTS hodometro_inicial integer,
  ADD COLUMN IF NOT EXISTS hodometro_final integer,
  ADD COLUMN IF NOT EXISTS foto_carga_url text,
  ADD COLUMN IF NOT EXISTS foto_carga_final_url text,
  ADD COLUMN IF NOT EXISTS checklist_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saida_real timestamptz,
  ADD COLUMN IF NOT EXISTS observacao_inicial text,
  ADD COLUMN IF NOT EXISTS observacao_final text,
  ADD COLUMN IF NOT EXISTS bags_restantes integer,
  ADD COLUMN IF NOT EXISTS bags_recolhidas integer,
  ADD COLUMN IF NOT EXISTS bags_danificadas integer,
  ADD COLUMN IF NOT EXISTS bags_ajustes integer,
  ADD COLUMN IF NOT EXISTS divergencia_bags integer,
  ADD COLUMN IF NOT EXISTS divergencia_justificativa text,
  ADD COLUMN IF NOT EXISTS confirmado_principal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmado_secundario boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.agua_rota_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.agua_rotas(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'divergencia_bags',
  descricao text,
  divergencia integer,
  situacao text NOT NULL DEFAULT 'aberta',
  tratativa text,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agua_rota_ocorrencias_situacao_check CHECK (situacao = ANY (ARRAY['aberta','em_tratativa','resolvida']))
);
CREATE INDEX IF NOT EXISTS agua_rota_ocorrencias_rota_idx ON public.agua_rota_ocorrencias (rota_id, criado_em DESC);
GRANT SELECT, INSERT, UPDATE ON public.agua_rota_ocorrencias TO authenticated;
GRANT ALL ON public.agua_rota_ocorrencias TO service_role;
ALTER TABLE public.agua_rota_ocorrencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agua_rota_ocorrencias_select ON public.agua_rota_ocorrencias;
CREATE POLICY agua_rota_ocorrencias_select ON public.agua_rota_ocorrencias FOR SELECT TO authenticated USING (public.agua_can('read'));
DROP POLICY IF EXISTS agua_rota_ocorrencias_insert ON public.agua_rota_ocorrencias;
CREATE POLICY agua_rota_ocorrencias_insert ON public.agua_rota_ocorrencias FOR INSERT TO authenticated WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());
DROP POLICY IF EXISTS agua_rota_ocorrencias_update ON public.agua_rota_ocorrencias;
CREATE POLICY agua_rota_ocorrencias_update ON public.agua_rota_ocorrencias FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());

DROP TRIGGER IF EXISTS agua_rota_ocorrencias_touch ON public.agua_rota_ocorrencias;
CREATE TRIGGER agua_rota_ocorrencias_touch BEFORE UPDATE ON public.agua_rota_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();-- ============ 9.1 Tipos de bag ============
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
  ('BAG10', 'Bag 10 litros', '10 L', 10, 0, 10, 'Almoxarifado Central');-- =====================================================================
-- Filtros de água: ativos, eventos e workflow com SLA
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.agua_filtro_ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  codigo text,
  marca text,
  modelo text,
  numero_serie text,
  tipo_filtro text NOT NULL DEFAULT 'refil',
  local_instalacao text,
  instalado_em date,
  ultima_troca date,
  periodicidade_dias integer NOT NULL DEFAULT 180,
  proxima_troca date,
  situacao text NOT NULL DEFAULT 'ativo',
  observacao text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agua_filtro_ativos_periodicidade_chk CHECK (periodicidade_dias BETWEEN 1 AND 3650),
  CONSTRAINT agua_filtro_ativos_situacao_chk CHECK (situacao IN ('ativo','inativo','substituido'))
);

CREATE UNIQUE INDEX IF NOT EXISTS agua_filtro_ativos_serie_uidx
  ON public.agua_filtro_ativos (lower(numero_serie))
  WHERE numero_serie IS NOT NULL AND numero_serie <> '';
CREATE INDEX IF NOT EXISTS agua_filtro_ativos_ponto_idx ON public.agua_filtro_ativos (ponto_id);
CREATE INDEX IF NOT EXISTS agua_filtro_ativos_proxima_idx ON public.agua_filtro_ativos (proxima_troca);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_filtro_ativos TO authenticated;
GRANT ALL ON public.agua_filtro_ativos TO service_role;
ALTER TABLE public.agua_filtro_ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_filtro_ativos_select" ON public.agua_filtro_ativos
  FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_filtro_ativos_insert" ON public.agua_filtro_ativos
  FOR INSERT TO authenticated WITH CHECK (public.agua_can('create'));
CREATE POLICY "agua_filtro_ativos_update" ON public.agua_filtro_ativos
  FOR UPDATE TO authenticated USING (public.agua_can('update')) WITH CHECK (public.agua_can('update'));
CREATE POLICY "agua_filtro_ativos_delete" ON public.agua_filtro_ativos
  FOR DELETE TO authenticated USING (public.agua_is_gestor());

-- --------------------------------------------------------------------
-- Colunas novas nas solicitações
-- --------------------------------------------------------------------
ALTER TABLE public.agua_filtro_solicitacoes
  ADD COLUMN IF NOT EXISTS ativo_id uuid REFERENCES public.agua_filtro_ativos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'gestor',
  ADD COLUMN IF NOT EXISTS sla_horas integer,
  ADD COLUMN IF NOT EXISTS vence_em timestamptz,
  ADD COLUMN IF NOT EXISTS atendida_por uuid,
  ADD COLUMN IF NOT EXISTS foto_conclusao_url text,
  ADD COLUMN IF NOT EXISTS observacao_conclusao text,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS numero bigint GENERATED BY DEFAULT AS IDENTITY;

CREATE INDEX IF NOT EXISTS agua_filtro_solic_vence_idx
  ON public.agua_filtro_solicitacoes (vence_em)
  WHERE situacao IN ('aberta','em_atendimento');

-- --------------------------------------------------------------------
-- Trilha de eventos (append-only)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agua_filtro_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.agua_filtro_solicitacoes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  situacao_anterior text,
  situacao_nova text,
  comentario text,
  foto_url text,
  autor uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agua_filtro_eventos_tipo_chk CHECK (
    tipo IN ('abertura','triagem','programacao','execucao','conclusao','cancelamento','comentario')
  )
);

CREATE INDEX IF NOT EXISTS agua_filtro_eventos_solic_idx
  ON public.agua_filtro_eventos (solicitacao_id, criado_em DESC);

GRANT SELECT, INSERT ON public.agua_filtro_eventos TO authenticated;
GRANT ALL ON public.agua_filtro_eventos TO service_role;
ALTER TABLE public.agua_filtro_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_filtro_eventos_select" ON public.agua_filtro_eventos
  FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_filtro_eventos_insert" ON public.agua_filtro_eventos
  FOR INSERT TO authenticated WITH CHECK (public.agua_can('update') AND autor = auth.uid());

-- --------------------------------------------------------------------
-- Automação: SLA, próxima troca e trilha
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_agua_filtro_ativo_proxima()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em := now();
  NEW.proxima_troca := COALESCE(NEW.ultima_troca, NEW.instalado_em) + (NEW.periodicidade_dias || ' days')::interval;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agua_filtro_ativo_proxima ON public.agua_filtro_ativos;
CREATE TRIGGER trg_agua_filtro_ativo_proxima
  BEFORE INSERT OR UPDATE ON public.agua_filtro_ativos
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_filtro_ativo_proxima();

CREATE OR REPLACE FUNCTION public.tg_agua_filtro_sla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_horas integer;
BEGIN
  v_horas := CASE NEW.prioridade WHEN 'alta' THEN 24 WHEN 'media' THEN 72 ELSE 168 END;

  IF TG_OP = 'INSERT' OR NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN
    NEW.sla_horas := v_horas;
    NEW.vence_em := COALESCE(NEW.criado_em, now()) + (v_horas || ' hours')::interval;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.atualizado_em := now();
    IF NEW.situacao = 'concluida' AND OLD.situacao <> 'concluida' THEN
      NEW.concluida_em := COALESCE(NEW.concluida_em, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agua_filtro_sla ON public.agua_filtro_solicitacoes;
CREATE TRIGGER trg_agua_filtro_sla
  BEFORE INSERT OR UPDATE ON public.agua_filtro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_filtro_sla();

CREATE OR REPLACE FUNCTION public.tg_agua_filtro_trilha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.agua_filtro_eventos (solicitacao_id, tipo, situacao_nova, comentario, autor)
    VALUES (NEW.id, 'abertura', NEW.situacao, NEW.descricao, NEW.criado_por);
    RETURN NEW;
  END IF;

  IF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    INSERT INTO public.agua_filtro_eventos (
      solicitacao_id, tipo, situacao_anterior, situacao_nova, comentario, foto_url, autor
    ) VALUES (
      NEW.id,
      CASE NEW.situacao
        WHEN 'em_atendimento' THEN 'execucao'
        WHEN 'concluida' THEN 'conclusao'
        WHEN 'cancelada' THEN 'cancelamento'
        ELSE 'triagem'
      END,
      OLD.situacao,
      NEW.situacao,
      COALESCE(NEW.observacao_conclusao, NEW.motivo_cancelamento),
      NEW.foto_conclusao_url,
      auth.uid()
    );
  END IF;

  -- Conclusão atualiza o ciclo preventivo do ativo
  IF NEW.situacao = 'concluida' AND OLD.situacao <> 'concluida' AND NEW.ativo_id IS NOT NULL THEN
    UPDATE public.agua_filtro_ativos
       SET ultima_troca = COALESCE(NEW.concluida_em::date, CURRENT_DATE)
     WHERE id = NEW.ativo_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agua_filtro_trilha ON public.agua_filtro_solicitacoes;
CREATE TRIGGER trg_agua_filtro_trilha
  AFTER INSERT OR UPDATE ON public.agua_filtro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_filtro_trilha();-- ============ 12.1 Cadastro de pontos de filtro ============
ALTER TABLE public.agua_filtro_ativos
  ADD COLUMN IF NOT EXISTS predio text,
  ADD COLUMN IF NOT EXISTS andar_setor text,
  ADD COLUMN IF NOT EXISTS espaco text,
  ADD COLUMN IF NOT EXISTS tipo_equipamento text,
  ADD COLUMN IF NOT EXISTS fabricante text,
  ADD COLUMN IF NOT EXISTS modelo_elemento text,
  ADD COLUMN IF NOT EXISTS patrimonio text,
  ADD COLUMN IF NOT EXISTS condicao_atual text NOT NULL DEFAULT 'boa',
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS qr_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS responsavel text;

DO $$ BEGIN
  ALTER TABLE public.agua_filtro_ativos
    ADD CONSTRAINT agua_filtro_ativos_condicao_chk
    CHECK (condicao_atual IN ('boa','regular','ruim','critica'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agua_filtro_ativos_qr_uidx
  ON public.agua_filtro_ativos (qr_token);

-- ============ 12.2 / 12.3 / 12.4 / 12.5 Solicitações ============
ALTER TABLE public.agua_filtro_solicitacoes
  ADD COLUMN IF NOT EXISTS solicitante_nome text,
  ADD COLUMN IF NOT EXISTS predio text,
  ADD COLUMN IF NOT EXISTS andar_setor text,
  ADD COLUMN IF NOT EXISTS espaco text,
  ADD COLUMN IF NOT EXISTS motivos text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS motivo_outro text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS disponibilidade_acesso text,
  ADD COLUMN IF NOT EXISTS os_relacionada text,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text,
  -- programação
  ADD COLUMN IF NOT EXISTS responsavel_nome text,
  ADD COLUMN IF NOT EXISTS responsavel_2_nome text,
  ADD COLUMN IF NOT EXISTS programada_em timestamptz,
  ADD COLUMN IF NOT EXISTS veiculo_id uuid,
  ADD COLUMN IF NOT EXISTS material_descricao text,
  ADD COLUMN IF NOT EXISTS material_quantidade integer,
  ADD COLUMN IF NOT EXISTS material_reservado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incluir_na_rota boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lembrete_em timestamptz,
  ADD COLUMN IF NOT EXISTS observacao_programacao text,
  -- conclusão
  ADD COLUMN IF NOT EXISTS foto_antes_url text,
  ADD COLUMN IF NOT EXISTS foto_depois_url text,
  ADD COLUMN IF NOT EXISTS filtro_utilizado text,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS quantidade_utilizada integer,
  ADD COLUMN IF NOT EXISTS colaborador_conclusao text,
  ADD COLUMN IF NOT EXISTS descarte_destino text,
  ADD COLUMN IF NOT EXISTS condicao_apos text,
  ADD COLUMN IF NOT EXISTS nova_proxima_troca date,
  ADD COLUMN IF NOT EXISTS assinatura_url text,
  -- validação / avaliação
  ADD COLUMN IF NOT EXISTS validada_em timestamptz,
  ADD COLUMN IF NOT EXISTS reaberturas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avaliacao_nota smallint,
  ADD COLUMN IF NOT EXISTS avaliacao_comentario text;

DO $$ BEGIN
  ALTER TABLE public.agua_filtro_solicitacoes
    ADD CONSTRAINT agua_filtro_solic_avaliacao_chk
    CHECK (avaliacao_nota IS NULL OR avaliacao_nota BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.agua_filtro_solicitacoes
    ADD CONSTRAINT agua_filtro_solic_veiculo_fk
    FOREIGN KEY (veiculo_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Workflow completo (mantém valores legados 'aberta' e 'em_atendimento')
ALTER TABLE public.agua_filtro_solicitacoes
  DROP CONSTRAINT IF EXISTS agua_filtro_solicitacoes_situacao_chk;
ALTER TABLE public.agua_filtro_solicitacoes
  ADD CONSTRAINT agua_filtro_solicitacoes_situacao_chk CHECK (situacao IN (
    'aberta','em_atendimento',
    'solicitada','em_triagem','aprovada','rejeitada','aguardando_material',
    'programada','em_deslocamento','em_execucao','concluida','validada',
    'reaberta','cancelada'
  ));

CREATE INDEX IF NOT EXISTS agua_filtro_solic_ativo_idx
  ON public.agua_filtro_solicitacoes (ativo_id, criado_em DESC);

-- Trilha: cobre os novos status
CREATE OR REPLACE FUNCTION public.tg_agua_filtro_trilha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.agua_filtro_eventos (solicitacao_id, tipo, situacao_nova, comentario, autor)
    VALUES (NEW.id, 'abertura', NEW.situacao, NEW.descricao, NEW.criado_por);
    RETURN NEW;
  END IF;

  IF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    INSERT INTO public.agua_filtro_eventos (
      solicitacao_id, tipo, situacao_anterior, situacao_nova, comentario, foto_url, autor
    ) VALUES (
      NEW.id,
      CASE NEW.situacao
        WHEN 'programada' THEN 'programacao'
        WHEN 'aprovada' THEN 'programacao'
        WHEN 'em_deslocamento' THEN 'execucao'
        WHEN 'em_execucao' THEN 'execucao'
        WHEN 'em_atendimento' THEN 'execucao'
        WHEN 'concluida' THEN 'conclusao'
        WHEN 'validada' THEN 'conclusao'
        WHEN 'cancelada' THEN 'cancelamento'
        ELSE 'triagem'
      END,
      OLD.situacao,
      COALESCE(NEW.motivo_rejeicao, NEW.observacao_conclusao, NEW.motivo_cancelamento),
      COALESCE(NEW.foto_depois_url, NEW.foto_conclusao_url),
      auth.uid()
    );
  END IF;

  IF NEW.situacao = 'concluida' AND OLD.situacao <> 'concluida' AND NEW.ativo_id IS NOT NULL THEN
    UPDATE public.agua_filtro_ativos
       SET ultima_troca = COALESCE(NEW.concluida_em::date, CURRENT_DATE),
           condicao_atual = COALESCE(NEW.condicao_apos, condicao_atual)
     WHERE id = NEW.ativo_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- SLA: recalcula considerando os estados finais novos
CREATE OR REPLACE FUNCTION public.tg_agua_filtro_sla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_horas integer;
BEGIN
  v_horas := CASE NEW.prioridade WHEN 'alta' THEN 24 WHEN 'media' THEN 72 ELSE 168 END;

  IF TG_OP = 'INSERT' OR NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN
    NEW.sla_horas := v_horas;
    NEW.vence_em := COALESCE(NEW.criado_em, now()) + (v_horas || ' hours')::interval;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.atualizado_em := now();
    IF NEW.situacao = 'concluida' AND OLD.situacao <> 'concluida' THEN
      NEW.concluida_em := COALESCE(NEW.concluida_em, now());
    END IF;
    IF NEW.situacao = 'validada' AND OLD.situacao <> 'validada' THEN
      NEW.validada_em := COALESCE(NEW.validada_em, now());
    END IF;
    IF NEW.situacao = 'reaberta' AND OLD.situacao <> 'reaberta' THEN
      NEW.reaberturas := OLD.reaberturas + 1;
      NEW.concluida_em := NULL;
      NEW.vence_em := now() + (v_horas || ' hours')::interval;
      NEW.sla_horas := v_horas;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============ 12.6 Agenda preventiva ============
CREATE TABLE IF NOT EXISTS public.agua_filtro_preventivas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id uuid NOT NULL REFERENCES public.agua_filtro_ativos(id) ON DELETE CASCADE,
  prevista_para date NOT NULL,
  status text NOT NULL DEFAULT 'programada',
  justificativa text,
  reagendada_de date,
  solicitacao_id uuid REFERENCES public.agua_filtro_solicitacoes(id) ON DELETE SET NULL,
  concluida_em timestamptz,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agua_filtro_prev_status_chk
    CHECK (status IN ('programada','vencendo','vencido','concluido','cancelado'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_filtro_preventivas TO authenticated;
GRANT ALL ON public.agua_filtro_preventivas TO service_role;

ALTER TABLE public.agua_filtro_preventivas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "agua_filtro_prev_select" ON public.agua_filtro_preventivas
    FOR SELECT TO authenticated USING (public.agua_can('read'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "agua_filtro_prev_insert" ON public.agua_filtro_preventivas
    FOR INSERT TO authenticated WITH CHECK (public.agua_can('create'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "agua_filtro_prev_update" ON public.agua_filtro_preventivas
    FOR UPDATE TO authenticated USING (public.agua_can('update')) WITH CHECK (public.agua_can('update'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "agua_filtro_prev_delete" ON public.agua_filtro_preventivas
    FOR DELETE TO authenticated USING (public.agua_is_gestor());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agua_filtro_prev_ativo_data_uidx
  ON public.agua_filtro_preventivas (ativo_id, prevista_para);

DROP TRIGGER IF EXISTS trg_agua_filtro_prev_updated ON public.agua_filtro_preventivas;
CREATE TRIGGER trg_agua_filtro_prev_updated
  BEFORE UPDATE ON public.agua_filtro_preventivas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();-- ============================================================
-- ITEM 13 — Banco de dados do módulo Abastecimento de Água
-- Migração incremental sobre o schema agua_* existente
-- ============================================================

-- ---------- 13.1 pontos de entrega ----------
ALTER TABLE public.agua_pontos
  ADD COLUMN IF NOT EXISTS bag_tipo_id uuid REFERENCES public.agua_bag_tipos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contato_nome text,
  ADD COLUMN IF NOT EXISTS qr_token_hash text,
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS agua_pontos_local_norm_uidx
  ON public.agua_pontos (
    lower(btrim(coalesce(predio, ''))),
    lower(btrim(coalesce(andar, ''))),
    lower(btrim(coalesce(espaco, '')))
  ) WHERE arquivado_em IS NULL AND mesclado_para IS NULL;

CREATE INDEX IF NOT EXISTS agua_pontos_ativo_idx ON public.agua_pontos (ativo) WHERE arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS agua_pontos_bag_tipo_idx ON public.agua_pontos (bag_tipo_id);

-- ---------- 13.2 regras de programação ----------
ALTER TABLE public.agua_programacao
  ADD COLUMN IF NOT EXISTS janela_inicio time,
  ADD COLUMN IF NOT EXISTS janela_fim time,
  ADD COLUMN IF NOT EXISTS vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS vigencia_fim date,
  ADD COLUMN IF NOT EXISTS criado_por uuid;

CREATE INDEX IF NOT EXISTS agua_programacao_vigencia_idx
  ON public.agua_programacao (vigencia_inicio, vigencia_fim) WHERE ativo;

-- ---------- 13.3 modelos de rota ----------
CREATE TABLE IF NOT EXISTS public.agua_rota_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,
  nome text NOT NULL,
  equipe text,
  turno text NOT NULL DEFAULT 'manha',
  veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  versao integer NOT NULL DEFAULT 1,
  observacao text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agua_rota_templates_chave_uidx
  ON public.agua_rota_templates (lower(btrim(chave)), coalesce(lower(btrim(equipe)), ''), turno);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_rota_templates TO authenticated;
GRANT ALL ON public.agua_rota_templates TO service_role;
ALTER TABLE public.agua_rota_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_rota_templates_select" ON public.agua_rota_templates
  FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_rota_templates_insert" ON public.agua_rota_templates
  FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rota_templates_update" ON public.agua_rota_templates
  FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rota_templates_delete" ON public.agua_rota_templates
  FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_rota_templates_touch BEFORE UPDATE ON public.agua_rota_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- 13.4 paradas do modelo de rota ----------
CREATE TABLE IF NOT EXISTS public.agua_rota_template_paradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.agua_rota_templates(id) ON DELETE CASCADE,
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  ordem integer NOT NULL DEFAULT 0,
  bags_previstas numeric NOT NULL DEFAULT 0,
  tempo_estimado_min integer NOT NULL DEFAULT 10,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, ponto_id, dia_semana)
);

CREATE INDEX IF NOT EXISTS agua_rota_template_paradas_dia_idx
  ON public.agua_rota_template_paradas (template_id, dia_semana, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_rota_template_paradas TO authenticated;
GRANT ALL ON public.agua_rota_template_paradas TO service_role;
ALTER TABLE public.agua_rota_template_paradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_rota_template_paradas_select" ON public.agua_rota_template_paradas
  FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_rota_template_paradas_insert" ON public.agua_rota_template_paradas
  FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rota_template_paradas_update" ON public.agua_rota_template_paradas
  FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rota_template_paradas_delete" ON public.agua_rota_template_paradas
  FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_rota_template_paradas_touch BEFORE UPDATE ON public.agua_rota_template_paradas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- 13.5 rotas executadas ----------
ALTER TABLE public.agua_rotas
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.agua_rota_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_versao integer,
  ADD COLUMN IF NOT EXISTS geracao_job_id uuid REFERENCES public.agua_geracao_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agua_rotas_template_idx ON public.agua_rotas (template_id, data);
CREATE INDEX IF NOT EXISTS agua_rotas_status_idx ON public.agua_rotas (status, data DESC);

-- ---------- 13.6 paradas executadas ----------
ALTER TABLE public.agua_visitas
  ADD COLUMN IF NOT EXISTS offline_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS agua_visitas_offline_key_uidx
  ON public.agua_visitas (offline_idempotency_key)
  WHERE offline_idempotency_key IS NOT NULL;

-- ---------- 13.9 movimentações de bags ----------
ALTER TABLE public.agua_bag_movimentos
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- ---------- 13.14 lotes de importação ----------
ALTER TABLE public.agua_import_lotes
  ADD COLUMN IF NOT EXISTS pontos_novos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pontos_atualizados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relatorio jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rollback_permitido boolean NOT NULL DEFAULT true;

-- ---------- 13.15 eventos e auditoria ----------
CREATE TRIGGER agua_pontos_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_pontos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_programacao_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_programacao
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_rotas_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_rotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_visitas_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_visitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_retificacoes_audit AFTER INSERT ON public.agua_retificacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_bag_movimentos_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_bag_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_fotos_audit AFTER INSERT OR DELETE ON public.agua_fotos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_whatsapp_envios_audit AFTER INSERT OR UPDATE ON public.agua_whatsapp_envios
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_import_lotes_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_import_lotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_filtro_ativos_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_filtro_ativos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_filtro_solicitacoes_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_filtro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_rota_templates_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_rota_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');-- ============================================================
-- ITEM 14 — Enums e máquinas de estado do módulo de Água
-- ============================================================

-- ---------- 14.1 enum de rota ----------
CREATE TYPE public.agua_rota_status AS ENUM (
  'rascunho', 'planejada', 'atribuida', 'pronta', 'em_andamento',
  'pausada', 'concluida', 'concluida_com_divergencia', 'cancelada'
);

-- ---------- 14.2 enum de parada ----------
CREATE TYPE public.agua_visita_status AS ENUM (
  'pendente', 'em_deslocamento', 'em_atendimento', 'concluida', 'parcial',
  'sem_necessidade', 'acesso_bloqueado', 'local_fechado', 'falta_bags',
  'endereco_divergente', 'reprogramada', 'nao_realizada', 'cancelada'
);

-- ---------- 14.3 enum de solicitação de filtro ----------
CREATE TYPE public.agua_filtro_situacao AS ENUM (
  'solicitada', 'em_triagem', 'aprovada', 'rejeitada', 'aguardando_material',
  'programada', 'em_deslocamento', 'em_execucao', 'concluida', 'validada',
  'reaberta', 'cancelada', 'aberta', 'em_atendimento'
);

-- ---------- conversão das colunas existentes ----------
ALTER TABLE public.agua_rotas DROP CONSTRAINT IF EXISTS agua_rotas_status_check;
ALTER TABLE public.agua_visitas DROP CONSTRAINT IF EXISTS agua_visitas_status_check;
ALTER TABLE public.agua_filtro_solicitacoes
  DROP CONSTRAINT IF EXISTS agua_filtro_solicitacoes_situacao_chk;
DROP INDEX IF EXISTS public.agua_filtro_solic_vence_idx;

ALTER TABLE public.agua_rotas ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.agua_rotas
  ALTER COLUMN status TYPE public.agua_rota_status
  USING (CASE lower(btrim(coalesce(status, 'planejada')))
    WHEN 'finalizada' THEN 'concluida'
    WHEN 'aberta' THEN 'planejada'
    WHEN 'draft' THEN 'rascunho'
    WHEN 'scheduled' THEN 'planejada'
    WHEN 'assigned' THEN 'atribuida'
    WHEN 'ready' THEN 'pronta'
    WHEN 'in_progress' THEN 'em_andamento'
    WHEN 'paused' THEN 'pausada'
    WHEN 'completed' THEN 'concluida'
    WHEN 'cancelled' THEN 'cancelada'
    WHEN '' THEN 'planejada'
    ELSE lower(btrim(status))
  END)::public.agua_rota_status;
ALTER TABLE public.agua_rotas ALTER COLUMN status SET DEFAULT 'planejada'::public.agua_rota_status;
ALTER TABLE public.agua_rotas ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.agua_visitas ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.agua_visitas
  ALTER COLUMN status TYPE public.agua_visita_status
  USING (CASE lower(btrim(coalesce(status, 'pendente')))
    WHEN '' THEN 'pendente'
    WHEN 'pending' THEN 'pendente'
    WHEN 'travelling' THEN 'em_deslocamento'
    WHEN 'in_service' THEN 'em_atendimento'
    WHEN 'completed' THEN 'concluida'
    WHEN 'partial' THEN 'parcial'
    WHEN 'no_need' THEN 'sem_necessidade'
    WHEN 'access_blocked' THEN 'acesso_bloqueado'
    WHEN 'closed' THEN 'local_fechado'
    WHEN 'out_of_stock' THEN 'falta_bags'
    WHEN 'location_mismatch' THEN 'endereco_divergente'
    WHEN 'rescheduled' THEN 'reprogramada'
    WHEN 'cancelled' THEN 'cancelada'
    ELSE lower(btrim(status))
  END)::public.agua_visita_status;
ALTER TABLE public.agua_visitas ALTER COLUMN status SET DEFAULT 'pendente'::public.agua_visita_status;
ALTER TABLE public.agua_visitas ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.agua_filtro_solicitacoes ALTER COLUMN situacao DROP DEFAULT;
ALTER TABLE public.agua_filtro_solicitacoes
  ALTER COLUMN situacao TYPE public.agua_filtro_situacao
  USING (CASE lower(btrim(coalesce(situacao, 'solicitada')))
    WHEN '' THEN 'solicitada'
    ELSE lower(btrim(situacao))
  END)::public.agua_filtro_situacao;
ALTER TABLE public.agua_filtro_solicitacoes
  ALTER COLUMN situacao SET DEFAULT 'solicitada'::public.agua_filtro_situacao;
ALTER TABLE public.agua_filtro_solicitacoes ALTER COLUMN situacao SET NOT NULL;

CREATE INDEX agua_filtro_solic_vence_idx ON public.agua_filtro_solicitacoes (vence_em)
  WHERE situacao NOT IN ('concluida','validada','cancelada','rejeitada');

-- ============================================================
-- Máquinas de estado validadas no servidor
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_agua_rota_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE permitido public.agua_rota_status[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  permitido := CASE OLD.status::text
    WHEN 'rascunho' THEN ARRAY['planejada','cancelada']
    WHEN 'planejada' THEN ARRAY['rascunho','atribuida','pronta','cancelada']
    WHEN 'atribuida' THEN ARRAY['planejada','pronta','cancelada']
    WHEN 'pronta' THEN ARRAY['atribuida','em_andamento','cancelada']
    WHEN 'em_andamento' THEN ARRAY['pausada','concluida','concluida_com_divergencia','cancelada']
    WHEN 'pausada' THEN ARRAY['em_andamento','cancelada']
    WHEN 'concluida' THEN ARRAY['concluida_com_divergencia']
    WHEN 'concluida_com_divergencia' THEN ARRAY['concluida']
    ELSE ARRAY[]::text[]
  END::public.agua_rota_status[];

  -- gestor pode cancelar de qualquer estado não encerrado
  IF NEW.status = 'cancelada' AND OLD.status NOT IN ('concluida','concluida_com_divergencia','cancelada')
     AND public.agua_is_gestor() THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status = ANY (permitido)) THEN
    RAISE EXCEPTION 'Transição de rota inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agua_rotas_transicao BEFORE UPDATE OF status ON public.agua_rotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_rota_transicao();

CREATE OR REPLACE FUNCTION public.tg_agua_visita_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  finais public.agua_visita_status[] := ARRAY[
    'concluida','parcial','sem_necessidade','acesso_bloqueado','local_fechado',
    'falta_bags','endereco_divergente','reprogramada','nao_realizada','cancelada'
  ]::public.agua_visita_status[];
  permitido public.agua_visita_status[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  permitido := CASE
    WHEN OLD.status = 'pendente' THEN ARRAY['em_deslocamento','em_atendimento']::public.agua_visita_status[] || finais
    WHEN OLD.status = 'em_deslocamento' THEN ARRAY['pendente','em_atendimento']::public.agua_visita_status[] || finais
    WHEN OLD.status = 'em_atendimento' THEN ARRAY['em_deslocamento']::public.agua_visita_status[] || finais
    -- reabertura de parada encerrada exige gestor (retificação registrada à parte)
    WHEN OLD.status = ANY (finais) AND public.agua_is_gestor()
      THEN ARRAY['pendente','em_deslocamento','em_atendimento']::public.agua_visita_status[] || finais
    ELSE ARRAY[]::public.agua_visita_status[]
  END;

  IF NOT (NEW.status = ANY (permitido)) THEN
    RAISE EXCEPTION 'Transição de parada inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agua_visitas_transicao BEFORE UPDATE OF status ON public.agua_visitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_visita_transicao();

CREATE OR REPLACE FUNCTION public.tg_agua_filtro_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE permitido public.agua_filtro_situacao[];
BEGIN
  IF NEW.situacao = OLD.situacao THEN RETURN NEW; END IF;

  permitido := CASE OLD.situacao::text
    WHEN 'solicitada' THEN ARRAY['em_triagem','aprovada','rejeitada','cancelada']
    WHEN 'aberta' THEN ARRAY['em_triagem','aprovada','rejeitada','cancelada']
    WHEN 'em_triagem' THEN ARRAY['aprovada','rejeitada','aguardando_material','cancelada']
    WHEN 'aprovada' THEN ARRAY['aguardando_material','programada','cancelada']
    WHEN 'aguardando_material' THEN ARRAY['programada','cancelada']
    WHEN 'programada' THEN ARRAY['em_deslocamento','em_execucao','aguardando_material','cancelada']
    WHEN 'em_deslocamento' THEN ARRAY['em_execucao','programada','cancelada']
    WHEN 'em_execucao' THEN ARRAY['concluida','aguardando_material','cancelada']
    WHEN 'em_atendimento' THEN ARRAY['concluida','aguardando_material','cancelada']
    WHEN 'concluida' THEN ARRAY['validada','reaberta']
    WHEN 'validada' THEN ARRAY['reaberta']
    WHEN 'reaberta' THEN ARRAY['em_triagem','programada','em_execucao','cancelada']
    ELSE ARRAY[]::text[]
  END::public.agua_filtro_situacao[];

  IF NOT (NEW.situacao = ANY (permitido)) THEN
    RAISE EXCEPTION 'Transição de solicitação inválida: % -> %', OLD.situacao, NEW.situacao
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agua_filtro_transicao BEFORE UPDATE OF situacao ON public.agua_filtro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_filtro_transicao();CREATE OR REPLACE FUNCTION public.tg_agua_filtro_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE permitido public.agua_filtro_situacao[];
BEGIN
  IF NEW.situacao = OLD.situacao THEN RETURN NEW; END IF;

  permitido := CASE OLD.situacao::text
    WHEN 'solicitada' THEN ARRAY['em_triagem','aprovada','rejeitada','cancelada']
    WHEN 'aberta' THEN ARRAY['em_triagem','aprovada','rejeitada','cancelada']
    WHEN 'em_triagem' THEN ARRAY['aprovada','rejeitada','aguardando_material','cancelada']
    WHEN 'aprovada' THEN ARRAY['aguardando_material','programada','cancelada']
    WHEN 'aguardando_material' THEN ARRAY['programada','cancelada']
    WHEN 'programada' THEN ARRAY['em_deslocamento','em_execucao','aguardando_material','cancelada']
    WHEN 'em_deslocamento' THEN ARRAY['em_execucao','cancelada']
    WHEN 'em_execucao' THEN ARRAY['concluida','aguardando_material','cancelada']
    WHEN 'em_atendimento' THEN ARRAY['concluida','aguardando_material','cancelada']
    WHEN 'concluida' THEN ARRAY['validada','reaberta']
    WHEN 'reaberta' THEN ARRAY['em_triagem','aprovada','programada','cancelada']
    WHEN 'rejeitada' THEN ARRAY['reaberta']
    ELSE ARRAY[]::text[]
  END::public.agua_filtro_situacao[];

  IF NOT (NEW.situacao = ANY (permitido)) THEN
    RAISE EXCEPTION 'Transição de solicitação inválida: % -> %', OLD.situacao, NEW.situacao
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;-- ============================================================
-- 15.1 Permissões
-- ============================================================
INSERT INTO public.pcm_permissions (key, module_key, action, label) VALUES
  ('water_delivery.view',               'abastecimento-agua', 'view',               'Água — visualizar'),
  ('water_delivery.plan',               'abastecimento-agua', 'plan',               'Água — programar'),
  ('water_delivery.assign',             'abastecimento-agua', 'assign',             'Água — atribuir rota'),
  ('water_delivery.execute',            'abastecimento-agua', 'execute',            'Água — executar rota'),
  ('water_delivery.correct',            'abastecimento-agua', 'correct',            'Água — retificar registro'),
  ('water_delivery.manage',             'abastecimento-agua', 'manage',             'Água — gerenciar módulo'),
  ('water_delivery.export',             'abastecimento-agua', 'export',             'Água — exportar'),
  ('water_delivery.photos.view',        'abastecimento-agua', 'photos.view',        'Água — ver evidências'),
  ('water_delivery.photos.upload',      'abastecimento-agua', 'photos.upload',      'Água — enviar evidências'),
  ('water_delivery.whatsapp.share',     'abastecimento-agua', 'whatsapp.share',     'Água — compartilhar no WhatsApp'),
  ('water_delivery.whatsapp.automatic', 'abastecimento-agua', 'whatsapp.automatic', 'Água — envio automático WhatsApp'),
  ('water_bags.manage',                 'agua-bags',          'manage',             'Bags — gerenciar'),
  ('water_filters.view',                'agua-filtros',       'view',               'Filtros — visualizar'),
  ('water_filters.request',             'agua-filtros',       'request',            'Filtros — solicitar'),
  ('water_filters.triage',              'agua-filtros',       'triage',             'Filtros — triagem/aprovação'),
  ('water_filters.execute',             'agua-filtros',       'execute',            'Filtros — executar troca'),
  ('water_filters.manage',              'agua-filtros',       'manage',             'Filtros — gerenciar'),
  ('water_filters.export',              'agua-filtros',       'export',             'Filtros — exportar')
ON CONFLICT (key) DO UPDATE SET module_key = EXCLUDED.module_key,
                                action = EXCLUDED.action,
                                label = EXCLUDED.label;

-- ============================================================
-- 15.2 Papéis
-- ============================================================
INSERT INTO public.pcm_roles (key, label) VALUES
  ('solicitante_filtro', 'Solicitante de Filtro'),
  ('tecnico_filtro',     'Técnico de Filtro')
ON CONFLICT (key) DO NOTHING;

-- operador_frota: executa a rota atribuída e envia evidências
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_frota', k FROM unnest(ARRAY[
  'water_delivery.execute','water_delivery.photos.view','water_delivery.photos.upload',
  'water_delivery.whatsapp.share','abastecimento-agua:read','abastecimento-agua:create',
  'abastecimento-agua:update'
]) k
ON CONFLICT DO NOTHING;

-- gestor_frota / gestor_pcm / administrador / proprietario: gestão completa
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r, k
  FROM unnest(ARRAY['gestor_frota','gestor_pcm','administrador','proprietario']) r
 CROSS JOIN unnest(ARRAY[
  'water_delivery.view','water_delivery.plan','water_delivery.assign','water_delivery.execute',
  'water_delivery.correct','water_delivery.manage','water_delivery.export',
  'water_delivery.photos.view','water_delivery.photos.upload',
  'water_delivery.whatsapp.share','water_delivery.whatsapp.automatic',
  'water_bags.manage',
  'water_filters.view','water_filters.request','water_filters.triage',
  'water_filters.execute','water_filters.manage','water_filters.export',
  'abastecimento-agua:read','abastecimento-agua:create','abastecimento-agua:update','abastecimento-agua:delete'
]) k
ON CONFLICT DO NOTHING;

-- solicitante_filtro: abre e acompanha as próprias solicitações
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'solicitante_filtro', k FROM unnest(ARRAY[
  'water_filters.request','water_filters.view','abastecimento-agua:read'
]) k
ON CONFLICT DO NOTHING;

-- tecnico_filtro: executa as trocas atribuídas
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico_filtro', k FROM unnest(ARRAY[
  'water_filters.execute','water_filters.view',
  'water_delivery.photos.upload','abastecimento-agua:read','abastecimento-agua:update'
]) k
ON CONFLICT DO NOTHING;

-- Garantia explícita: corretiva e climatização NÃO recebem acesso automático.
DELETE FROM public.pcm_role_permissions
 WHERE role_key IN ('tecnico_corretiva','tecnico_climatizacao')
   AND (permission_key LIKE 'water\_%' OR permission_key LIKE 'abastecimento-agua:%');

-- ============================================================
-- Helpers de permissão
-- ============================================================
CREATE OR REPLACE FUNCTION public.agua_perm(_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.user_pcm_roles ur
       JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
       WHERE ur.user_id = auth.uid() AND rp.permission_key = _perm
    ) OR EXISTS (
      SELECT 1 FROM public.pcm_permissions p
       JOIN public.user_module_access uma
         ON uma.user_id = auth.uid() AND uma.module_key = p.module_key
       WHERE p.key = _perm
         AND (p.action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.agua_is_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.frota_is_gestor()
      OR public.can_access_module('abastecimento-agua', 'update')
      OR public.agua_perm('water_delivery.manage')
      OR public.agua_perm('water_filters.manage');
$$;

CREATE OR REPLACE FUNCTION public.agua_can(required_action text DEFAULT 'read'::text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.frota_can(required_action)
      OR public.can_access_module('abastecimento-agua', required_action)
      OR public.agua_perm('water_delivery.manage')
      OR CASE required_action
           WHEN 'read' THEN public.agua_perm('water_delivery.view')
                          OR public.agua_perm('water_delivery.execute')
                          OR public.agua_perm('water_delivery.plan')
                          OR public.agua_perm('water_filters.view')
                          OR public.agua_perm('water_filters.request')
                          OR public.agua_perm('water_filters.execute')
           WHEN 'create' THEN public.agua_perm('water_delivery.execute')
                            OR public.agua_perm('water_delivery.plan')
                            OR public.agua_perm('water_filters.request')
           WHEN 'update' THEN public.agua_perm('water_delivery.execute')
                            OR public.agua_perm('water_delivery.plan')
                            OR public.agua_perm('water_filters.execute')
           WHEN 'export' THEN public.agua_perm('water_delivery.export')
                            OR public.agua_perm('water_filters.export')
           ELSE false
         END;
$$;

-- Nome do usuário logado, normalizado (rotas guardam o colaborador por nome).
CREATE OR REPLACE FUNCTION public.agua_meu_nome()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT nullif(lower(btrim(coalesce(p.full_name, ''))), '')
    FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- Operador "puro": executa, mas não planeja nem gerencia -> escopo restrito.
CREATE OR REPLACE FUNCTION public.agua_escopo_restrito()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.agua_perm('water_delivery.execute')
     AND NOT public.agua_perm('water_delivery.manage')
     AND NOT public.agua_perm('water_delivery.plan')
     AND NOT public.agua_perm('water_delivery.view')
     AND NOT public.frota_is_gestor()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.agua_rota_minha(_rota_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agua_rotas r
     WHERE r.id = _rota_id
       AND (
         r.criado_por = auth.uid()
         OR (public.agua_meu_nome() IS NOT NULL AND public.agua_meu_nome() IN (
              lower(btrim(coalesce(r.colaborador_principal, ''))),
              lower(btrim(coalesce(r.colaborador_secundario, ''))),
              lower(btrim(coalesce(r.supervisor, '')))
            ))
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.agua_rota_ativa(_rota_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agua_rotas r
     WHERE r.id = _rota_id
       AND r.status::text IN ('pronta', 'em_andamento', 'pausada')
  );
$$;

-- Solicitante/técnico de filtro sem visão ampla -> só enxerga o que é dele.
CREATE OR REPLACE FUNCTION public.agua_filtro_escopo_restrito()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (public.agua_perm('water_filters.request') OR public.agua_perm('water_filters.execute'))
     AND NOT public.agua_perm('water_filters.manage')
     AND NOT public.agua_perm('water_filters.triage')
     AND NOT public.agua_perm('water_filters.view')
     AND NOT public.frota_is_gestor()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- ============================================================
-- 15.3 Políticas RLS
-- ============================================================

-- Rotas ------------------------------------------------------
DROP POLICY IF EXISTS agua_rotas_select ON public.agua_rotas;
CREATE POLICY agua_rotas_select ON public.agua_rotas FOR SELECT TO authenticated
USING (
  (public.agua_can('read') AND NOT public.agua_escopo_restrito())
  OR (public.agua_escopo_restrito() AND public.agua_rota_minha(id))
);

DROP POLICY IF EXISTS agua_rotas_update ON public.agua_rotas;
CREATE POLICY agua_rotas_update ON public.agua_rotas FOR UPDATE TO authenticated
USING (
  public.agua_is_gestor()
  OR (public.agua_can('update') AND NOT public.agua_escopo_restrito())
  OR (public.agua_rota_minha(id) AND public.agua_rota_ativa(id))
)
WITH CHECK (
  public.agua_is_gestor()
  OR (public.agua_can('update') AND NOT public.agua_escopo_restrito())
  OR public.agua_rota_minha(id)
);

-- Paradas ----------------------------------------------------
DROP POLICY IF EXISTS agua_visitas_select ON public.agua_visitas;
CREATE POLICY agua_visitas_select ON public.agua_visitas FOR SELECT TO authenticated
USING (
  (public.agua_can('read') AND NOT public.agua_escopo_restrito())
  OR (public.agua_escopo_restrito() AND rota_id IS NOT NULL AND public.agua_rota_minha(rota_id))
);

DROP POLICY IF EXISTS agua_visitas_insert ON public.agua_visitas;
CREATE POLICY agua_visitas_insert ON public.agua_visitas FOR INSERT TO authenticated
WITH CHECK (
  public.agua_is_gestor()
  OR ((public.agua_can('create') OR public.agua_can('update')) AND NOT public.agua_escopo_restrito())
  OR (rota_id IS NOT NULL AND public.agua_rota_minha(rota_id) AND public.agua_rota_ativa(rota_id))
);

DROP POLICY IF EXISTS agua_visitas_update ON public.agua_visitas;
CREATE POLICY agua_visitas_update ON public.agua_visitas FOR UPDATE TO authenticated
USING (
  public.agua_is_gestor()
  OR ((public.agua_can('update')) AND NOT public.agua_escopo_restrito())
  OR (rota_id IS NOT NULL AND public.agua_rota_minha(rota_id) AND public.agua_rota_ativa(rota_id))
)
WITH CHECK (
  public.agua_is_gestor()
  OR ((public.agua_can('update')) AND NOT public.agua_escopo_restrito())
  OR (rota_id IS NOT NULL AND public.agua_rota_minha(rota_id))
);

-- Registro finalizado só muda com gestor (retificação registrada em trilha).
CREATE OR REPLACE FUNCTION public.tg_agua_visita_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status::text IN ('concluida','parcial','sem_necessidade','acesso_bloqueado',
                          'local_fechado','falta_bags','endereco_divergente',
                          'reprogramada','nao_realizada','cancelada')
     AND NOT public.agua_is_gestor() THEN
    RAISE EXCEPTION 'Parada finalizada: peça a retificação ao gestor.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agua_visita_imutavel ON public.agua_visitas;
CREATE TRIGGER agua_visita_imutavel BEFORE UPDATE ON public.agua_visitas
FOR EACH ROW EXECUTE FUNCTION public.tg_agua_visita_imutavel();

CREATE OR REPLACE FUNCTION public.tg_agua_rota_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status::text IN ('concluida','concluida_com_divergencia','cancelada')
     AND NOT public.agua_is_gestor() THEN
    RAISE EXCEPTION 'Rota encerrada: apenas o gestor pode retificar.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agua_rota_imutavel ON public.agua_rotas;
CREATE TRIGGER agua_rota_imutavel BEFORE UPDATE ON public.agua_rotas
FOR EACH ROW EXECUTE FUNCTION public.tg_agua_rota_imutavel();

-- Evidências -------------------------------------------------
DROP POLICY IF EXISTS agua_fotos_select ON public.agua_fotos;
CREATE POLICY agua_fotos_select ON public.agua_fotos FOR SELECT TO authenticated
USING (
  (public.agua_can('read') AND NOT public.agua_escopo_restrito())
  OR (public.agua_escopo_restrito() AND rota_id IS NOT NULL AND public.agua_rota_minha(rota_id))
  OR enviada_por = auth.uid()
);

DROP POLICY IF EXISTS agua_fotos_insert ON public.agua_fotos;
CREATE POLICY agua_fotos_insert ON public.agua_fotos FOR INSERT TO authenticated
WITH CHECK (
  enviada_por = auth.uid()
  AND (
    public.agua_is_gestor()
    OR public.agua_perm('water_delivery.photos.upload')
    OR public.agua_can('create')
    OR public.agua_can('update')
  )
);

-- Operador nunca apaga evidência: DELETE segue exclusivo do gestor.
DROP POLICY IF EXISTS agua_fotos_delete ON public.agua_fotos;
CREATE POLICY agua_fotos_delete ON public.agua_fotos FOR DELETE TO authenticated
USING (public.agua_is_gestor());

-- Programação: leitura ampla, escrita só gestor/planejador ----
DROP POLICY IF EXISTS agua_prog_insert ON public.agua_programacao;
CREATE POLICY agua_prog_insert ON public.agua_programacao FOR INSERT TO authenticated
WITH CHECK (public.agua_is_gestor() OR public.agua_perm('water_delivery.plan'));

DROP POLICY IF EXISTS agua_prog_update ON public.agua_programacao;
CREATE POLICY agua_prog_update ON public.agua_programacao FOR UPDATE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_delivery.plan'))
WITH CHECK (public.agua_is_gestor() OR public.agua_perm('water_delivery.plan'));

DROP POLICY IF EXISTS agua_prog_delete ON public.agua_programacao;
CREATE POLICY agua_prog_delete ON public.agua_programacao FOR DELETE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_delivery.plan'));

-- Bags -------------------------------------------------------
DROP POLICY IF EXISTS agua_bag_tipos_insert ON public.agua_bag_tipos;
CREATE POLICY agua_bag_tipos_insert ON public.agua_bag_tipos FOR INSERT TO authenticated
WITH CHECK (public.agua_is_gestor() OR public.agua_perm('water_bags.manage'));

DROP POLICY IF EXISTS agua_bag_tipos_update ON public.agua_bag_tipos;
CREATE POLICY agua_bag_tipos_update ON public.agua_bag_tipos FOR UPDATE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_bags.manage'))
WITH CHECK (public.agua_is_gestor() OR public.agua_perm('water_bags.manage'));

DROP POLICY IF EXISTS agua_bag_tipos_delete ON public.agua_bag_tipos;
CREATE POLICY agua_bag_tipos_delete ON public.agua_bag_tipos FOR DELETE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_bags.manage'));

-- Solicitações de filtro -------------------------------------
DROP POLICY IF EXISTS agua_filtro_select ON public.agua_filtro_solicitacoes;
CREATE POLICY agua_filtro_select ON public.agua_filtro_solicitacoes FOR SELECT TO authenticated
USING (
  (public.agua_can('read') AND NOT public.agua_filtro_escopo_restrito())
  OR criado_por = auth.uid()
  OR atendida_por = auth.uid()
  OR (public.agua_meu_nome() IS NOT NULL AND public.agua_meu_nome() IN (
        lower(btrim(coalesce(responsavel_nome, ''))),
        lower(btrim(coalesce(responsavel_2_nome, '')))
     ))
);

DROP POLICY IF EXISTS agua_filtro_insert ON public.agua_filtro_solicitacoes;
CREATE POLICY agua_filtro_insert ON public.agua_filtro_solicitacoes FOR INSERT TO authenticated
WITH CHECK (
  (criado_por IS NULL OR criado_por = auth.uid())
  AND (public.agua_can('create') OR public.agua_perm('water_filters.request'))
);

DROP POLICY IF EXISTS agua_filtro_update ON public.agua_filtro_solicitacoes;
CREATE POLICY agua_filtro_update ON public.agua_filtro_solicitacoes FOR UPDATE TO authenticated
USING (
  public.agua_is_gestor()
  OR public.agua_perm('water_filters.triage')
  OR (public.agua_can('update') AND NOT public.agua_filtro_escopo_restrito())
  OR atendida_por = auth.uid()
  OR (public.agua_perm('water_filters.execute') AND public.agua_meu_nome() IS NOT NULL
      AND public.agua_meu_nome() IN (
        lower(btrim(coalesce(responsavel_nome, ''))),
        lower(btrim(coalesce(responsavel_2_nome, '')))))
  OR (criado_por = auth.uid() AND situacao::text IN ('solicitada','aberta','em_triagem','reaberta'))
)
WITH CHECK (
  public.agua_is_gestor()
  OR public.agua_perm('water_filters.triage')
  OR (public.agua_can('update') AND NOT public.agua_filtro_escopo_restrito())
  OR atendida_por = auth.uid()
  OR public.agua_perm('water_filters.execute')
  OR criado_por = auth.uid()
);

DROP POLICY IF EXISTS agua_filtro_delete ON public.agua_filtro_solicitacoes;
CREATE POLICY agua_filtro_delete ON public.agua_filtro_solicitacoes FOR DELETE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_filters.manage'));

-- ============================================================
-- Views com dados de contato mascarados
-- ============================================================
CREATE OR REPLACE VIEW public.agua_pontos_operacao
WITH (security_invoker = on) AS
SELECT p.id, p.codigo, p.predio, p.andar, p.espaco, p.descricao, p.bags_padrao,
       p.bag_tipo, p.bag_tipo_id, p.bag_capacidade_litros, p.estoque_minimo,
       p.janela_inicio, p.janela_fim, p.ordem, p.prioridade, p.frequencia,
       p.tempo_estimado_min, p.acesso_observacoes, p.requer_epi, p.epi_descricao,
       p.veiculo_recomendado, p.latitude, p.longitude, p.imagem_url, p.ativo,
       p.arquivado_em, p.criado_em, p.atualizado_em,
       CASE WHEN public.agua_is_gestor() THEN p.contato_nome
            ELSE nullif(split_part(coalesce(p.contato_nome, ''), ' ', 1), '') END AS contato_nome,
       CASE WHEN public.agua_is_gestor() THEN p.contato_telefone
            WHEN p.contato_telefone IS NULL THEN NULL
            ELSE repeat('*', greatest(length(regexp_replace(p.contato_telefone, '\D', '', 'g')) - 4, 0))
                 || right(regexp_replace(p.contato_telefone, '\D', '', 'g'), 4) END AS contato_telefone
  FROM public.agua_pontos p;

GRANT SELECT ON public.agua_pontos_operacao TO authenticated;

CREATE OR REPLACE VIEW public.agua_filtro_solicitacoes_operacao
WITH (security_invoker = on) AS
SELECT s.id, s.numero, s.ponto_id, s.ativo_id, s.tipo, s.prioridade, s.situacao,
       s.descricao, s.predio, s.andar_setor, s.espaco, s.motivos, s.motivo_outro,
       s.origem, s.sla_horas, s.vence_em, s.prevista_para, s.programada_em,
       s.concluida_em, s.validada_em, s.reaberturas, s.responsavel_nome,
       s.responsavel_2_nome, s.criado_por, s.atendida_por, s.criado_em, s.atualizado_em,
       CASE WHEN public.agua_is_gestor() OR s.criado_por = auth.uid() THEN s.solicitante_nome
            ELSE nullif(split_part(coalesce(s.solicitante_nome, ''), ' ', 1), '') END AS solicitante_nome,
       CASE WHEN public.agua_is_gestor() OR s.criado_por = auth.uid() THEN s.telefone
            WHEN s.telefone IS NULL THEN NULL
            ELSE repeat('*', greatest(length(regexp_replace(s.telefone, '\D', '', 'g')) - 4, 0))
                 || right(regexp_replace(s.telefone, '\D', '', 'g'), 4) END AS telefone
  FROM public.agua_filtro_solicitacoes s;

GRANT SELECT ON public.agua_filtro_solicitacoes_operacao TO authenticated;REVOKE EXECUTE ON FUNCTION public.agua_perm(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_meu_nome() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_escopo_restrito() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_filtro_escopo_restrito() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_rota_minha(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_rota_ativa(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.agua_perm(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_meu_nome() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_escopo_restrito() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_filtro_escopo_restrito() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_rota_minha(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_rota_ativa(uuid) TO authenticated, service_role;-- 1) Arquivamento por usuário
ALTER TABLE public.notification_receipts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2) Preferências por canal
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  inapp boolean NOT NULL DEFAULT true,
  toast boolean NOT NULL DEFAULT true,
  som boolean NOT NULL DEFAULT false,
  email boolean NOT NULL DEFAULT false,
  whatsapp boolean NOT NULL DEFAULT false,
  categorias_silenciadas text[] NOT NULL DEFAULT '{}'::text[],
  prioridade_minima text NOT NULL DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_self" ON public.notification_preferences;
CREATE POLICY "notif_prefs_self" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_notification_preferences_updated ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Emissão de eventos automáticos
CREATE OR REPLACE FUNCTION public.notificar_evento(
  p_evento text,
  p_titulo text,
  p_corpo text DEFAULT NULL,
  p_categoria text DEFAULT 'informacao',
  p_severidade text DEFAULT 'info',
  p_deep_link text DEFAULT NULL,
  p_modulo text DEFAULT 'abastecimento-agua',
  p_requires_ack boolean DEFAULT false,
  p_dedupe_key text DEFAULT NULL,
  p_alvos jsonb DEFAULT '[]'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_mode text := 'all';
  v_key text := coalesce(nullif(btrim(p_dedupe_key), ''), p_evento);
  v_has_user boolean;
  v_has_role boolean;
  v_has_module boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.agua_can('read') OR public.can_manage_notifications()) THEN
    RAISE EXCEPTION 'sem permissao';
  END IF;
  IF coalesce(btrim(p_titulo), '') = '' THEN RAISE EXCEPTION 'titulo obrigatorio'; END IF;

  -- Anti-repetição: mesmo evento/chave nas últimas 12 horas
  SELECT n.id INTO v_id
    FROM public.notifications n
   WHERE n.metadata->>'dedupe' = v_key
     AND n.created_at > now() - interval '12 hours'
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT bool_or(a->>'user_id' IS NOT NULL),
         bool_or(a->>'role_key' IS NOT NULL),
         bool_or(a->>'module_key' IS NOT NULL)
    INTO v_has_user, v_has_role, v_has_module
    FROM jsonb_array_elements(coalesce(p_alvos, '[]'::jsonb)) a;

  v_mode := CASE
    WHEN coalesce(v_has_user, false) THEN 'users'
    WHEN coalesce(v_has_role, false) THEN 'roles'
    WHEN coalesce(v_has_module, false) THEN 'modules'
    ELSE 'all' END;

  INSERT INTO public.notifications (
    title, body, severity, category, target_mode, module_key,
    deep_link, requires_ack, status, created_by, metadata
  ) VALUES (
    p_titulo, nullif(btrim(coalesce(p_corpo, '')), ''), coalesce(p_severidade, 'info'),
    coalesce(p_categoria, 'informacao'), v_mode, p_modulo, p_deep_link,
    coalesce(p_requires_ack, false), 'published', v_uid,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('dedupe', v_key, 'evento', p_evento, 'origem', 'automatico')
  ) RETURNING id INTO v_id;

  IF v_mode <> 'all' THEN
    INSERT INTO public.notification_targets (notification_id, user_id, role_key, module_key, team_key)
    SELECT v_id,
           nullif(a->>'user_id','')::uuid,
           nullif(a->>'role_key',''),
           nullif(a->>'module_key',''),
           nullif(a->>'team_key','')
      FROM jsonb_array_elements(coalesce(p_alvos, '[]'::jsonb)) a;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notificar_evento(text,text,text,text,text,text,text,boolean,text,jsonb,jsonb) TO authenticated;CREATE TABLE IF NOT EXISTS public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text NOT NULL,
  idempotency_key text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed','skipped')),
  attempt integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_runs_select" ON public.job_runs;
CREATE POLICY "job_runs_select" ON public.job_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.can_access_module('observabilidade', 'read'));

CREATE UNIQUE INDEX IF NOT EXISTS job_runs_idem_uk
  ON public.job_runs (job_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_runs_key_started_idx
  ON public.job_runs (job_key, started_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_running_idx
  ON public.job_runs (job_key, started_at DESC) WHERE status = 'running';

DROP TRIGGER IF EXISTS trg_job_runs_updated_at ON public.job_runs;
CREATE TRIGGER trg_job_runs_updated_at BEFORE UPDATE ON public.job_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Abre uma execução respeitando idempotência, limite de concorrência e TTL da trava.
CREATE OR REPLACE FUNCTION public.job_begin(
  p_job_key text,
  p_idempotency_key text DEFAULT NULL,
  p_lock_ttl_seconds integer DEFAULT 300,
  p_max_concurrent integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.job_runs;
  v_running integer;
  v_id uuid;
  v_attempt integer := 1;
BEGIN
  IF coalesce(btrim(p_job_key), '') = '' THEN
    RAISE EXCEPTION 'job_key obrigatorio';
  END IF;

  -- Trava lógica: execuções presas além do TTL são marcadas como falha.
  UPDATE public.job_runs
     SET status = 'failed',
         finished_at = now(),
         error_message = 'timeout: execucao excedeu o TTL da trava'
   WHERE job_key = p_job_key
     AND status = 'running'
     AND started_at < now() - make_interval(secs => greatest(coalesce(p_lock_ttl_seconds, 300), 5));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.job_runs
     WHERE job_key = p_job_key AND idempotency_key = p_idempotency_key
     LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.status IN ('success','skipped') THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'duplicate',
                                  'run_id', v_existing.id, 'result', v_existing.result);
      ELSIF v_existing.status = 'running' THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'in_progress', 'run_id', v_existing.id);
      ELSE
        UPDATE public.job_runs
           SET status = 'running', attempt = v_existing.attempt + 1,
               started_at = now(), finished_at = NULL, error_message = NULL
         WHERE id = v_existing.id
        RETURNING id, attempt INTO v_id, v_attempt;
        RETURN jsonb_build_object('acquired', true, 'run_id', v_id, 'attempt', v_attempt);
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_running FROM public.job_runs
   WHERE job_key = p_job_key AND status = 'running';
  IF v_running >= greatest(coalesce(p_max_concurrent, 1), 1) THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'locked', 'running', v_running);
  END IF;

  INSERT INTO public.job_runs (job_key, idempotency_key, status)
  VALUES (p_job_key, p_idempotency_key, 'running')
  RETURNING id, attempt INTO v_id, v_attempt;

  RETURN jsonb_build_object('acquired', true, 'run_id', v_id, 'attempt', v_attempt);
END;
$$;

-- Encerra a execução registrando duração, resultado ou erro.
CREATE OR REPLACE FUNCTION public.job_finish(
  p_run_id uuid,
  p_status text,
  p_result jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.job_runs
     SET status = CASE WHEN p_status IN ('success','failed','skipped') THEN p_status ELSE 'failed' END,
         finished_at = now(),
         duration_ms = greatest(0, (extract(epoch FROM (now() - started_at)) * 1000)::int),
         result = coalesce(p_result, result),
         error_message = left(p_error, 2000)
   WHERE id = p_run_id;
END;
$$;

-- Limpeza SEGURA de filas temporárias. Nunca remove fotos/evidências.
CREATE OR REPLACE FUNCTION public.jobs_limpeza_filas(p_dias integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dias integer := greatest(coalesce(p_dias, 90), 30);
  v_corte timestamptz := now() - make_interval(days => v_dias);
  v_runs integer := 0;
  v_zap integer := 0;
  v_ger integer := 0;
  v_err integer := 0;
BEGIN
  DELETE FROM public.job_runs
   WHERE status IN ('success','skipped') AND started_at < v_corte;
  GET DIAGNOSTICS v_runs = ROW_COUNT;

  DELETE FROM public.agua_whatsapp_envios
   WHERE created_at < v_corte
     AND status IN ('entregue','lido','falha','cancelado');
  GET DIAGNOSTICS v_zap = ROW_COUNT;

  DELETE FROM public.agua_geracao_jobs
   WHERE criado_em < v_corte;
  GET DIAGNOSTICS v_ger = ROW_COUNT;

  DELETE FROM public.client_error_logs
   WHERE created_at < v_corte;
  GET DIAGNOSTICS v_err = ROW_COUNT;

  RETURN jsonb_build_object('dias', v_dias, 'job_runs', v_runs,
    'whatsapp', v_zap, 'geracao_jobs', v_ger, 'client_error_logs', v_err);
END;
$$;

REVOKE ALL ON FUNCTION public.job_begin(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_finish(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jobs_limpeza_filas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_begin(text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_finish(uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.jobs_limpeza_filas(integer) TO service_role;CREATE OR REPLACE FUNCTION public.jobs_limpeza_filas(p_dias integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dias integer := greatest(coalesce(p_dias, 90), 30);
  v_corte timestamptz := now() - make_interval(days => v_dias);
  v_runs integer := 0;
  v_zap integer := 0;
  v_ger integer := 0;
  v_err integer := 0;
BEGIN
  DELETE FROM public.job_runs
   WHERE status IN ('success','skipped') AND started_at < v_corte;
  GET DIAGNOSTICS v_runs = ROW_COUNT;

  DELETE FROM public.agua_whatsapp_envios
   WHERE criado_em < v_corte
     AND status IN ('entregue','lido','falha','cancelado');
  GET DIAGNOSTICS v_zap = ROW_COUNT;

  DELETE FROM public.agua_geracao_jobs
   WHERE criado_em < v_corte;
  GET DIAGNOSTICS v_ger = ROW_COUNT;

  DELETE FROM public.client_error_logs
   WHERE created_at < v_corte;
  GET DIAGNOSTICS v_err = ROW_COUNT;

  RETURN jsonb_build_object('dias', v_dias, 'job_runs', v_runs,
    'whatsapp', v_zap, 'geracao_jobs', v_ger, 'client_error_logs', v_err);
END;
$$;

REVOKE ALL ON FUNCTION public.jobs_limpeza_filas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jobs_limpeza_filas(integer) TO service_role;-- Item 24 — índices para consultas por data e atribuição.
CREATE INDEX IF NOT EXISTS agua_visitas_data_ordem_idx
  ON public.agua_visitas (data DESC, ordem ASC);

CREATE INDEX IF NOT EXISTS agua_visitas_responsavel_data_idx
  ON public.agua_visitas (responsavel, data DESC)
  WHERE responsavel IS NOT NULL;

CREATE INDEX IF NOT EXISTS agua_visitas_veiculo_data_idx
  ON public.agua_visitas (veiculo, data DESC)
  WHERE veiculo IS NOT NULL;

CREATE INDEX IF NOT EXISTS agua_visitas_status_data_idx
  ON public.agua_visitas (status, data DESC);

CREATE INDEX IF NOT EXISTS agua_visitas_ponto_data_idx
  ON public.agua_visitas (ponto_id, data DESC);

-- Galeria de evidências: paginação por período, ponto e tipo.
CREATE INDEX IF NOT EXISTS agua_fotos_ponto_data_idx
  ON public.agua_fotos (ponto_id, enviada_em DESC)
  WHERE ponto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agua_fotos_tipo_data_idx
  ON public.agua_fotos (tipo, enviada_em DESC);

-- Rotas por equipe/veículo e data.
CREATE INDEX IF NOT EXISTS agua_rotas_equipe_data_idx
  ON public.agua_rotas (equipe, data DESC)
  WHERE equipe IS NOT NULL;

CREATE INDEX IF NOT EXISTS agua_rotas_veiculo_data_idx
  ON public.agua_rotas (veiculo, data DESC)
  WHERE veiculo IS NOT NULL;
-- Item 24 — evita N+1 na reordenação da programação.
CREATE OR REPLACE FUNCTION public.agua_reordenar_programacao(itens jsonb)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH dados AS (
    SELECT (e->>'id')::uuid AS id, (e->>'ordem')::int AS ordem
    FROM jsonb_array_elements(COALESCE(itens, '[]'::jsonb)) AS e
  ), atualizado AS (
    UPDATE public.agua_programacao p
    SET ordem = d.ordem
    FROM dados d
    WHERE p.id = d.id AND p.ordem IS DISTINCT FROM d.ordem
    RETURNING p.id
  )
  SELECT count(*)::int FROM atualizado;
$$;

REVOKE ALL ON FUNCTION public.agua_reordenar_programacao(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agua_reordenar_programacao(jsonb) TO authenticated;

create table if not exists public.agua_prog_pontos (
  id uuid primary key default gen_random_uuid(),
  predio text not null,
  andar text,
  espaco text,
  periodo text,
  dias int[] not null default '{}',
  bags numeric not null default 1,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.agua_prog_pontos to authenticated;
grant all on public.agua_prog_pontos to service_role;
alter table public.agua_prog_pontos enable row level security;
drop policy if exists "agua_prog_pontos_auth" on public.agua_prog_pontos;
create policy "agua_prog_pontos_auth" on public.agua_prog_pontos for all to authenticated using (true) with check (true);

create table if not exists public.agua_prog_entregas (
  id uuid primary key default gen_random_uuid(),
  ponto_id uuid not null references public.agua_prog_pontos(id) on delete cascade,
  data date not null,
  colaboradores text[] not null default '{}',
  veiculo text,
  bags numeric not null default 1,
  observacao text,
  status text not null default 'concluida',
  registrado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ponto_id, data)
);
create index if not exists agua_prog_entregas_data_idx on public.agua_prog_entregas (data desc);
grant select, insert, update, delete on public.agua_prog_entregas to authenticated;
grant all on public.agua_prog_entregas to service_role;
alter table public.agua_prog_entregas enable row level security;
drop policy if exists "agua_prog_entregas_auth" on public.agua_prog_entregas;
create policy "agua_prog_entregas_auth" on public.agua_prog_entregas for all to authenticated using (true) with check (true);

create table if not exists public.agua_prog_fotos (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.agua_prog_entregas(id) on delete cascade,
  url text not null,
  storage_path text,
  criado_em timestamptz not null default now()
);
create index if not exists agua_prog_fotos_entrega_idx on public.agua_prog_fotos (entrega_id);
grant select, insert, update, delete on public.agua_prog_fotos to authenticated;
grant all on public.agua_prog_fotos to service_role;
alter table public.agua_prog_fotos enable row level security;
drop policy if exists "agua_prog_fotos_auth" on public.agua_prog_fotos;
create policy "agua_prog_fotos_auth" on public.agua_prog_fotos for all to authenticated using (true) with check (true);

insert into public.agua_prog_pontos (predio, andar, espaco, periodo, dias, ordem)
select * from (values
('A170','TÉRREO','PORTARIA 1','SEGUNDA-FEIRA',ARRAY[1]::int[],1),
('C65','TÉRREO','FÁBRICA 1','SEGUNDA E QUINTA-FEIRA',ARRAY[1,4]::int[],2),
('COMISSÃO','TÉRREO','GERAL','SEGUNDA E QUINTA-FEIRA',ARRAY[1,4]::int[],3),
('E171','TÉRREO','ENGENHARIA','SEGUNDA E QUINTA-FEIRA',ARRAY[1,4]::int[],4),
('A460','ENGEKO','GERAL','SEGUNDA E QUINTA-FEIRA',ARRAY[1,4]::int[],5),
('A160','TÉRREO','CICULAÇÃO','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],6),
('A160','TÉRREO','COPA','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],7),
('B440','TÉRREO','CANTEIRO DE OBRAS','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],8),
('C340','TÉRREO','LOGISTICA INTERNA','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],9),
('ADC','VCE','ADC','TERÇA-FEIRA',ARRAY[2]::int[],10),
('B90','TÉRREO','SALA FACILITES EHS','QUINTA-FEIRA',ARRAY[4]::int[],11),
('B115','TÉRREO','LAVANDERIA','QUINTA-FEIRA',ARRAY[4]::int[],12),
('C46','TÉRREO','PORTARIA 2','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],13),
('A220','TÉRREO','SALA CAFÉ','1x POR DIA',ARRAY[1]::int[],14),
('A220','TÉRREO','LOGISTICA','1x POR DIA',ARRAY[1]::int[],15),
('A460','TÉRREO','GERAL','1x POR DIA',ARRAY[1]::int[],16),
('C110','TÉRREO','AMBULATÓRIO - RH - COPA','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],17),
('A460','CANTEIRO DE OBRAS','GERAL','1x POR DIA',ARRAY[1]::int[],18),
('A460','GRI','GERAL','1x POR DIA',ARRAY[2]::int[],19),
('B203','TÉRREO','SUVINIL','1x POR DIA',ARRAY[2]::int[],20),
('B203','TÉRREO','ÁREA ADM','1x POR DIA',ARRAY[2]::int[],21),
('B290','TÉRREO','SALA CAFÉ','1x POR DIA',ARRAY[3]::int[],22),
('C120','TÉRREO','AWETA','1x POR DIA',ARRAY[3]::int[],23),
('C120','TÉRREO','COPA','1x POR DIA',ARRAY[3]::int[],24),
('C46','TÉRREO','COMISSÃO DE FÁBRICA - SALA PATRIMONIAL','QUINTA-FEIRA',ARRAY[4]::int[],25),
('C120','TÉRREO','GERAL','1x POR DIA',ARRAY[3]::int[],26),
('D295','6ª ANDAR','PESAGEM','TERÇA-FEIRA',ARRAY[2]::int[],27),
('C120','TÉRREO','HALL','1x POR DIA',ARRAY[3]::int[],28),
('D240','GERAL','CENTRAL DE ENERGIA','QUINTA-FEIRA',ARRAY[4]::int[],29),
('D270','CCM','COPA','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],30),
('C380','TÉRREO','ALMOXARIFADO','1x POR DIA',ARRAY[4]::int[],31),
('D270','GERAL','PREPARAÇÃO','1x POR DIA',ARRAY[5]::int[],32),
('D270','4ª ANDAR','ADMINISTRAÇÃO','1x POR DIA',ARRAY[5]::int[],33),
('E310','TÉRREO','RECUPERAÇÃO DE SOLVENTES','TERÇA-FEIRA',ARRAY[2]::int[],34),
('C70','TÉRREO','RESTAURANTE','QUARTA-FEIRA',ARRAY[3]::int[],35),
('D345','TÉRREO','COPA','QUARTA-FEIRA',ARRAY[3]::int[],36),
('D345','1ª ANDAR','ALMOXARIFADO - DESENVASE','QUARTA-FEIRA',ARRAY[3]::int[],37),
('D270','1ª ANDAR','RESINAS','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],38),
('D240','TÉRREO','CENTRAL DE UTILIDADES','QUINTA-FEIRA',ARRAY[4]::int[],39),
('D55 - D85','TÉRREO','SALA ADM','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],40),
('D270','5ª ANDAR','GERAL','1x POR DIA',ARRAY[5]::int[],41),
('E165','TÉRREO','PESAGEM FÁBRICA 3','QUINTA-FEIRA',ARRAY[4]::int[],42),
('E105','TÉRREO','ENGENHARIA DE CAMPO - ECO','1x POR DIA',ARRAY[1]::int[],43),
('D345','TÉRREO','LABORATÓRIO MP','QUARTA-FEIRA',ARRAY[3]::int[],44),
('E130','TÉRREO','FÁBRICA 3','QUARTA-FEIRA',ARRAY[3]::int[],45),
('E35','TÉRREO','EHS','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],46),
('E35','TÉRREO','SALA CAFÉ','1x POR DIA',ARRAY[2]::int[],47),
('E70','TÉRREO','FÁBRICA 5','1x POR DIA',ARRAY[2]::int[],48),
('F30','TÉRREO','PORTARIA 3','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],49),
('F60','TÉRREO','LOJA SUVINIL','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],50),
('Z210','TÉRREO','PORTARIA 4','QUARTA-FEIRA',ARRAY[3]::int[],51),
('Z310','TÉRREO','ETE','QUARTA-FEIRA',ARRAY[3]::int[],52),
('Z500','TÉRREO','SALA ADM','1x POR DIA',ARRAY[3]::int[],53),
('Z500','TÉRREO','SALA CAFÉ','1x POR DIA',ARRAY[3]::int[],54)
) as v(predio, andar, espaco, periodo, dias, ordem)
where not exists (select 1 from public.agua_prog_pontos);
CREATE POLICY "agua_fotos_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agua-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "agua_fotos_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agua-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "agua_fotos_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agua-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE UNIQUE INDEX IF NOT EXISTS agua_prog_entregas_ponto_data_key
  ON public.agua_prog_entregas (ponto_id, data);UPDATE agua_prog_pontos AS p SET dias = v.dias, predio = v.predio, andar = v.andar, espaco = v.espaco, ativo = true FROM (VALUES
(1,'A170','TÉRREO','PORTARIA 1',ARRAY[1]::int[]),
(2,'C65','TÉRREO','FÁBRICA 1',ARRAY[4]::int[]),
(3,'COMISSÃO','TÉRREO','GERAL',ARRAY[4]::int[]),
(4,'E171','TÉRREO','ENGENHARIA',ARRAY[1]::int[]),
(5,'A460','ENGEKO','GERAL',ARRAY[2]::int[]),
(6,'A160','TÉRREO','CICULAÇÃO',ARRAY[1]::int[]),
(7,'A160','TÉRREO','COPA',ARRAY[1]::int[]),
(8,'B440','TÉRREO','CANTEIRO DE OBRAS',ARRAY[3]::int[]),
(9,'C340','TÉRREO','LOGISTICA INTERNA',ARRAY[4]::int[]),
(10,'ADC','VCE','ADC',ARRAY[2]::int[]),
(11,'B90','TÉRREO','SALA FACILITES EHS',ARRAY[2]::int[]),
(12,'B115','TÉRREO','LAVANDERIA',ARRAY[2]::int[]),
(13,'C46','TÉRREO','PORTARIA 2',ARRAY[4]::int[]),
(14,'A220','TÉRREO','SALA CAFÉ',ARRAY[1]::int[]),
(15,'A220','TÉRREO','LOGISTICA',ARRAY[1]::int[]),
(16,'A460','TÉRREO','GERAL',ARRAY[1]::int[]),
(17,'C110','TÉRREO','AMBULATÓRIO - RH - COPA',ARRAY[3]::int[]),
(18,'A460','CANTEIRO DE OBRAS','GERAL',ARRAY[1]::int[]),
(19,'A460','GRI','GERAL',ARRAY[2]::int[]),
(20,'B203','TÉRREO','SUVINIL',ARRAY[2]::int[]),
(21,'B203','TÉRREO','ÁREA ADM',ARRAY[2]::int[]),
(22,'B290','TÉRREO','SALA CAFÉ',ARRAY[3]::int[]),
(23,'C120','TÉRREO','AWETA',ARRAY[3]::int[]),
(24,'C120','TÉRREO','COPA',ARRAY[3]::int[]),
(25,'C46','TÉRREO','COMISSÃO DE FÁBRICA - SALA PATRIMONIAL',ARRAY[4]::int[]),
(26,'C120','TÉRREO','GERAL',ARRAY[3]::int[]),
(27,'D295','6ª ANDAR','PESAGEM',ARRAY[5]::int[]),
(28,'C120','TÉRREO','HALL',ARRAY[3]::int[]),
(29,'D240','GERAL','CENTRAL DE ENERGIA',ARRAY[5]::int[]),
(30,'D270','CCM','COPA',ARRAY[5]::int[]),
(31,'C380','TÉRREO','ALMOXARIFADO',ARRAY[4]::int[]),
(32,'D270','GERAL','PREPARAÇÃO',ARRAY[5]::int[]),
(33,'D270','4ª ANDAR','ADMINISTRAÇÃO',ARRAY[5]::int[]),
(34,'E310','TÉRREO','RECUPERAÇÃO DE SOLVENTES',ARRAY[2]::int[]),
(35,'C70','TÉRREO','RESTAURANTE',ARRAY[4]::int[]),
(36,'D345','TÉRREO','COPA',ARRAY[5]::int[]),
(37,'D345','1ª ANDAR','ALMOXARIFADO - DESENVASE',ARRAY[5]::int[]),
(38,'D270','1ª ANDAR','RESINAS',ARRAY[1]::int[]),
(39,'D240','TÉRREO','CENTRAL DE UTILIDADES',ARRAY[1]::int[]),
(40,'D55 - D85','TÉRREO','SALA ADM',ARRAY[1]::int[]),
(41,'D270','5ª ANDAR','GERAL',ARRAY[5]::int[]),
(42,'E165','TÉRREO','PESAGEM FÁBRICA 3',ARRAY[1]::int[]),
(43,'E105','TÉRREO','ENGENHARIA DE CAMPO - ECO',ARRAY[1]::int[]),
(44,'D345','TÉRREO','LABORATÓRIO MP',ARRAY[1]::int[]),
(45,'E130','TÉRREO','FÁBRICA 3',ARRAY[2]::int[]),
(46,'E35','TÉRREO','EHS',ARRAY[2]::int[]),
(47,'E35','TÉRREO','SALA CAFÉ',ARRAY[2]::int[]),
(48,'E70','TÉRREO','FÁBRICA 5',ARRAY[2]::int[]),
(49,'F30','TÉRREO','PORTARIA 3',ARRAY[2]::int[]),
(50,'F60','TÉRREO','LOJA SUVINIL',ARRAY[2]::int[]),
(51,'Z210','TÉRREO','PORTARIA 4',ARRAY[3]::int[]),
(52,'Z310','TÉRREO','ETE',ARRAY[3]::int[]),
(53,'Z500','TÉRREO','SALA ADM',ARRAY[3]::int[]),
(54,'Z500','TÉRREO','SALA CAFÉ',ARRAY[3]::int[])
) AS v(ordem,predio,andar,espaco,dias) WHERE p.ordem = v.ordem;ALTER TABLE public.agua_prog_entregas
  ADD COLUMN IF NOT EXISTS bebedouro_ok boolean,
  ADD COLUMN IF NOT EXISTS bebedouro_obs text;INSERT INTO public.user_module_access (user_id, module_key, actions)
VALUES
  ('35f7359f-f14c-42a3-a796-0dd06e436247', 'frota-checklist', ARRAY['read','create','update','export']),
  ('35f7359f-f14c-42a3-a796-0dd06e436247', 'frota-historico', ARRAY['read','export']),
  ('35f7359f-f14c-42a3-a796-0dd06e436247', 'abastecimento', ARRAY['read','create','update','export'])
ON CONFLICT (user_id, module_key) DO UPDATE SET actions = EXCLUDED.actions;-- ============ Catálogo de materiais ============
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
  ('FER-0001','Broca de aço rápido 8mm','Ferramentas','UN','Para metal');DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'materiais@apontauto.local';
  IF v_uid IS NULL THEN RAISE EXCEPTION 'usuario materiais nao encontrado'; END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_uid, 'Materiais')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.user_module_access WHERE user_id = v_uid;

  INSERT INTO public.user_module_access (user_id, module_key, actions)
  VALUES
    (v_uid, 'dashboard', ARRAY['read']),
    (v_uid, 'solicitacao-materiais', ARRAY['read','create','update','export']),
    (v_uid, 'controle-materiais', ARRAY['read','create','update','export']),
    (v_uid, 'materiais-os', ARRAY['read','create','update','export']),
    (v_uid, 'painel-legal', ARRAY['read','export'])
  ON CONFLICT DO NOTHING;
END $$;
-- ABASTECIMENTOS (controle financeiro)
CREATE TABLE public.fleet_fuelings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  fueled_at timestamptz NOT NULL DEFAULT now(),
  driver_name text,
  station text,
  fuel_type text NOT NULL DEFAULT 'gasolina',
  liters numeric(10,3) NOT NULL CHECK (liters > 0),
  total_cost numeric(12,2) NOT NULL CHECK (total_cost >= 0),
  odometer_km integer NOT NULL CHECK (odometer_km >= 0),
  invoice_number text,
  payment_method text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_fuelings TO authenticated;
GRANT ALL ON public.fleet_fuelings TO service_role;
ALTER TABLE public.fleet_fuelings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fuelings_select" ON public.fleet_fuelings FOR SELECT TO authenticated USING (true);
CREATE POLICY "fuelings_insert" ON public.fleet_fuelings FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "fuelings_update" ON public.fleet_fuelings FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "fuelings_delete" ON public.fleet_fuelings FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX fleet_fuelings_vehicle_idx ON public.fleet_fuelings (vehicle_id, fueled_at DESC);

-- CHECKLISTS VEICULARES
CREATE TABLE public.fleet_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'saida',
  driver_name text NOT NULL,
  odometer_km integer NOT NULL CHECK (odometer_km >= 0),
  fuel_level_pct integer CHECK (fuel_level_pct BETWEEN 0 AND 100),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_status text NOT NULL DEFAULT 'ok',
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_checklists TO authenticated;
GRANT ALL ON public.fleet_checklists TO service_role;
ALTER TABLE public.fleet_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklists_select" ON public.fleet_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklists_insert" ON public.fleet_checklists FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "checklists_update" ON public.fleet_checklists FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "checklists_delete" ON public.fleet_checklists FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX fleet_checklists_vehicle_idx ON public.fleet_checklists (vehicle_id, created_at DESC);

-- FOTOS DO CHECKLIST
CREATE TABLE public.fleet_checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.fleet_checklists(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'geral',
  storage_path text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_checklist_photos TO authenticated;
GRANT ALL ON public.fleet_checklist_photos TO service_role;
ALTER TABLE public.fleet_checklist_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_photos_select" ON public.fleet_checklist_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_photos_insert" ON public.fleet_checklist_photos FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "checklist_photos_delete" ON public.fleet_checklist_photos FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX fleet_checklist_photos_checklist_idx ON public.fleet_checklist_photos (checklist_id);

CREATE TRIGGER fleet_fuelings_updated_at BEFORE UPDATE ON public.fleet_fuelings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER fleet_checklists_updated_at BEFORE UPDATE ON public.fleet_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- STORAGE: bucket privado frota-fotos
CREATE POLICY "frota_fotos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'frota-fotos');
CREATE POLICY "frota_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'frota-fotos' AND owner = auth.uid());
CREATE POLICY "frota_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'frota-fotos' AND owner = auth.uid());

ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS status_origem text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_conclusao timestamptz;

CREATE INDEX IF NOT EXISTS backorder_os_finalizado_idx ON public.backorder_os (finalizado);
CREATE INDEX IF NOT EXISTS backorder_os_cancelado_idx ON public.backorder_os (cancelado);
CREATE INDEX IF NOT EXISTS backorder_os_data_solicitacao_idx ON public.backorder_os (data_solicitacao);

CREATE OR REPLACE FUNCTION public.backorder_clear_all()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para limpar o backorder';
  END IF;
  SELECT count(*) INTO n FROM public.backorder_os;
  DELETE FROM public.backorder_os;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.backorder_clear_all() FROM public;
GRANT EXECUTE ON FUNCTION public.backorder_clear_all() TO authenticated;

CREATE OR REPLACE FUNCTION public.backorder_bulk_upsert(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new bigint := 0;
  v_upd bigint := 0;
  v_total bigint := 0;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para importar backorder';
  END IF;

  CREATE TEMP TABLE _bo_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_rows) AS x(
    os text, nome text, ativo text, predio text, andar text, espaco text,
    atividade text, equipe text, termino_sla timestamptz, data_solicitacao timestamptz,
    outros text, criticidade text, revisao_manual boolean,
    origem_predio_andar_espaco text, origem_equipe text,
    status_origem text, finalizado boolean, cancelado boolean, data_conclusao timestamptz
  );

  DELETE FROM _bo_in a USING _bo_in b
   WHERE a.ctid < b.ctid AND a.os = b.os;

  SELECT count(*) INTO v_total FROM _bo_in;

  SELECT count(*) INTO v_new
    FROM _bo_in i LEFT JOIN public.backorder_os o ON o.os = i.os
   WHERE o.os IS NULL;
  v_upd := v_total - v_new;

  INSERT INTO public.backorder_os AS o (
    os, nome, ativo, predio, andar, espaco, atividade, equipe,
    termino_sla, data_solicitacao, outros, criticidade, revisao_manual,
    origem_predio_andar_espaco, origem_equipe,
    status_origem, finalizado, cancelado, data_conclusao, data_finalizacao
  )
  SELECT
    i.os, i.nome, i.ativo, coalesce(i.predio,''), coalesce(i.andar,''), coalesce(i.espaco,''),
    i.atividade, i.equipe, i.termino_sla, coalesce(i.data_solicitacao, now()),
    coalesce(i.outros,''), coalesce(i.criticidade,''), coalesce(i.revisao_manual,false),
    coalesce(i.origem_predio_andar_espaco,'pendente'), coalesce(i.origem_equipe,'regra_local'),
    coalesce(i.status_origem,''), coalesce(i.finalizado,false), coalesce(i.cancelado,false),
    i.data_conclusao,
    CASE WHEN coalesce(i.finalizado,false) THEN coalesce(i.data_conclusao, now()) END
  FROM _bo_in i
  ON CONFLICT (os) DO UPDATE SET
    nome = EXCLUDED.nome,
    ativo = EXCLUDED.ativo,
    -- nunca destrói localização já preenchida manualmente
    predio = CASE WHEN EXCLUDED.predio <> '' THEN EXCLUDED.predio ELSE o.predio END,
    andar  = CASE WHEN EXCLUDED.andar  <> '' THEN EXCLUDED.andar  ELSE o.andar  END,
    espaco = CASE WHEN EXCLUDED.espaco <> '' THEN EXCLUDED.espaco ELSE o.espaco END,
    -- respeita classificação manual existente
    atividade = CASE WHEN o.atividade_manual THEN o.atividade ELSE EXCLUDED.atividade END,
    equipe    = CASE WHEN o.atividade_manual THEN o.equipe    ELSE EXCLUDED.equipe END,
    termino_sla = EXCLUDED.termino_sla,
    data_solicitacao = EXCLUDED.data_solicitacao,
    outros = EXCLUDED.outros,
    criticidade = EXCLUDED.criticidade,
    revisao_manual = CASE WHEN o.atividade_manual THEN false ELSE EXCLUDED.revisao_manual END,
    origem_predio_andar_espaco = EXCLUDED.origem_predio_andar_espaco,
    origem_equipe = CASE WHEN o.atividade_manual THEN 'regra_aprendida' ELSE EXCLUDED.origem_equipe END,
    status_origem = EXCLUDED.status_origem,
    cancelado = EXCLUDED.cancelado,
    data_conclusao = coalesce(EXCLUDED.data_conclusao, o.data_conclusao),
    -- planilha pode concluir, mas nunca reabre o que já foi finalizado no sistema
    finalizado = o.finalizado OR EXCLUDED.finalizado,
    data_finalizacao = CASE
      WHEN o.finalizado THEN o.data_finalizacao
      WHEN EXCLUDED.finalizado THEN coalesce(EXCLUDED.data_conclusao, now())
      ELSE o.data_finalizacao END,
    atualizado_em = now();

  RETURN jsonb_build_object('total', v_total, 'novas', v_new, 'atualizadas', v_upd);
END;
$$;

REVOKE ALL ON FUNCTION public.backorder_bulk_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.backorder_bulk_upsert(jsonb) TO authenticated;
TRUNCATE TABLE public.backorder_os;

CREATE INDEX IF NOT EXISTS idx_backorder_os_data_sol ON public.backorder_os (data_solicitacao DESC);
CREATE INDEX IF NOT EXISTS idx_backorder_os_flags ON public.backorder_os (finalizado, cancelado);
CREATE INDEX IF NOT EXISTS idx_backorder_os_equipe ON public.backorder_os (equipe);
CREATE INDEX IF NOT EXISTS idx_backorder_os_predio ON public.backorder_os (predio);

CREATE OR REPLACE FUNCTION public.backorder_dashboard_stats(
  p_equipe text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_criticidade text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_solicitante text DEFAULT NULL,
  p_predio text DEFAULT NULL,
  p_ano integer DEFAULT NULL,
  p_dias integer DEFAULT NULL,
  p_row_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;

  WITH base AS (
    SELECT
      b.*,
      CASE WHEN b.cancelado THEN 'cancelado'
           WHEN b.finalizado THEN 'concluido'
           ELSE 'aberto' END AS st,
      EXTRACT(YEAR FROM b.data_solicitacao)::int AS ano,
      to_char(b.data_solicitacao, 'YYYY-MM') AS mes
    FROM public.backorder_os b
    WHERE (p_equipe IS NULL OR b.equipe = p_equipe)
      AND (p_categoria IS NULL OR b.atividade = p_categoria)
      AND (p_criticidade IS NULL OR coalesce(nullif(b.criticidade,''),'NÃO INFORMADA') = p_criticidade)
      AND (p_solicitante IS NULL OR coalesce(nullif(b.outros,''),'NÃO INFORMADO') = p_solicitante)
      AND (p_predio IS NULL OR coalesce(nullif(b.predio,''),'—') = p_predio)
      AND (p_ano IS NULL OR EXTRACT(YEAR FROM b.data_solicitacao)::int = p_ano)
      AND (p_dias IS NULL OR b.data_solicitacao >= now() - (p_dias || ' days')::interval)
      AND (p_status IS NULL OR p_status = (CASE WHEN b.cancelado THEN 'cancelado' WHEN b.finalizado THEN 'concluido' ELSE 'aberto' END))
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
        'total', count(*),
        'concluidos', count(*) FILTER (WHERE st = 'concluido'),
        'cancelados', count(*) FILTER (WHERE st = 'cancelado'),
        'abertos', count(*) FILTER (WHERE st = 'aberto'),
        'vencidos', count(*) FILTER (WHERE st = 'aberto' AND termino_sla IS NOT NULL AND termino_sla < now()),
        'vencendo48h', count(*) FILTER (WHERE st = 'aberto' AND termino_sla IS NOT NULL AND termino_sla >= now() AND termino_sla < now() + interval '48 hours'),
        'criticos', count(*) FILTER (WHERE st = 'aberto' AND upper(coalesce(criticidade,'')) LIKE 'ALTA%'),
        'tempoMedioDias', coalesce(round(avg(EXTRACT(EPOCH FROM (coalesce(data_conclusao, data_finalizacao) - data_solicitacao))/86400) FILTER (WHERE st='concluido' AND coalesce(data_conclusao, data_finalizacao) IS NOT NULL AND data_solicitacao IS NOT NULL), 1), 0),
        'primeiroAno', min(ano), 'ultimoAno', max(ano)
      ) FROM base),
    'porAno', coalesce((SELECT jsonb_agg(x ORDER BY x->>'ano') FROM (
        SELECT jsonb_build_object('ano', ano::text,
          'total', count(*),
          'concluidos', count(*) FILTER (WHERE st='concluido'),
          'cancelados', count(*) FILTER (WHERE st='cancelado'),
          'abertos', count(*) FILTER (WHERE st='aberto')) AS x
        FROM base WHERE ano IS NOT NULL GROUP BY ano) t), '[]'::jsonb),
    'porMes', coalesce((SELECT jsonb_agg(x ORDER BY x->>'mes') FROM (
        SELECT jsonb_build_object('mes', mes,
          'total', count(*),
          'concluidos', count(*) FILTER (WHERE st='concluido'),
          'cancelados', count(*) FILTER (WHERE st='cancelado')) AS x
        FROM base WHERE mes IS NOT NULL GROUP BY mes) t), '[]'::jsonb),
    'porEquipe', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(equipe,''),'Outros'),
          'total', count(*),
          'concluidos', count(*) FILTER (WHERE st='concluido'),
          'cancelados', count(*) FILTER (WHERE st='cancelado'),
          'abertos', count(*) FILTER (WHERE st='aberto')) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 15) t), '[]'::jsonb),
    'porCategoria', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(atividade,''),'OUTROS'), 'value', count(*)) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t), '[]'::jsonb),
    'porCriticidade', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(criticidade,''),'NÃO INFORMADA'), 'value', count(*)) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) t), '[]'::jsonb),
    'porSolicitante', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(outros,''),'NÃO INFORMADO'),
          'total', count(*), 'abertos', count(*) FILTER (WHERE st='aberto')) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t), '[]'::jsonb),
    'porPredio', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(predio,''),'—'), 'value', count(*)) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 10) t), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('os', os, 'nome', nome, 'equipe', equipe, 'atividade', atividade,
          'predio', predio, 'andar', andar, 'espaco', espaco, 'criticidade', criticidade,
          'solicitante', outros, 'status', st, 'statusOrigem', status_origem,
          'dataSolicitacao', data_solicitacao, 'terminoSla', termino_sla,
          'dataConclusao', coalesce(data_conclusao, data_finalizacao)) AS x
        FROM base ORDER BY data_solicitacao DESC NULLS LAST LIMIT greatest(coalesce(p_row_limit,300),1)) t), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.backorder_dashboard_filtros()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;
  SELECT jsonb_build_object(
    'equipes', coalesce((SELECT jsonb_agg(DISTINCT equipe) FROM public.backorder_os WHERE nullif(equipe,'') IS NOT NULL), '[]'::jsonb),
    'categorias', coalesce((SELECT jsonb_agg(DISTINCT atividade) FROM public.backorder_os WHERE nullif(atividade,'') IS NOT NULL), '[]'::jsonb),
    'criticidades', coalesce((SELECT jsonb_agg(DISTINCT criticidade) FROM public.backorder_os WHERE nullif(criticidade,'') IS NOT NULL), '[]'::jsonb),
    'predios', coalesce((SELECT jsonb_agg(DISTINCT predio) FROM public.backorder_os WHERE nullif(predio,'') IS NOT NULL), '[]'::jsonb),
    'solicitantes', coalesce((SELECT jsonb_agg(DISTINCT outros) FROM public.backorder_os WHERE nullif(outros,'') IS NOT NULL), '[]'::jsonb),
    'anos', coalesce((SELECT jsonb_agg(DISTINCT EXTRACT(YEAR FROM data_solicitacao)::int) FROM public.backorder_os WHERE data_solicitacao IS NOT NULL), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backorder_dashboard_stats(text,text,text,text,text,text,integer,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backorder_dashboard_filtros() TO authenticated;-- Índices redundantes: cobertos por idx_backorder_os_data_sol (data_solicitacao DESC)
DROP INDEX IF EXISTS public.backorder_os_data_solic_idx;
DROP INDEX IF EXISTS public.backorder_os_data_solicitacao_idx;

-- Coberto pelo prefixo de idx_backorder_os_finalizado_data (finalizado, data_solicitacao)
DROP INDEX IF EXISTS public.backorder_os_finalizado_idx;

ANALYZE public.backorder_os;-- 1) Normalizador de status (coluna G)
CREATE OR REPLACE FUNCTION public.backorder_status_cat(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN s IS NULL OR s = '' THEN 'aberto'
    WHEN s LIKE '%CANCEL%' OR s LIKE '%RECUSAD%' OR s LIKE '%REPROVAD%' THEN 'cancelado'
    WHEN s LIKE '%NAO EXECUTAD%' OR s LIKE '%NAO REALIZAD%' THEN 'nao_executada'
    WHEN s LIKE '%NAO VALIDAD%' THEN 'nao_validado'
    WHEN s LIKE '%AGUARDANDO APROVA%' OR s LIKE '%AGUARD%APROVA%' OR s LIKE '%APROVACAO PENDENTE%' THEN 'aguardando_aprovacao'
    WHEN s LIKE '%EM EXECU%' OR s LIKE '%EXECUCAO%' OR s LIKE '%ANDAMENTO%' THEN 'em_execucao'
    WHEN s LIKE '%PROGRAMAD%' OR s LIKE '%AGENDAD%' THEN 'programado'
    WHEN s LIKE '%VALIDAD%' THEN 'validado'
    WHEN s LIKE '%CONCLU%' OR s LIKE '%FINALIZAD%' OR s LIKE '%ATENDID%' OR s LIKE '%RESOLVID%' THEN 'concluido'
    WHEN s LIKE '%FECHAD%' OR s LIKE '%ENCERRAD%' THEN 'fechado'
    WHEN s LIKE '%PENDENTE%' THEN 'pendente'
    WHEN s LIKE '%ABERT%' THEN 'aberto'
    ELSE 'aberto'
  END
  FROM (SELECT upper(translate(coalesce(trim(p_status),''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))) AS t(s);
$$;

-- 2) Coluna de status detalhado
ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS status_cat text NOT NULL DEFAULT 'aberto';

CREATE INDEX IF NOT EXISTS idx_backorder_os_status_cat
  ON public.backorder_os (status_cat, data_solicitacao DESC);
-- 3) Trigger: mantém status_cat/flags coerentes com o status de origem
CREATE OR REPLACE FUNCTION public.tg_backorder_status_cat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status_cat IS NULL OR NEW.status_cat = '' OR NEW.status_cat = 'aberto' THEN
    NEW.status_cat := public.backorder_status_cat(NEW.status_origem);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS backorder_os_status_cat ON public.backorder_os;
CREATE TRIGGER backorder_os_status_cat
  BEFORE INSERT OR UPDATE ON public.backorder_os
  FOR EACH ROW EXECUTE FUNCTION public.tg_backorder_status_cat();

-- 4) Limpeza total corrigida (DELETE com WHERE explícito)
CREATE OR REPLACE FUNCTION public.backorder_clear_all()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para limpar o backorder';
  END IF;
  SELECT count(*) INTO n FROM public.backorder_os;
  DELETE FROM public.backorder_os WHERE os IS NOT NULL;
  RETURN n;
END;
$$;

-- 5) Dashboard v2 — recorte por ano + status detalhado + solicitantes
CREATE OR REPLACE FUNCTION public.backorder_dashboard_v2(
  p_ano integer DEFAULT NULL,
  p_equipe text DEFAULT NULL,
  p_status_cat text DEFAULT NULL,
  p_predio text DEFAULT NULL,
  p_solicitante text DEFAULT NULL,
  p_criticidade text DEFAULT NULL,
  p_row_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;

  WITH base AS (
    SELECT b.*,
      coalesce(nullif(b.status_cat,''),'aberto') AS sc,
      EXTRACT(YEAR FROM b.data_solicitacao)::int AS ano,
      to_char(b.data_solicitacao,'YYYY-MM') AS mes,
      coalesce(nullif(b.outros,''),'NÃO INFORMADO') AS solic
    FROM public.backorder_os b
    WHERE (p_ano IS NULL OR EXTRACT(YEAR FROM b.data_solicitacao)::int = p_ano)
      AND (p_equipe IS NULL OR b.equipe = p_equipe)
      AND (p_status_cat IS NULL OR coalesce(nullif(b.status_cat,''),'aberto') = p_status_cat)
      AND (p_predio IS NULL OR coalesce(nullif(b.predio,''),'—') = p_predio)
      AND (p_solicitante IS NULL OR coalesce(nullif(b.outros,''),'NÃO INFORMADO') = p_solicitante)
      AND (p_criticidade IS NULL OR coalesce(nullif(b.criticidade,''),'NÃO INFORMADA') = p_criticidade)
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
      'total', count(*),
      'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao')),
      'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
      'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
      'aguardandoAprovacao', count(*) FILTER (WHERE sc = 'aguardando_aprovacao'),
      'vencidos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao') AND termino_sla IS NOT NULL AND termino_sla < now()),
      'vencendo48h', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao') AND termino_sla >= now() AND termino_sla < now() + interval '48 hours'),
      'criticos', count(*) FILTER (WHERE upper(coalesce(criticidade,'')) LIKE 'ALTA%'),
      'tempoMedioDias', coalesce(round(avg(EXTRACT(EPOCH FROM (coalesce(data_conclusao,data_finalizacao) - data_solicitacao))/86400)
        FILTER (WHERE sc IN ('concluido','fechado','validado') AND coalesce(data_conclusao,data_finalizacao) IS NOT NULL),1),0),
      'primeiroAno', min(ano), 'ultimoAno', max(ano)
    ) FROM base),
    'porStatus', coalesce((SELECT jsonb_object_agg(sc, n) FROM (SELECT sc, count(*) n FROM base GROUP BY sc) t),'{}'::jsonb),
    'porAno', coalesce((SELECT jsonb_agg(x ORDER BY x->>'ano') FROM (
      SELECT jsonb_build_object('ano', ano::text,'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao'))) AS x
      FROM base WHERE ano IS NOT NULL GROUP BY ano) t),'[]'::jsonb),
    'porMes', coalesce((SELECT jsonb_agg(x ORDER BY x->>'mes') FROM (
      SELECT jsonb_build_object('mes', mes,'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao'))) AS x
      FROM base WHERE mes IS NOT NULL GROUP BY mes) t),'[]'::jsonb),
    'porEquipe', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(equipe,''),'Outros'),'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao'))) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'porCategoria', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(atividade,''),'Outros'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'porCriticidade', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(criticidade,''),'NÃO INFORMADA'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) t),'[]'::jsonb),
    'porPredio', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(predio,''),'—'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 10) t),'[]'::jsonb),
    'avaliacaoPendente', coalesce((SELECT jsonb_agg(x ORDER BY (x->>'total')::int DESC) FROM (
      SELECT jsonb_build_object('nome', solic,
        'total', count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'oss', (array_agg(os ORDER BY data_solicitacao DESC))[1:25]) AS x
      FROM base WHERE sc IN ('concluido','fechado','validado','aguardando_aprovacao')
      GROUP BY solic) t),'[]'::jsonb),
    'cancelados', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('os', os,'nome',nome,'equipe',equipe,'predio',predio,
        'solicitante', solic,'statusOrigem',status_origem,'statusCat',sc,
        'dataSolicitacao', data_solicitacao,'dataConclusao', coalesce(data_conclusao,data_finalizacao)) AS x
      FROM base WHERE sc IN ('cancelado','nao_executada')
      ORDER BY data_solicitacao DESC LIMIT 500) t),'[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('os', os,'nome',nome,'equipe',equipe,'atividade',atividade,
        'predio',predio,'andar',andar,'espaco',espaco,'criticidade',criticidade,
        'solicitante', solic,'statusCat',sc,'statusOrigem',status_origem,
        'dataSolicitacao', data_solicitacao,'terminoSla',termino_sla,
        'dataConclusao', coalesce(data_conclusao,data_finalizacao)) AS x
      FROM base ORDER BY data_solicitacao DESC NULLS LAST LIMIT greatest(coalesce(p_row_limit,300),1)) t),'[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- 6) Filtros incluindo status detalhado
CREATE OR REPLACE FUNCTION public.backorder_dashboard_filtros()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;
  SELECT jsonb_build_object(
    'equipes', coalesce((SELECT jsonb_agg(DISTINCT equipe) FROM public.backorder_os WHERE nullif(equipe,'') IS NOT NULL),'[]'::jsonb),
    'categorias', coalesce((SELECT jsonb_agg(DISTINCT atividade) FROM public.backorder_os WHERE nullif(atividade,'') IS NOT NULL),'[]'::jsonb),
    'criticidades', coalesce((SELECT jsonb_agg(DISTINCT criticidade) FROM public.backorder_os WHERE nullif(criticidade,'') IS NOT NULL),'[]'::jsonb),
    'predios', coalesce((SELECT jsonb_agg(DISTINCT predio) FROM public.backorder_os WHERE nullif(predio,'') IS NOT NULL),'[]'::jsonb),
    'solicitantes', coalesce((SELECT jsonb_agg(DISTINCT outros) FROM public.backorder_os WHERE nullif(outros,'') IS NOT NULL),'[]'::jsonb),
    'statusCats', coalesce((SELECT jsonb_agg(DISTINCT coalesce(nullif(status_cat,''),'aberto')) FROM public.backorder_os),'[]'::jsonb),
    'anos', coalesce((SELECT jsonb_agg(DISTINCT EXTRACT(YEAR FROM data_solicitacao)::int) FROM public.backorder_os WHERE data_solicitacao IS NOT NULL),'[]'::jsonb)
  ) INTO r;
  RETURN r;
END;
$$;

-- 7) Limpeza solicitada da base atual
DELETE FROM public.backorder_os WHERE os IS NOT NULL;
CREATE OR REPLACE FUNCTION public.backorder_dashboard_v2(p_ano integer DEFAULT NULL::integer, p_equipe text DEFAULT NULL::text, p_status_cat text DEFAULT NULL::text, p_predio text DEFAULT NULL::text, p_solicitante text DEFAULT NULL::text, p_criticidade text DEFAULT NULL::text, p_row_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;

  WITH base AS (
    SELECT b.*,
      coalesce(nullif(b.status_cat,''),'aberto') AS sc,
      EXTRACT(YEAR FROM b.data_solicitacao)::int AS ano,
      to_char(b.data_solicitacao,'YYYY-MM') AS mes,
      coalesce(nullif(b.outros,''),'NÃO INFORMADO') AS solic
    FROM public.backorder_os b
    WHERE (p_ano IS NULL OR EXTRACT(YEAR FROM b.data_solicitacao)::int = p_ano)
      AND (p_equipe IS NULL OR b.equipe = p_equipe)
      AND (p_status_cat IS NULL OR coalesce(nullif(b.status_cat,''),'aberto') = p_status_cat)
      AND (p_predio IS NULL OR coalesce(nullif(b.predio,''),'—') = p_predio)
      AND (p_solicitante IS NULL OR coalesce(nullif(b.outros,''),'NÃO INFORMADO') = p_solicitante)
      AND (p_criticidade IS NULL OR coalesce(nullif(b.criticidade,''),'NÃO INFORMADA') = p_criticidade)
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
      'total', count(*),
      'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado')),
      'backorder', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado') AND data_solicitacao < now() - interval '30 days'),
      'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
      'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
      'aguardandoAprovacao', count(*) FILTER (WHERE sc = 'aguardando_aprovacao'),
      'vencidos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado') AND termino_sla IS NOT NULL AND termino_sla < now()),
      'vencendo48h', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado') AND termino_sla >= now() AND termino_sla < now() + interval '48 hours'),
      'criticos', count(*) FILTER (WHERE upper(coalesce(criticidade,'')) LIKE 'ALTA%'),
      'tempoMedioDias', coalesce(round(avg(EXTRACT(EPOCH FROM (coalesce(data_conclusao,data_finalizacao) - data_solicitacao))/86400)
        FILTER (WHERE sc IN ('concluido','fechado','validado') AND coalesce(data_conclusao,data_finalizacao) IS NOT NULL),1),0),
      'primeiroAno', min(ano), 'ultimoAno', max(ano)
    ) FROM base),
    'porStatus', coalesce((SELECT jsonb_object_agg(sc, n) FROM (SELECT sc, count(*) n FROM base GROUP BY sc) t),'{}'::jsonb),
    'porAno', coalesce((SELECT jsonb_agg(x ORDER BY x->>'ano') FROM (
      SELECT jsonb_build_object('ano', ano::text,'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado'))) AS x
      FROM base WHERE ano IS NOT NULL GROUP BY ano) t),'[]'::jsonb),
    'porMes', coalesce((SELECT jsonb_agg(x ORDER BY x->>'mes') FROM (
      SELECT jsonb_build_object('mes', mes,'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado'))) AS x
      FROM base WHERE mes IS NOT NULL GROUP BY mes) t),'[]'::jsonb),
    'porEquipe', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(equipe,''),'Outros'),'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado'))) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'porCategoria', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(atividade,''),'Outros'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'porCriticidade', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(criticidade,''),'NÃO INFORMADA'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) t),'[]'::jsonb),
    'porPredio', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(predio,''),'—'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'avaliacaoPendente', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('nome', solic,
        'total', count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'oss', (array_agg(os ORDER BY data_solicitacao DESC))[1:40]) AS x
      FROM base WHERE sc IN ('concluido','fechado','validado','aguardando_aprovacao')
      GROUP BY solic ORDER BY count(*) DESC LIMIT 200) t),'[]'::jsonb),
    'cancelados', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('os', os,'nome',nome,'equipe',equipe,'predio',predio,
        'solicitante', solic,'statusOrigem',status_origem,'statusCat',sc,
        'dataSolicitacao', data_solicitacao,'dataConclusao', coalesce(data_conclusao,data_finalizacao)) AS x
      FROM base WHERE sc IN ('cancelado','nao_executada') ORDER BY data_solicitacao DESC LIMIT 500) t),'[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('os', os,'nome',nome,'equipe',equipe,'atividade',atividade,
        'predio',predio,'andar',andar,'espaco',espaco,'criticidade',criticidade,
        'solicitante', solic,'statusCat',sc,'statusOrigem',status_origem,
        'dataSolicitacao', data_solicitacao,'terminoSla',termino_sla,
        'dataConclusao', coalesce(data_conclusao,data_finalizacao)) AS x
      FROM base ORDER BY data_solicitacao DESC LIMIT greatest(coalesce(p_row_limit,300),1)) t),'[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;CREATE OR REPLACE FUNCTION public.tg_backorder_status_cat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.status_cat := public.backorder_status_cat(NEW.status_origem);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.backorder_bulk_upsert(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received bigint := 0;
  v_new bigint := 0;
  v_upd bigint := 0;
  v_total bigint := 0;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para importar backorder';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'O lote da importação deve ser uma lista de OS';
  END IF;

  v_received := jsonb_array_length(p_rows);

  CREATE TEMP TABLE _bo_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_rows) AS x(
    os text, nome text, ativo text, predio text, andar text, espaco text,
    atividade text, equipe text, termino_sla timestamptz, data_solicitacao timestamptz,
    outros text, criticidade text, revisao_manual boolean,
    origem_predio_andar_espaco text, origem_equipe text,
    status_origem text, status_cat text, finalizado boolean, cancelado boolean,
    data_conclusao timestamptz
  );

  DELETE FROM _bo_in WHERE os IS NULL OR btrim(os) = '';
  DELETE FROM _bo_in a USING _bo_in b
   WHERE a.ctid < b.ctid AND btrim(a.os) = btrim(b.os);

  UPDATE _bo_in SET os = btrim(os);
  SELECT count(*) INTO v_total FROM _bo_in;

  SELECT count(*) INTO v_new
    FROM _bo_in i LEFT JOIN public.backorder_os o ON o.os = i.os
   WHERE o.os IS NULL;
  v_upd := v_total - v_new;

  INSERT INTO public.backorder_os AS o (
    os, nome, ativo, predio, andar, espaco, atividade, equipe,
    termino_sla, data_solicitacao, outros, criticidade, revisao_manual,
    origem_predio_andar_espaco, origem_equipe, status_origem, status_cat,
    finalizado, cancelado, data_conclusao, data_finalizacao
  )
  SELECT
    i.os, coalesce(i.nome,''), coalesce(i.ativo,''), coalesce(i.predio,''),
    coalesce(i.andar,''), coalesce(i.espaco,''), coalesce(i.atividade,'Outros'),
    coalesce(i.equipe,'Outros'), i.termino_sla, coalesce(i.data_solicitacao, now()),
    coalesce(i.outros,''), coalesce(i.criticidade,''), coalesce(i.revisao_manual,false),
    coalesce(i.origem_predio_andar_espaco,'pendente'), coalesce(i.origem_equipe,'regra_local'),
    coalesce(i.status_origem,''), public.backorder_status_cat(i.status_origem),
    coalesce(i.finalizado,false), coalesce(i.cancelado,false), i.data_conclusao,
    CASE WHEN coalesce(i.finalizado,false) THEN coalesce(i.data_conclusao, now()) END
  FROM _bo_in i
  ON CONFLICT (os) DO UPDATE SET
    nome = EXCLUDED.nome,
    ativo = EXCLUDED.ativo,
    predio = CASE WHEN EXCLUDED.predio <> '' THEN EXCLUDED.predio ELSE o.predio END,
    andar = CASE WHEN EXCLUDED.andar <> '' THEN EXCLUDED.andar ELSE o.andar END,
    espaco = CASE WHEN EXCLUDED.espaco <> '' THEN EXCLUDED.espaco ELSE o.espaco END,
    atividade = CASE WHEN o.atividade_manual THEN o.atividade ELSE EXCLUDED.atividade END,
    equipe = CASE WHEN o.atividade_manual THEN o.equipe ELSE EXCLUDED.equipe END,
    termino_sla = EXCLUDED.termino_sla,
    data_solicitacao = EXCLUDED.data_solicitacao,
    outros = EXCLUDED.outros,
    criticidade = EXCLUDED.criticidade,
    revisao_manual = CASE WHEN o.atividade_manual THEN false ELSE EXCLUDED.revisao_manual END,
    origem_predio_andar_espaco = EXCLUDED.origem_predio_andar_espaco,
    origem_equipe = CASE WHEN o.atividade_manual THEN 'regra_aprendida' ELSE EXCLUDED.origem_equipe END,
    status_origem = EXCLUDED.status_origem,
    status_cat = EXCLUDED.status_cat,
    cancelado = EXCLUDED.cancelado,
    data_conclusao = EXCLUDED.data_conclusao,
    finalizado = EXCLUDED.finalizado,
    data_finalizacao = CASE
      WHEN EXCLUDED.finalizado THEN coalesce(EXCLUDED.data_conclusao, o.data_finalizacao, now())
      ELSE NULL
    END,
    atualizado_em = now();

  RETURN jsonb_build_object(
    'recebidas', v_received,
    'total', v_total,
    'novas', v_new,
    'atualizadas', v_upd,
    'ignoradas', v_received - v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backorder_bulk_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.backorder_bulk_upsert(jsonb) TO authenticated;-- 1) Permissões do novo módulo (aditivo)
INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT 'gestao-executiva:' || a, 'gestao-executiva', a, 'gestao-executiva — ' || a
FROM unnest(ARRAY['read','create','update','delete','export','admin']) a
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r, 'gestao-executiva:' || a
FROM unnest(ARRAY['proprietario','administrador','gestor_pcm']) r,
     unnest(ARRAY['read','create','update','delete','export','admin']) a
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
VALUES ('supervisor','gestao-executiva:read'),
       ('auditor','gestao-executiva:read'),
       ('auditor','gestao-executiva:export')
ON CONFLICT DO NOTHING;

-- 2) Guarda de permissão reutilizável
CREATE OR REPLACE FUNCTION public.can_access_gestao(required_action text DEFAULT 'read')
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_module('gestao-executiva', coalesce(nullif(btrim(required_action),''),'read'));
$$;

-- 3) Notas executivas
CREATE TABLE IF NOT EXISTS public.gestao_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  detalhe text NOT NULL DEFAULT '',
  modulo text NOT NULL DEFAULT 'geral',
  prioridade text NOT NULL DEFAULT 'media',
  situacao text NOT NULL DEFAULT 'aberta',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gestao_notas TO authenticated;
GRANT ALL ON public.gestao_notas TO service_role;

ALTER TABLE public.gestao_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gestao_notas_select ON public.gestao_notas;
CREATE POLICY gestao_notas_select ON public.gestao_notas
  FOR SELECT TO authenticated
  USING (public.can_access_gestao('read'));

DROP POLICY IF EXISTS gestao_notas_insert ON public.gestao_notas;
CREATE POLICY gestao_notas_insert ON public.gestao_notas
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_gestao('create') AND created_by = auth.uid());

DROP POLICY IF EXISTS gestao_notas_update ON public.gestao_notas;
CREATE POLICY gestao_notas_update ON public.gestao_notas
  FOR UPDATE TO authenticated
  USING (public.can_access_gestao('update') OR created_by = auth.uid())
  WITH CHECK (public.can_access_gestao('update') OR created_by = auth.uid());

DROP POLICY IF EXISTS gestao_notas_delete ON public.gestao_notas;
CREATE POLICY gestao_notas_delete ON public.gestao_notas
  FOR DELETE TO authenticated
  USING (public.can_access_gestao('delete') OR created_by = auth.uid());

CREATE INDEX IF NOT EXISTS gestao_notas_situacao_idx ON public.gestao_notas (situacao, created_at DESC);

DROP TRIGGER IF EXISTS trg_gestao_notas_updated_at ON public.gestao_notas;
CREATE TRIGGER trg_gestao_notas_updated_at
  BEFORE UPDATE ON public.gestao_notas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Visão consolidada (somente leitura, sem alterar dados)
CREATE OR REPLACE FUNCTION public.gestao_overview(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini timestamptz := now() - (greatest(coalesce(p_dias,30), 1) || ' days')::interval;
  v_out jsonb;
BEGIN
  IF NOT public.can_access_gestao('read') THEN
    RAISE EXCEPTION 'Sem permissão para o Centro de Gestão';
  END IF;

  SELECT jsonb_build_object(
    'periodo_dias', greatest(coalesce(p_dias,30), 1),
    'gerado_em', now(),
    'backorder', (
      SELECT jsonb_build_object(
        'total', count(*),
        'por_status', coalesce(jsonb_object_agg(t.status_cat, t.qtd) FILTER (WHERE t.status_cat IS NOT NULL), '{}'::jsonb)
      )
      FROM (
        SELECT coalesce(nullif(btrim(status_cat),''),'indefinido') AS status_cat, count(*) AS qtd
        FROM public.backorder_os GROUP BY 1
      ) t
    ),
    'backorder_envelhecido', (
      SELECT count(*) FROM public.backorder_os
      WHERE finalizado = false AND cancelado = false
        AND data_solicitacao < now() - interval '30 days'
    ),
    'backorder_mensal', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'mes'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'mes', to_char(date_trunc('month', data_solicitacao), 'YYYY-MM'),
          'total', count(*),
          'concluidas', count(*) FILTER (WHERE finalizado),
          'canceladas', count(*) FILTER (WHERE cancelado)
        ) x
        FROM public.backorder_os
        WHERE data_solicitacao >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
      ) s
    ),
    'backorder_equipes', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('equipe', coalesce(nullif(btrim(equipe),''),'Outros'), 'abertas', count(*)) x
        FROM public.backorder_os
        WHERE finalizado = false AND cancelado = false
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 8
      ) s
    ),
    'corretiva', (
      SELECT jsonb_build_object(
        'abertas', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','finalizada')),
        'periodo', count(*) FILTER (WHERE created_at >= v_ini)
      ) FROM public.corretiva_os
    ),
    'refrigeracao', (
      SELECT jsonb_build_object(
        'abertas', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','finalizada')),
        'periodo', count(*) FILTER (WHERE created_at >= v_ini)
      ) FROM public.refrigeracao_os
    ),
    'agua', (
      SELECT jsonb_build_object(
        'entregas_periodo', count(*) FILTER (WHERE criado_em >= v_ini),
        'bags_periodo', coalesce(sum(bags) FILTER (WHERE criado_em >= v_ini), 0),
        'bebedouros_nok', count(*) FILTER (WHERE criado_em >= v_ini AND bebedouro_ok = false)
      ) FROM public.agua_prog_entregas
    ),
    'frota', (
      SELECT jsonb_build_object(
        'checklists_periodo', (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini),
        'checklists_reprovados', (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini AND overall_status <> 'ok'),
        'custo_periodo', (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'litros_periodo', (SELECT coalesce(sum(liters),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini)
      )
    ),
    'materiais', (
      SELECT jsonb_build_object(
        'pendentes', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','atendida')),
        'periodo', count(*) FILTER (WHERE created_at >= v_ini)
      ) FROM public.material_solicitacoes
    ),
    'legal', (
      SELECT jsonb_build_object(
        'total', count(*),
        'vencidos', count(*) FILTER (WHERE concluido = false AND proxima_execucao IS NOT NULL AND proxima_execucao < current_date),
        'proximos_30', count(*) FILTER (WHERE concluido = false AND proxima_execucao BETWEEN current_date AND current_date + 30)
      ) FROM public.legal_items
    ),
    'sst', (
      SELECT jsonb_build_object(
        'aso_vencidos', count(*) FILTER (WHERE ativo AND data_vencimento IS NOT NULL AND data_vencimento < current_date),
        'aso_proximos_30', count(*) FILTER (WHERE ativo AND data_vencimento BETWEEN current_date AND current_date + 30)
      ) FROM public.sst_colaboradores
    ),
    'taludes', (
      SELECT jsonb_build_object(
        'pt_ativas', count(*) FILTER (WHERE status IN ('liberada','em_analise','solicitada')),
        'pt_suspensas', count(*) FILTER (WHERE status = 'suspensa')
      ) FROM public.talude_pt_releases
    ),
    'notas_abertas', (SELECT count(*) FROM public.gestao_notas WHERE situacao = 'aberta')
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.gestao_overview(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.gestao_overview(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_gestao(text) TO authenticated;-- ============================================================
-- Centro de Gestão — consolidação de OS, indicadores e preferências
-- Aditivo: nenhuma tabela operacional é alterada ou duplicada.
-- ============================================================

-- 1) Status canônico -------------------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_status_canonico(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status IS NULL OR btrim(p_status) = '' THEN 'aberta'
    WHEN lower(unaccent_safe.s) ~ '(cancel|nao executad|não executad)' THEN 'cancelada'
    WHEN lower(unaccent_safe.s) ~ '(conclu|finaliz|fechad|encerrad|validad|atendid)' THEN 'concluida'
    WHEN lower(unaccent_safe.s) ~ '(execu|andamento|iniciad|progress)' THEN 'andamento'
    WHEN lower(unaccent_safe.s) ~ '(aguard|aprova|pendente|analise|análise|programad)' THEN 'pendente'
    ELSE 'aberta'
  END
  FROM (SELECT btrim(p_status) AS s) unaccent_safe
$$;

-- 2) View consolidada (RLS das tabelas de origem preservada) ----------
CREATE OR REPLACE VIEW public.vw_gestao_os_consolidada
WITH (security_invoker = on) AS
WITH bo AS (
  SELECT
    'backorder'::text AS origem,
    b.os::text        AS id,
    b.os::text        AS numero_os,
    coalesce(nullif(btrim(b.nome), ''), b.atividade) AS descricao,
    b.ativo,
    NULL::text        AS patrimonio,
    b.predio, b.andar, b.espaco AS local,
    coalesce(nullif(btrim(b.equipe), ''), 'Não atribuída') AS equipe,
    NULL::text        AS tecnico,
    CASE WHEN b.is_prioridade THEN 'alta' ELSE coalesce(b.prioridade_nivel::text, 'normal') END AS prioridade,
    coalesce(nullif(btrim(b.criticidade), ''), 'media') AS criticidade,
    CASE
      WHEN b.cancelado THEN 'cancelada'
      WHEN b.finalizado THEN 'concluida'
      ELSE public.gestao_status_canonico(b.status_origem)
    END AS status_canonico,
    coalesce(nullif(btrim(b.status_origem), ''), 'indefinido') AS status_origem,
    b.data_solicitacao AS criado_em,
    NULL::timestamptz  AS inicio,
    coalesce(b.data_conclusao, b.data_finalizacao) AS conclusao,
    b.termino_sla      AS prazo_sla
  FROM public.backorder_os b
),
cor AS (
  SELECT
    'corretiva'::text, c.id::text, c.numero_os,
    c.nome_os, c.ativo, c.patrimonio,
    c.predio, c.andar, c.local,
    coalesce(nullif(btrim(c.equipe), ''), 'Não atribuída'),
    c.assinatura_nome,
    coalesce(nullif(btrim(c.tipo), ''), 'normal'),
    'media'::text,
    public.gestao_status_canonico(c.status::text),
    coalesce(nullif(btrim(c.status::text), ''), 'indefinido'),
    coalesce(c.data_criacao, c.created_at), c.inicio, c.fim, c.data_sla
  FROM public.corretiva_os c
),
refr AS (
  SELECT
    'refrigeracao'::text, r.id::text, r.numero_os,
    r.nome_os, r.ativo, r.patrimonio,
    r.predio, r.andar, r.local,
    coalesce(nullif(btrim(r.equipe), ''), 'Refrigeração'),
    NULL::text,
    coalesce(nullif(btrim(r.tipo), ''), 'normal'),
    'media'::text,
    public.gestao_status_canonico(r.status::text),
    coalesce(nullif(btrim(r.status::text), ''), 'indefinido'),
    r.created_at, r.inicio, r.fim, r.data_sla
  FROM public.refrigeracao_os r
),
base AS (
  SELECT * FROM bo
  UNION ALL SELECT * FROM cor
  UNION ALL SELECT * FROM refr
)
SELECT
  b.origem, b.id, b.numero_os, b.descricao, b.ativo, b.patrimonio,
  b.predio, b.andar, b.local, b.equipe, b.tecnico, b.prioridade, b.criticidade,
  b.status_canonico, b.status_origem,
  b.criado_em, b.inicio, b.conclusao, b.prazo_sla,
  (b.status_canonico NOT IN ('concluida','cancelada')
     AND b.prazo_sla IS NOT NULL AND b.prazo_sla < now()) AS atrasada,
  CASE WHEN b.prazo_sla IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (coalesce(b.conclusao, now()) - b.prazo_sla)) / 86400)::int
  END AS dias_atraso,
  CASE WHEN b.criado_em IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (coalesce(b.conclusao, now()) - b.criado_em)) / 3600)::numeric
  END AS horas_atendimento,
  CASE WHEN b.inicio IS NULL OR b.conclusao IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (b.conclusao - b.inicio)) / 3600)::numeric
  END AS horas_reparo,
  coalesce(pc.pendentes, 0) AS pecas_pendentes,
  coalesce(pb.total, 0)     AS problemas,
  CASE WHEN b.ativo IS NULL OR btrim(b.ativo) = '' THEN 1
       ELSE count(*) OVER (PARTITION BY lower(btrim(b.ativo))) END AS reincidencia
FROM base b
LEFT JOIN LATERAL (
  SELECT count(*) AS pendentes FROM public.corretiva_pecas p
  WHERE b.origem = 'corretiva' AND p.os_id::text = b.id
    AND coalesce(p.status_gestor, 'pendente') = 'pendente'
  UNION ALL
  SELECT count(*) FROM public.refrigeracao_pecas p
  WHERE b.origem = 'refrigeracao' AND p.os_id::text = b.id
    AND coalesce(p.status_gestor, 'pendente') = 'pendente'
  LIMIT 1
) pc ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total FROM public.corretiva_problemas p
  WHERE b.origem = 'corretiva' AND p.os_id::text = b.id
  UNION ALL
  SELECT count(*) FROM public.refrigeracao_problemas p
  WHERE b.origem = 'refrigeracao' AND p.os_id::text = b.id
  LIMIT 1
) pb ON true;

GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;
GRANT SELECT ON public.vw_gestao_os_consolidada TO service_role;

-- 3) RPC de leitura filtrada -----------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_os_consolidada(
  p_dias       integer DEFAULT 30,
  p_modulo     text    DEFAULT NULL,
  p_equipe     text    DEFAULT NULL,
  p_predio     text    DEFAULT NULL,
  p_status     text    DEFAULT NULL,
  p_criticidade text   DEFAULT NULL,
  p_limit      integer DEFAULT 500
)
RETURNS SETOF public.vw_gestao_os_consolidada
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini timestamptz := now() - (greatest(coalesce(p_dias, 30), 1) || ' days')::interval;
BEGIN
  IF NOT public.can_access_gestao('read') THEN
    RAISE EXCEPTION 'Sem permissão para o Centro de Gestão';
  END IF;

  RETURN QUERY
  SELECT * FROM public.vw_gestao_os_consolidada v
  WHERE (v.criado_em IS NULL OR v.criado_em >= v_ini
         OR v.status_canonico NOT IN ('concluida','cancelada'))
    AND (p_modulo      IS NULL OR v.origem = p_modulo)
    AND (p_equipe      IS NULL OR v.equipe = p_equipe)
    AND (p_predio      IS NULL OR v.predio = p_predio)
    AND (p_status      IS NULL OR v.status_canonico = p_status)
    AND (p_criticidade IS NULL OR v.criticidade = p_criticidade)
  ORDER BY v.atrasada DESC NULLS LAST, v.criado_em DESC NULLS LAST
  LIMIT greatest(coalesce(p_limit, 500), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.gestao_os_consolidada(integer,text,text,text,text,text,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gestao_os_consolidada(integer,text,text,text,text,text,integer) TO authenticated, service_role;

-- 4) Overview v2: período + comparação + atenção ----------------------
CREATE OR REPLACE FUNCTION public.gestao_overview_v2(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d    integer     := greatest(coalesce(p_dias, 30), 1);
  v_ini  timestamptz := now() - (v_d || ' days')::interval;
  v_pini timestamptz := now() - ((v_d * 2) || ' days')::interval;
  v_out  jsonb;
BEGIN
  IF NOT public.can_access_gestao('read') THEN
    RAISE EXCEPTION 'Sem permissão para o Centro de Gestão';
  END IF;

  SELECT jsonb_build_object(
    'periodo_dias', v_d,
    'gerado_em', now(),
    'os', (
      SELECT jsonb_build_object(
        'abertas',        count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
        'concluidas',     count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini),
        'concluidas_ant', count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_pini AND conclusao < v_ini),
        'criadas',        count(*) FILTER (WHERE criado_em >= v_ini),
        'criadas_ant',    count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini),
        'vencidas',       count(*) FILTER (WHERE atrasada),
        'vence_24h',      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '24 hours'),
        'vence_48h',      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '48 hours'),
        'backlog',        count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
        'backlog_30',     count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criado_em < now() - interval '30 days'),
        'sem_responsavel',count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND (equipe IS NULL OR equipe = 'Não atribuída')),
        'sla_ok',         count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini AND (prazo_sla IS NULL OR conclusao <= prazo_sla)),
        'tma_horas',      round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini), 0)::numeric, 1),
        'mttr_horas',     round(coalesce(avg(horas_reparo) FILTER (WHERE conclusao >= v_ini), 0)::numeric, 1),
        'criticas',       count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criticidade IN ('alta','critica','crítica'))
      )
      FROM public.vw_gestao_os_consolidada
    ),
    'os_status', (
      SELECT coalesce(jsonb_object_agg(t.status_canonico, t.qtd), '{}'::jsonb)
      FROM (SELECT status_canonico, count(*) qtd FROM public.vw_gestao_os_consolidada GROUP BY 1) t
    ),
    'os_aging', (
      SELECT coalesce(jsonb_object_agg(t.faixa, t.qtd), '{}'::jsonb)
      FROM (
        SELECT CASE
                 WHEN criado_em >= now() - interval '7 days'  THEN '0-7'
                 WHEN criado_em >= now() - interval '30 days' THEN '8-30'
                 WHEN criado_em >= now() - interval '90 days' THEN '31-90'
                 ELSE '90+'
               END faixa, count(*) qtd
        FROM public.vw_gestao_os_consolidada
        WHERE status_canonico NOT IN ('concluida','cancelada')
        GROUP BY 1
      ) t
    ),
    'os_equipes', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'equipe', equipe,
          'abertas', count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
          'concluidas', count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini),
          'atrasadas', count(*) FILTER (WHERE atrasada),
          'tma_horas', round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida'), 0)::numeric, 1)
        ) x
        FROM public.vw_gestao_os_consolidada
        GROUP BY equipe ORDER BY count(*) DESC LIMIT 10
      ) s
    ),
    'os_predios', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('predio', coalesce(nullif(btrim(predio),''),'Não informado'), 'abertas', count(*)) x
        FROM public.vw_gestao_os_consolidada
        WHERE status_canonico NOT IN ('concluida','cancelada')
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 10
      ) s
    ),
    'os_reincidentes', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('ativo', ativo, 'ocorrencias', count(*)) x
        FROM public.vw_gestao_os_consolidada
        WHERE ativo IS NOT NULL AND btrim(ativo) <> ''
        GROUP BY ativo HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT 10
      ) s
    ),
    'os_mensal', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'mes'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'mes', to_char(date_trunc('month', criado_em), 'YYYY-MM'),
          'criadas', count(*),
          'concluidas', count(*) FILTER (WHERE status_canonico = 'concluida'),
          'canceladas', count(*) FILTER (WHERE status_canonico = 'cancelada')
        ) x
        FROM public.vw_gestao_os_consolidada
        WHERE criado_em >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
      ) s
    ),
    'frota', (
      SELECT jsonb_build_object(
        'total',        (SELECT count(*) FROM public.vehicles),
        'disponiveis',  (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'ativo') IN ('ativo','disponivel')),
        'bloqueados',   (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'') IN ('bloqueado','inativo')),
        'manutencao',   (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'') = 'manutencao'),
        'checklists',   (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini),
        'checklists_ant',(SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_pini AND created_at < v_ini),
        'reprovados',   (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini AND coalesce(overall_status,'ok') <> 'ok'),
        'custo',        (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'custo_ant',    (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_pini AND fueled_at < v_ini),
        'litros',       (SELECT coalesce(sum(liters),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'ocorrencias',  (SELECT count(*) FROM public.vehicle_occurrences WHERE coalesce(state,'aberta') NOT IN ('resolvida','fechada'))
      )
    ),
    'agua', (
      SELECT jsonb_build_object(
        'entregas',     count(*) FILTER (WHERE criado_em >= v_ini),
        'entregas_ant', count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini),
        'bags',         coalesce(sum(bags) FILTER (WHERE criado_em >= v_ini), 0),
        'bags_ant',     coalesce(sum(bags) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini), 0),
        'pendentes',    count(*) FILTER (WHERE criado_em >= v_ini AND coalesce(status,'') NOT IN ('concluida','entregue')),
        'bebedouros_nok', count(*) FILTER (WHERE criado_em >= v_ini AND bebedouro_ok = false),
        'sem_evidencia', count(*) FILTER (
            WHERE criado_em >= v_ini
              AND NOT EXISTS (SELECT 1 FROM public.agua_prog_fotos f WHERE f.entrega_id = e.id))
      ) FROM public.agua_prog_entregas e
    ),
    'filtros', (
      SELECT jsonb_build_object(
        'vencidos',   count(*) FILTER (WHERE proxima_troca IS NOT NULL AND proxima_troca < current_date),
        'proximos_30',count(*) FILTER (WHERE proxima_troca BETWEEN current_date AND current_date + 30)
      ) FROM public.agua_filtro_ativos
    ),
    'materiais', (
      SELECT jsonb_build_object(
        'pendentes', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','atendida')),
        'periodo',   count(*) FILTER (WHERE created_at >= v_ini),
        'periodo_ant', count(*) FILTER (WHERE created_at >= v_pini AND created_at < v_ini)
      ) FROM public.material_solicitacoes
    ),
    'pecas', (
      SELECT jsonb_build_object(
        'aguardando', (SELECT count(*) FROM public.corretiva_pecas WHERE coalesce(status_gestor,'pendente') = 'pendente')
                    + (SELECT count(*) FROM public.refrigeracao_pecas WHERE coalesce(status_gestor,'pendente') = 'pendente'),
        'problemas',  (SELECT count(*) FROM public.corretiva_problemas WHERE coalesce(status_gestor,'pendente') = 'pendente')
                    + (SELECT count(*) FROM public.refrigeracao_problemas WHERE coalesce(status_gestor,'pendente') = 'pendente')
      )
    ),
    'legal', (
      SELECT jsonb_build_object(
        'total', count(*),
        'vencidos', count(*) FILTER (WHERE concluido = false AND proxima_execucao < current_date),
        'proximos_30', count(*) FILTER (WHERE concluido = false AND proxima_execucao BETWEEN current_date AND current_date + 30)
      ) FROM public.legal_items
    ),
    'sst', (
      SELECT jsonb_build_object(
        'aso_vencidos', count(*) FILTER (WHERE ativo AND data_vencimento < current_date),
        'aso_proximos_30', count(*) FILTER (WHERE ativo AND data_vencimento BETWEEN current_date AND current_date + 30)
      ) FROM public.sst_colaboradores
    ),
    'taludes', (
      SELECT jsonb_build_object(
        'pt_ativas', count(*) FILTER (WHERE status IN ('liberada','em_andamento')),
        'pt_aguardando', count(*) FILTER (WHERE status IN ('solicitada','analise')),
        'pt_suspensas', count(*) FILTER (WHERE status = 'suspensa')
      ) FROM public.talude_pt_releases
    ),
    'notas_abertas', (SELECT count(*) FROM public.gestao_notas WHERE situacao <> 'concluida')
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.gestao_overview_v2(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer) TO authenticated, service_role;

-- 5) Preferências do painel ------------------------------------------
CREATE TABLE IF NOT EXISTS public.gestor_dashboard_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  favorites_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gestor_dashboard_preferences TO authenticated;
GRANT ALL ON public.gestor_dashboard_preferences TO service_role;

ALTER TABLE public.gestor_dashboard_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prefs_own" ON public.gestor_dashboard_preferences;
CREATE POLICY "prefs_own" ON public.gestor_dashboard_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_gestor_prefs_updated_at ON public.gestor_dashboard_preferences;
CREATE TRIGGER trg_gestor_prefs_updated_at
  BEFORE UPDATE ON public.gestor_dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();-- 8. SEGURANÇA: HARDENING E AUDITORIA

-- 8.1 Gestão de Credenciais
-- Implementa infraestrutura para convites e expiração de senhas
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_password_change boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_password_change timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.user_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    role public.app_role NOT NULL DEFAULT 'user',
    token text UNIQUE NOT NULL,
    invited_by uuid REFERENCES auth.users(id),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
    created_at timestamptz DEFAULT now(),
    accepted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invitations TO authenticated;
GRANT ALL ON public.user_invitations TO service_role;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invitations" ON public.user_invitations
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8.2 Hardening de Funções SECURITY DEFINER
-- Garante search_path seguro e revoga acesso PUBLIC
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = true AND n.nspname = 'public'
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
            func_record.nspname, func_record.proname, func_record.args);
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', 
            func_record.nspname, func_record.proname, func_record.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', 
            func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- 8.4 Mascaramento de Dados e Auditoria Administrativa
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    target_table text,
    target_id uuid,
    details jsonb,
    created_at timestamptz DEFAULT now()
);

GRANT INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can see all logs" ON public.admin_audit_logs
    FOR SELECT TO service_role USING (true);

-- Função para mascarar CPF (Item 8.4)
CREATE OR REPLACE FUNCTION public.mask_cpf(cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN length(cpf) = 11 THEN '***.' || substr(cpf, 4, 3) || '.' || substr(cpf, 7, 3) || '-**'
    ELSE cpf
  END;
$$;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           (pg_get_function_result(p.oid) = 'trigger') AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF NOT r.is_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;CREATE OR REPLACE FUNCTION public.backorder_bulk_upsert(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received bigint := 0;
  v_new bigint := 0;
  v_upd bigint := 0;
  v_total bigint := 0;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para importar backorder';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'O lote da importação deve ser uma lista de OS';
  END IF;

  v_received := jsonb_array_length(p_rows);

  CREATE TEMP TABLE _bo_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_rows) AS x(
    os text, nome text, ativo text, predio text, andar text, espaco text,
    atividade text, equipe text, termino_sla timestamptz, data_solicitacao timestamptz,
    outros text, criticidade text, revisao_manual boolean,
    origem_predio_andar_espaco text, origem_equipe text,
    status_origem text, status_cat text, finalizado boolean, cancelado boolean,
    data_conclusao timestamptz
  );

  DELETE FROM _bo_in WHERE os IS NULL OR btrim(os) = '';
  DELETE FROM _bo_in a USING _bo_in b
   WHERE a.ctid < b.ctid AND btrim(a.os) = btrim(b.os);

  -- Adicionado WHERE true para evitar erros de "UPDATE requires a WHERE clause" em alguns contextos
  UPDATE _bo_in SET os = btrim(os) WHERE true;
  
  SELECT count(*) INTO v_total FROM _bo_in;

  SELECT count(*) INTO v_new
    FROM _bo_in i LEFT JOIN public.backorder_os o ON o.os = i.os
   WHERE o.os IS NULL;
  v_upd := v_total - v_new;

  INSERT INTO public.backorder_os AS o (
    os, nome, ativo, predio, andar, espaco, atividade, equipe,
    termino_sla, data_solicitacao, outros, criticidade, revisao_manual,
    origem_predio_andar_espaco, origem_equipe, status_origem, status_cat,
    finalizado, cancelado, data_conclusao, data_finalizacao
  )
  SELECT
    i.os, coalesce(i.nome,''), coalesce(i.ativo,''), coalesce(i.predio,''),
    coalesce(i.andar,''), coalesce(i.espaco,''), coalesce(i.atividade,'Outros'),
    coalesce(i.equipe,'Outros'), i.termino_sla, coalesce(i.data_solicitacao, now()),
    coalesce(i.outros,''), coalesce(i.criticidade,''), coalesce(i.revisao_manual,false),
    coalesce(i.origem_predio_andar_espaco,'pendente'), coalesce(i.origem_equipe,'regra_local'),
    coalesce(i.status_origem,''), public.backorder_status_cat(i.status_origem),
    coalesce(i.finalizado,false), coalesce(i.cancelado,false), i.data_conclusao,
    CASE WHEN coalesce(i.finalizado,false) THEN coalesce(i.data_conclusao, now()) END
  FROM _bo_in i
  ON CONFLICT (os) DO UPDATE SET
    nome = EXCLUDED.nome,
    ativo = EXCLUDED.ativo,
    predio = CASE WHEN EXCLUDED.predio <> '' THEN EXCLUDED.predio ELSE o.predio END,
    andar = CASE WHEN EXCLUDED.andar <> '' THEN EXCLUDED.andar ELSE o.andar END,
    espaco = CASE WHEN EXCLUDED.espaco <> '' THEN EXCLUDED.espaco ELSE o.espaco END,
    atividade = CASE WHEN o.atividade_manual THEN o.atividade ELSE EXCLUDED.atividade END,
    equipe = CASE WHEN o.atividade_manual THEN o.equipe ELSE EXCLUDED.equipe END,
    termino_sla = EXCLUDED.termino_sla,
    data_solicitacao = EXCLUDED.data_solicitacao,
    outros = EXCLUDED.outros,
    criticidade = EXCLUDED.criticidade,
    revisao_manual = CASE WHEN o.atividade_manual THEN false ELSE EXCLUDED.revisao_manual END,
    origem_predio_andar_espaco = EXCLUDED.origem_predio_andar_espaco,
    origem_equipe = CASE WHEN o.atividade_manual THEN 'regra_aprendida' ELSE EXCLUDED.origem_equipe END,
    status_origem = EXCLUDED.status_origem,
    status_cat = EXCLUDED.status_cat,
    cancelado = EXCLUDED.cancelado,
    data_conclusao = EXCLUDED.data_conclusao,
    finalizado = EXCLUDED.finalizado,
    data_finalizacao = CASE
      WHEN EXCLUDED.finalizado THEN coalesce(EXCLUDED.data_conclusao, o.data_finalizacao, now())
      ELSE NULL
    END,
    atualizado_em = now();

  RETURN jsonb_build_object(
    'recebidas', v_received,
    'total', v_total,
    'novas', v_new,
    'atualizadas', v_upd,
    'ignoradas', v_received - v_total
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.backorder_clear_all()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  n bigint;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para limpar o backorder';
  END IF;
  
  SELECT count(*) INTO n FROM public.backorder_os;
  
  -- DELETE em PostgreSQL exige WHERE em alguns contextos de segurança, 'WHERE true' é a forma explícita.
  DELETE FROM public.backorder_os WHERE true;
  
  RETURN n;
END;
$$;
-- Índices de performance para o Centro de Gestão e painéis de OS.
-- Os LATERAL JOINs da view consolidada faziam varredura sequencial por linha.
CREATE INDEX IF NOT EXISTS idx_corretiva_pecas_os_status
  ON public.corretiva_pecas (os_id, status_gestor);
CREATE INDEX IF NOT EXISTS idx_refrigeracao_pecas_os_status
  ON public.refrigeracao_pecas (os_id, status_gestor);
CREATE INDEX IF NOT EXISTS idx_corretiva_problemas_os
  ON public.corretiva_problemas (os_id);
CREATE INDEX IF NOT EXISTS idx_refrigeracao_problemas_os
  ON public.refrigeracao_problemas (os_id);

-- Agregações por período do overview.
CREATE INDEX IF NOT EXISTS idx_fleet_fuelings_fueled_at
  ON public.fleet_fuelings (fueled_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_checklists_created_at
  ON public.fleet_checklists (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_corretiva_os_criacao
  ON public.corretiva_os (data_criacao DESC);
CREATE INDEX IF NOT EXISTS idx_refrigeracao_os_created
  ON public.refrigeracao_os (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agua_prog_entregas_criado
  ON public.agua_prog_entregas (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_agua_prog_fotos_entrega
  ON public.agua_prog_fotos (entrega_id);

ANALYZE public.backorder_os;
ANALYZE public.corretiva_os;
ANALYZE public.refrigeracao_os;-- Fix gestao_overview_v2: Remove avg(horas_atendimento) and count(*) from GROUP BY
CREATE OR REPLACE FUNCTION public.gestao_overview_v2(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d    integer     := greatest(coalesce(p_dias, 30), 1);
  v_ini  timestamptz := now() - (v_d || ' days')::interval;
  v_pini timestamptz := now() - ((v_d * 2) || ' days')::interval;
  v_out  jsonb;
BEGIN
  IF NOT public.can_access_gestao('read') THEN
    RAISE EXCEPTION 'Sem permissão para o Centro de Gestão';
  END IF;

  SELECT jsonb_build_object(
    'periodo_dias', v_d,
    'gerado_em', now(),
    'os', (
      SELECT jsonb_build_object(
        'abertas',        count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
        'concluidas',     count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini),
        'concluidas_ant', count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_pini AND conclusao < v_ini),
        'criadas',        count(*) FILTER (WHERE criado_em >= v_ini),
        'criadas_ant',    count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini),
        'vencidas',       count(*) FILTER (WHERE atrasada),
        'vence_24h',      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '24 hours'),
        'vence_48h',      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '48 hours'),
        'backlog',        count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
        'backlog_30',     count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criado_em < now() - interval '30 days'),
        'sem_responsavel',count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND (equipe IS NULL OR equipe = 'Não atribuída')),
        'sla_ok',         count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini AND (prazo_sla IS NULL OR conclusao <= prazo_sla)),
        'tma_horas',      round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini), 0)::numeric, 1),
        'mttr_horas',     round(coalesce(avg(horas_reparo) FILTER (WHERE conclusao >= v_ini), 0)::numeric, 1),
        'criticas',       count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criticidade IN ('alta','critica','crítica'))
      )
      FROM public.vw_gestao_os_consolidada
    ),
    'os_status', (
      SELECT coalesce(jsonb_object_agg(t.status_canonico, t.qtd), '{}'::jsonb)
      FROM (SELECT status_canonico, count(*) qtd FROM public.vw_gestao_os_consolidada GROUP BY status_canonico) t
    ),
    'os_aging', (
      SELECT coalesce(jsonb_object_agg(t.faixa, t.qtd), '{}'::jsonb)
      FROM (
        SELECT CASE
                 WHEN criado_em >= now() - interval '7 days'  THEN '0-7'
                 WHEN criado_em >= now() - interval '30 days' THEN '8-30'
                 WHEN criado_em >= now() - interval '90 days' THEN '31-90'
                 ELSE '90+'
               END faixa, count(*) qtd
        FROM public.vw_gestao_os_consolidada
        WHERE status_canonico NOT IN ('concluida','cancelada')
        GROUP BY 1
      ) t
    ),
    'os_equipes', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'equipe', equipe,
          'abertas', count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
          'concluidas', count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini),
          'atrasadas', count(*) FILTER (WHERE atrasada),
          'tma_horas', round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida'), 0)::numeric, 1)
        ) x
        FROM public.vw_gestao_os_consolidada
        GROUP BY equipe ORDER BY count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) DESC LIMIT 10
      ) s
    ),
    'os_predios', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('predio', coalesce(nullif(btrim(predio),''),'Não informado'), 'abertas', count(*)) x
        FROM public.vw_gestao_os_consolidada
        WHERE status_canonico NOT IN ('concluida','cancelada')
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 10
      ) s
    ),
    'os_reincidentes', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('ativo', ativo, 'ocorrencias', count(*)) x
        FROM public.vw_gestao_os_consolidada
        WHERE ativo IS NOT NULL AND btrim(ativo) <> ''
        GROUP BY ativo HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT 10
      ) s
    ),
    'os_mensal', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'mes'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'mes', to_char(date_trunc('month', criado_em), 'YYYY-MM'),
          'criadas', count(*),
          'concluidas', count(*) FILTER (WHERE status_canonico = 'concluida'),
          'canceladas', count(*) FILTER (WHERE status_canonico = 'cancelada')
        ) x
        FROM public.vw_gestao_os_consolidada
        WHERE criado_em >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
      ) s
    ),
    'frota', (
      SELECT jsonb_build_object(
        'total',        (SELECT count(*) FROM public.vehicles),
        'disponiveis',  (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'ativo') IN ('ativo','disponivel')),
        'bloqueados',   (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'') IN ('bloqueado','inativo')),
        'manutencao',   (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'') = 'manutencao'),
        'checklists',   (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini),
        'checklists_ant',(SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_pini AND created_at < v_ini),
        'reprovados',   (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini AND coalesce(overall_status,'ok') <> 'ok'),
        'custo',        (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'custo_ant',    (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_pini AND fueled_at < v_ini),
        'litros',       (SELECT coalesce(sum(liters),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'ocorrencias',  (SELECT count(*) FROM public.vehicle_occurrences WHERE coalesce(state,'aberta') NOT IN ('resolvida','fechada'))
      )
    ),
    'agua', (
      SELECT jsonb_build_object(
        'entregas',     count(*) FILTER (WHERE criado_em >= v_ini),
        'entregas_ant', count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini),
        'bags',         coalesce(sum(bags) FILTER (WHERE criado_em >= v_ini), 0),
        'bags_ant',     coalesce(sum(bags) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini), 0),
        'pendentes',    count(*) FILTER (WHERE criado_em >= v_ini AND coalesce(status,'') NOT IN ('concluida','entregue')),
        'bebedouros_nok', count(*) FILTER (WHERE criado_em >= v_ini AND bebedouro_ok = false),
        'sem_evidencia', count(*) FILTER (
            WHERE criado_em >= v_ini
              AND NOT EXISTS (SELECT 1 FROM public.agua_prog_fotos f WHERE f.entrega_id = e.id))
      ) FROM public.agua_prog_entregas e
    ),
    'filtros', (
      SELECT jsonb_build_object(
        'vencidos',   count(*) FILTER (WHERE proxima_troca IS NOT NULL AND proxima_troca < current_date),
        'proximos_30',count(*) FILTER (WHERE proxima_troca BETWEEN current_date AND current_date + 30)
      ) FROM public.agua_filtro_ativos
    ),
    'materiais', (
      SELECT jsonb_build_object(
        'pendentes', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','atendida')),
        'periodo',   count(*) FILTER (WHERE created_at >= v_ini),
        'periodo_ant', count(*) FILTER (WHERE created_at >= v_pini AND created_at < v_ini)
      ) FROM public.material_solicitacoes
    ),
    'pecas', (
      SELECT jsonb_build_object(
        'aguardando', (SELECT count(*) FROM public.corretiva_pecas WHERE coalesce(status_gestor,'pendente') = 'pendente')
                    + (SELECT count(*) FROM public.refrigeracao_pecas WHERE coalesce(status_gestor,'pendente') = 'pendente'),
        'problemas',  (SELECT count(*) FROM public.corretiva_problemas WHERE coalesce(status_gestor,'pendente') = 'pendente')
                    + (SELECT count(*) FROM public.refrigeracao_problemas WHERE coalesce(status_gestor,'pendente') = 'pendente')
      )
    ),
    'legal', (
      SELECT jsonb_build_object(
        'total', count(*),
        'vencidos', count(*) FILTER (WHERE concluido = false AND proxima_execucao < current_date),
        'proximos_30', count(*) FILTER (WHERE concluido = false AND proxima_execucao BETWEEN current_date AND current_date + 30)
      ) FROM public.legal_items
    ),
    'sst', (
      SELECT jsonb_build_object(
        'aso_vencidos', count(*) FILTER (WHERE ativo AND data_vencimento < current_date),
        'aso_proximos_30', count(*) FILTER (WHERE ativo AND data_vencimento BETWEEN current_date AND current_date + 30)
      ) FROM public.sst_colaboradores
    ),
    'taludes', (
      SELECT jsonb_build_object(
        'pt_ativas', count(*) FILTER (WHERE status IN ('liberada','em_andamento')),
        'pt_aguardando', count(*) FILTER (WHERE status IN ('solicitada','analise')),
        'pt_suspensas', count(*) FILTER (WHERE status = 'suspensa')
      ) FROM public.talude_pt_releases
    ),
    'notas_abertas', (SELECT count(*) FROM public.gestao_notas WHERE situacao <> 'concluida')
  ) INTO v_out;

  RETURN v_out;
END;
$$;-- Force GRANTs on all functions and views related to Centro de Gestão
-- This ensures that even if a previous migration had a specific argument signature mismatch,
-- the current one is correctly granted to the 'authenticated' role.

GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_gestao(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_module(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Ensure the view used by the function is accessible to 'authenticated'
-- The function is SECURITY DEFINER, but RLS on the view might still apply 
-- depending on how it's written.
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;

-- Ensure RLS on user_roles and other tables doesn't block has_role
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.user_pcm_roles TO authenticated;
GRANT SELECT ON public.user_module_access TO authenticated;
GRANT SELECT ON public.pcm_role_permissions TO authenticated;
GRANT SELECT ON public.pcm_permissions TO authenticated;

-- Also check if there are any other signatures for gestao_overview_v2
-- (e.g. if it was created without arguments or with a different default)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'gestao_overview_v2')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END LOOP;
END $$;
-- Correcting permissions for all Centro de Gestão functions and related views.
-- The user is reporting a 'permission denied for function gestao_overview_v2' error.
-- This script ensures that 'authenticated' users (like managers and admins) have explicit EXECUTE grants.

-- 1. Grant EXECUTE to 'authenticated' for the main overview function and all its variations/overloads.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'gestao_overview_v2')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END LOOP;
END $$;

-- 2. Ensure supporting functions are also callable
GRANT EXECUTE ON FUNCTION public.can_access_gestao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_module(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestao_status_canonico(text) TO authenticated, service_role;

-- 3. Ensure the underlying view and the tables it joins are accessible for the RPC to work.
-- Even though functions are SECURITY DEFINER, RLS on views can sometimes cause issues if not configured correctly.
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated, service_role;
GRANT SELECT ON public.backorder_os TO authenticated, service_role;
GRANT SELECT ON public.corretiva_os TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_os TO authenticated, service_role;
GRANT SELECT ON public.corretiva_pecas TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_pecas TO authenticated, service_role;
GRANT SELECT ON public.corretiva_problemas TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_problemas TO authenticated, service_role;

-- 4. Audit tables used for indicators
GRANT SELECT ON public.vehicles TO authenticated, service_role;
GRANT SELECT ON public.fleet_checklists TO authenticated, service_role;
GRANT SELECT ON public.fleet_fuelings TO authenticated, service_role;
GRANT SELECT ON public.vehicle_occurrences TO authenticated, service_role;
GRANT SELECT ON public.agua_prog_entregas TO authenticated, service_role;
GRANT SELECT ON public.agua_filtro_ativos TO authenticated, service_role;
GRANT SELECT ON public.material_solicitacoes TO authenticated, service_role;
GRANT SELECT ON public.legal_items TO authenticated, service_role;
GRANT SELECT ON public.sst_colaboradores TO authenticated, service_role;
GRANT SELECT ON public.talude_pt_releases TO authenticated, service_role;
GRANT SELECT ON public.gestao_notas TO authenticated, service_role;
GRANT SELECT ON public.gestor_dashboard_preferences TO authenticated, service_role;
-- Definitive fix for Centro de Gestão permissions.
-- We are encountering "permission denied for function gestao_overview_v2".
-- This migration forces EXECUTE permissions on all relevant functions and SELECT on all relevant views/tables.

-- 1. Grant EXECUTE to authenticated and service_role for all overloads of gestao_overview_v2
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'gestao_overview_v2')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', func_record.sig);
    END LOOP;
END $$;

-- 2. Grant EXECUTE to authenticated and service_role for security helpers
GRANT EXECUTE ON FUNCTION public.can_access_gestao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_module(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3. The function uses the view vw_gestao_os_consolidada which is defined as security_invoker = on.
-- This means the caller MUST have SELECT permission on the view and ALL underlying tables.
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated, service_role;

-- 4. Grant SELECT on all source tables used by the view and the overview function
GRANT SELECT ON public.backorder_os TO authenticated, service_role;
GRANT SELECT ON public.corretiva_os TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_os TO authenticated, service_role;
GRANT SELECT ON public.corretiva_pecas TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_pecas TO authenticated, service_role;
GRANT SELECT ON public.corretiva_problemas TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_problemas TO authenticated, service_role;
GRANT SELECT ON public.vehicles TO authenticated, service_role;
GRANT SELECT ON public.fleet_checklists TO authenticated, service_role;
GRANT SELECT ON public.fleet_fuelings TO authenticated, service_role;
GRANT SELECT ON public.vehicle_occurrences TO authenticated, service_role;
GRANT SELECT ON public.agua_prog_entregas TO authenticated, service_role;
GRANT SELECT ON public.agua_filtro_ativos TO authenticated, service_role;
GRANT SELECT ON public.material_solicitacoes TO authenticated, service_role;
GRANT SELECT ON public.legal_items TO authenticated, service_role;
GRANT SELECT ON public.sst_colaboradores TO authenticated, service_role;
GRANT SELECT ON public.talude_pt_releases TO authenticated, service_role;
GRANT SELECT ON public.gestao_notas TO authenticated, service_role;
GRANT SELECT ON public.gestor_dashboard_preferences TO authenticated, service_role;
GRANT SELECT ON public.user_roles TO authenticated, service_role;
GRANT SELECT ON public.user_pcm_roles TO authenticated, service_role;
GRANT SELECT ON public.pcm_role_permissions TO authenticated, service_role;
GRANT SELECT ON public.pcm_permissions TO authenticated, service_role;
GRANT SELECT ON public.user_module_access TO authenticated, service_role;

-- 5. Ensure the helper function pcm_fill_metrics is also available as it's often used in PCM Home
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'pcm_fill_metrics')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', func_record.sig);
    END LOOP;
END $$;
-- GRANTs for authenticated role were missing or not propagating correctly.
-- This migration explicitly grants SELECT on all relevant tables to 'authenticated'.

GRANT SELECT ON public.backorder_os TO authenticated;
GRANT SELECT ON public.corretiva_os TO authenticated;
GRANT SELECT ON public.refrigeracao_os TO authenticated;
GRANT SELECT ON public.corretiva_pecas TO authenticated;
GRANT SELECT ON public.refrigeracao_pecas TO authenticated;
GRANT SELECT ON public.corretiva_problemas TO authenticated;
GRANT SELECT ON public.refrigeracao_problemas TO authenticated;
GRANT SELECT ON public.vehicles TO authenticated;
GRANT SELECT ON public.fleet_checklists TO authenticated;
GRANT SELECT ON public.fleet_fuelings TO authenticated;
GRANT SELECT ON public.vehicle_occurrences TO authenticated;
GRANT SELECT ON public.agua_prog_entregas TO authenticated;
GRANT SELECT ON public.agua_filtro_ativos TO authenticated;
GRANT SELECT ON public.material_solicitacoes TO authenticated;
GRANT SELECT ON public.legal_items TO authenticated;
GRANT SELECT ON public.sst_colaboradores TO authenticated;
GRANT SELECT ON public.talude_pt_releases TO authenticated;
GRANT SELECT ON public.gestao_notas TO authenticated;
GRANT SELECT ON public.gestor_dashboard_preferences TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.user_pcm_roles TO authenticated;
GRANT SELECT ON public.pcm_role_permissions TO authenticated;
GRANT SELECT ON public.pcm_permissions TO authenticated;
GRANT SELECT ON public.user_module_access TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- And the view itself
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;
-- Phase 8 Revision: Refactoring Centro de Gestão for Robustness and Performance
-- Goal: Fix "aggregate functions are not allowed in GROUP BY" and optimize aggregations.

-- 1. Redefine status mapping (IMMUTABLE for indexing)
CREATE OR REPLACE FUNCTION public.gestao_status_canonico(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status IS NULL OR btrim(p_status) = '' THEN 'aberta'
    WHEN lower(unaccent_safe.s) ~ '(cancel|nao executad|não executad)' THEN 'cancelada'
    WHEN lower(unaccent_safe.s) ~ '(conclu|finaliz|fechad|encerrad|validad|atendid)' THEN 'concluida'
    WHEN lower(unaccent_safe.s) ~ '(execu|andamento|iniciad|progress)' THEN 'andamento'
    WHEN lower(unaccent_safe.s) ~ '(aguard|aprova|pendente|analise|análise|programad)' THEN 'pendente'
    ELSE 'aberta'
  END
  FROM (SELECT btrim(p_status) AS s) unaccent_safe
$$;

-- 2. Consolidated View (security_invoker=on for RLS protection)
-- We rebuild it with clean aliases and robust lateral joins.
-- Using DROP VIEW CASCADE to ensure we can recreate it with new owner/structure.
DROP VIEW IF EXISTS public.vw_gestao_os_consolidada CASCADE;

CREATE OR REPLACE VIEW public.vw_gestao_os_consolidada
WITH (security_invoker = on) AS
WITH bo AS (
  SELECT
    'backorder'::text AS origem,
    b.os::text        AS id,
    b.os::text        AS numero_os,
    coalesce(nullif(btrim(b.nome), ''), b.atividade) AS descricao,
    b.ativo,
    NULL::text        AS patrimonio,
    b.predio, b.andar, b.espaco AS local,
    coalesce(nullif(btrim(b.equipe), ''), 'Não atribuída') AS equipe,
    NULL::text        AS tecnico,
    CASE WHEN b.is_prioridade THEN 'alta' ELSE coalesce(b.prioridade_nivel::text, 'normal') END AS prioridade,
    coalesce(nullif(btrim(b.criticidade), ''), 'media') AS criticidade,
    CASE
      WHEN b.cancelado THEN 'cancelada'
      WHEN b.finalizado THEN 'concluida'
      ELSE public.gestao_status_canonico(b.status_origem)
    END AS status_canonico,
    coalesce(nullif(btrim(b.status_origem), ''), 'indefinido') AS status_origem,
    b.data_solicitacao AS criado_em,
    NULL::timestamptz  AS inicio,
    coalesce(b.data_conclusao, b.data_finalizacao) AS conclusao,
    b.termino_sla      AS prazo_sla
  FROM public.backorder_os b
),
cor AS (
  SELECT
    'corretiva'::text AS origem,
    c.id::text AS id,
    c.numero_os,
    c.nome_os AS descricao,
    c.ativo,
    c.patrimonio,
    c.predio,
    c.andar,
    c.local,
    coalesce(nullif(btrim(c.equipe), ''), 'Não atribuída') AS equipe,
    c.assinatura_nome AS tecnico,
    coalesce(nullif(btrim(c.tipo), ''), 'normal') AS prioridade,
    'media'::text AS criticidade,
    public.gestao_status_canonico(c.status::text) AS status_canonico,
    coalesce(nullif(btrim(c.status::text), ''), 'indefinido') AS status_origem,
    coalesce(c.data_criacao, c.created_at) AS criado_em,
    c.inicio,
    c.fim AS conclusao,
    c.data_sla AS prazo_sla
  FROM public.corretiva_os c
),
refr AS (
  SELECT
    'refrigeracao'::text AS origem,
    r.id::text AS id,
    r.numero_os,
    r.nome_os AS descricao,
    r.ativo,
    r.patrimonio,
    r.predio,
    r.andar,
    r.local,
    coalesce(nullif(btrim(r.equipe), ''), 'Refrigeração') AS equipe,
    NULL::text AS tecnico,
    coalesce(nullif(btrim(r.tipo), ''), 'normal') AS prioridade,
    'media'::text AS criticidade,
    public.gestao_status_canonico(r.status::text) AS status_canonico,
    coalesce(nullif(btrim(r.status::text), ''), 'indefinido') AS status_origem,
    r.created_at AS criado_em,
    r.inicio,
    r.fim AS conclusao,
    r.data_sla AS prazo_sla
  FROM public.refrigeracao_os r
),
base AS (
  SELECT * FROM bo
  UNION ALL SELECT * FROM cor
  UNION ALL SELECT * FROM refr
)
SELECT
  b.origem, b.id, b.numero_os, b.descricao, b.ativo, b.patrimonio,
  b.predio, b.andar, b.local, b.equipe, b.tecnico, b.prioridade, b.criticidade,
  b.status_canonico, b.status_origem,
  b.criado_em, b.inicio, b.conclusao, b.prazo_sla,
  (b.status_canonico NOT IN ('concluida','cancelada')
     AND b.prazo_sla IS NOT NULL AND b.prazo_sla < now()) AS atrasada,
  CASE WHEN b.prazo_sla IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (coalesce(b.conclusao, now()) - b.prazo_sla)) / 86400)::int
  END AS dias_atraso,
  CASE WHEN b.criado_em IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (coalesce(b.conclusao, now()) - b.criado_em)) / 3600)::numeric
  END AS horas_atendimento,
  CASE WHEN b.inicio IS NULL OR b.conclusao IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (b.conclusao - b.inicio)) / 3600)::numeric
  END AS horas_reparo,
  coalesce(pc.pendentes, 0) AS pecas_pendentes,
  coalesce(pb.total, 0)     AS problemas,
  -- Optimized reincidencia
  (SELECT count(*) FROM base b2 WHERE b2.ativo IS NOT NULL AND b2.ativo <> '' AND lower(btrim(b2.ativo)) = lower(btrim(b.ativo))) AS reincidencia
FROM base b
LEFT JOIN LATERAL (
  SELECT count(*) AS pendentes FROM (
    SELECT 1 FROM public.corretiva_pecas p WHERE b.origem = 'corretiva' AND p.os_id::text = b.id AND coalesce(p.status_gestor, 'pendente'::corretiva_status_gestor) = 'pendente'::corretiva_status_gestor
    UNION ALL
    SELECT 1 FROM public.refrigeracao_pecas p WHERE b.origem = 'refrigeracao' AND p.os_id::text = b.id AND coalesce(p.status_gestor, 'pendente'::refrig_status_gestor) = 'pendente'::refrig_status_gestor
  ) sub
) pc ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total FROM (
    SELECT 1 FROM public.corretiva_problemas p WHERE b.origem = 'corretiva' AND p.os_id::text = b.id
    UNION ALL
    SELECT 1 FROM public.refrigeracao_problemas p WHERE b.origem = 'refrigeracao' AND p.os_id::text = b.id
  ) sub
) pb ON true;

GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated, service_role;

-- 3. Executive Overview v2 (Safe Aggregation Pattern)
CREATE OR REPLACE FUNCTION public.gestao_overview_v2(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d    integer     := greatest(coalesce(p_dias, 30), 1);
  v_ini  timestamptz := now() - (v_d || ' days')::interval;
  v_pini timestamptz := now() - ((v_d * 2) || ' days')::interval;
  v_out  jsonb;
BEGIN
  IF NOT public.can_access_gestao('read') THEN
    RAISE EXCEPTION 'Sem permissão para o Centro de Gestão';
  END IF;

  WITH 
  base_os AS (
    SELECT * FROM public.vw_gestao_os_consolidada
  ),
  stats_os AS (
    SELECT 
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) as abertas,
      count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini) as concluidas,
      count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_pini AND conclusao < v_ini) as concluidas_ant,
      count(*) FILTER (WHERE criado_em >= v_ini) as criadas,
      count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini) as criadas_ant,
      count(*) FILTER (WHERE atrasada) as vencidas,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '24 hours') as vence_24h,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '48 hours') as vence_48h,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) as backlog,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criado_em < now() - interval '30 days') as backlog_30,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND (equipe IS NULL OR equipe = 'Não atribuída')) as sem_responsavel,
      count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini AND (prazo_sla IS NULL OR conclusao <= prazo_sla)) as sla_ok,
      round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini), 0)::numeric, 1) as tma_horas,
      round(coalesce(avg(horas_reparo) FILTER (WHERE conclusao >= v_ini), 0)::numeric, 1) as mttr_horas,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criticidade IN ('alta','critica','crítica')) as criticas
    FROM base_os
  ),
  status_group AS (
    SELECT status_canonico, count(*) as qtd FROM base_os GROUP BY 1
  ),
  aging_group AS (
    SELECT 
      CASE
        WHEN criado_em >= now() - interval '7 days'  THEN '0-7'
        WHEN criado_em >= now() - interval '30 days' THEN '8-30'
        WHEN criado_em >= now() - interval '90 days' THEN '31-90'
        ELSE '90+'
      END as faixa, 
      count(*) as qtd
    FROM base_os
    WHERE status_canonico NOT IN ('concluida','cancelada')
    GROUP BY 1
  ),
  equipe_group AS (
    SELECT 
      equipe,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) as abertas,
      count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini) as concluidas,
      count(*) FILTER (WHERE atrasada) as atrasadas,
      round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida'), 0)::numeric, 1) as tma_horas
    FROM base_os
    GROUP BY 1 
    ORDER BY count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) DESC 
    LIMIT 10
  ),
  predio_group AS (
    SELECT coalesce(nullif(btrim(predio),''),'Não informado') as predio, count(*) as abertas
    FROM base_os
    WHERE status_canonico NOT IN ('concluida','cancelada')
    GROUP BY 1 
    ORDER BY count(*) DESC 
    LIMIT 10
  ),
  reincidente_group AS (
    SELECT ativo, count(*) as ocorrencias
    FROM base_os
    WHERE ativo IS NOT NULL AND btrim(ativo) <> ''
    GROUP BY 1 
    HAVING count(*) > 1 
    ORDER BY count(*) DESC 
    LIMIT 10
  ),
  mensal_group AS (
    SELECT 
      to_char(date_trunc('month', criado_em), 'YYYY-MM') as mes,
      count(*) as criadas,
      count(*) FILTER (WHERE status_canonico = 'concluida') as concluidas,
      count(*) FILTER (WHERE status_canonico = 'cancelada') as canceladas
    FROM base_os
    WHERE criado_em >= date_trunc('month', now()) - interval '11 months'
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'periodo_dias', v_d,
    'gerado_em', now(),
    'os', (SELECT row_to_json(stats_os) FROM stats_os),
    'os_status', (SELECT coalesce(jsonb_object_agg(status_canonico, qtd), '{}'::jsonb) FROM status_group),
    'os_aging', (SELECT coalesce(jsonb_object_agg(faixa, qtd), '{}'::jsonb) FROM aging_group),
    'os_equipes', (SELECT coalesce(jsonb_agg(row_to_json(equipe_group)), '[]'::jsonb) FROM equipe_group),
    'os_predios', (SELECT coalesce(jsonb_agg(row_to_json(predio_group)), '[]'::jsonb) FROM predio_group),
    'os_reincidentes', (SELECT coalesce(jsonb_agg(row_to_json(reincidente_group)), '[]'::jsonb) FROM reincidente_group),
    'os_mensal', (SELECT coalesce(jsonb_agg(row_to_json(mensal_group) ORDER BY mes), '[]'::jsonb) FROM mensal_group),
    'frota', (
      SELECT jsonb_build_object(
        'total',        (SELECT count(*) FROM public.vehicles),
        'disponiveis',  (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'ativo') IN ('ativo','disponivel')),
        'bloqueados',   (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'') IN ('bloqueado','inativo')),
        'manutencao',   (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'') = 'manutencao'),
        'checklists',   (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini),
        'checklists_ant',(SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_pini AND created_at < v_ini),
        'reprovados',   (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini AND coalesce(overall_status,'ok') <> 'ok'),
        'custo',        (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'custo_ant',    (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_pini AND fueled_at < v_ini),
        'litros',       (SELECT coalesce(sum(liters),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'ocorrencias',  (SELECT count(*) FROM public.vehicle_occurrences WHERE coalesce(state,'aberta') NOT IN ('resolvida','fechada'))
      )
    ),
    'agua', (
      SELECT jsonb_build_object(
        'entregas',     count(*) FILTER (WHERE criado_em >= v_ini),
        'entregas_ant', count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini),
        'bags',         coalesce(sum(bags) FILTER (WHERE criado_em >= v_ini), 0),
        'bags_ant',     coalesce(sum(bags) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini), 0),
        'pendentes',    count(*) FILTER (WHERE criado_em >= v_ini AND coalesce(status,'') NOT IN ('concluida','entregue')),
        'bebedouros_nok', count(*) FILTER (WHERE criado_em >= v_ini AND bebedouro_ok = false),
        'sem_evidencia', count(*) FILTER (
            WHERE criado_em >= v_ini
              AND NOT EXISTS (SELECT 1 FROM public.agua_prog_fotos f WHERE f.entrega_id = e.id))
      ) FROM public.agua_prog_entregas e
    ),
    'filtros', (
      SELECT jsonb_build_object(
        'vencidos',   count(*) FILTER (WHERE proxima_troca IS NOT NULL AND proxima_troca < current_date),
        'proximos_30',count(*) FILTER (WHERE proxima_troca BETWEEN current_date AND current_date + 30)
      ) FROM public.agua_filtro_ativos
    ),
    'materiais', (
      SELECT jsonb_build_object(
        'pendentes', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','atendida')),
        'periodo',   count(*) FILTER (WHERE created_at >= v_ini),
        'periodo_ant', count(*) FILTER (WHERE created_at >= v_pini AND created_at < v_ini)
      ) FROM public.material_solicitacoes
    ),
    'pecas', (
      SELECT jsonb_build_object(
        'aguardando', (SELECT count(*) FROM public.corretiva_pecas WHERE coalesce(status_gestor,'pendente'::corretiva_status_gestor) = 'pendente'::corretiva_status_gestor)
                    + (SELECT count(*) FROM public.refrigeracao_pecas WHERE coalesce(status_gestor,'pendente'::refrig_status_gestor) = 'pendente'::refrig_status_gestor),
        'problemas',  (SELECT count(*) FROM public.corretiva_problemas WHERE coalesce(status_gestor,'pendente') = 'pendente')
                    + (SELECT count(*) FROM public.refrigeracao_problemas WHERE coalesce(status_gestor,'pendente') = 'pendente')
      )
    ),
    'legal', (
      SELECT jsonb_build_object(
        'total', count(*),
        'vencidos', count(*) FILTER (WHERE concluido = false AND proxima_execucao < current_date),
        'proximos_30', count(*) FILTER (WHERE concluido = false AND proxima_execucao BETWEEN current_date AND current_date + 30)
      ) FROM public.legal_items
    ),
    'sst', (
      SELECT jsonb_build_object(
        'aso_vencidos', count(*) FILTER (WHERE ativo AND data_vencimento < current_date),
        'aso_proximos_30', count(*) FILTER (WHERE ativo AND data_vencimento BETWEEN current_date AND current_date + 30)
      ) FROM public.sst_colaboradores
    ),
    'taludes', (
      SELECT jsonb_build_object(
        'pt_ativas', count(*) FILTER (WHERE status IN ('liberada','em_andamento')),
        'pt_aguardando', count(*) FILTER (WHERE status IN ('solicitada','analise')),
        'pt_suspensas', count(*) FILTER (WHERE status = 'suspensa')
      ) FROM public.talude_pt_releases
    ),
    'notas_abertas', (SELECT count(*) FROM public.gestao_notas WHERE situacao <> 'concluida')
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer) TO authenticated, service_role;
-- 4. Create OsConsolidada Record Function for Dashboard Lists
-- This replaces the direct view access for lists, allowing high-performance filtering.

CREATE OR REPLACE FUNCTION public.gestao_os_consolidada(
  p_dias integer DEFAULT 30,
  p_modulo text DEFAULT NULL,
  p_equipe text DEFAULT NULL,
  p_predio text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_criticidade text DEFAULT NULL,
  p_limit integer DEFAULT 800
)
RETURNS SETOF public.vw_gestao_os_consolidada
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.vw_gestao_os_consolidada
  WHERE 
    (p_modulo IS NULL OR origem = p_modulo)
    AND (p_equipe IS NULL OR equipe = p_equipe)
    AND (p_predio IS NULL OR predio = p_predio)
    AND (p_status IS NULL OR status_canonico = p_status)
    AND (p_criticidade IS NULL OR criticidade = p_criticidade)
    AND (
      status_canonico NOT IN ('concluida', 'cancelada')
      OR criado_em >= (now() - (coalesce(p_dias, 30) || ' days')::interval)
    )
  ORDER BY 
    CASE 
      WHEN status_canonico NOT IN ('concluida','cancelada') THEN 0
      ELSE 1
    END,
    CASE 
      WHEN criticidade IN ('alta','critica','crítica') THEN 0
      WHEN criticidade = 'media' THEN 1
      ELSE 2
    END,
    criado_em DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.gestao_os_consolidada(integer, text, text, text, text, text, integer) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.agua_exec_can(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.agua_can(required_action)
      OR (required_action IN ('read', 'create', 'update')
          AND public.can_access_module('agua-execucao', required_action));
$$;

GRANT EXECUTE ON FUNCTION public.agua_exec_can(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "agua_prog_pontos_auth" ON public.agua_prog_pontos;
DROP POLICY IF EXISTS "agua_prog_pontos_select" ON public.agua_prog_pontos;
DROP POLICY IF EXISTS "agua_prog_pontos_insert" ON public.agua_prog_pontos;
DROP POLICY IF EXISTS "agua_prog_pontos_update" ON public.agua_prog_pontos;
DROP POLICY IF EXISTS "agua_prog_pontos_delete" ON public.agua_prog_pontos;

CREATE POLICY "agua_prog_pontos_select" ON public.agua_prog_pontos
  FOR SELECT TO authenticated USING (public.agua_exec_can('read'));
CREATE POLICY "agua_prog_pontos_insert" ON public.agua_prog_pontos
  FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_prog_pontos_update" ON public.agua_prog_pontos
  FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_prog_pontos_delete" ON public.agua_prog_pontos
  FOR DELETE TO authenticated USING (public.agua_is_gestor());

DROP POLICY IF EXISTS "agua_prog_entregas_auth" ON public.agua_prog_entregas;
DROP POLICY IF EXISTS "agua_prog_entregas_select" ON public.agua_prog_entregas;
DROP POLICY IF EXISTS "agua_prog_entregas_insert" ON public.agua_prog_entregas;
DROP POLICY IF EXISTS "agua_prog_entregas_update" ON public.agua_prog_entregas;
DROP POLICY IF EXISTS "agua_prog_entregas_delete" ON public.agua_prog_entregas;

CREATE POLICY "agua_prog_entregas_select" ON public.agua_prog_entregas
  FOR SELECT TO authenticated USING (public.agua_exec_can('read'));
CREATE POLICY "agua_prog_entregas_insert" ON public.agua_prog_entregas
  FOR INSERT TO authenticated WITH CHECK (public.agua_exec_can('create'));
CREATE POLICY "agua_prog_entregas_update" ON public.agua_prog_entregas
  FOR UPDATE TO authenticated USING (public.agua_exec_can('update')) WITH CHECK (public.agua_exec_can('update'));
CREATE POLICY "agua_prog_entregas_delete" ON public.agua_prog_entregas
  FOR DELETE TO authenticated USING (public.agua_exec_can('update'));

DROP POLICY IF EXISTS "agua_prog_fotos_auth" ON public.agua_prog_fotos;
DROP POLICY IF EXISTS "agua_prog_fotos_select" ON public.agua_prog_fotos;
DROP POLICY IF EXISTS "agua_prog_fotos_insert" ON public.agua_prog_fotos;
DROP POLICY IF EXISTS "agua_prog_fotos_update" ON public.agua_prog_fotos;
DROP POLICY IF EXISTS "agua_prog_fotos_delete" ON public.agua_prog_fotos;

CREATE POLICY "agua_prog_fotos_select" ON public.agua_prog_fotos
  FOR SELECT TO authenticated USING (public.agua_exec_can('read'));
CREATE POLICY "agua_prog_fotos_insert" ON public.agua_prog_fotos
  FOR INSERT TO authenticated WITH CHECK (public.agua_exec_can('create'));
CREATE POLICY "agua_prog_fotos_update" ON public.agua_prog_fotos
  FOR UPDATE TO authenticated USING (public.agua_exec_can('update')) WITH CHECK (public.agua_exec_can('update'));
CREATE POLICY "agua_prog_fotos_delete" ON public.agua_prog_fotos
  FOR DELETE TO authenticated USING (public.agua_exec_can('update'));DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'corretivas@apontauto.local';
  IF v_uid IS NULL THEN
    RAISE NOTICE 'login corretivas nao encontrado';
    RETURN;
  END IF;

  UPDATE auth.users
     SET email = 'manutencao@apontauto.local',
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('email', 'manutencao@apontauto.local', 'nome', 'Manutenção'),
         updated_at = now()
   WHERE id = v_uid;

  UPDATE auth.identities
     SET identity_data = coalesce(identity_data, '{}'::jsonb)
           || jsonb_build_object('email', 'manutencao@apontauto.local'),
         updated_at = now()
   WHERE user_id = v_uid AND provider = 'email';
END $$;CREATE OR REPLACE FUNCTION public.admin_readonly_query(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := btrim(coalesce(_sql, ''));
  low text;
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem consultar dados.';
  END IF;

  q := regexp_replace(q, ';+\s*$', '');
  low := lower(q);

  IF low !~ '^(select|with)\s' THEN
    RAISE EXCEPTION 'Somente consultas de leitura (SELECT) são permitidas.';
  END IF;
  IF position(';' in q) > 0 THEN
    RAISE EXCEPTION 'Apenas uma consulta por vez.';
  END IF;
  IF low ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|do|merge|refresh|comment|reindex|set|reset|listen|notify|lock)\M' THEN
    RAISE EXCEPTION 'Comando não permitido em consulta de leitura.';
  END IF;
  IF low ~ '\m(auth|vault|storage|pg_catalog|information_schema|pg_shadow|pg_authid)\s*\.' THEN
    RAISE EXCEPTION 'Esquema restrito.';
  END IF;
  IF low ~ 'pg_read_file|pg_ls_dir|dblink|pg_sleep|lo_import|lo_export' THEN
    RAISE EXCEPTION 'Função não permitida.';
  END IF;

  EXECUTE format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s limit 500) t', q) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_readonly_query(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_readonly_query(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_readonly_query(text) TO service_role;CREATE TABLE public.programacao_semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  semana integer NOT NULL CHECK (semana BETWEEN 1 AND 53),
  liberada boolean NOT NULL DEFAULT false,
  liberada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  liberada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, semana)
);

GRANT SELECT, INSERT, UPDATE ON public.programacao_semanas TO authenticated;
GRANT ALL ON public.programacao_semanas TO service_role;

ALTER TABLE public.programacao_semanas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver semanas"
  ON public.programacao_semanas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins podem criar semanas"
  ON public.programacao_semanas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem atualizar semanas"
  ON public.programacao_semanas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_programacao_semanas_updated_at
  BEFORE UPDATE ON public.programacao_semanas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();insert into public.profiles (id, full_name, allowed_menus)
values ('c47ad322-a4d2-4efc-b43a-89ed5f55529b','Corretivas - Campo', array['corretiva','corretiva-historico'])
on conflict (id) do update set full_name = excluded.full_name, allowed_menus = excluded.allowed_menus;

delete from public.user_roles where user_id = 'c47ad322-a4d2-4efc-b43a-89ed5f55529b';
insert into public.user_roles (user_id, role) values ('c47ad322-a4d2-4efc-b43a-89ed5f55529b','user');

delete from public.user_module_access where user_id = 'c47ad322-a4d2-4efc-b43a-89ed5f55529b';
insert into public.user_module_access (user_id, module_key, actions, granted_by)
values
  ('c47ad322-a4d2-4efc-b43a-89ed5f55529b','corretiva', array['read','create','update'], '5cf1aedb-82f7-4d43-9892-4013f32f07b9'),
  ('c47ad322-a4d2-4efc-b43a-89ed5f55529b','corretiva-historico', array['read'], '5cf1aedb-82f7-4d43-9892-4013f32f07b9');insert into public.user_module_access (user_id, module_key)
select u.id, k
from auth.users u
cross join unnest(array['corretiva','corretiva-historico','corretiva-pecas-status','refrigeracao','refrigeracao-historico','refrigeracao-pecas-status','preventiva-ac','materiais-os','programacao','apontamentos']) as k
where u.email in ('corretivas@apontauto.local','manutencao@apontauto.local')
on conflict do nothing;
-- Tabela de Organograma
CREATE TABLE IF NOT EXISTS public.organograma (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    cargo text NOT NULL,
    email text,
    foto_url text,
    parent_id uuid REFERENCES public.organograma(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organograma TO authenticated;
GRANT ALL ON public.organograma TO service_role;

-- RLS
ALTER TABLE public.organograma ENABLE ROW LEVEL SECURITY;

-- Política de leitura: todos autenticados
CREATE POLICY "Todos podem ver o organograma"
ON public.organograma FOR SELECT
TO authenticated
USING (true);

-- Política de escrita restrita
CREATE POLICY "Apenas admin e gabrielvlp podem editar"
ON public.organograma FOR ALL
TO authenticated
USING (
  auth.email() = 'gabrielvlp33@gmail.com' OR 
  split_part(auth.email(), '@', 1) = 'admin'
);
CREATE OR REPLACE FUNCTION public.provision_encarregados_login(_admin_id uuid, _password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_id uuid;
    _email text := 'encarregados@apontauto.local';
    _login text := 'encarregados';
    _full_name text := 'Encarregados';
    _modules text[] := ARRAY[
        'dashboard',
        'programacao-gps', 'backlog-inteligente', 'capacidade', 'apontamentos', 
        'refrigeracao', 'refrigeracao-pecas-status', 'refrigeracao-historico',
        'programacao', 'corretiva', 'corretiva-pecas-status', 'corretiva-historico',
        'abastecimento', 'agua-execucao'
    ];
    _actions text[] := ARRAY['read'];
BEGIN
    -- Only admin can run this
    IF NOT public.has_role(_admin_id, 'admin') THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    -- Look for existing user
    SELECT id INTO _user_id FROM auth.users WHERE email = _email;

    IF _user_id IS NULL THEN
        -- Create user
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, recovery_sent_at, last_sign_in_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', _email, crypt(_password, gen_salt('bf')),
            now(), now(), now(),
            jsonb_build_object('provider', 'email', 'providers', array['email']),
            jsonb_build_object('login', _login, 'full_name', _full_name),
            now(), now(), '', '', '', ''
        ) RETURNING id INTO _user_id;
    ELSE
        -- Update password
        UPDATE auth.users 
        SET encrypted_password = crypt(_password, gen_salt('bf')),
            updated_at = now(),
            raw_user_meta_data = jsonb_build_object('login', _login, 'full_name', _full_name)
        WHERE id = _user_id;
    END IF;

    -- Profile
    INSERT INTO public.profiles (id, full_name, allowed_menus)
    VALUES (_user_id, _full_name, _modules)
    ON CONFLICT (id) DO UPDATE SET 
        full_name = EXCLUDED.full_name,
        allowed_menus = EXCLUDED.allowed_menus;

    -- Role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Module Access
    DELETE FROM public.user_module_access WHERE user_id = _user_id;
    INSERT INTO public.user_module_access (user_id, module_key, actions, granted_by)
    SELECT _user_id, unnest(_modules), _actions, _admin_id;

    RETURN json_build_object('ok', true, 'user_id', _user_id, 'email', _email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_encarregados_login(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_encarregados_login(uuid, text) TO service_role;
DROP FUNCTION IF EXISTS public.provision_encarregados_login(uuid, text);

CREATE OR REPLACE FUNCTION public.provision_encarregados_login(_admin_id uuid, _password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_id uuid;
    _email text := 'encarregados@apontauto.local';
    _login text := 'encarregados';
    _full_name text := 'Encarregados';
    -- Módulos solicitados: Planejamento PCM, Ordens de Serviço e Frota/Abastecimento
    _modules text[] := ARRAY[
        'dashboard',
        -- PCM
        'programacao-gps', 'backlog-inteligente', 'capacidade', 'apontamentos', 
        'refrigeracao', 'refrigeracao-pecas-status', 'refrigeracao-historico',
        -- OS
        'programacao', 'corretiva', 'corretiva-pecas-status', 'corretiva-historico',
        -- Frota
        'abastecimento', 'agua-execucao'
    ];
    -- Somente monitoramento (leitura)
    _actions text[] := ARRAY['read'];
BEGIN
    -- Verifica se o chamador é admin
    IF NOT public.has_role(_admin_id, 'admin') THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    -- Busca usuário existente
    SELECT id INTO _user_id FROM auth.users WHERE email = _email;

    IF _user_id IS NULL THEN
        -- Cria novo usuário operacional
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, recovery_sent_at, last_sign_in_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', _email, crypt(_password, gen_salt('bf')),
            now(), now(), now(),
            jsonb_build_object('provider', 'email', 'providers', array['email']),
            jsonb_build_object('login', _login, 'full_name', _full_name),
            now(), now(), '', '', '', ''
        ) RETURNING id INTO _user_id;
    ELSE
        -- Atualiza senha e metadados
        UPDATE auth.users 
        SET encrypted_password = crypt(_password, gen_salt('bf')),
            updated_at = now(),
            raw_user_meta_data = jsonb_build_object('login', _login, 'full_name', _full_name)
        WHERE id = _user_id;
    END IF;

    -- Profiles
    INSERT INTO public.profiles (id, full_name, allowed_menus)
    VALUES (_user_id, _full_name, _modules)
    ON CONFLICT (id) DO UPDATE SET 
        full_name = EXCLUDED.full_name,
        allowed_menus = EXCLUDED.allowed_menus;

    -- Papel
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Permissões de Módulo (somente 'read')
    DELETE FROM public.user_module_access WHERE user_id = _user_id;
    INSERT INTO public.user_module_access (user_id, module_key, actions, granted_by)
    SELECT _user_id, unnest(_modules), _actions, _admin_id;

    RETURN json_build_object('ok', true, 'user_id', _user_id, 'email', _email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_encarregados_login(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_encarregados_login(uuid, text) TO service_role;
ALTER TABLE public.backorder_os ADD COLUMN centro_custo text DEFAULT '';ALTER TABLE public.backorder_os ADD COLUMN IF NOT EXISTS data_abertura TIMESTAMPTZ;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backorder_os TO authenticated;
GRANT ALL ON public.backorder_os TO service_role;CREATE TABLE public.organizational_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    photo_url TEXT,
    level INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#6366f1',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizational_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.organizational_members TO authenticated;
GRANT ALL ON public.organizational_members TO service_role;
GRANT SELECT ON public.organizational_members TO anon;

CREATE POLICY "Allow public read access" ON public.organizational_members FOR SELECT USING (true);
CREATE POLICY "Allow admin all access" ON public.organizational_members 
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'email' = 'admin@admin.com' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

INSERT INTO public.organizational_members (name, role, level, color, display_order) VALUES
('Anne H. Cavalcante', 'ADM/RH', 0, '#ec4899', 1),
('Adriana Gergye', 'TST', 1, '#f59e0b', 2),
('Carlos G. Marrese', 'Coordenador de operações IFM', 1, '#10b981', 3),
('Risomar P. Costa', 'Supervisora Soft', 2, '#06b6d4', 4),
('Reynaldo Carpinetti', 'Supervisor de manutenção', 2, '#8b5cf6', 5),
('Thalita T. Correa', 'Mensageria', 3, '#ec4899', 6),
('Debora Keiko', 'Supervisora Uniformes', 3, '#f59e0b', 7),
('Edimacio Messias', 'Encarregado Manutenção', 3, '#8b5cf6', 8),
('Jessica C. Barone', 'Supervisora Serviços', 3, '#06b6d4', 9),
('Felipe França', 'Encarregado Manutenção', 3, '#8b5cf6', 10),
('Zilda F. de Souza', 'Líder Limpeza', 4, '#06b6d4', 11),
('Gabriel V. Lemos', 'Planejador/Programador', 4, '#6366f1', 12),
('José Erisvaldo', 'Líder Jardinagem', 4, '#10b981', 13),
('Solange Maria', 'Líder Limpeza', 4, '#06b6d4', 14);-- Explicitly grant permissions to authenticated and service_role for talude tables
-- These grants were missing from the information_schema check, which is a common cause for "no results" in the UI.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;

GRANT SELECT, INSERT ON public.talude_map_versions TO authenticated;
GRANT ALL ON public.talude_map_versions TO service_role;

GRANT SELECT, INSERT ON public.talude_geometry_events TO authenticated;
GRANT ALL ON public.talude_geometry_events TO service_role;

-- Ensure the RLS policies also allow admins to see everything
-- Re-creating select policies to include admin bypass

DROP POLICY IF EXISTS "Own maps: select" ON public.talude_maps;
CREATE POLICY "Maps: select" ON public.talude_maps 
  FOR SELECT TO authenticated 
  USING (
    auth.uid() = owner_id 
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Own marc: select" ON public.talude_marcacoes;
CREATE POLICY "Marc: select" ON public.talude_marcacoes 
  FOR SELECT TO authenticated 
  USING (
    auth.uid() = owner_id 
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_map_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_geometry_events TO authenticated;

GRANT ALL ON public.talude_maps TO service_role;
GRANT ALL ON public.talude_marcacoes TO service_role;
GRANT ALL ON public.talude_map_versions TO service_role;
GRANT ALL ON public.talude_geometry_events TO service_role;

GRANT SELECT ON public.talude_maps TO anon;
GRANT SELECT ON public.talude_marcacoes TO anon;

-- Ensure RLS is enabled
ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talude_marcacoes ENABLE ROW LEVEL SECURITY;

-- Re-create policies to be more permissive for initial troubleshooting
DROP POLICY IF EXISTS "Maps: select" ON public.talude_maps;
CREATE POLICY "Maps: select" ON public.talude_maps 
FOR SELECT TO authenticated, anon 
USING (true);

DROP POLICY IF EXISTS "Marc: select" ON public.talude_marcacoes;
CREATE POLICY "Marc: select" ON public.talude_marcacoes 
FOR SELECT TO authenticated, anon 
USING (true);

DROP POLICY IF EXISTS "Maps: insert" ON public.talude_maps;
CREATE POLICY "Maps: insert" ON public.talude_maps 
FOR INSERT TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Marc: insert" ON public.talude_marcacoes;
CREATE POLICY "Marc: insert" ON public.talude_marcacoes 
FOR INSERT TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Maps: update" ON public.talude_maps;
CREATE POLICY "Maps: update" ON public.talude_maps 
FOR UPDATE TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Marc: update" ON public.talude_marcacoes;
CREATE POLICY "Marc: update" ON public.talude_marcacoes 
FOR UPDATE TO authenticated 
USING (true);
UPDATE public.talude_maps SET image_url = '/__l5e/assets-v1/1bda0cea-f1a2-48c3-a2f8-830326712b26/taludes-mapa.webp' WHERE nome = 'Mapa Principal Demarchi';DELETE FROM public.talude_marcacoes WHERE map_id IN (SELECT id FROM public.talude_maps WHERE nome = 'Mapa Principal Demarchi');
DELETE FROM public.talude_maps WHERE nome = 'Mapa Principal Demarchi';
-- Verify and add owner_id to talude_maps if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'talude_maps' AND column_name = 'owner_id') THEN
        ALTER TABLE public.talude_maps ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;
END
$$;

-- Ensure RLS is enabled
ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;

-- Drop existing policies if any to avoid duplicates
DROP POLICY IF EXISTS "Users can view all talude maps" ON public.talude_maps;
DROP POLICY IF EXISTS "Admins can manage all talude maps" ON public.talude_maps;

-- Define policies
CREATE POLICY "Users can view all talude maps" 
ON public.talude_maps FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage all talude maps" 
ON public.talude_maps FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT ALL ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;
GRANT ALL ON public.talude_marcacoes TO service_role;
GRANT SELECT ON public.talude_maps TO anon;
GRANT SELECT ON public.talude_marcacoes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_os TO authenticated;
GRANT ALL ON public.corretiva_os TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.user_module_access TO authenticated;
GRANT ALL ON public.user_module_access TO service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.corretiva_os ADD COLUMN tipo_importacao text DEFAULT 'padrao';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_os TO authenticated;
GRANT ALL ON public.corretiva_os TO service_role;