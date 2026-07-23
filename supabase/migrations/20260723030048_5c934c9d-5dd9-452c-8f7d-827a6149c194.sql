
-- Adiciona colunas faltantes ao esquema Prisma para bater com a spec do painel

-- Renomeia matricula -> codigo_prisma para clareza (mantém tipo text)
ALTER TABLE public.prisma_tecnicos RENAME COLUMN matricula TO codigo_prisma;

-- Hora de início da jornada (defaults 08:00)
ALTER TABLE public.prisma_lotes
  ADD COLUMN IF NOT EXISTS hora_inicio_jornada time NOT NULL DEFAULT '08:00';

-- Horários calculados por OS (agendamento previsto)
ALTER TABLE public.prisma_os_itens
  ADD COLUMN IF NOT EXISTS data_hora_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS data_hora_fim timestamptz;
