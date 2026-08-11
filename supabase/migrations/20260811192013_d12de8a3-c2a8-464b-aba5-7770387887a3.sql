-- Force clean the table to ensure the schema is exactly as required (PRIMARY KEY on ativo, equipamento)
DROP TABLE IF EXISTS public.refrigeracao_historico_permanente CASCADE;

CREATE TABLE public.refrigeracao_historico_permanente (
    ativo text NOT NULL,
    equipamento text NOT NULL,
    patrimonio text,
    informacoes_tecnicas text,
    data_ultima_atualizacao timestamp with time zone DEFAULT now(),
    PRIMARY KEY (ativo, equipamento)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_historico_permanente TO authenticated;
GRANT ALL ON public.refrigeracao_historico_permanente TO service_role;

ALTER TABLE public.refrigeracao_historico_permanente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso leitura historico" ON public.refrigeracao_historico_permanente FOR SELECT TO authenticated USING (true);
CREATE POLICY "Acesso escrita historico" ON public.refrigeracao_historico_permanente FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Acesso update historico" ON public.refrigeracao_historico_permanente FOR UPDATE TO authenticated USING (true);

-- Update trigger function to also aggregate informacoes_tecnicas from OS names if needed, 
-- but primarily it should preserve what's there and update from the last OS.
CREATE OR REPLACE FUNCTION public.tg_refrig_os_update_historico_permanente()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'concluida' THEN
        INSERT INTO public.refrigeracao_historico_permanente (ativo, equipamento, patrimonio, informacoes_tecnicas, data_ultima_atualizacao)
        VALUES (
            NEW.ativo, 
            NEW.equipamento, 
            NEW.patrimonio, 
            NEW.nome_os, -- Initial technical info from the OS name
            now()
        )
        ON CONFLICT (ativo, equipamento)
        DO UPDATE SET
            patrimonio = COALESCE(EXCLUDED.patrimonio, public.refrigeracao_historico_permanente.patrimonio),
            informacoes_tecnicas = CASE 
                WHEN EXCLUDED.informacoes_tecnicas IS NOT NULL AND (public.refrigeracao_historico_permanente.informacoes_tecnicas IS NULL OR public.refrigeracao_historico_permanente.informacoes_tecnicas NOT LIKE '%' || EXCLUDED.informacoes_tecnicas || '%')
                THEN public.refrigeracao_historico_permanente.informacoes_tecnicas || ' | ' || EXCLUDED.informacoes_tecnicas
                ELSE public.refrigeracao_historico_permanente.informacoes_tecnicas
            END,
            data_ultima_atualizacao = EXCLUDED.data_ultima_atualizacao;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger
DROP TRIGGER IF EXISTS trg_refrig_os_update_historico ON public.refrigeracao_os;
CREATE TRIGGER trg_refrig_os_update_historico
AFTER UPDATE ON public.refrigeracao_os
FOR EACH ROW
WHEN (NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida')
EXECUTE FUNCTION public.tg_refrig_os_update_historico_permanente();

-- Deep recovery: include ALL completed OS, even from previous months
INSERT INTO public.refrigeracao_historico_permanente (ativo, equipamento, patrimonio, informacoes_tecnicas, data_ultima_atualizacao)
SELECT 
    ativo, 
    equipamento, 
    MAX(patrimonio) as patrimonio,
    string_agg(DISTINCT nome_os, ' | ') as informacoes_tecnicas,
    MAX(fim) as data_ultima_atualizacao
FROM public.refrigeracao_os
WHERE status = 'concluida'
GROUP BY ativo, equipamento
ON CONFLICT (ativo, equipamento) DO UPDATE SET
    patrimonio = COALESCE(EXCLUDED.patrimonio, public.refrigeracao_historico_permanente.patrimonio),
    informacoes_tecnicas = EXCLUDED.informacoes_tecnicas,
    data_ultima_atualizacao = EXCLUDED.data_ultima_atualizacao;