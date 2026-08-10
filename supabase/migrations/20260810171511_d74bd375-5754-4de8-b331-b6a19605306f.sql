-- 1. Garantir que a tabela de auditoria existe
CREATE TABLE IF NOT EXISTS public.image_uploads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
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

-- 2. Habilitar RLS em todas as tabelas críticas
ALTER TABLE public.image_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_os ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretiva_pecas ENABLE ROW LEVEL SECURITY;

-- 3. Grants de acesso (Necessário para API REST do Supabase)
GRANT SELECT, INSERT, UPDATE ON public.image_uploads TO authenticated;
GRANT ALL ON public.image_uploads TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_os TO authenticated;
GRANT ALL ON public.corretiva_os TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_fotos TO authenticated;
GRANT ALL ON public.corretiva_fotos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_pecas TO authenticated;
GRANT ALL ON public.corretiva_pecas TO service_role;

-- 4. Políticas de Segurança (RLS)
DO $$ 
BEGIN
    -- Auditoria
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own uploads' AND tablename = 'image_uploads') THEN
        CREATE POLICY "Users can manage their own uploads" ON public.image_uploads FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;

    -- OS Corretiva (Permite que qualquer usuário logado veja e edite OS, fotos e peças)
    -- Em um sistema mais restrito, poderíamos filtrar por equipe aqui.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage OS data' AND tablename = 'corretiva_os') THEN
        CREATE POLICY "Authenticated users can manage OS data" ON public.corretiva_os FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage photo evidence' AND tablename = 'corretiva_fotos') THEN
        CREATE POLICY "Authenticated users can manage photo evidence" ON public.corretiva_fotos FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage parts requests' AND tablename = 'corretiva_pecas') THEN
        CREATE POLICY "Authenticated users can manage parts requests" ON public.corretiva_pecas FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;
