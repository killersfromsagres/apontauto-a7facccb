drop policy if exists "refrigeracao_os_select" on public.refrigeracao_os;
create policy "refrigeracao_os_select" on public.refrigeracao_os
for select to authenticated
using (public.user_can_access_any(array[
  'refrigeracao',
  'refrigeracao-gestor',
  'refrigeracao-pecas-status',
  'refrigeracao-historico',
  'refrigeracao-historico-permanente',
  'corretiva-pecas-status',
  'controle-materiais',
  'central-materiais-unificada',
  'dashboard',
  'dashboard-chamados'
]::text[]));

drop policy if exists "refrigeracao_pecas_select" on public.refrigeracao_pecas;
create policy "refrigeracao_pecas_select" on public.refrigeracao_pecas
for select to authenticated
using (public.user_can_access_any(array[
  'refrigeracao',
  'refrigeracao-gestor',
  'refrigeracao-pecas-status',
  'refrigeracao-historico',
  'corretiva-pecas-status',
  'controle-materiais',
  'central-materiais-unificada'
]::text[]));

drop policy if exists "refrigeracao_fotos_select" on public.refrigeracao_fotos;
create policy "refrigeracao_fotos_select" on public.refrigeracao_fotos
for select to authenticated
using (public.user_can_access_any(array[
  'refrigeracao',
  'refrigeracao-gestor',
  'refrigeracao-historico',
  'refrigeracao-pecas-status',
  'corretiva-pecas-status',
  'controle-materiais',
  'central-materiais-unificada'
]::text[]));

drop policy if exists "corretiva_fotos_select" on public.corretiva_fotos;
create policy "corretiva_fotos_select" on public.corretiva_fotos
for select to authenticated
using (public.user_can_access_any(array[
  'corretiva-novo',
  'corretiva',
  'corretiva-historico',
  'corretiva-pecas-status',
  'controle-materiais',
  'central-materiais-unificada'
]::text[]));

notify pgrst, 'reload schema';
