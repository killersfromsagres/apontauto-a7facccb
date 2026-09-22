create or replace function public.sync_piece_cost_center_to_control_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origin text;
begin
  if tg_table_name = 'corretiva_pecas' then
    v_origin := 'corretiva';
  elsif tg_table_name = 'refrigeracao_pecas' then
    v_origin := 'refrigeracao';
  else
    return new;
  end if;

  if nullif(trim(coalesce(new.centro_custo, '')), '') is null then
    return new;
  end if;

  insert into public.controle_materiais_meta (
    origem, tipo, item_id, centro_custo, status_compra, updated_at
  ) values (
    v_origin, 'peca', new.id, new.centro_custo, 'aguardando', now()
  )
  on conflict (origem, tipo, item_id) do update
  set centro_custo = excluded.centro_custo,
      updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_piece_cost_center_to_control_meta() from public, anon, authenticated;

drop trigger if exists trg_corretiva_pecas_sync_cc_meta on public.corretiva_pecas;
create trigger trg_corretiva_pecas_sync_cc_meta
after insert or update of centro_custo on public.corretiva_pecas
for each row execute function public.sync_piece_cost_center_to_control_meta();

drop trigger if exists trg_refrigeracao_pecas_sync_cc_meta on public.refrigeracao_pecas;
create trigger trg_refrigeracao_pecas_sync_cc_meta
after insert or update of centro_custo on public.refrigeracao_pecas
for each row execute function public.sync_piece_cost_center_to_control_meta();

insert into public.controle_materiais_meta (origem, tipo, item_id, centro_custo, status_compra, updated_at)
select 'corretiva', 'peca', p.id, p.centro_custo, 'aguardando', now()
from public.corretiva_pecas p
where nullif(trim(coalesce(p.centro_custo, '')), '') is not null
on conflict (origem, tipo, item_id) do update
set centro_custo = excluded.centro_custo,
    updated_at = now();

insert into public.controle_materiais_meta (origem, tipo, item_id, centro_custo, status_compra, updated_at)
select 'refrigeracao', 'peca', p.id, p.centro_custo, 'aguardando', now()
from public.refrigeracao_pecas p
where nullif(trim(coalesce(p.centro_custo, '')), '') is not null
on conflict (origem, tipo, item_id) do update
set centro_custo = excluded.centro_custo,
    updated_at = now();

notify pgrst, 'reload schema';
