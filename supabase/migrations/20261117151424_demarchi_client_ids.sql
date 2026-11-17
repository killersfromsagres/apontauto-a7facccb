begin;
alter table public.dem_people add column if not exists login_id text;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='dem_people_login_id_format' and conrelid='public.dem_people'::regclass) then
    alter table public.dem_people add constraint dem_people_login_id_format check(login_id is null or login_id ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
  end if;
end; $$;
create unique index if not exists dem_people_login_id_key on public.dem_people(login_id) where login_id is not null;

-- Only the administrator-authorized Edge Function may bind a new Auth account
-- to a client ID. The existing account-provisioning transaction stays intact.
create or replace function public.dem_finish_client_account(admin_id uuid, account_id uuid, person_name text, client_login_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare person_id uuid; normalized_id text := lower(trim(client_login_id)); begin
  if normalized_id is null or normalized_id !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then raise exception 'ID inválido. Use de 3 a 40 caracteres.'; end if;
  if not exists(select 1 from public.user_roles where user_id=admin_id and role='admin') then raise exception 'Apenas administradores podem criar clientes.'; end if;
  if not exists(select 1 from auth.users where id=account_id and email=normalized_id||'@cliente.demarchi.local') then raise exception 'O ID não corresponde ao acesso criado.'; end if;
  person_id := public.dem_finish_account(admin_id,account_id,person_name,'','solicitante','');
  update public.dem_people set login_id=normalized_id where id=person_id;
  return person_id;
end; $$;
revoke all on function public.dem_finish_client_account(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.dem_finish_client_account(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
