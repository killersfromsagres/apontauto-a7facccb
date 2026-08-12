# Dashboard Overhaul and Graph Stability Fix

The user is reporting a persistent "Erro ao carregar a página" on the homepage charts. Audit suggests a potential breakdown in data mapping between the Supabase RPC `gestao_overview_v2` and the `reaviz` chart component, specifically concerning date handling and data normalization.

## Proposed Changes

### Database Layer (Supabase)
1. **Refine `gestao_overview_v2`**: Ensure `os_mensal` aggregation produces consistent ISO dates and always returns all months in the requested period to prevent empty data points that crash `reaviz`.
2. **Permissions Review**: Double-check that all underlying tables used by `vw_gestao_os_consolidada` (backorder_os, corretiva_os, refrigeracao_os, etc.) have proper RLS policies allowing the dashboard to read them.

### Frontend Layer (TanStack Start)
1. **Robust Data Normalization in `CentralInteligenciaView`**:
   - Improve `chartDataReaviz` transformation to handle `null` series and ensure `key` is a valid `Date` object before passing to `reaviz`.
   - Add a "Demo Data" fallback if the RPC returns empty, so the UI never appears broken.
2. **Hardened `AreaChart1` Component**:
   - Update `validateChartData` to be even more defensive against unexpected data shapes.
   - Improve error boundary state with more helpful diagnostic info.
3. **Lazy Loading and Hydration**:
   - Verify `reaviz` imports are strictly client-side to avoid SSR hydration mismatches that might look like "loading errors".

## Technical Details

- **RPC Signature**: `public.gestao_overview_v2(integer, text, text, text, text, text)`
- **Chart Library**: `reaviz` (requires specific data structure: `[{ key: 'Series', data: [{ key: Date, data: number }] }]`)
- **Error Source**: Likely `NaN` or `Invalid Date` injected into `reaviz` SVG rendering.

## Security
- Grant `SELECT` on all relevant views and tables to `authenticated` role.
- Ensure `SECURITY DEFINER` is used on the RPC to bypass granular RLS if necessary for executive overview.
