CREATE TABLE public.refrigeracao_historico_permanente (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ativo text NOT NULL,
    equipamento text NOT NULL,
    patrimonio text,
    ultima_os_concluida uuid,
    informacoes_tecnicas text,
    data_ultima_atualizacao timestamp with time zone DEFAULT now(),
    UNIQUE(ativo, equipamento)
);

GRANT SELECT, INSERT, UPDATE ON public.refrigeracao_historico_permanente TO authenticated;
GRANT ALL ON public.refrigeracao_historico_permanente TO service_role;

ALTER TABLE public.refrigeracao_historico_permanente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso leitura historico" ON public.refrigeracao_historico_permanente FOR SELECT TO authenticated USING (true);
CREATE POLICY "Acesso escrita historico" ON public.refrigeracao_historico_permanente FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Acesso update historico" ON public.refrigeracao_historico_permanente FOR UPDATE TO authenticated USING (true);

-- Trigger para atualizar o histórico quando uma OS de refrigeração for concluída
CREATE OR REPLACE FUNCTION public.tg_refrig_os_update_historico_permanente()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'concluida' THEN
        INSERT INTO public.refrigeracao_historico_permanente (ativo, equipamento, patrimonio, ultima_os_concluida, data_ultima_atualizacao)
        VALUES (NEW.ativo, NEW.equipamento, NEW.patrimonio, NEW.id, now())
        ON CONFLICT (ativo, equipamento)
        DO UPDATE SET
            patrimonio = EXCLUDED.patrimonio,
            ultima_os_concluida = EXCLUDED.ultima_os_concluida,
            data_ultima_atualizacao = EXCLUDED.data_ultima_atualizacao;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_refrig_os_update_historico
AFTER UPDATE ON public.refrigeracao_os
FOR EACH ROW
WHEN (NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida')
EXECUTE FUNCTION public.tg_refrig_os_update_historico_permanente();

-- Recuperar informações de OS já concluídas para o histórico permanente
INSERT INTO public.refrigeracao_historico_permanente (ativo, equipamento, patrimonio, ultima_os_concluida, data_ultima_atualizacao)
SELECT DISTINCT ON (ativo, equipamento)
    ativo, equipamento, patrimonio, id, fim
FROM public.refrigeracao_os
WHERE status = 'concluida'
ORDER BY ativo, equipamento, fim DESC NULLS LAST
ON CONFLICT (ativo, equipamento) DO NOTHING;
