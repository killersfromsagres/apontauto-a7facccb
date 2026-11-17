-- Central Demarchi. Additive installation; does not replace any existing OS.
begin;
create schema if not exists dem_private;
revoke all on schema dem_private from public;
grant usage on schema dem_private to authenticated;
create sequence if not exists public.dem_asset_number_seq;
create sequence if not exists public.dem_ticket_number_seq;
create table if not exists public.dem_assets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('DEM' || lpad(nextval('public.dem_asset_number_seq')::text, 6, '0')),
  name text not null check (length(trim(name)) between 1 and 200),
  kind text not null check (kind in ('planta','predio','andar','ambiente','equipamento')),
  parent_id uuid references public.dem_assets(id), source_ref text unique, source_parent text,
  enabled boolean not null default true, created_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create table if not exists public.dem_people (
  id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id),
  name text not null check (length(trim(name)) between 2 and 160),
  email text not null default '', kind text not null check(kind in ('solicitante','tecnico')),
  specialty text not null default '', active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.dem_preventive_plans (
  id uuid primary key default gen_random_uuid(), source_key text unique,
  asset_id uuid not null references public.dem_assets(id), name text not null check(length(trim(name)) > 2),
  routine_code text not null default '', interval_unit text not null check(interval_unit in ('dia','mes')),
  interval_value integer not null check(interval_value between 1 and 365),
  next_due date not null, source_due date, tolerance_days integer not null default 0 check(tolerance_days >= 0),
  active boolean not null default true, instructions text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.dem_tickets (
  id uuid primary key default gen_random_uuid(), number bigint not null unique default nextval('public.dem_ticket_number_seq'),
  title text not null check(length(trim(title)) between 3 and 180),
  description text not null check(length(trim(description)) between 10 and 10000),
  asset_id uuid not null references public.dem_assets(id), location_detail text not null default '',
  requester_id uuid not null default auth.uid() references auth.users(id),
  requester_name text not null default '', requester_email text not null default '',
  priority text not null default 'baixa' check(priority in ('emergencial','alta','baixa')),
  status text not null default 'aberto' check(status in ('aberto','programado','em_execucao','aguardando_material','concluido','cancelado')),
  deadline timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  completed_at timestamptz, scheduled_for date, assigned_to uuid references public.dem_people(id),
  resolution text not null default '', preventive_plan_id uuid references public.dem_preventive_plans(id),
  preventive_occurrence date, version integer not null default 1,
  unique(preventive_plan_id, preventive_occurrence)
);
create table if not exists public.dem_worklogs (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.dem_tickets(id),
  person_id uuid not null references public.dem_people(id), minutes integer not null check(minutes between 1 and 1440),
  description text not null check(length(trim(description)) between 3 and 2000),
  performed_on date not null default current_date, created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.dem_ticket_events (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.dem_tickets(id),
  actor_id uuid references auth.users(id), actor_name text not null,
  message text not null, created_at timestamptz not null default now()
);
create index if not exists dem_assets_parent on public.dem_assets(parent_id);
create index if not exists dem_tickets_requester on public.dem_tickets(requester_id);
create index if not exists dem_tickets_queue on public.dem_tickets(status, priority, deadline);
create index if not exists dem_tickets_assigned on public.dem_tickets(assigned_to);
create index if not exists dem_events_ticket on public.dem_ticket_events(ticket_id, created_at);
create index if not exists dem_logs_ticket on public.dem_worklogs(ticket_id);
create index if not exists dem_logs_person on public.dem_worklogs(person_id);
create index if not exists dem_logs_creator on public.dem_worklogs(created_by);
create index if not exists dem_events_actor on public.dem_ticket_events(actor_id);
create index if not exists dem_plans_asset on public.dem_preventive_plans(asset_id);
create index if not exists dem_tickets_asset on public.dem_tickets(asset_id);
create index if not exists dem_plans_due on public.dem_preventive_plans(next_due) where active;

create or replace function dem_private.is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'); $$;
create or replace function dem_private.is_member() returns boolean language sql stable security definer set search_path = public
as $$ select dem_private.is_admin() or exists(select 1 from public.dem_people where user_id = auth.uid() and active); $$;
create or replace function dem_private.can_read_ticket(target uuid) returns boolean language sql stable security definer set search_path = public
as $$ select dem_private.is_admin() or exists(
  select 1 from public.dem_tickets t where t.id = target and dem_private.is_member() and
  (t.requester_id = auth.uid() or t.assigned_to in (select id from public.dem_people where user_id = auth.uid() and active))
); $$;
revoke all on function dem_private.is_admin(), dem_private.is_member(), dem_private.can_read_ticket(uuid) from public, anon;
grant execute on function dem_private.is_admin(), dem_private.is_member(), dem_private.can_read_ticket(uuid) to authenticated;

alter table public.dem_assets enable row level security;
alter table public.dem_people enable row level security;
alter table public.dem_preventive_plans enable row level security;
alter table public.dem_tickets enable row level security;
alter table public.dem_worklogs enable row level security;
alter table public.dem_ticket_events enable row level security;
grant select, insert, update on public.dem_assets, public.dem_people, public.dem_preventive_plans, public.dem_tickets to authenticated;
grant select, insert on public.dem_worklogs to authenticated;
grant select on public.dem_ticket_events to authenticated;
grant usage on sequence public.dem_asset_number_seq, public.dem_ticket_number_seq to authenticated;
grant all on public.dem_assets, public.dem_people, public.dem_preventive_plans, public.dem_tickets, public.dem_worklogs, public.dem_ticket_events to service_role;
grant usage on sequence public.dem_asset_number_seq, public.dem_ticket_number_seq to service_role;

drop policy if exists dem_assets_read on public.dem_assets;
create policy dem_assets_read on public.dem_assets for select to authenticated using((select dem_private.is_member()));
drop policy if exists dem_assets_write on public.dem_assets;
create policy dem_assets_write on public.dem_assets for all to authenticated using((select dem_private.is_admin())) with check((select dem_private.is_admin()));
drop policy if exists dem_people_read on public.dem_people;
create policy dem_people_read on public.dem_people for select to authenticated using(dem_private.is_admin() or user_id = auth.uid());
drop policy if exists dem_people_write on public.dem_people;
create policy dem_people_write on public.dem_people for all to authenticated using((select dem_private.is_admin())) with check((select dem_private.is_admin()));
drop policy if exists dem_plans_admin on public.dem_preventive_plans;
create policy dem_plans_admin on public.dem_preventive_plans for all to authenticated using((select dem_private.is_admin())) with check((select dem_private.is_admin()));
drop policy if exists dem_tickets_read on public.dem_tickets;
create policy dem_tickets_read on public.dem_tickets for select to authenticated using(dem_private.can_read_ticket(id));
drop policy if exists dem_tickets_insert on public.dem_tickets;
create policy dem_tickets_insert on public.dem_tickets for insert to authenticated with check(dem_private.is_member() and requester_id = auth.uid());
drop policy if exists dem_tickets_admin_update on public.dem_tickets;
create policy dem_tickets_admin_update on public.dem_tickets for update to authenticated using((select dem_private.is_admin())) with check((select dem_private.is_admin()));
drop policy if exists dem_logs_read on public.dem_worklogs;
create policy dem_logs_read on public.dem_worklogs for select to authenticated using(dem_private.is_admin() or person_id in (select id from public.dem_people where user_id=auth.uid() and active));
drop policy if exists dem_logs_insert on public.dem_worklogs;
create policy dem_logs_insert on public.dem_worklogs for insert to authenticated with check(dem_private.is_admin() and created_by=auth.uid());
drop policy if exists dem_events_read on public.dem_ticket_events;
create policy dem_events_read on public.dem_ticket_events for select to authenticated using(dem_private.can_read_ticket(ticket_id));

create or replace function dem_private.validate_asset() returns trigger language plpgsql set search_path = public as $$
declare p public.dem_assets; begin
  if new.parent_id is not null then
    select * into p from public.dem_assets where id = new.parent_id;
    if not found then raise exception 'Ativo pai não encontrado.'; end if;
    if new.kind='planta' or (new.kind='predio' and p.kind<>'planta') or (new.kind='andar' and p.kind<>'predio') or (new.kind='ambiente' and p.kind<>'andar') or (new.kind='equipamento' and p.kind not in ('ambiente','andar','predio')) then
      raise exception 'Hierarquia inválida: selecione um pai do nível anterior.';
    end if;
    if exists(with recursive parents as (select id,parent_id from public.dem_assets where id=new.parent_id union all select a.id,a.parent_id from public.dem_assets a join parents p on a.id=p.parent_id) select 1 from parents where id=new.id) then raise exception 'A localização não pode ser filha de si mesma.'; end if;
  elsif new.kind <> 'planta' then raise exception 'Selecione a localização superior.';
  end if; return new;
end; $$;
drop trigger if exists dem_asset_validation on public.dem_assets;
create trigger dem_asset_validation before insert or update on public.dem_assets for each row execute function dem_private.validate_asset();

create or replace function dem_private.ticket_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare person public.dem_people; begin
  if tg_op='INSERT' then
    if not dem_private.is_member() then raise exception 'Seu acesso ao portal está inativo.'; end if;
    select * into person from public.dem_people where user_id=auth.uid() and active;
    new.requester_id := auth.uid();
    new.requester_name := coalesce(person.name, (select coalesce(raw_user_meta_data->>'full_name',email) from auth.users where id=auth.uid()));
    new.requester_email := coalesce(person.email, (select email from auth.users where id=auth.uid()));
    new.created_at := now(); new.version := 1;
    if not dem_private.is_admin() then
      new.status := 'aberto'; new.scheduled_for := null; new.assigned_to := null;
      new.resolution := ''; new.preventive_plan_id := null; new.preventive_occurrence := null;
    end if;
  else
    if not dem_private.is_admin() then raise exception 'Apenas administradores podem alterar chamados.'; end if;
    new.id := old.id; new.number := old.number; new.requester_id := old.requester_id;
    new.requester_name := old.requester_name; new.requester_email := old.requester_email; new.created_at := old.created_at;
    new.preventive_plan_id := old.preventive_plan_id; new.preventive_occurrence := old.preventive_occurrence;
    new.version := old.version + 1;
  end if;
  if not exists(select 1 from public.dem_assets where id=new.asset_id and enabled) then raise exception 'Selecione um local ativo.'; end if;
  if new.assigned_to is not null and not exists(select 1 from public.dem_people where id=new.assigned_to and kind='tecnico' and active) then raise exception 'Selecione um colaborador técnico ativo.'; end if;
  new.deadline := new.created_at + make_interval(days => case new.priority when 'emergencial' then 1 when 'alta' then 7 else 30 end);
  if new.status='programado' and new.scheduled_for is null then raise exception 'Informe a data da programação.'; end if;
  if new.status='concluido' and length(trim(new.resolution))<5 then raise exception 'Descreva o serviço realizado antes de concluir.'; end if;
  if new.status='concluido' and not exists(select 1 from public.dem_worklogs where ticket_id=new.id) then raise exception 'Registre o apontamento de pelo menos um colaborador antes de concluir.'; end if;
  if new.status in ('concluido','cancelado') then new.completed_at := coalesce(new.completed_at,now()); else new.completed_at := null; end if;
  new.updated_at := now(); return new;
end; $$;
drop trigger if exists dem_ticket_validation on public.dem_tickets;
create trigger dem_ticket_validation before insert or update on public.dem_tickets for each row execute function dem_private.ticket_guard();
create or replace function dem_private.ticket_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare actor text; msg text; begin
  select name into actor from public.dem_people where user_id=auth.uid();
  actor := coalesce(actor, 'Administração');
  if tg_op='INSERT' then msg := 'Chamado aberto.';
  else msg := 'Atualização: ' || new.status || '. Criticidade: ' || new.priority || coalesce('. Programação: ' || new.scheduled_for::text,''); end if;
  insert into public.dem_ticket_events(ticket_id,actor_id,actor_name,message) values(new.id,auth.uid(),actor,msg);
  return new;
end; $$;
drop trigger if exists dem_ticket_history on public.dem_tickets;
create trigger dem_ticket_history after insert or update on public.dem_tickets for each row execute function dem_private.ticket_audit();
create or replace function public.dem_comment_ticket(target_ticket uuid, comment_text text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not dem_private.can_read_ticket(target_ticket) then raise exception 'Sem acesso a este chamado.'; end if;
  if length(trim(comment_text)) not between 2 and 2000 then raise exception 'Escreva entre 2 e 2000 caracteres.'; end if;
  insert into public.dem_ticket_events(ticket_id,actor_id,actor_name,message)
    values(target_ticket,auth.uid(),coalesce((select name from public.dem_people where user_id=auth.uid()),'Administração'),trim(comment_text));
end; $$;
revoke all on function public.dem_comment_ticket(uuid,text) from public, anon;
grant execute on function public.dem_comment_ticket(uuid,text) to authenticated;
create or replace function public.dem_generate_preventives(through_date date) returns integer language plpgsql security definer set search_path=public as $$
declare p public.dem_preventive_plans; generated integer := 0; next_date date; begin
  if not dem_private.is_admin() then raise exception 'Apenas administradores podem gerar preventivas.'; end if;
  if through_date is null or through_date > current_date + 90 or through_date < current_date then raise exception 'Escolha uma data entre hoje e os próximos 90 dias.'; end if;
  for p in select * from public.dem_preventive_plans where active and next_due<=through_date order by next_due,id for update skip locked loop
    while p.next_due<=through_date and generated<200 loop
      insert into public.dem_tickets(title,description,asset_id,priority,status,scheduled_for,preventive_plan_id,preventive_occurrence)
        values(left(p.name,180),coalesce(nullif(p.instructions,''),p.name),p.asset_id,'baixa','programado',p.next_due,p.id,p.next_due)
        on conflict(preventive_plan_id,preventive_occurrence) do nothing;
      if found then generated := generated+1; end if;
      next_date := case when p.interval_unit='mes' then (p.next_due + make_interval(months=>p.interval_value))::date else p.next_due + p.interval_value end;
      p.next_due := next_date;
    end loop;
    update public.dem_preventive_plans set next_due=p.next_due where id=p.id;
    exit when generated>=200;
  end loop;
  return generated;
end; $$;
revoke all on function public.dem_generate_preventives(date) from public, anon;
grant execute on function public.dem_generate_preventives(date) to authenticated;

-- Used only by the authenticated administrator's Edge Function after Auth creates
-- a NEW account. Contact identity and portal permission are saved atomically.
create or replace function public.dem_finish_account(admin_id uuid, account_id uuid, person_name text, contact_email text, person_kind text, person_specialty text)
returns uuid language plpgsql security definer set search_path=public as $$
declare person_id uuid; begin
  if not exists(select 1 from public.user_roles where user_id=admin_id and role='admin') then raise exception 'Apenas administradores podem criar acessos.'; end if;
  if account_id=admin_id or exists(select 1 from public.dem_people where user_id=account_id) then raise exception 'Este acesso já está cadastrado.'; end if;
  insert into public.dem_people(user_id,name,email,kind,specialty) values(account_id,person_name,contact_email,person_kind,person_specialty) returning id into person_id;
  delete from public.user_roles where user_id=account_id;
  insert into public.user_roles(user_id,role) values(account_id,'user');
  delete from public.user_module_access where user_id=account_id;
  insert into public.user_module_access(user_id,module_key) values(account_id,'portal-cliente');
  return person_id;
end; $$;
revoke all on function public.dem_finish_account(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dem_finish_account(uuid,uuid,text,text,text,text) to service_role;
revoke all on function dem_private.ticket_guard(), dem_private.ticket_audit(), dem_private.validate_asset() from public, anon, authenticated;

-- Realtime respects the SELECT policies, including requester isolation.
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['dem_tickets','dem_ticket_events','dem_worklogs'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end; $$;
notify pgrst,'reload schema';
commit;
