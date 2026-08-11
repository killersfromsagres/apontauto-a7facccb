CREATE TABLE IF NOT EXISTS public.refrigeracao_historico_permanente (
    ativo text NOT NULL,
    equipamento text NOT NULL,
    patrimonio text,
    informacoes_tecnicas text,
    data_ultima_atualizacao timestamp with time zone DEFAULT now(),
    PRIMARY KEY (ativo, equipamento)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refrigeracao_historico_permanente TO authenticated;
GRANT ALL ON public.refrigeracao_historico_permanente TO service_role;