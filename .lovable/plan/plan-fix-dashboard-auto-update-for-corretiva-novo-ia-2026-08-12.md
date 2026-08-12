# Plan: Fix Dashboard Auto-Update for Corretiva Novo (IA)

The user reports that charts and information in the dashboard for "Programação Corretivas - Execução de Campo IA" and "Histórico de Execução" are not updating automatically. 

My analysis indicates that:
1. The dashboard (`CentralInteligenciaView`) uses the `gestao_overview_v2` RPC.
2. While `gestao_overview_v2` was recently updated to include a `corretiva_novo` object, the main `os_mensal` chart data and summary KPIs still pull from `vw_gestao_os_consolidada`.
3. `vw_gestao_os_consolidada` includes `vw_gestao_os_corretiva_novo`, but the aggregation logic in `gestao_overview_v2` might need optimization to ensure real-time visibility and correct mapping of IA-classified orders.
4. The frontend `refetchInterval` is set to 30-60 seconds, which should handle the "automatic" part if the data is correct.

## Proposed Changes

### Database (Supabase)
1. **Update `vw_gestao_os_corretiva_novo`**:
   - Ensure the `status_canonico` logic correctly captures all "concluida" states.
   - Verify `criado_em` mapping to ensure monthly charts pick up recent imports.
2. **Refresh `gestao_overview_v2` RPC**:
   - Refine the `os_mensal` query to explicitly include `corretiva_novo` records in the monthly volume.
   - Ensure the summary metrics (abertas, concluidas, criadas) correctly count IA orders.

### Frontend
1. **`CentralInteligenciaView`**:
   - Ensure `chartData` correctly maps the expanded `os_mensal` structure.
   - Verify that the `KpiMonitorCard` for "CAMPO IA" reflects the total volume correctly.
   - Ensure all queries have appropriate `refetchInterval` and `staleTime: 0`.

## Technical Details
- **View**: `public.vw_gestao_os_corretiva_novo` and `public.vw_gestao_os_consolidada`.
- **RPC**: `public.gestao_overview_v2`.
- **Frontend**: `src/features/inteligencia-pcm/components/central-inteligencia-view.tsx`.

I will now implement these changes to ensure the dashboard reflects "Execução de Campo IA" data accurately and in real-time.
