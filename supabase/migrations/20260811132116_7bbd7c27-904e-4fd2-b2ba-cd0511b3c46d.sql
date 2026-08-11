CREATE TABLE public.corretiva_avaliacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    os_ids text[] NOT NULL,
    solicitante text NOT NULL,
    email_destinatario text NOT NULL,
    status text NOT NULL DEFAULT 'Pendente', -- Pendente, Preparado, Enviado, Avaliado
    assunto text,
    corpo_email text,
    feedback_nota integer,
    feedback_comentario text,
    criado_em timestamptz DEFAULT now(),
    enviado_em timestamptz,
    respondido_em timestamptz,
    owner_id uuid REFERENCES auth.users(id)
);

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_avaliacoes TO authenticated;
GRANT ALL ON public.corretiva_avaliacoes TO service_role;

-- RLS
ALTER TABLE public.corretiva_avaliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver avaliações"
ON public.corretiva_avaliacoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem inserir avaliações"
ON public.corretiva_avaliacoes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar avaliações"
ON public.corretiva_avaliacoes FOR UPDATE TO authenticated USING (true);
