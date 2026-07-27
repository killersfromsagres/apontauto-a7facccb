ALTER TABLE public.corretiva_pecas ADD COLUMN IF NOT EXISTS modelo text;

ALTER TABLE public.corretiva_os ADD COLUMN IF NOT EXISTS assinatura_url text;
ALTER TABLE public.corretiva_os ADD COLUMN IF NOT EXISTS assinatura_nome text;
ALTER TABLE public.corretiva_os ADD COLUMN IF NOT EXISTS assinatura_em timestamptz;