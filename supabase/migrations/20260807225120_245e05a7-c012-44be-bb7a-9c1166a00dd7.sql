
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
