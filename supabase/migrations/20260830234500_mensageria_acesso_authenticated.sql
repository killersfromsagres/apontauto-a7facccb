-- Libera a operação da Mensageria para qualquer sessão autenticada.
-- O acesso anônimo permanece revogado porque os protocolos contêm dados pessoais e assinaturas.

alter table public.mensageria_setores enable row level security;
alter table public.mensageria_malotes enable row level security;

revoke all on public.mensageria_setores from anon, authenticated;
revoke all on public.mensageria_malotes from anon, authenticated;

grant select on public.mensageria_setores to authenticated;
grant select, insert, update on public.mensageria_malotes to authenticated;
grant all on public.mensageria_setores to service_role;
grant all on public.mensageria_malotes to service_role;

drop policy if exists "Mensageria setores visiveis por usuarios autorizados"
  on public.mensageria_setores;
drop policy if exists "Mensageria malotes visiveis por usuarios autorizados"
  on public.mensageria_malotes;
drop policy if exists "Mensageria malotes inseriveis por usuarios autorizados"
  on public.mensageria_malotes;
drop policy if exists "Mensageria malotes atualizaveis por usuarios autorizados"
  on public.mensageria_malotes;

drop policy if exists "Mensageria setores para autenticados"
  on public.mensageria_setores;
drop policy if exists "Mensageria malotes leitura para autenticados"
  on public.mensageria_malotes;
drop policy if exists "Mensageria malotes inclusao para autenticados"
  on public.mensageria_malotes;
drop policy if exists "Mensageria malotes atualizacao para autenticados"
  on public.mensageria_malotes;

create policy "Mensageria setores para autenticados"
on public.mensageria_setores
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Mensageria malotes leitura para autenticados"
on public.mensageria_malotes
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Mensageria malotes inclusao para autenticados"
on public.mensageria_malotes
for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Mensageria malotes atualizacao para autenticados"
on public.mensageria_malotes
for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

notify pgrst, 'reload schema';
