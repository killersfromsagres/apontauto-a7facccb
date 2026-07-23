GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_tecnicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_equipe_tecnicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_os_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_lote_tecnicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_execucao_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prisma_extensao_status TO authenticated;
GRANT ALL ON public.prisma_tecnicos, public.prisma_equipes, public.prisma_equipe_tecnicos, public.prisma_lotes, public.prisma_os_itens, public.prisma_lote_tecnicos, public.prisma_execucao_logs, public.prisma_extensao_status TO service_role;