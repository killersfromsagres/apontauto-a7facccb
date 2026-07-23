DROP TABLE IF EXISTS public.prisma_execucao_logs CASCADE;
DROP TABLE IF EXISTS public.prisma_os_itens CASCADE;
DROP TABLE IF EXISTS public.prisma_lote_tecnicos CASCADE;
DROP TABLE IF EXISTS public.prisma_lotes CASCADE;
DROP TABLE IF EXISTS public.prisma_equipe_tecnicos CASCADE;
DROP TABLE IF EXISTS public.prisma_equipes CASCADE;
DROP TABLE IF EXISTS public.prisma_tecnicos CASCADE;
DROP TABLE IF EXISTS public.prisma_extensao_status CASCADE;

UPDATE public.profiles
SET allowed_menus = array_remove(allowed_menus, 'prisma')
WHERE allowed_menus IS NOT NULL AND 'prisma' = ANY(allowed_menus);