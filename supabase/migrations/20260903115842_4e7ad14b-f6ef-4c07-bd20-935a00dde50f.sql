CREATE TABLE IF NOT EXISTS public.corretiva_historico_verificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL UNIQUE,
  numero_os text NOT NULL,
  verificado_em timestamptz NOT NULL DEFAULT now(),
  verificado_por uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.corretiva_historico_verificacoes IS 'Histórico persistente de conferência de OS de corretiva. Sem FK para corretiva_os por retenção histórica: o registro sobrevive à remoção da OS.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_historico_verificacoes TO authenticated;
GRANT ALL ON public.corretiva_historico_verificacoes TO service_role;

ALTER TABLE public.corretiva_historico_verificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corretiva_hist_verif_select" ON public.corretiva_historico_verificacoes;
CREATE POLICY "corretiva_hist_verif_select"
  ON public.corretiva_historico_verificacoes
  FOR SELECT TO authenticated
  USING (public.can_access_corretiva('read'));

DROP POLICY IF EXISTS "corretiva_hist_verif_insert" ON public.corretiva_historico_verificacoes;
CREATE POLICY "corretiva_hist_verif_insert"
  ON public.corretiva_historico_verificacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_corretiva('update'));

DROP POLICY IF EXISTS "corretiva_hist_verif_update" ON public.corretiva_historico_verificacoes;
CREATE POLICY "corretiva_hist_verif_update"
  ON public.corretiva_historico_verificacoes
  FOR UPDATE TO authenticated
  USING (public.can_write_corretiva('update'))
  WITH CHECK (public.can_write_corretiva('update'));

DROP POLICY IF EXISTS "corretiva_hist_verif_delete" ON public.corretiva_historico_verificacoes;
CREATE POLICY "corretiva_hist_verif_delete"
  ON public.corretiva_historico_verificacoes
  FOR DELETE TO authenticated
  USING (public.can_write_corretiva('update'));

CREATE INDEX IF NOT EXISTS idx_corretiva_hist_verif_os_id
  ON public.corretiva_historico_verificacoes (os_id);
CREATE INDEX IF NOT EXISTS idx_corretiva_hist_verif_verificado_em
  ON public.corretiva_historico_verificacoes (verificado_em DESC);
CREATE INDEX IF NOT EXISTS idx_corretiva_hist_verif_verificado_por
  ON public.corretiva_historico_verificacoes (verificado_por);

DROP TRIGGER IF EXISTS set_updated_at_corretiva_hist_verif ON public.corretiva_historico_verificacoes;
CREATE TRIGGER set_updated_at_corretiva_hist_verif
  BEFORE UPDATE ON public.corretiva_historico_verificacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();