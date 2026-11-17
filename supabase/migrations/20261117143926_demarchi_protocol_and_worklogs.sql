-- Server-owned protocol sequence and validation of worklog dates.
begin;
alter table public.dem_tickets alter column number drop default;
create or replace function dem_private.ticket_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare person public.dem_people; begin
  if tg_op='INSERT' then
    if not dem_private.is_member() then raise exception 'Seu acesso ao portal está inativo.'; end if;
    select * into person from public.dem_people where user_id=auth.uid() and active;
    new.requester_id := auth.uid();
    new.requester_name := coalesce(person.name, (select coalesce(raw_user_meta_data->>'full_name',email) from auth.users where id=auth.uid()));
    new.requester_email := coalesce(person.email, (select email from auth.users where id=auth.uid()));
    new.created_at := now(); new.version := 1; new.number := nextval('public.dem_ticket_number_seq');
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

create or replace function dem_private.validate_worklog() returns trigger language plpgsql set search_path=public as $$
begin
  if new.performed_on > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data do apontamento não pode ser futura.'; end if;
  if not exists(select 1 from public.dem_people where id=new.person_id and kind='tecnico' and active) then raise exception 'Selecione um colaborador técnico ativo.'; end if;
  return new;
end; $$;
drop trigger if exists dem_worklog_validation on public.dem_worklogs;
create trigger dem_worklog_validation before insert on public.dem_worklogs for each row execute function dem_private.validate_worklog();
revoke all on function dem_private.validate_worklog() from public,anon,authenticated;
commit;
