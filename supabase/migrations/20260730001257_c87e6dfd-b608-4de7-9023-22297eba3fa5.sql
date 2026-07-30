CREATE OR REPLACE FUNCTION public.tg_agua_filtro_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE permitido public.agua_filtro_situacao[];
BEGIN
  IF NEW.situacao = OLD.situacao THEN RETURN NEW; END IF;

  permitido := CASE OLD.situacao::text
    WHEN 'solicitada' THEN ARRAY['em_triagem','aprovada','rejeitada','cancelada']
    WHEN 'aberta' THEN ARRAY['em_triagem','aprovada','rejeitada','cancelada']
    WHEN 'em_triagem' THEN ARRAY['aprovada','rejeitada','aguardando_material','cancelada']
    WHEN 'aprovada' THEN ARRAY['aguardando_material','programada','cancelada']
    WHEN 'aguardando_material' THEN ARRAY['programada','cancelada']
    WHEN 'programada' THEN ARRAY['em_deslocamento','em_execucao','aguardando_material','cancelada']
    WHEN 'em_deslocamento' THEN ARRAY['em_execucao','cancelada']
    WHEN 'em_execucao' THEN ARRAY['concluida','aguardando_material','cancelada']
    WHEN 'em_atendimento' THEN ARRAY['concluida','aguardando_material','cancelada']
    WHEN 'concluida' THEN ARRAY['validada','reaberta']
    WHEN 'reaberta' THEN ARRAY['em_triagem','aprovada','programada','cancelada']
    WHEN 'rejeitada' THEN ARRAY['reaberta']
    ELSE ARRAY[]::text[]
  END::public.agua_filtro_situacao[];

  IF NOT (NEW.situacao = ANY (permitido)) THEN
    RAISE EXCEPTION 'Transição de solicitação inválida: % -> %', OLD.situacao, NEW.situacao
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;