---
title: Fix Dashboard Chart Loading and SQL Permissions
description: Refactor dashboard query handling, fix reaviz data mapping, and address SQL view permissions.
---

## Problem
The dashboard shows an "Erro ao carregar a página" (Error loading page) message, likely due to a combination of:
1.  **Strict Data Mapping**: `reaviz` is sensitive to null/undefined or incorrectly shaped data in the series.
2.  **SQL Permissions**: The dashboard relies on `gestao_overview_v2` and underlying views (`vw_gestao_os_consolidada`, `vw_gestao_os_corretiva_novo`) which may lack explicit `GRANT` statements for the `authenticated` role.
3.  **Transaction Failures**: Previous attempts to finalize OS or fetch data might be failing due to missing permissions on specific columns or rows.

## Proposed Changes

### Database (Supabase)
- Create a new migration to explicitly grant permissions to the dashboard views and functions.
- Ensure `gestao_overview_v2` handles empty states gracefully using `COALESCE`.

### Frontend
- **Enhanced Error Handling**: Improve the error boundary in `CentralInteligenciaView` to provide more diagnostic info and a "Retry" button.
- **Robust Data Validation**: Update `AreaChart1` and its parent to strictly validate and cast all data points to `number` or `0`.
- **Safe Date Handling**: Ensure date keys in `reaviz` are valid `Date` objects.

## Technical Details

### SQL Migration
```sql
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;
GRANT SELECT ON public.vw_gestao_os_corretiva_novo TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestao_overview_v2 TO authenticated;
```

### Data Normalization
- Wrap `chartDataReaviz` computation in a try-catch and ensure it returns an empty array on failure.
- Update `validateChartData` in `AreaChart1.tsx` to handle nested arrays safely.

### User Experience
- Replace the generic error message with a diagnostic view showing the exact error message.
- Add a direct link back to the dashboard if a deep-link fails.
