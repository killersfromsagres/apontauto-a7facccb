-- Adiciona coluna para controle de loop semanal se não existir
ALTER TABLE public.agua_visitas ADD COLUMN IF NOT EXISTS recorrente boolean DEFAULT true;

-- Concede permissões para as tabelas de frota e abastecimento
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_fuelings TO authenticated;
GRANT ALL ON public.fleet_fuelings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_checklists TO authenticated;
GRANT ALL ON public.fleet_checklists TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_checklist_photos TO authenticated;
GRANT ALL ON public.fleet_checklist_photos TO service_role;

-- Função para resetar entregas concluídas para a próxima semana
CREATE OR REPLACE FUNCTION public.reset_weekly_water_deliveries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- O loop semanal funciona gerando visitas para a próxima data baseada na programação
    PERFORM public.agua_gerar_rotas((current_date + ((8 - extract(dow from current_date))::int % 7) * interval '1 day')::date, 'cron_loop');
END;
$$;
