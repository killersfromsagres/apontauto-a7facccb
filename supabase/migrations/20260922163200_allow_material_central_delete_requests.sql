drop policy if exists corretiva_pecas_central_delete on public.corretiva_pecas;
create policy corretiva_pecas_central_delete
on public.corretiva_pecas
for delete
to authenticated
using (
  user_can_access_any(array['corretiva-pecas-status'::text, 'central-materiais-unificada'::text])
);

drop policy if exists refrigeracao_pecas_central_delete on public.refrigeracao_pecas;
create policy refrigeracao_pecas_central_delete
on public.refrigeracao_pecas
for delete
to authenticated
using (
  user_can_access_any(array['corretiva-pecas-status'::text, 'central-materiais-unificada'::text])
);
