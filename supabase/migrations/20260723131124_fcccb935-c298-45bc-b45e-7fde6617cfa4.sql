
ALTER TABLE public.refrigeracao_pecas
  ADD COLUMN IF NOT EXISTS patrimonio TEXT,
  ADD COLUMN IF NOT EXISTS modelo TEXT,
  ADD COLUMN IF NOT EXISTS btus TEXT;

CREATE INDEX IF NOT EXISTS idx_refrig_os_ativo_equip
  ON public.refrigeracao_os (ativo, equipamento);

CREATE OR REPLACE FUNCTION public.tg_refrig_os_propagate_patrimonio()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.patrimonio IS NOT NULL
     AND btrim(NEW.patrimonio) <> ''
     AND (OLD.patrimonio IS DISTINCT FROM NEW.patrimonio)
  THEN
    UPDATE public.refrigeracao_os
       SET patrimonio = NEW.patrimonio
     WHERE id <> NEW.id
       AND ativo = NEW.ativo
       AND equipamento = NEW.equipamento
       AND (patrimonio IS NULL OR btrim(patrimonio) = '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refrig_os_propagate_patrim ON public.refrigeracao_os;
CREATE TRIGGER trg_refrig_os_propagate_patrim
AFTER UPDATE OF patrimonio ON public.refrigeracao_os
FOR EACH ROW
EXECUTE FUNCTION public.tg_refrig_os_propagate_patrimonio();
