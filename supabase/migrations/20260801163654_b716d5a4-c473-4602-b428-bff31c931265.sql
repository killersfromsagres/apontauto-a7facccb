-- Índices redundantes: cobertos por idx_backorder_os_data_sol (data_solicitacao DESC)
DROP INDEX IF EXISTS public.backorder_os_data_solic_idx;
DROP INDEX IF EXISTS public.backorder_os_data_solicitacao_idx;

-- Coberto pelo prefixo de idx_backorder_os_finalizado_data (finalizado, data_solicitacao)
DROP INDEX IF EXISTS public.backorder_os_finalizado_idx;

ANALYZE public.backorder_os;