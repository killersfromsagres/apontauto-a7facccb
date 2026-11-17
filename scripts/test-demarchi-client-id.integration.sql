-- Temporary account/profile fixtures are reverted, including their permissions.
begin;
create temporary table client_id_fixture as select gen_random_uuid() account1,gen_random_uuid() account2,
  (select user_id from public.user_roles where role='admin' limit 1) admin_id;
insert into auth.users(id,email,raw_user_meta_data,aud,role)
select account1,'001234@cliente.demarchi.local','{"full_name":"QA cliente ID"}'::jsonb,'authenticated','authenticated' from client_id_fixture
union all select account2,'outro@cliente.demarchi.local','{"full_name":"QA cliente ID 2"}'::jsonb,'authenticated','authenticated' from client_id_fixture;
select public.dem_finish_client_account(admin_id,account1,'QA cliente ID',' 001234 ') from client_id_fixture;
do $$ begin
  if not exists(select 1 from public.dem_people where user_id=(select account1 from client_id_fixture) and login_id='001234' and name='QA cliente ID' and email='') then raise exception 'Client ID, name or email-free contact profile failed'; end if;
  if has_function_privilege('authenticated','public.dem_finish_client_account(uuid,uuid,text,text)','execute') or has_function_privilege('anon','public.dem_finish_client_account(uuid,uuid,text,text)','execute') then raise exception 'Client account provisioning exposed'; end if;
  begin
    perform public.dem_finish_client_account((select admin_id from client_id_fixture),(select account2 from client_id_fixture),'QA cliente ID 2','001234');
    raise exception 'UNEXPECTED identity mismatch accepted';
  exception when others then if sqlerrm like 'UNEXPECTED%' then raise; end if; end;
  if exists(select 1 from public.dem_people where user_id=(select account2 from client_id_fixture)) then raise exception 'Failed provisioning left a partial client profile'; end if;
  begin
    update public.dem_people set login_id='001234' where user_id=(select account2 from client_id_fixture);
    insert into public.dem_people(name,kind,login_id) values('QA duplicado','solicitante','001234');
    raise exception 'UNEXPECTED duplicate client ID accepted';
  exception when unique_violation then null; end;
end; $$;
select jsonb_build_object('leading_zeroes',true,'requester_name_preserved',true,'no_contact_email_required',true,'duplicate_ids_rejected',true,'account_provisioning_restricted',true,'partial_profile_rollback',true) as validation;
rollback;
