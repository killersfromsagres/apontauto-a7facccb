-- Corrige o salvamento de "Observações de campo" em Corretiva > Novo.
-- A interface já persistia este campo em corretiva_os, mas a coluna ainda não
-- existia no schema do banco, causando erro do PostgREST ao salvar.

ALTER TABLE public.corretiva_os
  ADD COLUMN IF NOT EXISTS observacao_conclusao TEXT;

COMMENT ON COLUMN public.corretiva_os.observacao_conclusao IS
  'Observação de campo registrada durante a execução da OS corretiva.';

-- Garante que a API REST atualize o cache de schema após a migration.
NOTIFY pgrst, 'reload schema';
