
CREATE TABLE IF NOT EXISTS public.preventiva_programacao_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    nome_arquivo TEXT NOT NULL,
    configuracao JSONB NOT NULL,
    total_os INTEGER DEFAULT 0,
    resumo_equipes JSONB DEFAULT '{}'::jsonb,
    criado_por UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT ON public.preventiva_programacao_historico TO authenticated;
GRANT ALL ON public.preventiva_programacao_historico TO service_role;
ALTER TABLE public.preventiva_programacao_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários autenticados podem ver histórico" ON public.preventiva_programacao_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuários autenticados podem inserir histórico" ON public.preventiva_programacao_historico FOR INSERT TO authenticated WITH CHECK (auth.uid() = criado_por OR criado_por IS NULL);

CREATE TABLE IF NOT EXISTS public.preventiva_servicos_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    termo TEXT NOT NULL UNIQUE,
    equipe TEXT NOT NULL,
    prioridade INTEGER DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preventiva_servicos_config TO authenticated;
GRANT ALL ON public.preventiva_servicos_config TO service_role;
ALTER TABLE public.preventiva_servicos_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total para autenticados em configurações" ON public.preventiva_servicos_config FOR ALL TO authenticated USING (true);

INSERT INTO public.preventiva_servicos_config (termo, equipe) VALUES
('calha', 'HIDRÁULICA'), ('pluvial', 'HIDRÁULICA'), ('tubulação', 'HIDRÁULICA'), ('ralo', 'HIDRÁULICA'),
('chave', 'CHAVEIRO'), ('porta', 'CHAVEIRO'), ('fechadura', 'CHAVEIRO'),
('pintura', 'CIVIL'), ('alvenaria', 'CIVIL'), ('piso', 'CIVIL')
ON CONFLICT (termo) DO NOTHING;
