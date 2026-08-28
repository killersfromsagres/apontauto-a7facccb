create index mensageria_malotes_created_by_idx
  on public.mensageria_malotes(created_by)
  where created_by is not null;

drop trigger if exists mensageria_setores_set_updated_at on public.mensageria_setores;
drop trigger if exists mensageria_malotes_set_updated_at on public.mensageria_malotes;

create trigger mensageria_setores_set_updated_at
before update on public.mensageria_setores
for each row execute function public.tg_set_updated_at();

create trigger mensageria_malotes_set_updated_at
before update on public.mensageria_malotes
for each row execute function public.tg_set_updated_at();

drop policy if exists "Mensageria setores visiveis por usuarios autorizados" on public.mensageria_setores;
drop policy if exists "Mensageria malotes visiveis por usuarios autorizados" on public.mensageria_malotes;
drop policy if exists "Mensageria malotes inseriveis por usuarios autorizados" on public.mensageria_malotes;
drop policy if exists "Mensageria malotes atualizaveis por usuarios autorizados" on public.mensageria_malotes;

create policy "Mensageria setores visiveis por usuarios autorizados"
on public.mensageria_setores
for select
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
);

create policy "Mensageria malotes visiveis por usuarios autorizados"
on public.mensageria_malotes
for select
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
);

create policy "Mensageria malotes inseriveis por usuarios autorizados"
on public.mensageria_malotes
for insert
to authenticated
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
);

create policy "Mensageria malotes atualizaveis por usuarios autorizados"
on public.mensageria_malotes
for update
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
);
