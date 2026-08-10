-- Helpers de acesso por família de módulo
CREATE OR REPLACE FUNCTION public.can_access_corretiva(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('corretiva', required_action)
      OR public.can_access_module('corretiva-gestor', required_action)
      OR public.can_access_module('corretiva-historico', required_action)
      OR public.can_access_module('corretiva-pecas-status', required_action);
$$;

CREATE OR REPLACE FUNCTION public.can_write_corretiva(required_action text DEFAULT 'update')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('corretiva', required_action)
      OR public.can_access_module('corretiva-gestor', required_action);
$$;

CREATE OR REPLACE FUNCTION public.can_access_refrigeracao(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('refrigeracao', required_action)
      OR public.can_access_module('refrigeracao-gestor', required_action)
      OR public.can_access_module('refrigeracao-historico', required_action)
      OR public.can_access_module('refrigeracao-pecas-status', required_action)
      OR public.can_access_module('preventiva-ac', required_action);
$$;

CREATE OR REPLACE FUNCTION public.can_write_refrigeracao(required_action text DEFAULT 'update')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('refrigeracao', required_action)
      OR public.can_access_module('refrigeracao-gestor', required_action)
      OR public.can_access_module('preventiva-ac', required_action);
$$;

CREATE OR REPLACE FUNCTION public.can_access_backorder(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_module('backorder', required_action)
      OR public.can_access_module('corretiva-gestor', required_action);
$$;

-- ============ CORRETIVA ============
DROP POLICY IF EXISTS "corretiva_os_read" ON public.corretiva_os;
CREATE POLICY "corretiva_os_read" ON public.corretiva_os FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "corretiva_os_insert" ON public.corretiva_os;
CREATE POLICY "corretiva_os_insert" ON public.corretiva_os FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('create'));
DROP POLICY IF EXISTS "corretiva_os_update" ON public.corretiva_os;
CREATE POLICY "corretiva_os_update" ON public.corretiva_os FOR UPDATE TO authenticated
  USING (public.can_write_corretiva('update')) WITH CHECK (public.can_write_corretiva('update'));

DROP POLICY IF EXISTS "corretiva_fotos_read" ON public.corretiva_fotos;
CREATE POLICY "corretiva_fotos_read" ON public.corretiva_fotos FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "corretiva_fotos_insert" ON public.corretiva_fotos;
CREATE POLICY "corretiva_fotos_insert" ON public.corretiva_fotos FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('create'));

DROP POLICY IF EXISTS "corretiva_pecas_read" ON public.corretiva_pecas;
CREATE POLICY "corretiva_pecas_read" ON public.corretiva_pecas FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "corretiva_pecas_insert" ON public.corretiva_pecas;
CREATE POLICY "corretiva_pecas_insert" ON public.corretiva_pecas FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('create'));

DROP POLICY IF EXISTS "corretiva_problemas_read" ON public.corretiva_problemas;
CREATE POLICY "corretiva_problemas_read" ON public.corretiva_problemas FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "corretiva_problemas_insert" ON public.corretiva_problemas;
CREATE POLICY "corretiva_problemas_insert" ON public.corretiva_problemas FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('create'));

DROP POLICY IF EXISTS "corretiva_equipes_read" ON public.corretiva_equipes;
CREATE POLICY "corretiva_equipes_read" ON public.corretiva_equipes FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));

-- ============ REFRIGERAÇÃO ============
DROP POLICY IF EXISTS "refrig_os_read" ON public.refrigeracao_os;
CREATE POLICY "refrig_os_read" ON public.refrigeracao_os FOR SELECT TO authenticated
  USING (public.can_access_refrigeracao('read'));
DROP POLICY IF EXISTS "refrig_os_insert" ON public.refrigeracao_os;
CREATE POLICY "refrig_os_insert" ON public.refrigeracao_os FOR INSERT TO authenticated
  WITH CHECK (public.can_write_refrigeracao('create'));
DROP POLICY IF EXISTS "refrig_os_update" ON public.refrigeracao_os;
CREATE POLICY "refrig_os_update" ON public.refrigeracao_os FOR UPDATE TO authenticated
  USING (public.can_write_refrigeracao('update')) WITH CHECK (public.can_write_refrigeracao('update'));

DROP POLICY IF EXISTS "refrig_fotos_read" ON public.refrigeracao_fotos;
CREATE POLICY "refrig_fotos_read" ON public.refrigeracao_fotos FOR SELECT TO authenticated
  USING (public.can_access_refrigeracao('read'));
DROP POLICY IF EXISTS "refrig_fotos_insert" ON public.refrigeracao_fotos;
CREATE POLICY "refrig_fotos_insert" ON public.refrigeracao_fotos FOR INSERT TO authenticated
  WITH CHECK (public.can_write_refrigeracao('create'));

DROP POLICY IF EXISTS "refrig_pecas_read" ON public.refrigeracao_pecas;
CREATE POLICY "refrig_pecas_read" ON public.refrigeracao_pecas FOR SELECT TO authenticated
  USING (public.can_access_refrigeracao('read'));
DROP POLICY IF EXISTS "refrig_pecas_insert" ON public.refrigeracao_pecas;
CREATE POLICY "refrig_pecas_insert" ON public.refrigeracao_pecas FOR INSERT TO authenticated
  WITH CHECK (public.can_write_refrigeracao('create'));

DROP POLICY IF EXISTS "refrig_probl_read" ON public.refrigeracao_problemas;
CREATE POLICY "refrig_probl_read" ON public.refrigeracao_problemas FOR SELECT TO authenticated
  USING (public.can_access_refrigeracao('read'));
DROP POLICY IF EXISTS "refrig_probl_insert" ON public.refrigeracao_problemas;
CREATE POLICY "refrig_probl_insert" ON public.refrigeracao_problemas FOR INSERT TO authenticated
  WITH CHECK (public.can_write_refrigeracao('create'));

-- ============ BACKORDER ============
DROP POLICY IF EXISTS "backorder_os auth read" ON public.backorder_os;
CREATE POLICY "backorder_os auth read" ON public.backorder_os FOR SELECT TO authenticated
  USING (public.can_access_backorder('read'));
DROP POLICY IF EXISTS "backorder_os auth write" ON public.backorder_os;
CREATE POLICY "backorder_os auth write" ON public.backorder_os FOR ALL TO authenticated
  USING (public.can_access_backorder('update')) WITH CHECK (public.can_access_backorder('update'));

DROP POLICY IF EXISTS "backorder_ovr auth read" ON public.backorder_atividade_override;
CREATE POLICY "backorder_ovr auth read" ON public.backorder_atividade_override FOR SELECT TO authenticated
  USING (public.can_access_backorder('read'));
DROP POLICY IF EXISTS "backorder_ovr auth write" ON public.backorder_atividade_override;
CREATE POLICY "backorder_ovr auth write" ON public.backorder_atividade_override FOR ALL TO authenticated
  USING (public.can_access_backorder('update')) WITH CHECK (public.can_access_backorder('update'));

DROP POLICY IF EXISTS "auth read config" ON public.backorder_prioridade_config;
CREATE POLICY "auth read config" ON public.backorder_prioridade_config FOR SELECT TO authenticated
  USING (public.can_access_backorder('read'));
DROP POLICY IF EXISTS "auth write config" ON public.backorder_prioridade_config;
CREATE POLICY "auth write config" ON public.backorder_prioridade_config FOR ALL TO authenticated
  USING (public.can_access_backorder('update')) WITH CHECK (public.can_access_backorder('update'));

-- Regras de classificação e aprendizado
DROP POLICY IF EXISTS "auth read learned team" ON public.regras_aprendidas_equipe;
CREATE POLICY "auth read learned team" ON public.regras_aprendidas_equipe FOR SELECT TO authenticated
  USING (public.can_access_backorder('read') OR public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "auth write learned team" ON public.regras_aprendidas_equipe;
CREATE POLICY "auth write learned team" ON public.regras_aprendidas_equipe FOR INSERT TO authenticated
  WITH CHECK (public.can_access_backorder('create') OR public.can_write_corretiva('create'));
DROP POLICY IF EXISTS "auth update learned team" ON public.regras_aprendidas_equipe;
CREATE POLICY "auth update learned team" ON public.regras_aprendidas_equipe FOR UPDATE TO authenticated
  USING (public.can_access_backorder('update') OR public.can_write_corretiva('update'))
  WITH CHECK (public.can_access_backorder('update') OR public.can_write_corretiva('update'));
DROP POLICY IF EXISTS "auth delete learned team" ON public.regras_aprendidas_equipe;
CREATE POLICY "auth delete learned team" ON public.regras_aprendidas_equipe FOR DELETE TO authenticated
  USING (public.can_access_backorder('delete') OR public.can_write_corretiva('delete'));

DROP POLICY IF EXISTS "auth read learned loc" ON public.regras_aprendidas_localizacao;
CREATE POLICY "auth read learned loc" ON public.regras_aprendidas_localizacao FOR SELECT TO authenticated
  USING (public.can_access_backorder('read') OR public.can_access_corretiva('read'));
DROP POLICY IF EXISTS "auth write learned loc" ON public.regras_aprendidas_localizacao;
CREATE POLICY "auth write learned loc" ON public.regras_aprendidas_localizacao FOR INSERT TO authenticated
  WITH CHECK (public.can_access_backorder('create') OR public.can_write_corretiva('create'));
DROP POLICY IF EXISTS "auth update learned loc" ON public.regras_aprendidas_localizacao;
CREATE POLICY "auth update learned loc" ON public.regras_aprendidas_localizacao FOR UPDATE TO authenticated
  USING (public.can_access_backorder('update') OR public.can_write_corretiva('update'))
  WITH CHECK (public.can_access_backorder('update') OR public.can_write_corretiva('update'));
DROP POLICY IF EXISTS "auth delete learned loc" ON public.regras_aprendidas_localizacao;
CREATE POLICY "auth delete learned loc" ON public.regras_aprendidas_localizacao FOR DELETE TO authenticated
  USING (public.can_access_backorder('delete') OR public.can_write_corretiva('delete'));

DROP POLICY IF EXISTS "regras auth write" ON public.regras_classificacao_equipe;
CREATE POLICY "regras auth write" ON public.regras_classificacao_equipe FOR ALL TO authenticated
  USING (public.can_access_backorder('update') OR public.can_write_corretiva('update'))
  WITH CHECK (public.can_access_backorder('update') OR public.can_write_corretiva('update'));

-- ============ BASE DE ATIVOS DE REFERÊNCIA ============
DROP POLICY IF EXISTS "assets_ref auth write" ON public.assets_ref;
CREATE POLICY "assets_ref auth write" ON public.assets_ref FOR ALL TO authenticated
  USING (public.can_access_module('assets-catalog', 'update') OR public.can_access_backorder('update'))
  WITH CHECK (public.can_access_module('assets-catalog', 'update') OR public.can_access_backorder('update'));

-- ============ CONFIGURAÇÕES GLOBAIS ============
DROP POLICY IF EXISTS "Settings writable by authenticated" ON public.app_settings;
CREATE POLICY "Settings insert by managers" ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module('configuracoes', 'update'));
DROP POLICY IF EXISTS "Settings updatable by authenticated" ON public.app_settings;
CREATE POLICY "Settings update by managers" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module('configuracoes', 'update'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module('configuracoes', 'update'));