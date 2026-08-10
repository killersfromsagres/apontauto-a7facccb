
CREATE TABLE public.lavanderia_colaboradores (
  matricula text PRIMARY KEY,
  nome text NOT NULL,
  setor text,
  tipo_peca_padrao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lavanderia_colaboradores TO authenticated;
GRANT ALL ON public.lavanderia_colaboradores TO service_role;
ALTER TABLE public.lavanderia_colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lav_colab_auth_all" ON public.lavanderia_colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_lav_colab_updated_at BEFORE UPDATE ON public.lavanderia_colaboradores FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.lavanderia_pecas (
  codigo text PRIMARY KEY,
  matricula text REFERENCES public.lavanderia_colaboradores(matricula) ON DELETE SET NULL,
  tipo_peca text NOT NULL DEFAULT 'Não informado',
  setor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lavanderia_pecas TO authenticated;
GRANT ALL ON public.lavanderia_pecas TO service_role;
ALTER TABLE public.lavanderia_pecas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lav_pecas_auth_all" ON public.lavanderia_pecas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_lav_pecas_matricula ON public.lavanderia_pecas(matricula);
CREATE TRIGGER trg_lav_pecas_updated_at BEFORE UPDATE ON public.lavanderia_pecas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.lavanderia_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('saida','entrada')),
  data date NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (codigo, tipo, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lavanderia_eventos TO authenticated;
GRANT ALL ON public.lavanderia_eventos TO service_role;
ALTER TABLE public.lavanderia_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lav_eventos_auth_all" ON public.lavanderia_eventos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_lav_eventos_codigo_data ON public.lavanderia_eventos(codigo, data);
CREATE INDEX idx_lav_eventos_tipo_data ON public.lavanderia_eventos(tipo, data);
