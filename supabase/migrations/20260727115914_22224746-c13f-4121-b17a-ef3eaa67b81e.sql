ALTER TABLE public.corretiva_os
  ADD COLUMN IF NOT EXISTS solicitante text,
  ADD COLUMN IF NOT EXISTS data_criacao date;