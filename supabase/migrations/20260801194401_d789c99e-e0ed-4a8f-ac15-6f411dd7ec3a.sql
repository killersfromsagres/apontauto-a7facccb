-- Índices de performance para o Centro de Gestão e painéis de OS.
-- Os LATERAL JOINs da view consolidada faziam varredura sequencial por linha.
CREATE INDEX IF NOT EXISTS idx_corretiva_pecas_os_status
  ON public.corretiva_pecas (os_id, status_gestor);
CREATE INDEX IF NOT EXISTS idx_refrigeracao_pecas_os_status
  ON public.refrigeracao_pecas (os_id, status_gestor);
CREATE INDEX IF NOT EXISTS idx_corretiva_problemas_os
  ON public.corretiva_problemas (os_id);
CREATE INDEX IF NOT EXISTS idx_refrigeracao_problemas_os
  ON public.refrigeracao_problemas (os_id);

-- Agregações por período do overview.
CREATE INDEX IF NOT EXISTS idx_fleet_fuelings_fueled_at
  ON public.fleet_fuelings (fueled_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_checklists_created_at
  ON public.fleet_checklists (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_corretiva_os_criacao
  ON public.corretiva_os (data_criacao DESC);
CREATE INDEX IF NOT EXISTS idx_refrigeracao_os_created
  ON public.refrigeracao_os (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agua_prog_entregas_criado
  ON public.agua_prog_entregas (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_agua_prog_fotos_entrega
  ON public.agua_prog_fotos (entrega_id);

ANALYZE public.backorder_os;
ANALYZE public.corretiva_os;
ANALYZE public.refrigeracao_os;