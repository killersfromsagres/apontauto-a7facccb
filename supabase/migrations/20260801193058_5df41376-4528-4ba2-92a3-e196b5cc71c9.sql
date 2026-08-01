CREATE OR REPLACE FUNCTION public.backorder_clear_all()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  n bigint;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para limpar o backorder';
  END IF;
  
  SELECT count(*) INTO n FROM public.backorder_os;
  
  -- DELETE em PostgreSQL exige WHERE em alguns contextos de segurança, 'WHERE true' é a forma explícita.
  DELETE FROM public.backorder_os WHERE true;
  
  RETURN n;
END;
$$;
