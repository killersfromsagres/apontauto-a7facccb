
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
