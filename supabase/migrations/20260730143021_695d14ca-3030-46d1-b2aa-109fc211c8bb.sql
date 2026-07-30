ALTER TABLE public.agua_prog_entregas
  ADD COLUMN IF NOT EXISTS bebedouro_ok boolean,
  ADD COLUMN IF NOT EXISTS bebedouro_obs text;