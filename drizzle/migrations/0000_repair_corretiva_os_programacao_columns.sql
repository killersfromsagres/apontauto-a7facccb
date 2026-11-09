ALTER TABLE public.corretiva_os
  ADD COLUMN IF NOT EXISTS programacao_status text NOT NULL DEFAULT 'disponivel',
  ADD COLUMN IF NOT EXISTS programacao_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS programacao_periodo_inicio date,
  ADD COLUMN IF NOT EXISTS programacao_periodo_fim date,
  ADD COLUMN IF NOT EXISTS programacao_dia_indice smallint,
  ADD COLUMN IF NOT EXISTS programacao_equipe text,
  ADD COLUMN IF NOT EXISTS programacao_reservada_em timestamptz,
  ADD COLUMN IF NOT EXISTS programacao_nao_realizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS programacao_nao_realizada_motivo text,
  ADD COLUMN IF NOT EXISTS programacao_nao_realizada_observacao text,
  ADD COLUMN IF NOT EXISTS programacao_retorno_fila_em timestamptz,
  ADD COLUMN IF NOT EXISTS programacao_ultima_acao_por uuid;

NOTIFY pgrst, 'reload schema';