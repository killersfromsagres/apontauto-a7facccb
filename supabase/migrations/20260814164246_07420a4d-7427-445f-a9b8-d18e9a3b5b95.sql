CREATE TYPE public.ronda_status AS ENUM ('pendente', 'concluido');

CREATE TABLE public.rondas_calhas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    predio text NOT NULL,
    preventiva_nome text NOT NULL,
    status public.ronda_status NOT NULL DEFAULT 'pendente',
    realizado_por text,
    realizado_em timestamp with time zone,
    problemas_identificados text,
    fotos text[] DEFAULT '{}',
    mes_referencia text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rondas_calhas TO authenticated;
GRANT ALL ON public.rondas_calhas TO service_role;
GRANT SELECT ON public.rondas_calhas TO anon;

ALTER TABLE public.rondas_calhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all rondas"
ON public.rondas_calhas FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert rondas"
ON public.rondas_calhas FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update rondas"
ON public.rondas_calhas FOR UPDATE
TO authenticated
USING (true);