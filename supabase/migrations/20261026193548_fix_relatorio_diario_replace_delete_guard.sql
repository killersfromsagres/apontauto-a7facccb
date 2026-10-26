create or replace function public.save_relatorio_diario_programacao(
  _rows jsonb,
  _replace boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  if auth.uid() is null or not public.user_can_access_any(array['relatorio-diario']::text[]) then
    raise exception 'Sem permissão para atualizar a programação compartilhada.';
  end if;

  if jsonb_typeof(coalesce(_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Formato inválido para a programação compartilhada.';
  end if;

  if _replace then
    -- O filtro pela chave primária satisfaz a proteção contra DELETE sem filtro.
    -- item_key é PRIMARY KEY e, portanto, não pode ser nulo.
    delete from public.relatorio_diario_programacao_rows
    where item_key is not null;
  end if;

  insert into public.relatorio_diario_programacao_rows (
    item_key,
    atividade_data,
    source_file,
    payload,
    imported_by,
    updated_at
  )
  select
    elem->>'id',
    (elem->>'date')::date,
    nullif(elem->>'sourceFile', ''),
    elem,
    auth.uid(),
    now()
  from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) as elem
  where nullif(elem->>'id', '') is not null
    and coalesce(elem->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
  on conflict (item_key) do update set
    atividade_data = excluded.atividade_data,
    source_file = excluded.source_file,
    payload = excluded.payload,
    imported_by = excluded.imported_by,
    updated_at = now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.save_relatorio_diario_programacao(jsonb, boolean) from public;
grant execute on function public.save_relatorio_diario_programacao(jsonb, boolean) to authenticated;
