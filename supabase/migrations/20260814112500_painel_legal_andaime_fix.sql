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
