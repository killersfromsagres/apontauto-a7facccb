
CREATE TABLE public.regras_aprendidas_localizacao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_ativo text NOT NULL,
  predio text NOT NULL DEFAULT '',
  andar text NOT NULL DEFAULT '',
  espaco text NOT NULL DEFAULT '',
  origem_chamado_os text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_regras_aprend_loc_ativo ON public.regras_aprendidas_localizacao(codigo_ativo) WHERE ativo;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_aprendidas_localizacao TO authenticated;
GRANT ALL ON public.regras_aprendidas_localizacao TO service_role;
ALTER TABLE public.regras_aprendidas_localizacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read learned loc" ON public.regras_aprendidas_localizacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write learned loc" ON public.regras_aprendidas_localizacao FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update learned loc" ON public.regras_aprendidas_localizacao FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete learned loc" ON public.regras_aprendidas_localizacao FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_regras_aprend_loc_updated BEFORE UPDATE ON public.regras_aprendidas_localizacao
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.regras_aprendidas_equipe (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_ativo text,
  equipe text NOT NULL,
  origem_chamado_os text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_regras_aprend_equipe_ativo ON public.regras_aprendidas_equipe(codigo_ativo) WHERE ativo;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_aprendidas_equipe TO authenticated;
GRANT ALL ON public.regras_aprendidas_equipe TO service_role;
ALTER TABLE public.regras_aprendidas_equipe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read learned team" ON public.regras_aprendidas_equipe FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write learned team" ON public.regras_aprendidas_equipe FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update learned team" ON public.regras_aprendidas_equipe FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete learned team" ON public.regras_aprendidas_equipe FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_regras_aprend_equipe_updated BEFORE UPDATE ON public.regras_aprendidas_equipe
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS origem_predio_andar_espaco text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS origem_equipe text NOT NULL DEFAULT 'classificacao_automatica';
