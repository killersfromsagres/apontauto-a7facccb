-- Ensure the column exists and RLS allows the update/insert of the new field
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'legal_items' AND column_name = 'precisa_andaime'
  ) THEN
    ALTER TABLE public.legal_items ADD COLUMN precisa_andaime BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Explicitly grant permissions again to be sure
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_items TO authenticated;
GRANT ALL ON public.legal_items TO service_role;

-- Re-apply RLS just in case there was a mismatch in column visibility
ALTER TABLE public.legal_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Legal items readable by authenticated" ON public.legal_items;
CREATE POLICY "Legal items readable by authenticated" ON public.legal_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Legal items insertable by authenticated" ON public.legal_items;
CREATE POLICY "Legal items insertable by authenticated" ON public.legal_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Legal items updatable by authenticated" ON public.legal_items;
CREATE POLICY "Legal items updatable by authenticated" ON public.legal_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Legal items deletable by authenticated" ON public.legal_items;
CREATE POLICY "Legal items deletable by authenticated" ON public.legal_items FOR DELETE TO authenticated USING (true);
