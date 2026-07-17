
ALTER TABLE public.backorder_os ADD COLUMN IF NOT EXISTS criticidade text NOT NULL DEFAULT '';

UPDATE public.backorder_os
SET criticidade = outros,
    outros = ''
WHERE criticidade = ''
  AND translate(upper(outros), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')
      ~ '^(MEDIA|ALTA|BAIXA|URGENTE|EMERGENCIAL|EMERGENCIA|CRITICA|CRITICO|NORMAL|MEDIA/ALTA|MEDIA/BAIXA)$';
