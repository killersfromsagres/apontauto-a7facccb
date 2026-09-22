drop policy if exists refrigeracao_pecas_central_update on public.refrigeracao_pecas;

create policy refrigeracao_pecas_central_update
on public.refrigeracao_pecas
for update
to authenticated
using (
  user_can_access_any(array['corretiva-pecas-status'::text, 'central-materiais-unificada'::text])
)
with check (
  user_can_access_any(array['corretiva-pecas-status'::text, 'central-materiais-unificada'::text])
);
