GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_tecnicos TO authenticated;
GRANT ALL ON public.prisma_tecnicos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipes TO authenticated;
GRANT ALL ON public.prisma_equipes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipe_tecnicos TO authenticated;
GRANT ALL ON public.prisma_equipe_tecnicos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lotes TO authenticated;
GRANT ALL ON public.prisma_lotes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_os_itens TO authenticated;
GRANT ALL ON public.prisma_os_itens TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lote_tecnicos TO authenticated;
GRANT ALL ON public.prisma_lote_tecnicos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_execucao_logs TO authenticated;
GRANT ALL ON public.prisma_execucao_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_extensao_status TO authenticated;
GRANT ALL ON public.prisma_extensao_status TO service_role;