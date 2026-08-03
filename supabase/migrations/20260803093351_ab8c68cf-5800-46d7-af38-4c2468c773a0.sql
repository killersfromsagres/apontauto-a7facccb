CREATE TABLE public.programacao_semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  semana integer NOT NULL CHECK (semana BETWEEN 1 AND 53),
  liberada boolean NOT NULL DEFAULT false,
  liberada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  liberada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, semana)
);

GRANT SELECT, INSERT, UPDATE ON public.programacao_semanas TO authenticated;
GRANT ALL ON public.programacao_semanas TO service_role;

ALTER TABLE public.programacao_semanas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver semanas"
  ON public.programacao_semanas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins podem criar semanas"
  ON public.programacao_semanas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem atualizar semanas"
  ON public.programacao_semanas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_programacao_semanas_updated_at
  BEFORE UPDATE ON public.programacao_semanas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();