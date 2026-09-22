create table if not exists public.material_asset_cost_centers (
  asset_code text primary key,
  cost_center text not null,
  asset_name text,
  source_name text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.normalize_material_asset_cost_center()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.asset_code := upper(trim(new.asset_code));
  new.cost_center := upper(trim(new.cost_center));
  new.asset_name := nullif(trim(coalesce(new.asset_name, '')), '');
  new.source_name := nullif(trim(coalesce(new.source_name, '')), '');
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.imported_at := coalesce(new.imported_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_material_asset_cost_center on public.material_asset_cost_centers;
create trigger trg_normalize_material_asset_cost_center
before insert or update on public.material_asset_cost_centers
for each row execute function public.normalize_material_asset_cost_center();

alter table public.corretiva_pecas add column if not exists centro_custo text;
alter table public.refrigeracao_pecas add column if not exists centro_custo text;

create index if not exists idx_material_asset_cost_centers_cost_center on public.material_asset_cost_centers (cost_center);
create index if not exists idx_corretiva_pecas_centro_custo on public.corretiva_pecas (centro_custo);
create index if not exists idx_refrigeracao_pecas_centro_custo on public.refrigeracao_pecas (centro_custo);

create or replace function public.assign_piece_cost_center_from_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset text;
  v_cost_center text;
begin
  if tg_table_name = 'corretiva_pecas' then
    select upper(trim(coalesce(o.ativo, ''))) into v_asset
      from public.corretiva_os o where o.id = new.os_id;
  elsif tg_table_name = 'refrigeracao_pecas' then
    select upper(trim(coalesce(o.ativo, ''))) into v_asset
      from public.refrigeracao_os o where o.id = new.os_id;
  end if;

  if nullif(v_asset, '') is not null then
    select m.cost_center into v_cost_center
      from public.material_asset_cost_centers m where m.asset_code = v_asset;
  end if;

  if nullif(v_cost_center, '') is not null then
    new.centro_custo := v_cost_center;
  end if;
  return new;
end;
$$;

revoke all on function public.assign_piece_cost_center_from_asset() from public, anon, authenticated;

drop trigger if exists trg_corretiva_pecas_auto_cc on public.corretiva_pecas;
create trigger trg_corretiva_pecas_auto_cc
before insert or update of os_id on public.corretiva_pecas
for each row execute function public.assign_piece_cost_center_from_asset();

drop trigger if exists trg_refrigeracao_pecas_auto_cc on public.refrigeracao_pecas;
create trigger trg_refrigeracao_pecas_auto_cc
before insert or update of os_id on public.refrigeracao_pecas
for each row execute function public.assign_piece_cost_center_from_asset();

create or replace function public.propagate_asset_cost_center_to_pieces()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset text;
  v_cost_center text;
begin
  if tg_op = 'DELETE' then
    v_asset := old.asset_code;
    update public.corretiva_pecas p
       set centro_custo = null, updated_at = now()
      from public.corretiva_os o
     where o.id = p.os_id
       and upper(trim(coalesce(o.ativo, ''))) = v_asset
       and p.centro_custo = old.cost_center;
    update public.refrigeracao_pecas p
       set centro_custo = null, updated_at = now()
      from public.refrigeracao_os o
     where o.id = p.os_id
       and upper(trim(coalesce(o.ativo, ''))) = v_asset
       and p.centro_custo = old.cost_center;
    return old;
  end if;

  v_asset := new.asset_code;
  v_cost_center := new.cost_center;

  update public.corretiva_pecas p
     set centro_custo = v_cost_center, updated_at = now()
    from public.corretiva_os o
   where o.id = p.os_id
     and upper(trim(coalesce(o.ativo, ''))) = v_asset;

  update public.refrigeracao_pecas p
     set centro_custo = v_cost_center, updated_at = now()
    from public.refrigeracao_os o
   where o.id = p.os_id
     and upper(trim(coalesce(o.ativo, ''))) = v_asset;

  return new;
end;
$$;

revoke all on function public.propagate_asset_cost_center_to_pieces() from public, anon, authenticated;

drop trigger if exists trg_propagate_asset_cost_center_to_pieces on public.material_asset_cost_centers;
create trigger trg_propagate_asset_cost_center_to_pieces
after insert or update of asset_code, cost_center or delete on public.material_asset_cost_centers
for each row execute function public.propagate_asset_cost_center_to_pieces();

create or replace function public.refresh_piece_cost_center_after_os_asset_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cc text;
begin
  select m.cost_center into v_cc
    from public.material_asset_cost_centers m
   where m.asset_code = upper(trim(coalesce(new.ativo, '')));

  if tg_table_name = 'corretiva_os' then
    update public.corretiva_pecas set centro_custo = v_cc, updated_at = now() where os_id = new.id;
  elsif tg_table_name = 'refrigeracao_os' then
    update public.refrigeracao_pecas set centro_custo = v_cc, updated_at = now() where os_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_piece_cost_center_after_os_asset_change() from public, anon, authenticated;

drop trigger if exists trg_corretiva_os_refresh_piece_cc on public.corretiva_os;
create trigger trg_corretiva_os_refresh_piece_cc
after update of ativo on public.corretiva_os
for each row when (old.ativo is distinct from new.ativo)
execute function public.refresh_piece_cost_center_after_os_asset_change();

drop trigger if exists trg_refrigeracao_os_refresh_piece_cc on public.refrigeracao_os;
create trigger trg_refrigeracao_os_refresh_piece_cc
after update of ativo on public.refrigeracao_os
for each row when (old.ativo is distinct from new.ativo)
execute function public.refresh_piece_cost_center_after_os_asset_change();

alter table public.material_asset_cost_centers enable row level security;

drop policy if exists "material_asset_cc_select" on public.material_asset_cost_centers;
drop policy if exists "material_asset_cc_insert" on public.material_asset_cost_centers;
drop policy if exists "material_asset_cc_update" on public.material_asset_cost_centers;
drop policy if exists "material_asset_cc_delete" on public.material_asset_cost_centers;

create policy "material_asset_cc_select" on public.material_asset_cost_centers
for select to authenticated
using (public.user_can_access_any(array['corretiva-pecas-status','controle-materiais','central-materiais-unificada','corretiva','corretiva-novo','refrigeracao']::text[]));

create policy "material_asset_cc_insert" on public.material_asset_cost_centers
for insert to authenticated
with check (public.user_can_access_any(array['corretiva-pecas-status','controle-materiais','central-materiais-unificada']::text[]));

create policy "material_asset_cc_update" on public.material_asset_cost_centers
for update to authenticated
using (public.user_can_access_any(array['corretiva-pecas-status','controle-materiais','central-materiais-unificada']::text[]))
with check (public.user_can_access_any(array['corretiva-pecas-status','controle-materiais','central-materiais-unificada']::text[]));

create policy "material_asset_cc_delete" on public.material_asset_cost_centers
for delete to authenticated
using (public.user_can_access_any(array['corretiva-pecas-status','controle-materiais','central-materiais-unificada']::text[]));

grant select, insert, update, delete on public.material_asset_cost_centers to authenticated;

insert into public.material_asset_cost_centers(asset_code, cost_center, source_name)
values
  ('DEMPM01LAB01', '9I250042', 'PCM_ATIVOS_PREENCHIDO_2026-09-14_08-38.xlsx'),
  ('DEMPR01ACC01', '9670616', 'PCM_ATIVOS_PREENCHIDO_2026-09-14_08-38.xlsx'),
  ('DEMPT02BNM01', '9I120070', 'PCM_ATIVOS_PREENCHIDO_2026-09-14_08-38.xlsx'),
  ('DEMRITEBNM01', '9I670620', 'PCM_ATIVOS_PREENCHIDO_2026-09-14_08-38.xlsx'),
  ('DEMPZS1VTM01', '9I640002', 'PCM_ATIVOS_PREENCHIDO_2026-09-14_08-38.xlsx'),
  ('DEMPG01COP01', '9I660039', 'PCM_ATIVOS_PREENCHIDO_2026-09-14_08-38.xlsx')
on conflict (asset_code) do update
set cost_center = excluded.cost_center,
    source_name = excluded.source_name,
    imported_at = now(),
    updated_at = now();

update public.corretiva_pecas p
   set centro_custo = m.cost_center, updated_at = now()
  from public.corretiva_os o,
       public.material_asset_cost_centers m
 where o.id = p.os_id
   and m.asset_code = upper(trim(coalesce(o.ativo, '')))
   and p.centro_custo is distinct from m.cost_center;

update public.refrigeracao_pecas p
   set centro_custo = m.cost_center, updated_at = now()
  from public.refrigeracao_os o,
       public.material_asset_cost_centers m
 where o.id = p.os_id
   and m.asset_code = upper(trim(coalesce(o.ativo, '')))
   and p.centro_custo is distinct from m.cost_center;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'material_asset_cost_centers'
  ) then
    alter publication supabase_realtime add table public.material_asset_cost_centers;
  end if;
end $$;

notify pgrst, 'reload schema';
