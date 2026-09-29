
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
      raise exception 'Programação contém chamado sem identificador';
    end if;

    select *
      into target
      from public.corretiva_os
     where id = (entry->>'os_id')::uuid
     for update;

    if target.id is null then
      raise exception 'Chamado % não foi encontrado', entry->>'numero_os';
    end if;

    if target.status in (
      'concluida'::public.corretiva_os_status,
      'cancelada'::public.corretiva_os_status
    ) then
      raise exception 'OS % foi concluída/cancelada durante a geração; refaça a programação', target.numero_os;
    end if;

    previous_status := coalesce(target.programacao_status, 'disponivel');

    if previous_status = 'em_programacao' then
      raise exception 'OS % já está em outra programação; atualize e gere novamente', target.numero_os;
    end if;

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
