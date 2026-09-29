-- Corretiva-Novo: programação persistente, não realizado e reprogramação auditável.

alter table public.corretiva_os
  add column if not exists programacao_status text not null default 'disponivel',
  add column if not exists programacao_tentativas integer not null default 0,
  add column if not exists programacao_periodo_inicio date,
  add column if not exists programacao_periodo_fim date,
  add column if not exists programacao_dia_indice smallint,
  add column if not exists programacao_equipe text,
  add column if not exists programacao_reservada_em timestamptz,
  add column if not exists programacao_nao_realizada_em timestamptz,
  add column if not exists programacao_nao_realizada_motivo text,
  add column if not exists programacao_nao_realizada_observacao text,
  add column if not exists programacao_retorno_fila_em timestamptz,
  add column if not exists programacao_ultima_acao_por uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corretiva_os'::regclass
      and conname = 'corretiva_os_programacao_status_ck'
  ) then
    alter table public.corretiva_os
      add constraint corretiva_os_programacao_status_ck
      check (programacao_status in ('disponivel','em_programacao','reprogramacao_pendente'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.corretiva_os'::regclass
      and conname = 'corretiva_os_programacao_dia_ck'
  ) then
    alter table public.corretiva_os
      add constraint corretiva_os_programacao_dia_ck
      check (programacao_dia_indice is null or programacao_dia_indice between 0 and 4);
  end if;
end $$;

create index if not exists idx_corretiva_os_programacao_status
  on public.corretiva_os (programacao_status, equipe, data_sla, data_criacao);

create table if not exists public.corretiva_programacao_historico (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.corretiva_os(id) on delete cascade,
  numero_os text not null,
  evento text not null,
  tentativa integer not null default 0,
  periodo_inicio date,
  periodo_fim date,
  dia_indice smallint,
  equipe text,
  motivo text,
  observacao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint corretiva_programacao_historico_evento_ck
    check (evento in ('programada','reprogramada','nao_realizada','retirada')),
  constraint corretiva_programacao_historico_dia_ck
    check (dia_indice is null or dia_indice between 0 and 4)
);

create index if not exists idx_corretiva_programacao_hist_os
  on public.corretiva_programacao_historico (os_id, created_at desc);

alter table public.corretiva_programacao_historico enable row level security;

drop policy if exists corretiva_programacao_historico_select
  on public.corretiva_programacao_historico;
create policy corretiva_programacao_historico_select
  on public.corretiva_programacao_historico
  for select to authenticated
  using (
    public.user_can_access_any(
      array['corretiva-novo','corretiva','programacao','corretiva-historico','dashboard','dashboard-chamados']
    )
  );

revoke all on public.corretiva_programacao_historico from anon;
grant select on public.corretiva_programacao_historico to authenticated;

create or replace function public.register_corretiva_programacao_batch(_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  target public.corretiva_os;
  previous_status text;
  next_attempt integer;
  affected integer := 0;
  event_name text;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida';
  end if;

  if not public.user_can_access_any(array['programacao','corretiva-novo','corretiva']) then
    raise exception 'Sem permissão para registrar programação de corretivas';
  end if;

  if _entries is null or jsonb_typeof(_entries) <> 'array' then
    raise exception 'Programação inválida';
  end if;

  for entry in select value from jsonb_array_elements(_entries)
  loop
    if nullif(entry->>'os_id', '') is null then
      continue;
    end if;

    select *
      into target
      from public.corretiva_os
     where id = (entry->>'os_id')::uuid
     for update;

    if target.id is null then
      continue;
    end if;

    if target.status in (
      'concluida'::public.corretiva_os_status,
      'cancelada'::public.corretiva_os_status
    ) then
      continue;
    end if;

    previous_status := coalesce(target.programacao_status, 'disponivel');
    next_attempt := coalesce(target.programacao_tentativas, 0) + 1;
    event_name := case
      when previous_status = 'reprogramacao_pendente' then 'reprogramada'
      else 'programada'
    end;

    update public.corretiva_os
       set programacao_status = 'em_programacao',
           programacao_tentativas = next_attempt,
           programacao_periodo_inicio = nullif(entry->>'period_start', '')::date,
           programacao_periodo_fim = nullif(entry->>'period_end', '')::date,
           programacao_dia_indice = nullif(entry->>'day_index', '')::smallint,
           programacao_equipe = nullif(trim(entry->>'equipe'), ''),
           programacao_reservada_em = now(),
           programacao_retorno_fila_em = null,
           programacao_ultima_acao_por = auth.uid(),
           updated_at = now()
     where id = target.id;

    insert into public.corretiva_programacao_historico (
      os_id,
      numero_os,
      evento,
      tentativa,
      periodo_inicio,
      periodo_fim,
      dia_indice,
      equipe,
      created_by
    ) values (
      target.id,
      target.numero_os,
      event_name,
      next_attempt,
      nullif(entry->>'period_start', '')::date,
      nullif(entry->>'period_end', '')::date,
      nullif(entry->>'day_index', '')::smallint,
      nullif(trim(entry->>'equipe'), ''),
      auth.uid()
    );

    affected := affected + 1;
  end loop;

  return affected;
end;
$$;

revoke all on function public.register_corretiva_programacao_batch(jsonb) from public;
revoke all on function public.register_corretiva_programacao_batch(jsonb) from anon;
grant execute on function public.register_corretiva_programacao_batch(jsonb) to authenticated;

create or replace function public.mark_corretiva_programacao_nao_realizada(
  _os_id uuid,
  _motivo text,
  _observacao text default null,
  _period_start date default null,
  _period_end date default null,
  _day_index smallint default null,
  _equipe text default null
)
returns public.corretiva_os
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.corretiva_os;
  result public.corretiva_os;
  effective_attempt integer;
  effective_start date;
  effective_end date;
  effective_day smallint;
  effective_team text;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida';
  end if;

  if not public.user_can_access_any(array['corretiva-novo','corretiva','programacao']) then
    raise exception 'Sem permissão para devolver este chamado à programação';
  end if;

  if nullif(trim(_motivo), '') is null then
    raise exception 'Informe o motivo de não realização';
  end if;

  select *
    into target
    from public.corretiva_os
   where id = _os_id
   for update;

  if target.id is null then
    raise exception 'Chamado não encontrado';
  end if;

  if target.status in (
    'concluida'::public.corretiva_os_status,
    'cancelada'::public.corretiva_os_status
  ) then
    raise exception 'Chamado concluído ou cancelado não pode ser reprogramado';
  end if;

  effective_attempt := greatest(coalesce(target.programacao_tentativas, 0), 1);
  effective_start := coalesce(target.programacao_periodo_inicio, _period_start);
  effective_end := coalesce(target.programacao_periodo_fim, _period_end);
  effective_day := coalesce(target.programacao_dia_indice, _day_index);
  effective_team := coalesce(nullif(trim(target.programacao_equipe), ''), nullif(trim(_equipe), ''));

  insert into public.corretiva_programacao_historico (
    os_id,
    numero_os,
    evento,
    tentativa,
    periodo_inicio,
    periodo_fim,
    dia_indice,
    equipe,
    motivo,
    observacao,
    created_by
  ) values (
    target.id,
    target.numero_os,
    'nao_realizada',
    effective_attempt,
    effective_start,
    effective_end,
    effective_day,
    effective_team,
    trim(_motivo),
    nullif(trim(_observacao), ''),
    auth.uid()
  );

  update public.corretiva_os
     set programacao_status = 'reprogramacao_pendente',
         programacao_tentativas = effective_attempt,
         programacao_periodo_inicio = null,
         programacao_periodo_fim = null,
         programacao_dia_indice = null,
         programacao_equipe = null,
         programacao_reservada_em = null,
         programacao_nao_realizada_em = now(),
         programacao_nao_realizada_motivo = trim(_motivo),
         programacao_nao_realizada_observacao = nullif(trim(_observacao), ''),
         programacao_retorno_fila_em = now(),
         programacao_ultima_acao_por = auth.uid(),
         updated_at = now()
   where id = target.id
   returning * into result;

  return result;
end;
$$;

revoke all on function public.mark_corretiva_programacao_nao_realizada(
  uuid,text,text,date,date,smallint,text
) from public;
revoke all on function public.mark_corretiva_programacao_nao_realizada(
  uuid,text,text,date,date,smallint,text
) from anon;
grant execute on function public.mark_corretiva_programacao_nao_realizada(
  uuid,text,text,date,date,smallint,text
) to authenticated;
