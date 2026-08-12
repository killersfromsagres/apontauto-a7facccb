-- Forçar a recriação da estrutura de dados consolidada
DROP VIEW IF EXISTS public.vw_gestao_os_consolidada CASCADE;
DROP VIEW IF EXISTS public.vw_gestao_os_corretiva_novo CASCADE;

-- Sincronização de Corretiva Novo com Centro de Gestão
CREATE OR REPLACE VIEW public.vw_gestao_os_corretiva_novo AS
SELECT 
    'corretiva_novo'::text AS origem,
    (c.id)::text AS id,
    c.numero_os,
    c.nome_os AS descricao,
    c.ativo,
    c.patrimonio,
    c.predio,
    c.andar,
    c.local,
    COALESCE(NULLIF(trim(c.equipe), ''), 'Não atribuída') AS equipe,
    c.solicitante AS tecnico,
    COALESCE(NULLIF(trim(c.tipo), ''), 'normal') AS prioridade,
    'media'::text AS criticidade,
    CASE 
        WHEN c.status::text = 'concluida' THEN 'concluida'
        ELSE 'aberta'
    END AS status_canonico,
    COALESCE(NULLIF(trim(c.status::text), ''), 'indefinido') AS status_origem,
    COALESCE(c.data_criacao::timestamptz, c.created_at) AS criado_em,
    c.inicio AS inicio,
    c.fim AS conclusao,
    c.data_sla::timestamptz AS prazo_sla
FROM public.corretiva_os c;

GRANT SELECT ON public.vw_gestao_os_corretiva_novo TO authenticated;
GRANT SELECT ON public.vw_gestao_os_corretiva_novo TO service_role;

-- Recriar a View Consolidada incluindo a nova fonte
CREATE OR REPLACE VIEW public.vw_gestao_os_consolidada AS
  WITH bo AS (
          SELECT 'backorder'::text AS origem,
             b_1.os AS id,
             b_1.os AS numero_os,
             COALESCE(NULLIF(btrim(b_1.nome), ''::text), b_1.atividade) AS descricao,
             b_1.ativo,
             NULL::text AS patrimonio,
             b_1.predio,
             b_1.andar,
             b_1.espaco AS local,
             COALESCE(NULLIF(btrim(b_1.equipe), ''::text), 'Não atribuída'::text) AS equipe,
             NULL::text AS tecnico,
                 CASE
                     WHEN b_1.is_prioridade THEN 'alta'::text
                     ELSE COALESCE((b_1.prioridade_nivel)::text, 'normal'::text)
                 END AS prioridade,
             COALESCE(NULLIF(btrim(b_1.criticidade), ''::text), 'media'::text) AS criticidade,
                 CASE
                     WHEN b_1.cancelado THEN 'cancelada'::text
                     WHEN b_1.finalizado THEN 'concluida'::text
                     ELSE gestao_status_canonico(b_1.status_origem)
                 END AS status_canonico,
             COALESCE(NULLIF(btrim(b_1.status_origem), ''::text), 'indefinido'::text) AS status_origem,
             b_1.data_solicitacao AS criado_em,
             NULL::timestamp with time zone AS inicio,
             COALESCE(b_1.data_conclusao, b_1.data_finalizacao) AS conclusao,
             b_1.termino_sla AS prazo_sla
            FROM backorder_os b_1
         ), cor AS (
          SELECT * FROM public.vw_gestao_os_corretiva_novo
         ), ref AS (
          SELECT 'refrigeracao'::text AS origem,
             (r.id)::text AS id,
             r.numero_os,
             r.nome_os AS descricao,
             r.ativo,
             r.patrimonio,
             r.predio,
             r.andar,
             r.local,
             'Refrigeração'::text AS equipe,
             NULL::text AS tecnico,
             'normal'::text AS prioridade,
             'media'::text AS criticidade,
                 CASE
                     WHEN (r.status::text = 'concluida') THEN 'concluida'::text
                     ELSE 'aberta'::text
                 END AS status_canonico,
             r.status::text AS status_origem,
             r.created_at AS criado_em,
             r.inicio,
             r.fim AS conclusao,
             r.data_sla::timestamptz AS prazo_sla
            FROM refrigeracao_os r
         )
 SELECT bo.origem, bo.id, bo.numero_os, bo.descricao, bo.ativo, bo.patrimonio, bo.predio, bo.andar, bo.local, bo.equipe, bo.tecnico, bo.prioridade, bo.criticidade, bo.status_canonico, bo.status_origem, bo.criado_em, bo.inicio, bo.conclusao, bo.prazo_sla,
        CASE WHEN bo.prazo_sla IS NOT NULL AND bo.conclusao IS NULL AND now() > bo.prazo_sla THEN true ELSE false END as atrasada,
        CASE WHEN bo.prazo_sla IS NOT NULL AND bo.conclusao IS NULL AND now() > bo.prazo_sla THEN extract(day from (now() - bo.prazo_sla)) ELSE 0 END as dias_atraso,
        CASE WHEN bo.conclusao IS NOT NULL THEN extract(hour from (bo.conclusao - bo.criado_em)) ELSE extract(hour from (now() - bo.criado_em)) END as horas_atendimento,
        CASE WHEN bo.conclusao IS NOT NULL AND bo.inicio IS NOT NULL THEN extract(hour from (bo.conclusao - bo.inicio)) ELSE NULL END as horas_reparo
   FROM bo
UNION ALL
 SELECT cor.origem, cor.id, cor.numero_os, cor.descricao, cor.ativo, cor.patrimonio, cor.predio, cor.andar, cor.local, cor.equipe, cor.tecnico, cor.prioridade, cor.criticidade, cor.status_canonico, cor.status_origem, cor.criado_em, cor.inicio, cor.conclusao, cor.prazo_sla,
        CASE WHEN cor.prazo_sla IS NOT NULL AND cor.conclusao IS NULL AND now() > cor.prazo_sla THEN true ELSE false END as atrasada,
        CASE WHEN cor.prazo_sla IS NOT NULL AND cor.conclusao IS NULL AND now() > cor.prazo_sla THEN extract(day from (now() - cor.prazo_sla)) ELSE 0 END as dias_atraso,
        CASE WHEN cor.conclusao IS NOT NULL THEN extract(hour from (cor.conclusao - cor.criado_em)) ELSE extract(hour from (now() - cor.criado_em)) END as horas_atendimento,
        CASE WHEN cor.conclusao IS NOT NULL AND cor.inicio IS NOT NULL THEN extract(hour from (cor.conclusao - cor.inicio)) ELSE NULL END as horas_reparo
   FROM cor
UNION ALL
 SELECT ref.origem, ref.id, ref.numero_os, ref.descricao, ref.ativo, ref.patrimonio, ref.predio, ref.andar, ref.local, ref.equipe, ref.tecnico, ref.prioridade, ref.criticidade, ref.status_canonico, ref.status_origem, ref.criado_em, ref.inicio, ref.conclusao, ref.prazo_sla,
        CASE WHEN ref.prazo_sla IS NOT NULL AND ref.conclusao IS NULL AND now() > ref.prazo_sla THEN true ELSE false END as atrasada,
        CASE WHEN ref.prazo_sla IS NOT NULL AND ref.conclusao IS NULL AND now() > ref.prazo_sla THEN extract(day from (now() - ref.prazo_sla)) ELSE 0 END as dias_atraso,
        CASE WHEN ref.conclusao IS NOT NULL THEN extract(hour from (ref.conclusao - ref.criado_em)) ELSE extract(hour from (now() - ref.criado_em)) END as horas_atendimento,
        CASE WHEN ref.conclusao IS NOT NULL AND ref.inicio IS NOT NULL THEN extract(hour from (ref.conclusao - ref.inicio)) ELSE NULL END as horas_reparo
   FROM ref;

GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;
GRANT SELECT ON public.vw_gestao_os_consolidada TO service_role;

-- Restaurar a função RPC dependente se ela foi removida pelo CASCADE
CREATE OR REPLACE FUNCTION public.gestao_os_consolidada(
  p_dias integer DEFAULT 30,
  p_origem text DEFAULT NULL,
  p_equipe text DEFAULT NULL,
  p_predio text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_prioridade text DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS SETOF public.vw_gestao_os_consolidada
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM public.vw_gestao_os_consolidada
  WHERE (criado_em >= (now() - (p_dias || ' days')::interval) OR conclusao >= (now() - (p_dias || ' days')::interval))
    AND (p_origem IS NULL OR origem = p_origem)
    AND (p_equipe IS NULL OR equipe = p_equipe)
    AND (p_predio IS NULL OR predio = p_predio)
    AND (p_status IS NULL OR status_canonico = p_status)
    AND (p_prioridade IS NULL OR prioridade = p_prioridade)
  ORDER BY criado_em DESC
  LIMIT p_limit;
$$;
