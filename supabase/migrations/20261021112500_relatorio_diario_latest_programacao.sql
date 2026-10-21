create or replace function public.get_relatorio_diario_latest_programacao()
returns table (
  os_id uuid,
  periodo_inicio date,
  periodo_fim date,
  dia_indice smallint,
  equipe text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.user_can_access_any(array['relatorio-diario']::text[]) then
    raise exception 'Sem permissão para consultar a programação histórica do relatório diário.';
  end if;

  return query
  select distinct on (h.os_id)
    h.os_id,
    h.periodo_inicio,
    h.periodo_fim,
    h.dia_indice,
    h.equipe,
    h.created_at
  from public.corretiva_programacao_historico h
  where h.evento in ('programada', 'reprogramada')
  order by h.os_id, h.created_at desc;
end;
$$;

revoke all on function public.get_relatorio_diario_latest_programacao() from public;
grant execute on function public.get_relatorio_diario_latest_programacao() to authenticated;
