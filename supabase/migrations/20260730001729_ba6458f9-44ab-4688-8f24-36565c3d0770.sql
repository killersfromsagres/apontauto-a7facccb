-- ============================================================
-- 15.1 Permissões
-- ============================================================
INSERT INTO public.pcm_permissions (key, module_key, action, label) VALUES
  ('water_delivery.view',               'abastecimento-agua', 'view',               'Água — visualizar'),
  ('water_delivery.plan',               'abastecimento-agua', 'plan',               'Água — programar'),
  ('water_delivery.assign',             'abastecimento-agua', 'assign',             'Água — atribuir rota'),
  ('water_delivery.execute',            'abastecimento-agua', 'execute',            'Água — executar rota'),
  ('water_delivery.correct',            'abastecimento-agua', 'correct',            'Água — retificar registro'),
  ('water_delivery.manage',             'abastecimento-agua', 'manage',             'Água — gerenciar módulo'),
  ('water_delivery.export',             'abastecimento-agua', 'export',             'Água — exportar'),
  ('water_delivery.photos.view',        'abastecimento-agua', 'photos.view',        'Água — ver evidências'),
  ('water_delivery.photos.upload',      'abastecimento-agua', 'photos.upload',      'Água — enviar evidências'),
  ('water_delivery.whatsapp.share',     'abastecimento-agua', 'whatsapp.share',     'Água — compartilhar no WhatsApp'),
  ('water_delivery.whatsapp.automatic', 'abastecimento-agua', 'whatsapp.automatic', 'Água — envio automático WhatsApp'),
  ('water_bags.manage',                 'agua-bags',          'manage',             'Bags — gerenciar'),
  ('water_filters.view',                'agua-filtros',       'view',               'Filtros — visualizar'),
  ('water_filters.request',             'agua-filtros',       'request',            'Filtros — solicitar'),
  ('water_filters.triage',              'agua-filtros',       'triage',             'Filtros — triagem/aprovação'),
  ('water_filters.execute',             'agua-filtros',       'execute',            'Filtros — executar troca'),
  ('water_filters.manage',              'agua-filtros',       'manage',             'Filtros — gerenciar'),
  ('water_filters.export',              'agua-filtros',       'export',             'Filtros — exportar')
ON CONFLICT (key) DO UPDATE SET module_key = EXCLUDED.module_key,
                                action = EXCLUDED.action,
                                label = EXCLUDED.label;

-- ============================================================
-- 15.2 Papéis
-- ============================================================
INSERT INTO public.pcm_roles (key, label) VALUES
  ('solicitante_filtro', 'Solicitante de Filtro'),
  ('tecnico_filtro',     'Técnico de Filtro')
ON CONFLICT (key) DO NOTHING;

-- operador_frota: executa a rota atribuída e envia evidências
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_frota', k FROM unnest(ARRAY[
  'water_delivery.execute','water_delivery.photos.view','water_delivery.photos.upload',
  'water_delivery.whatsapp.share','abastecimento-agua:read','abastecimento-agua:create',
  'abastecimento-agua:update'
]) k
ON CONFLICT DO NOTHING;

-- gestor_frota / gestor_pcm / administrador / proprietario: gestão completa
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r, k
  FROM unnest(ARRAY['gestor_frota','gestor_pcm','administrador','proprietario']) r
 CROSS JOIN unnest(ARRAY[
  'water_delivery.view','water_delivery.plan','water_delivery.assign','water_delivery.execute',
  'water_delivery.correct','water_delivery.manage','water_delivery.export',
  'water_delivery.photos.view','water_delivery.photos.upload',
  'water_delivery.whatsapp.share','water_delivery.whatsapp.automatic',
  'water_bags.manage',
  'water_filters.view','water_filters.request','water_filters.triage',
  'water_filters.execute','water_filters.manage','water_filters.export',
  'abastecimento-agua:read','abastecimento-agua:create','abastecimento-agua:update','abastecimento-agua:delete'
]) k
ON CONFLICT DO NOTHING;

-- solicitante_filtro: abre e acompanha as próprias solicitações
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'solicitante_filtro', k FROM unnest(ARRAY[
  'water_filters.request','water_filters.view','abastecimento-agua:read'
]) k
ON CONFLICT DO NOTHING;

-- tecnico_filtro: executa as trocas atribuídas
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico_filtro', k FROM unnest(ARRAY[
  'water_filters.execute','water_filters.view',
  'water_delivery.photos.upload','abastecimento-agua:read','abastecimento-agua:update'
]) k
ON CONFLICT DO NOTHING;

-- Garantia explícita: corretiva e climatização NÃO recebem acesso automático.
DELETE FROM public.pcm_role_permissions
 WHERE role_key IN ('tecnico_corretiva','tecnico_climatizacao')
   AND (permission_key LIKE 'water\_%' OR permission_key LIKE 'abastecimento-agua:%');

-- ============================================================
-- Helpers de permissão
-- ============================================================
CREATE OR REPLACE FUNCTION public.agua_perm(_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.user_pcm_roles ur
       JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
       WHERE ur.user_id = auth.uid() AND rp.permission_key = _perm
    ) OR EXISTS (
      SELECT 1 FROM public.pcm_permissions p
       JOIN public.user_module_access uma
         ON uma.user_id = auth.uid() AND uma.module_key = p.module_key
       WHERE p.key = _perm
         AND (p.action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.agua_is_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.frota_is_gestor()
      OR public.can_access_module('abastecimento-agua', 'update')
      OR public.agua_perm('water_delivery.manage')
      OR public.agua_perm('water_filters.manage');
$$;

CREATE OR REPLACE FUNCTION public.agua_can(required_action text DEFAULT 'read'::text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.frota_can(required_action)
      OR public.can_access_module('abastecimento-agua', required_action)
      OR public.agua_perm('water_delivery.manage')
      OR CASE required_action
           WHEN 'read' THEN public.agua_perm('water_delivery.view')
                          OR public.agua_perm('water_delivery.execute')
                          OR public.agua_perm('water_delivery.plan')
                          OR public.agua_perm('water_filters.view')
                          OR public.agua_perm('water_filters.request')
                          OR public.agua_perm('water_filters.execute')
           WHEN 'create' THEN public.agua_perm('water_delivery.execute')
                            OR public.agua_perm('water_delivery.plan')
                            OR public.agua_perm('water_filters.request')
           WHEN 'update' THEN public.agua_perm('water_delivery.execute')
                            OR public.agua_perm('water_delivery.plan')
                            OR public.agua_perm('water_filters.execute')
           WHEN 'export' THEN public.agua_perm('water_delivery.export')
                            OR public.agua_perm('water_filters.export')
           ELSE false
         END;
$$;

-- Nome do usuário logado, normalizado (rotas guardam o colaborador por nome).
CREATE OR REPLACE FUNCTION public.agua_meu_nome()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT nullif(lower(btrim(coalesce(p.full_name, ''))), '')
    FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- Operador "puro": executa, mas não planeja nem gerencia -> escopo restrito.
CREATE OR REPLACE FUNCTION public.agua_escopo_restrito()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.agua_perm('water_delivery.execute')
     AND NOT public.agua_perm('water_delivery.manage')
     AND NOT public.agua_perm('water_delivery.plan')
     AND NOT public.agua_perm('water_delivery.view')
     AND NOT public.frota_is_gestor()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.agua_rota_minha(_rota_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agua_rotas r
     WHERE r.id = _rota_id
       AND (
         r.criado_por = auth.uid()
         OR (public.agua_meu_nome() IS NOT NULL AND public.agua_meu_nome() IN (
              lower(btrim(coalesce(r.colaborador_principal, ''))),
              lower(btrim(coalesce(r.colaborador_secundario, ''))),
              lower(btrim(coalesce(r.supervisor, '')))
            ))
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.agua_rota_ativa(_rota_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agua_rotas r
     WHERE r.id = _rota_id
       AND r.status::text IN ('pronta', 'em_andamento', 'pausada')
  );
$$;

-- Solicitante/técnico de filtro sem visão ampla -> só enxerga o que é dele.
CREATE OR REPLACE FUNCTION public.agua_filtro_escopo_restrito()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (public.agua_perm('water_filters.request') OR public.agua_perm('water_filters.execute'))
     AND NOT public.agua_perm('water_filters.manage')
     AND NOT public.agua_perm('water_filters.triage')
     AND NOT public.agua_perm('water_filters.view')
     AND NOT public.frota_is_gestor()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- ============================================================
-- 15.3 Políticas RLS
-- ============================================================

-- Rotas ------------------------------------------------------
DROP POLICY IF EXISTS agua_rotas_select ON public.agua_rotas;
CREATE POLICY agua_rotas_select ON public.agua_rotas FOR SELECT TO authenticated
USING (
  (public.agua_can('read') AND NOT public.agua_escopo_restrito())
  OR (public.agua_escopo_restrito() AND public.agua_rota_minha(id))
);

DROP POLICY IF EXISTS agua_rotas_update ON public.agua_rotas;
CREATE POLICY agua_rotas_update ON public.agua_rotas FOR UPDATE TO authenticated
USING (
  public.agua_is_gestor()
  OR (public.agua_can('update') AND NOT public.agua_escopo_restrito())
  OR (public.agua_rota_minha(id) AND public.agua_rota_ativa(id))
)
WITH CHECK (
  public.agua_is_gestor()
  OR (public.agua_can('update') AND NOT public.agua_escopo_restrito())
  OR public.agua_rota_minha(id)
);

-- Paradas ----------------------------------------------------
DROP POLICY IF EXISTS agua_visitas_select ON public.agua_visitas;
CREATE POLICY agua_visitas_select ON public.agua_visitas FOR SELECT TO authenticated
USING (
  (public.agua_can('read') AND NOT public.agua_escopo_restrito())
  OR (public.agua_escopo_restrito() AND rota_id IS NOT NULL AND public.agua_rota_minha(rota_id))
);

DROP POLICY IF EXISTS agua_visitas_insert ON public.agua_visitas;
CREATE POLICY agua_visitas_insert ON public.agua_visitas FOR INSERT TO authenticated
WITH CHECK (
  public.agua_is_gestor()
  OR ((public.agua_can('create') OR public.agua_can('update')) AND NOT public.agua_escopo_restrito())
  OR (rota_id IS NOT NULL AND public.agua_rota_minha(rota_id) AND public.agua_rota_ativa(rota_id))
);

DROP POLICY IF EXISTS agua_visitas_update ON public.agua_visitas;
CREATE POLICY agua_visitas_update ON public.agua_visitas FOR UPDATE TO authenticated
USING (
  public.agua_is_gestor()
  OR ((public.agua_can('update')) AND NOT public.agua_escopo_restrito())
  OR (rota_id IS NOT NULL AND public.agua_rota_minha(rota_id) AND public.agua_rota_ativa(rota_id))
)
WITH CHECK (
  public.agua_is_gestor()
  OR ((public.agua_can('update')) AND NOT public.agua_escopo_restrito())
  OR (rota_id IS NOT NULL AND public.agua_rota_minha(rota_id))
);

-- Registro finalizado só muda com gestor (retificação registrada em trilha).
CREATE OR REPLACE FUNCTION public.tg_agua_visita_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status::text IN ('concluida','parcial','sem_necessidade','acesso_bloqueado',
                          'local_fechado','falta_bags','endereco_divergente',
                          'reprogramada','nao_realizada','cancelada')
     AND NOT public.agua_is_gestor() THEN
    RAISE EXCEPTION 'Parada finalizada: peça a retificação ao gestor.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agua_visita_imutavel ON public.agua_visitas;
CREATE TRIGGER agua_visita_imutavel BEFORE UPDATE ON public.agua_visitas
FOR EACH ROW EXECUTE FUNCTION public.tg_agua_visita_imutavel();

CREATE OR REPLACE FUNCTION public.tg_agua_rota_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status::text IN ('concluida','concluida_com_divergencia','cancelada')
     AND NOT public.agua_is_gestor() THEN
    RAISE EXCEPTION 'Rota encerrada: apenas o gestor pode retificar.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agua_rota_imutavel ON public.agua_rotas;
CREATE TRIGGER agua_rota_imutavel BEFORE UPDATE ON public.agua_rotas
FOR EACH ROW EXECUTE FUNCTION public.tg_agua_rota_imutavel();

-- Evidências -------------------------------------------------
DROP POLICY IF EXISTS agua_fotos_select ON public.agua_fotos;
CREATE POLICY agua_fotos_select ON public.agua_fotos FOR SELECT TO authenticated
USING (
  (public.agua_can('read') AND NOT public.agua_escopo_restrito())
  OR (public.agua_escopo_restrito() AND rota_id IS NOT NULL AND public.agua_rota_minha(rota_id))
  OR enviada_por = auth.uid()
);

DROP POLICY IF EXISTS agua_fotos_insert ON public.agua_fotos;
CREATE POLICY agua_fotos_insert ON public.agua_fotos FOR INSERT TO authenticated
WITH CHECK (
  enviada_por = auth.uid()
  AND (
    public.agua_is_gestor()
    OR public.agua_perm('water_delivery.photos.upload')
    OR public.agua_can('create')
    OR public.agua_can('update')
  )
);

-- Operador nunca apaga evidência: DELETE segue exclusivo do gestor.
DROP POLICY IF EXISTS agua_fotos_delete ON public.agua_fotos;
CREATE POLICY agua_fotos_delete ON public.agua_fotos FOR DELETE TO authenticated
USING (public.agua_is_gestor());

-- Programação: leitura ampla, escrita só gestor/planejador ----
DROP POLICY IF EXISTS agua_prog_insert ON public.agua_programacao;
CREATE POLICY agua_prog_insert ON public.agua_programacao FOR INSERT TO authenticated
WITH CHECK (public.agua_is_gestor() OR public.agua_perm('water_delivery.plan'));

DROP POLICY IF EXISTS agua_prog_update ON public.agua_programacao;
CREATE POLICY agua_prog_update ON public.agua_programacao FOR UPDATE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_delivery.plan'))
WITH CHECK (public.agua_is_gestor() OR public.agua_perm('water_delivery.plan'));

DROP POLICY IF EXISTS agua_prog_delete ON public.agua_programacao;
CREATE POLICY agua_prog_delete ON public.agua_programacao FOR DELETE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_delivery.plan'));

-- Bags -------------------------------------------------------
DROP POLICY IF EXISTS agua_bag_tipos_insert ON public.agua_bag_tipos;
CREATE POLICY agua_bag_tipos_insert ON public.agua_bag_tipos FOR INSERT TO authenticated
WITH CHECK (public.agua_is_gestor() OR public.agua_perm('water_bags.manage'));

DROP POLICY IF EXISTS agua_bag_tipos_update ON public.agua_bag_tipos;
CREATE POLICY agua_bag_tipos_update ON public.agua_bag_tipos FOR UPDATE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_bags.manage'))
WITH CHECK (public.agua_is_gestor() OR public.agua_perm('water_bags.manage'));

DROP POLICY IF EXISTS agua_bag_tipos_delete ON public.agua_bag_tipos;
CREATE POLICY agua_bag_tipos_delete ON public.agua_bag_tipos FOR DELETE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_bags.manage'));

-- Solicitações de filtro -------------------------------------
DROP POLICY IF EXISTS agua_filtro_select ON public.agua_filtro_solicitacoes;
CREATE POLICY agua_filtro_select ON public.agua_filtro_solicitacoes FOR SELECT TO authenticated
USING (
  (public.agua_can('read') AND NOT public.agua_filtro_escopo_restrito())
  OR criado_por = auth.uid()
  OR atendida_por = auth.uid()
  OR (public.agua_meu_nome() IS NOT NULL AND public.agua_meu_nome() IN (
        lower(btrim(coalesce(responsavel_nome, ''))),
        lower(btrim(coalesce(responsavel_2_nome, '')))
     ))
);

DROP POLICY IF EXISTS agua_filtro_insert ON public.agua_filtro_solicitacoes;
CREATE POLICY agua_filtro_insert ON public.agua_filtro_solicitacoes FOR INSERT TO authenticated
WITH CHECK (
  (criado_por IS NULL OR criado_por = auth.uid())
  AND (public.agua_can('create') OR public.agua_perm('water_filters.request'))
);

DROP POLICY IF EXISTS agua_filtro_update ON public.agua_filtro_solicitacoes;
CREATE POLICY agua_filtro_update ON public.agua_filtro_solicitacoes FOR UPDATE TO authenticated
USING (
  public.agua_is_gestor()
  OR public.agua_perm('water_filters.triage')
  OR (public.agua_can('update') AND NOT public.agua_filtro_escopo_restrito())
  OR atendida_por = auth.uid()
  OR (public.agua_perm('water_filters.execute') AND public.agua_meu_nome() IS NOT NULL
      AND public.agua_meu_nome() IN (
        lower(btrim(coalesce(responsavel_nome, ''))),
        lower(btrim(coalesce(responsavel_2_nome, '')))))
  OR (criado_por = auth.uid() AND situacao::text IN ('solicitada','aberta','em_triagem','reaberta'))
)
WITH CHECK (
  public.agua_is_gestor()
  OR public.agua_perm('water_filters.triage')
  OR (public.agua_can('update') AND NOT public.agua_filtro_escopo_restrito())
  OR atendida_por = auth.uid()
  OR public.agua_perm('water_filters.execute')
  OR criado_por = auth.uid()
);

DROP POLICY IF EXISTS agua_filtro_delete ON public.agua_filtro_solicitacoes;
CREATE POLICY agua_filtro_delete ON public.agua_filtro_solicitacoes FOR DELETE TO authenticated
USING (public.agua_is_gestor() OR public.agua_perm('water_filters.manage'));

-- ============================================================
-- Views com dados de contato mascarados
-- ============================================================
CREATE OR REPLACE VIEW public.agua_pontos_operacao
WITH (security_invoker = on) AS
SELECT p.id, p.codigo, p.predio, p.andar, p.espaco, p.descricao, p.bags_padrao,
       p.bag_tipo, p.bag_tipo_id, p.bag_capacidade_litros, p.estoque_minimo,
       p.janela_inicio, p.janela_fim, p.ordem, p.prioridade, p.frequencia,
       p.tempo_estimado_min, p.acesso_observacoes, p.requer_epi, p.epi_descricao,
       p.veiculo_recomendado, p.latitude, p.longitude, p.imagem_url, p.ativo,
       p.arquivado_em, p.criado_em, p.atualizado_em,
       CASE WHEN public.agua_is_gestor() THEN p.contato_nome
            ELSE nullif(split_part(coalesce(p.contato_nome, ''), ' ', 1), '') END AS contato_nome,
       CASE WHEN public.agua_is_gestor() THEN p.contato_telefone
            WHEN p.contato_telefone IS NULL THEN NULL
            ELSE repeat('*', greatest(length(regexp_replace(p.contato_telefone, '\D', '', 'g')) - 4, 0))
                 || right(regexp_replace(p.contato_telefone, '\D', '', 'g'), 4) END AS contato_telefone
  FROM public.agua_pontos p;

GRANT SELECT ON public.agua_pontos_operacao TO authenticated;

CREATE OR REPLACE VIEW public.agua_filtro_solicitacoes_operacao
WITH (security_invoker = on) AS
SELECT s.id, s.numero, s.ponto_id, s.ativo_id, s.tipo, s.prioridade, s.situacao,
       s.descricao, s.predio, s.andar_setor, s.espaco, s.motivos, s.motivo_outro,
       s.origem, s.sla_horas, s.vence_em, s.prevista_para, s.programada_em,
       s.concluida_em, s.validada_em, s.reaberturas, s.responsavel_nome,
       s.responsavel_2_nome, s.criado_por, s.atendida_por, s.criado_em, s.atualizado_em,
       CASE WHEN public.agua_is_gestor() OR s.criado_por = auth.uid() THEN s.solicitante_nome
            ELSE nullif(split_part(coalesce(s.solicitante_nome, ''), ' ', 1), '') END AS solicitante_nome,
       CASE WHEN public.agua_is_gestor() OR s.criado_por = auth.uid() THEN s.telefone
            WHEN s.telefone IS NULL THEN NULL
            ELSE repeat('*', greatest(length(regexp_replace(s.telefone, '\D', '', 'g')) - 4, 0))
                 || right(regexp_replace(s.telefone, '\D', '', 'g'), 4) END AS telefone
  FROM public.agua_filtro_solicitacoes s;

GRANT SELECT ON public.agua_filtro_solicitacoes_operacao TO authenticated;