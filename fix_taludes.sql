-- First check if tables exist and have correct structure
DO $$ 
BEGIN
    -- Ensure talude_maps table is correct
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'talude_maps') THEN
        CREATE TABLE public.talude_maps (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome TEXT NOT NULL,
            image_url TEXT NOT NULL,
            image_width INTEGER NOT NULL,
            image_height INTEGER NOT NULL,
            owner_id UUID REFERENCES auth.users(id),
            created_at TIMESTAMPTZ DEFAULT now()
        );
    END IF;

    -- Ensure talude_marcacoes table is correct
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'talude_marcacoes') THEN
        CREATE TABLE public.talude_marcacoes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            map_id UUID REFERENCES public.talude_maps(id) ON DELETE CASCADE,
            nome TEXT,
            rotulo TEXT,
            polygon JSONB NOT NULL,
            cor TEXT DEFAULT '#ef4444',
            opacidade FLOAT DEFAULT 0.3,
            visivel BOOLEAN DEFAULT true,
            bloqueado BOOLEAN DEFAULT false,
            espessura_linha FLOAT DEFAULT 4.0,
            numero INTEGER,
            owner_id UUID REFERENCES auth.users(id),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    END IF;

    -- Add espessura_linha if missing
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'talude_marcacoes' AND column_name = 'espessura_linha') THEN
        ALTER TABLE public.talude_marcacoes ADD COLUMN espessura_linha FLOAT DEFAULT 4.0;
    END IF;

    -- Add updated_at if missing
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'talude_marcacoes' AND column_name = 'updated_at') THEN
        ALTER TABLE public.talude_marcacoes ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- Grant permissions (Crucial for Cloud environment)
GRANT ALL ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;
GRANT ALL ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;

-- Fix RLS: Since we use supabaseAdmin in server functions, we can be more permissive or just ensure they exist
ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talude_marcacoes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public read maps" ON public.talude_maps;
DROP POLICY IF EXISTS "Authenticated can manage maps" ON public.talude_maps;
DROP POLICY IF EXISTS "Public read marcacoes" ON public.talude_marcacoes;
DROP POLICY IF EXISTS "Authenticated can manage marcacoes" ON public.talude_marcacoes;

CREATE POLICY "Allow authenticated read maps" ON public.talude_maps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated manage maps" ON public.talude_maps FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read marcacoes" ON public.talude_marcacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated manage marcacoes" ON public.talude_marcacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ensure anon has read access if needed for preview
GRANT SELECT ON public.talude_maps TO anon;
GRANT SELECT ON public.talude_marcacoes TO anon;
CREATE POLICY "Allow anon read maps" ON public.talude_maps FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read marcacoes" ON public.talude_marcacoes FOR SELECT TO anon USING (true);
