
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
