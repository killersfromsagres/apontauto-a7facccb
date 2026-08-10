-- 1. Garantir que as tabelas de auditoria de imagem existam com as colunas corretas
CREATE TABLE IF NOT EXISTS public.image_uploads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    module_key text NOT NULL,
    entity_type text,
    entity_id text,
    sha256 text,
    size_bytes bigint,
    mime_type text,
    url text NOT NULL,
    delete_url text,
    created_at timestamptz DEFAULT now()
);

-- 2. Habilitar RLS em tudo que for crítico
ALTER TABLE public.image_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_os ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

-- 3. GRANTs fundamentais (O PostgREST precisa de permissão explícita na public)
GRANT SELECT, INSERT, UPDATE ON public.image_uploads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_os TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_fotos TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.user_module_access TO authenticated;

GRANT ALL ON public.image_uploads TO service_role;
GRANT ALL ON public.corretiva_os TO service_role;
GRANT ALL ON public.corretiva_fotos TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.user_module_access TO service_role;

-- 4. Políticas de RLS para image_uploads (Auditória)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can see their own uploads') THEN
        CREATE POLICY "Users can see their own uploads" ON public.image_uploads FOR SELECT TO authenticated USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own uploads') THEN
        CREATE POLICY "Users can insert their own uploads" ON public.image_uploads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can see all uploads') THEN
        CREATE POLICY "Admins can see all uploads" ON public.image_uploads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
    END IF;
END $$;

-- 5. Garantir que a função has_role seja SECURITY DEFINER para evitar recursão
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- 6. Política para corretiva_os (Garantir que todos autenticados possam ler e editar conforme o fluxo)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage OS') THEN
        CREATE POLICY "Authenticated users can manage OS" ON public.corretiva_os FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 7. Política para corretiva_fotos
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage photos') THEN
        CREATE POLICY "Authenticated users can manage photos" ON public.corretiva_fotos FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;
