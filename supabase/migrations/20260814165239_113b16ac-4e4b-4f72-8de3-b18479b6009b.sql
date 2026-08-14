
-- Ensure the table exists and grants are correct
GRANT SELECT, INSERT, UPDATE ON public.rondas_calhas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rondas_calhas TO anon;
GRANT ALL ON public.rondas_calhas TO service_role;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view all rondas" ON public.rondas_calhas;
DROP POLICY IF EXISTS "Users can insert rondas" ON public.rondas_calhas;
DROP POLICY IF EXISTS "Users can update rondas" ON public.rondas_calhas;

-- Create robust policies
CREATE POLICY "Enable read access for all users"
ON public.rondas_calhas FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Enable insert access for all users"
ON public.rondas_calhas FOR INSERT
TO authenticated, anon
WITH CHECK (true);

CREATE POLICY "Enable update access for all users"
ON public.rondas_calhas FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);
