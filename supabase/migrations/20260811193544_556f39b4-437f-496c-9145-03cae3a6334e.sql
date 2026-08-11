
DO $$
BEGIN
    -- Garantir que a tabela existe com as colunas corretas
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'refrigeracao_historico_permanente') THEN
        CREATE TABLE public.refrigeracao_historico_permanente (
            ativo TEXT NOT NULL,
            equipamento TEXT NOT NULL,
            patrimonio TEXT,
            informacoes_tecnicas TEXT,
            data_ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (ativo, equipamento)
        );
        GRANT ALL ON public.refrigeracao_historico_permanente TO authenticated;
        GRANT ALL ON public.refrigeracao_historico_permanente TO service_role;
    END IF;

    -- Recuperação Profunda: Inserir/Atualizar histórico a partir de TODAS as OS disponíveis
    -- Incluindo peças e problemas para não perder NADA do que foi reportado
    WITH os_data AS (
        SELECT 
            os.ativo,
            os.equipamento,
            MAX(os.patrimonio) as patrimonio,
            STRING_AGG(DISTINCT 
                os.nome_os || 
                COALESCE(' (Peças: ' || (SELECT STRING_AGG(p.descricao, ', ') FROM public.refrigeracao_pecas p WHERE p.os_id = os.id) || ')', '') ||
                COALESCE(' (Problemas: ' || (SELECT STRING_AGG(pr.descricao, ', ') FROM public.refrigeracao_problemas pr WHERE pr.os_id = os.id) || ')', ''),
                E'\n---\n'
            ) as tech_info,
            MAX(COALESCE(os.fim, os.updated_at)) as last_update
        FROM public.refrigeracao_os os
        WHERE os.ativo IS NOT NULL AND os.equipamento IS NOT NULL
        GROUP BY os.ativo, os.equipamento
    )
    INSERT INTO public.refrigeracao_historico_permanente (ativo, equipamento, patrimonio, informacoes_tecnicas, data_ultima_atualizacao)
    SELECT ativo, equipamento, patrimonio, tech_info, last_update
    FROM os_data
    ON CONFLICT (ativo, equipamento) 
    DO UPDATE SET 
        patrimonio = COALESCE(EXCLUDED.patrimonio, public.refrigeracao_historico_permanente.patrimonio),
        informacoes_tecnicas = EXCLUDED.informacoes_tecnicas,
        data_ultima_atualizacao = EXCLUDED.data_ultima_atualizacao;

END $$;
