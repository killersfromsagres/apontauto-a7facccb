
-- Tabela de Organograma
CREATE TABLE IF NOT EXISTS public.organograma (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    cargo text NOT NULL,
    email text,
    foto_url text,
    parent_id uuid REFERENCES public.organograma(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organograma TO authenticated;
GRANT ALL ON public.organograma TO service_role;

-- RLS
ALTER TABLE public.organograma ENABLE ROW LEVEL SECURITY;

-- Política de leitura: todos autenticados
CREATE POLICY "Todos podem ver o organograma"
ON public.organograma FOR SELECT
TO authenticated
USING (true);

-- Política de escrita restrita
CREATE POLICY "Apenas admin e gabrielvlp podem editar"
ON public.organograma FOR ALL
TO authenticated
USING (
  auth.email() = 'gabrielvlp33@gmail.com' OR 
  split_part(auth.email(), '@', 1) = 'admin'
);
