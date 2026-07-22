
-- Enums
DO $$ BEGIN
  CREATE TYPE public.prisma_lote_categoria AS ENUM ('refrigeracao', 'geral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prisma_lote_status AS ENUM ('rascunho', 'pendente', 'em_execucao', 'concluido', 'erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prisma_os_status AS ENUM ('pendente', 'em_execucao', 'concluido', 'erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tecnicos
CREATE TABLE public.prisma_tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  matricula TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_tecnicos TO authenticated;
GRANT ALL ON public.prisma_tecnicos TO service_role;
ALTER TABLE public.prisma_tecnicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_tecnicos" ON public.prisma_tecnicos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_tecnicos_user ON public.prisma_tecnicos(user_id);

-- equipes
CREATE TABLE public.prisma_equipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipes TO authenticated;
GRANT ALL ON public.prisma_equipes TO service_role;
ALTER TABLE public.prisma_equipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_equipes" ON public.prisma_equipes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_equipes_user ON public.prisma_equipes(user_id);

-- equipe_tecnicos
CREATE TABLE public.prisma_equipe_tecnicos (
  equipe_id UUID NOT NULL REFERENCES public.prisma_equipes(id) ON DELETE CASCADE,
  tecnico_id UUID NOT NULL REFERENCES public.prisma_tecnicos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (equipe_id, tecnico_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipe_tecnicos TO authenticated;
GRANT ALL ON public.prisma_equipe_tecnicos TO service_role;
ALTER TABLE public.prisma_equipe_tecnicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_equipe_tecnicos" ON public.prisma_equipe_tecnicos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- lotes
CREATE TABLE public.prisma_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  categoria public.prisma_lote_categoria NOT NULL DEFAULT 'geral',
  data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  hora_limite_jornada TIME NOT NULL DEFAULT '17:00',
  duracao_padrao_horas NUMERIC(4,2) NOT NULL DEFAULT 1,
  status public.prisma_lote_status NOT NULL DEFAULT 'rascunho',
  total_os INT NOT NULL DEFAULT 0,
  os_concluidas INT NOT NULL DEFAULT 0,
  os_com_erro INT NOT NULL DEFAULT 0,
  iniciado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lotes TO authenticated;
GRANT ALL ON public.prisma_lotes TO service_role;
ALTER TABLE public.prisma_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_lotes" ON public.prisma_lotes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_lotes_user_status ON public.prisma_lotes(user_id, status);
CREATE INDEX idx_prisma_lotes_criado ON public.prisma_lotes(criado_em DESC);

-- os_itens
CREATE TABLE public.prisma_os_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID NOT NULL REFERENCES public.prisma_lotes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_os TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  status public.prisma_os_status NOT NULL DEFAULT 'pendente',
  mensagem_erro TEXT,
  iniciado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_os_itens TO authenticated;
GRANT ALL ON public.prisma_os_itens TO service_role;
ALTER TABLE public.prisma_os_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_os_itens" ON public.prisma_os_itens FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_os_itens_lote ON public.prisma_os_itens(lote_id, ordem);

-- lote_tecnicos
CREATE TABLE public.prisma_lote_tecnicos (
  lote_id UUID NOT NULL REFERENCES public.prisma_lotes(id) ON DELETE CASCADE,
  tecnico_id UUID NOT NULL REFERENCES public.prisma_tecnicos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (lote_id, tecnico_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lote_tecnicos TO authenticated;
GRANT ALL ON public.prisma_lote_tecnicos TO service_role;
ALTER TABLE public.prisma_lote_tecnicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_lote_tecnicos" ON public.prisma_lote_tecnicos FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- execucao_logs
CREATE TABLE public.prisma_execucao_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.prisma_lotes(id) ON DELETE CASCADE,
  os_item_id UUID REFERENCES public.prisma_os_itens(id) ON DELETE SET NULL,
  etapa TEXT NOT NULL,
  status TEXT NOT NULL,
  mensagem TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_execucao_logs TO authenticated;
GRANT ALL ON public.prisma_execucao_logs TO service_role;
ALTER TABLE public.prisma_execucao_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_logs" ON public.prisma_execucao_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_prisma_logs_lote ON public.prisma_execucao_logs(lote_id, criado_em);

-- extensao_status
CREATE TABLE public.prisma_extensao_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ultima_atividade TIMESTAMPTZ NOT NULL DEFAULT now(),
  versao TEXT,
  info JSONB
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_extensao_status TO authenticated;
GRANT ALL ON public.prisma_extensao_status TO service_role;
ALTER TABLE public.prisma_extensao_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ext_status" ON public.prisma_extensao_status FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger reuse
CREATE OR REPLACE FUNCTION public.prisma_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_prisma_tecnicos_upd BEFORE UPDATE ON public.prisma_tecnicos
  FOR EACH ROW EXECUTE FUNCTION public.prisma_touch_updated_at();
CREATE TRIGGER trg_prisma_equipes_upd BEFORE UPDATE ON public.prisma_equipes
  FOR EACH ROW EXECUTE FUNCTION public.prisma_touch_updated_at();
CREATE TRIGGER trg_prisma_lotes_upd BEFORE UPDATE ON public.prisma_lotes
  FOR EACH ROW EXECUTE FUNCTION public.prisma_touch_updated_at();
CREATE TRIGGER trg_prisma_os_itens_upd BEFORE UPDATE ON public.prisma_os_itens
  FOR EACH ROW EXECUTE FUNCTION public.prisma_touch_updated_at();

-- Progress counter trigger on os_itens
CREATE OR REPLACE FUNCTION public.prisma_recalc_lote()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_lote UUID;
BEGIN
  v_lote := COALESCE(NEW.lote_id, OLD.lote_id);
  UPDATE public.prisma_lotes l SET
    total_os = (SELECT count(*) FROM public.prisma_os_itens WHERE lote_id = v_lote),
    os_concluidas = (SELECT count(*) FROM public.prisma_os_itens WHERE lote_id = v_lote AND status = 'concluido'),
    os_com_erro = (SELECT count(*) FROM public.prisma_os_itens WHERE lote_id = v_lote AND status = 'erro')
  WHERE l.id = v_lote;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_prisma_os_progress
AFTER INSERT OR UPDATE OR DELETE ON public.prisma_os_itens
FOR EACH ROW EXECUTE FUNCTION public.prisma_recalc_lote();

-- Realtime
ALTER TABLE public.prisma_lotes REPLICA IDENTITY FULL;
ALTER TABLE public.prisma_os_itens REPLICA IDENTITY FULL;
ALTER TABLE public.prisma_execucao_logs REPLICA IDENTITY FULL;
ALTER TABLE public.prisma_extensao_status REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.prisma_lotes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prisma_os_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prisma_execucao_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prisma_extensao_status;
