-- Disposable fixtures. No existing account is removed or changed.
begin;
create temporary table sherwin_fixture as select gen_random_uuid() account1,gen_random_uuid() account2,
  '990000'||lpad(floor(random()*999999999999)::bigint::text,12,'0') as suffix,
  (select user_id from public.user_roles where role='admin' limit 1) admin_id;
insert into auth.users(id,email,raw_user_meta_data,aud,role)
select account1,'sherwin'||suffix||'@cliente.demarchi.local','{"full_name":"QA cliente Sherwin"}'::jsonb,'authenticated','authenticated' from sherwin_fixture
union all select account2,'sherwin'||suffix||'2@cliente.demarchi.local','{"full_name":"QA proteção admin"}'::jsonb,'authenticated','authenticated' from sherwin_fixture;
select public.dem_finish_client_account(admin_id,account1,'QA cliente Sherwin',suffix) from sherwin_fixture;
select public.dem_finish_client_account(admin_id,account2,'QA proteção admin','Sherwin'||suffix||'2') from sherwin_fixture;
do $$ begin
  if not exists(select 1 from public.dem_people p join sherwin_fixture f on p.user_id=f.account1 where p.login_id='sherwin'||f.suffix) then raise exception 'Numeric suffix registration failed'; end if;
  if has_function_privilege('authenticated','public.dem_archive_client_account(uuid,uuid)','execute') or has_function_privilege('anon','public.dem_archive_client_account(uuid,uuid)','execute') then raise exception 'Client removal exposed'; end if;
  begin
    perform public.dem_archive_client_account((select account1 from sherwin_fixture),(select id from public.dem_people where user_id=(select account2 from sherwin_fixture)));
    raise exception 'UNEXPECTED non-admin removal allowed';
  exception when others then if sqlerrm like 'UNEXPECTED%' then raise; end if; end;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',account1,'role','authenticated')::text,true) from sherwin_fixture;
set local role authenticated;
insert into public.dem_tickets(title,description,asset_id,priority) select 'QA chamado preservado','Verificar preservação do histórico.',id,'baixa' from public.dem_assets where kind='ambiente' limit 1;
reset role;
select public.dem_archive_client_account(admin_id,(select id from public.dem_people where user_id=account1)) from sherwin_fixture;
do $$ begin
  if not exists(select 1 from public.dem_people where user_id=(select account1 from sherwin_fixture) and not active and removed_at is not null) then raise exception 'Archived account not blocked'; end if;
  if not exists(select 1 from public.dem_tickets where requester_id=(select account1 from sherwin_fixture)) then raise exception 'Removal lost ticket history'; end if;
  if exists(select 1 from public.user_module_access where user_id=(select account1 from sherwin_fixture) and module_key='portal-cliente') then raise exception 'Portal permission not revoked'; end if;
end; $$;
-- Even a stale administrator edit that re-enables the active flag cannot
-- restore access to an archived identity.
update public.dem_people set active=true where user_id=(select account1 from sherwin_fixture);
set local role authenticated;
do $$ begin
  if dem_private.is_member() then raise exception 'Old authenticated token retained membership'; end if;
  if exists(select 1 from public.dem_tickets where requester_id=auth.uid()) then raise exception 'Archived client still reads tickets'; end if;
end; $$;
reset role;
insert into public.user_roles(user_id,role) select account2,'admin' from sherwin_fixture on conflict do nothing;
do $$ begin
  begin
    perform public.dem_archive_client_account((select admin_id from sherwin_fixture),(select id from public.dem_people where user_id=(select account2 from sherwin_fixture)));
    raise exception 'UNEXPECTED admin removal allowed';
  exception when others then if sqlerrm like 'UNEXPECTED%' then raise; end if; end;
end; $$;
select jsonb_build_object('sherwin_registration',true,'leading_zeroes',true,'only_admin_can_remove',true,'admin_accounts_protected',true,'existing_session_data_blocked',true,'request_history_preserved',true) as tests;
rollback;
