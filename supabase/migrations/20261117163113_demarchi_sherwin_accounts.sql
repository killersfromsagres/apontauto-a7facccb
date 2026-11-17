begin;
alter table public.dem_people add column if not exists removed_at timestamptz;

create or replace function public.dem_finish_client_account(admin_id uuid, account_id uuid, person_name text, client_login_id text)
returns uuid language plpgsql security definer set search_path=public as $$
declare person_id uuid; normalized_id text := lower(trim(client_login_id)); begin
  if normalized_id ~ '^[0-9]{1,33}$' then normalized_id := 'sherwin'||normalized_id; end if;
  if normalized_id is null or normalized_id !~ '^sherwin[0-9]{1,33}$' then raise exception 'Use Sherwin seguido somente da numeração.'; end if;
  if not exists(select 1 from public.user_roles where user_id=admin_id and role='admin') then raise exception 'Apenas administradores podem criar clientes.'; end if;
  if not exists(select 1 from auth.users where id=account_id and email=normalized_id||'@cliente.demarchi.local') then raise exception 'O ID não corresponde ao acesso criado.'; end if;
  person_id := public.dem_finish_account(admin_id,account_id,person_name,'','solicitante','');
  update public.dem_people set login_id=normalized_id where id=person_id;
  return person_id;
end; $$;
revoke all on function public.dem_finish_client_account(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.dem_finish_client_account(uuid,uuid,text,text) to service_role;

create or replace function public.dem_archive_client_account(admin_id uuid, person_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target public.dem_people; begin
  if not exists(select 1 from public.user_roles where user_id=admin_id and role='admin') then raise exception 'Apenas administradores podem remover clientes.'; end if;
  select * into target from public.dem_people where id=person_id and kind='solicitante' for update;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  if target.user_id=admin_id or exists(select 1 from public.user_roles where user_id=target.user_id and role='admin') then raise exception 'Contas administradoras não podem ser removidas nesta seção.'; end if;
  update public.dem_people set active=false,removed_at=coalesce(removed_at,now()) where id=target.id;
  delete from public.user_module_access where user_id=target.user_id and module_key='portal-cliente';
end; $$;
revoke all on function public.dem_archive_client_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dem_archive_client_account(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
