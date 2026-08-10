CREATE OR REPLACE FUNCTION public.tg_backorder_status_cat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.status_cat := public.backorder_status_cat(NEW.status_origem);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.backorder_bulk_upsert(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received bigint := 0;
  v_new bigint := 0;
  v_upd bigint := 0;
  v_total bigint := 0;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para importar backorder';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'O lote da importação deve ser uma lista de OS';
  END IF;

  v_received := jsonb_array_length(p_rows);

  CREATE TEMP TABLE _bo_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_rows) AS x(
    os text, nome text, ativo text, predio text, andar text, espaco text,
    atividade text, equipe text, termino_sla timestamptz, data_solicitacao timestamptz,
    outros text, criticidade text, revisao_manual boolean,
    origem_predio_andar_espaco text, origem_equipe text,
    status_origem text, status_cat text, finalizado boolean, cancelado boolean,
    data_conclusao timestamptz
  );

  DELETE FROM _bo_in WHERE os IS NULL OR btrim(os) = '';
  DELETE FROM _bo_in a USING _bo_in b
   WHERE a.ctid < b.ctid AND btrim(a.os) = btrim(b.os);

  UPDATE _bo_in SET os = btrim(os);
  SELECT count(*) INTO v_total FROM _bo_in;

  SELECT count(*) INTO v_new
    FROM _bo_in i LEFT JOIN public.backorder_os o ON o.os = i.os
   WHERE o.os IS NULL;
  v_upd := v_total - v_new;

  INSERT INTO public.backorder_os AS o (
    os, nome, ativo, predio, andar, espaco, atividade, equipe,
    termino_sla, data_solicitacao, outros, criticidade, revisao_manual,
    origem_predio_andar_espaco, origem_equipe, status_origem, status_cat,
    finalizado, cancelado, data_conclusao, data_finalizacao
  )
  SELECT
    i.os, coalesce(i.nome,''), coalesce(i.ativo,''), coalesce(i.predio,''),
    coalesce(i.andar,''), coalesce(i.espaco,''), coalesce(i.atividade,'Outros'),
    coalesce(i.equipe,'Outros'), i.termino_sla, coalesce(i.data_solicitacao, now()),
    coalesce(i.outros,''), coalesce(i.criticidade,''), coalesce(i.revisao_manual,false),
    coalesce(i.origem_predio_andar_espaco,'pendente'), coalesce(i.origem_equipe,'regra_local'),
    coalesce(i.status_origem,''), public.backorder_status_cat(i.status_origem),
    coalesce(i.finalizado,false), coalesce(i.cancelado,false), i.data_conclusao,
    CASE WHEN coalesce(i.finalizado,false) THEN coalesce(i.data_conclusao, now()) END
  FROM _bo_in i
  ON CONFLICT (os) DO UPDATE SET
    nome = EXCLUDED.nome,
    ativo = EXCLUDED.ativo,
    predio = CASE WHEN EXCLUDED.predio <> '' THEN EXCLUDED.predio ELSE o.predio END,
    andar = CASE WHEN EXCLUDED.andar <> '' THEN EXCLUDED.andar ELSE o.andar END,
    espaco = CASE WHEN EXCLUDED.espaco <> '' THEN EXCLUDED.espaco ELSE o.espaco END,
    atividade = CASE WHEN o.atividade_manual THEN o.atividade ELSE EXCLUDED.atividade END,
    equipe = CASE WHEN o.atividade_manual THEN o.equipe ELSE EXCLUDED.equipe END,
    termino_sla = EXCLUDED.termino_sla,
    data_solicitacao = EXCLUDED.data_solicitacao,
    outros = EXCLUDED.outros,
    criticidade = EXCLUDED.criticidade,
    revisao_manual = CASE WHEN o.atividade_manual THEN false ELSE EXCLUDED.revisao_manual END,
    origem_predio_andar_espaco = EXCLUDED.origem_predio_andar_espaco,
    origem_equipe = CASE WHEN o.atividade_manual THEN 'regra_aprendida' ELSE EXCLUDED.origem_equipe END,
    status_origem = EXCLUDED.status_origem,
    status_cat = EXCLUDED.status_cat,
    cancelado = EXCLUDED.cancelado,
    data_conclusao = EXCLUDED.data_conclusao,
    finalizado = EXCLUDED.finalizado,
    data_finalizacao = CASE
      WHEN EXCLUDED.finalizado THEN coalesce(EXCLUDED.data_conclusao, o.data_finalizacao, now())
      ELSE NULL
    END,
    atualizado_em = now();

  RETURN jsonb_build_object(
    'recebidas', v_received,
    'total', v_total,
    'novas', v_new,
    'atualizadas', v_upd,
    'ignoradas', v_received - v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backorder_bulk_upsert(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.backorder_bulk_upsert(jsonb) TO authenticated;