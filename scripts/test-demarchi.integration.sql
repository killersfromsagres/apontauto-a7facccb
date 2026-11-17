-- Runs against the installed schema. All test users/data roll back at the end.
begin;
create temporary table dem_test_fixture as select gen_random_uuid() c1, gen_random_uuid() c2, gen_random_uuid() tech, gen_random_uuid() new_account,
  (select user_id from public.user_roles where role='admin' limit 1) admin_id,
  (select id from public.dem_assets where kind='ambiente' limit 1) asset_id;
create temporary table dem_test_tickets(id uuid, label text);
create temporary table dem_test_results(name text, passed boolean);
grant select on dem_test_fixture to authenticated;
grant select,insert on dem_test_tickets,dem_test_results to authenticated;
insert into auth.users(id,email,raw_user_meta_data,aud,role)
select c1,c1::text||'@example.invalid','{"full_name":"QA solicitante 1"}'::jsonb,'authenticated','authenticated' from dem_test_fixture
union all select c2,c2::text||'@example.invalid','{"full_name":"QA solicitante 2"}'::jsonb,'authenticated','authenticated' from dem_test_fixture
union all select tech,tech::text||'@example.invalid','{"full_name":"QA técnico"}'::jsonb,'authenticated','authenticated' from dem_test_fixture
union all select new_account,new_account::text||'@example.invalid','{"full_name":"QA novo acesso"}'::jsonb,'authenticated','authenticated' from dem_test_fixture;
insert into public.dem_people(user_id,name,email,kind)
select c1,'QA solicitante 1',c1::text||'@example.invalid','solicitante' from dem_test_fixture
union all select c2,'QA solicitante 2',c2::text||'@example.invalid','solicitante' from dem_test_fixture
union all select tech,'QA técnico',tech::text||'@example.invalid','tecnico' from dem_test_fixture;
select public.dem_finish_account(admin_id,new_account,'QA novo acesso',new_account::text||'@example.invalid','solicitante','') from dem_test_fixture;
do $$ begin
  if has_function_privilege('authenticated','public.dem_finish_account(uuid,uuid,text,text,text,text)','execute') then raise exception 'Account provisioning exposed to regular users'; end if;
  if (select count(*) from public.user_module_access where user_id=(select new_account from dem_test_fixture))<>1 or not exists(select 1 from public.user_module_access where user_id=(select new_account from dem_test_fixture) and module_key='portal-cliente') then raise exception 'Account portal permission failed'; end if;
  insert into dem_test_results values('atomic account profile and least-privilege portal permission',true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',c1,'role','authenticated')::text,true) from dem_test_fixture;
set local role authenticated;
do $$ declare t public.dem_tickets; affected integer; begin
  insert into public.dem_tickets(title,description,asset_id,priority,requester_name,number)
    select 'QA reparo emergencial','Descrição de teste de reparo.',asset_id,'emergencial','NOME FORJADO',999999 from dem_test_fixture returning * into t;
  if t.deadline-t.created_at<>interval '1 day' or t.requester_name<>'QA solicitante 1' or t.number=999999 then raise exception 'Identity, protocol or emergency SLA failed'; end if;
  insert into dem_test_tickets values(t.id,'client1');
  perform public.dem_comment_ticket(t.id,'Informação adicional do solicitante.');
  update public.dem_tickets set status='concluido' where id=t.id; get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Client modified management fields'; end if;
  update public.dem_people set kind='tecnico' where user_id=auth.uid(); get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Client modified own authorization'; end if;
  begin perform public.dem_generate_preventives(current_date); raise exception 'UNEXPECTED generation allowed';
  exception when others then if sqlerrm like 'UNEXPECTED%' then raise; end if; end;
  insert into dem_test_results values('requester identity, protocol, 1-day SLA and management isolation',true);
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',c2,'role','authenticated')::text,true) from dem_test_fixture;
set local role authenticated;
do $$ declare t public.dem_tickets; begin
  if exists(select 1 from public.dem_tickets where id in(select id from dem_test_tickets)) then raise exception 'Cross-client ticket leak'; end if;
  if exists(select 1 from public.dem_ticket_events where ticket_id in(select id from dem_test_tickets)) then raise exception 'Cross-client history leak'; end if;
  begin perform public.dem_comment_ticket((select id from dem_test_tickets where label='client1'),'Comentário em chamado alheio.'); raise exception 'UNEXPECTED cross-client comment allowed';
  exception when others then if sqlerrm like 'UNEXPECTED%' then raise; end if; end;
  insert into public.dem_tickets(title,description,asset_id,priority) select 'QA reparo baixa','Descrição de teste de reparo.',asset_id,'baixa' from dem_test_fixture returning * into t;
  if t.deadline-t.created_at<>interval '30 days' then raise exception '30-day SLA failed'; end if;
  insert into dem_test_tickets values(t.id,'client2');
  insert into dem_test_results values('cross-client isolation and 30-day SLA',true);
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true) from dem_test_fixture;
set local role authenticated;
do $$ declare t public.dem_tickets; person uuid; plan uuid; n integer; begin
  select id into person from public.dem_people where user_id=(select tech from dem_test_fixture);
  if (select count(*) from public.dem_tickets where id in(select id from dem_test_tickets))<>2 then raise exception 'Admin cannot see all tickets'; end if;
  update public.dem_tickets set priority='alta',status='programado',scheduled_for=current_date,assigned_to=person
    where id=(select id from dem_test_tickets where label='client1') returning * into t;
  if t.deadline-t.created_at<>interval '7 days' or t.version<>2 then raise exception '7-day SLA or version failed'; end if;
  begin update public.dem_tickets set status='concluido',resolution='Reparo executado.' where id=t.id; raise exception 'UNEXPECTED completion without time entry';
  exception when others then if sqlerrm like 'UNEXPECTED%' then raise; end if; end;
  insert into public.dem_worklogs(ticket_id,person_id,minutes,description) values(t.id,person,60,'Reparo executado.');
  update public.dem_tickets set status='concluido',resolution='Reparo executado.' where id=t.id;
  if (select count(*) from public.dem_ticket_events where ticket_id=t.id)<>4 then raise exception 'Audit history failed'; end if;
  insert into public.dem_preventive_plans(asset_id,name,routine_code,interval_unit,interval_value,next_due)
    select asset_id,'QA rotina preventiva mensal','QA.TEST','mes',1,current_date from dem_test_fixture returning id into plan;
  n:=public.dem_generate_preventives(current_date);
  if n<>1 then raise exception 'Preventive generation count failed: %',n; end if;
  n:=public.dem_generate_preventives(current_date);
  if n<>0 then raise exception 'Preventive duplicate generated'; end if;
  if (select next_due from public.dem_preventive_plans where id=plan)<>(current_date+interval '1 month')::date then raise exception 'Monthly calendar recurrence failed'; end if;
  insert into dem_test_results values('admin scheduling, 7-day SLA, time entry, audit and idempotent monthly preventive',true);
end; $$;
reset role;
select jsonb_agg(jsonb_build_object('test',name,'passed',passed)) as tests from dem_test_results;
rollback;
