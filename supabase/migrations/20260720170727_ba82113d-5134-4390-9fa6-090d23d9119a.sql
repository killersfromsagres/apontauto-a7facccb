
ALTER TABLE public.preventiva_ac_registros
  ADD COLUMN IF NOT EXISTS status_equipamento TEXT,
  ADD COLUMN IF NOT EXISTS quantidade_fluido TEXT;

UPDATE public.profiles
SET allowed_menus = ARRAY['refrigeracao','refrigeracao-historico','preventiva-ac']
WHERE id = 'fbda7bd9-924d-4f8d-8264-cb74853ae676';
