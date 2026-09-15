CREATE OR REPLACE FUNCTION public.ensure_corretiva_completion_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluida'::public.corretiva_os_status
     AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.fim IS NULL) THEN
    NEW.fim := COALESCE(NEW.fim, now()::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_corretiva_completion_consistency ON public.corretiva_os;
CREATE TRIGGER trg_corretiva_completion_consistency
BEFORE UPDATE OF status ON public.corretiva_os
FOR EACH ROW
EXECUTE FUNCTION public.ensure_corretiva_completion_consistency();
