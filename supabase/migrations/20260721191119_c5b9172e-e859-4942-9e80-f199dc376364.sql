
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
