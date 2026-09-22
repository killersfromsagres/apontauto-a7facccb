create table if not exists public.controle_materiais_meta (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('refrigeracao', 'corretiva')),
  tipo text not null check (tipo in ('peca', 'problema')),
  item_id uuid not null,
  centro_custo text,
  numero_requisicao text,
  fornecedor text,
  valor_estimado numeric(14,2),
  status_compra text not null default 'aguardando'
    check (status_compra in ('aguardando','solicitado','em_cotacao','comprado','recebido','cancelado')),
  data_solicitacao_facilities timestamptz,
  solicitado_por text,
  observacao text,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint controle_materiais_meta_item_unique unique (origem, tipo, item_id)
);

create table if not exists public.controle_centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descricao text,
  responsavel text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.controle_envios_facilities (
  id uuid primary key default gen_random_uuid(),
  enviado_em timestamptz not null default now(),
  centro_custo text,
  destinatario text,
  canal text,
  observacao text,
  total_itens integer not null default 0 check (total_itens >= 0),
  itens jsonb not null default '[]'::jsonb,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_controle_meta_status
  on public.controle_materiais_meta (status_compra);
create index if not exists idx_controle_meta_facilities
  on public.controle_materiais_meta (data_solicitacao_facilities desc);
create index if not exists idx_controle_meta_centro_custo
  on public.controle_materiais_meta (centro_custo);
create index if not exists idx_controle_envios_enviado_em
  on public.controle_envios_facilities (enviado_em desc);
create index if not exists idx_controle_centros_ativo_codigo
  on public.controle_centros_custo (ativo, codigo);

create or replace trigger trg_controle_materiais_meta_updated_at
before update on public.controle_materiais_meta
for each row execute function public.set_updated_at();

create or replace trigger trg_controle_centros_custo_updated_at
before update on public.controle_centros_custo
for each row execute function public.set_updated_at();

alter table public.controle_materiais_meta enable row level security;
alter table public.controle_centros_custo enable row level security;
alter table public.controle_envios_facilities enable row level security;

drop policy if exists "controle_meta_select" on public.controle_materiais_meta;
drop policy if exists "controle_meta_insert" on public.controle_materiais_meta;
drop policy if exists "controle_meta_update" on public.controle_materiais_meta;
drop policy if exists "controle_meta_delete" on public.controle_materiais_meta;
create policy "controle_meta_select" on public.controle_materiais_meta
  for select to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_meta_insert" on public.controle_materiais_meta
  for insert to authenticated
  with check (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_meta_update" on public.controle_materiais_meta
  for update to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]))
  with check (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_meta_delete" on public.controle_materiais_meta
  for delete to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));

drop policy if exists "controle_centros_select" on public.controle_centros_custo;
drop policy if exists "controle_centros_insert" on public.controle_centros_custo;
drop policy if exists "controle_centros_update" on public.controle_centros_custo;
drop policy if exists "controle_centros_delete" on public.controle_centros_custo;
create policy "controle_centros_select" on public.controle_centros_custo
  for select to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_centros_insert" on public.controle_centros_custo
  for insert to authenticated
  with check (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_centros_update" on public.controle_centros_custo
  for update to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]))
  with check (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_centros_delete" on public.controle_centros_custo
  for delete to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));

drop policy if exists "controle_envios_select" on public.controle_envios_facilities;
drop policy if exists "controle_envios_insert" on public.controle_envios_facilities;
drop policy if exists "controle_envios_update" on public.controle_envios_facilities;
drop policy if exists "controle_envios_delete" on public.controle_envios_facilities;
create policy "controle_envios_select" on public.controle_envios_facilities
  for select to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_envios_insert" on public.controle_envios_facilities
  for insert to authenticated
  with check (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_envios_update" on public.controle_envios_facilities
  for update to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]))
  with check (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));
create policy "controle_envios_delete" on public.controle_envios_facilities
  for delete to authenticated
  using (public.user_can_access_any(array['controle-materiais','central-materiais-unificada']::text[]));

grant select, insert, update, delete on public.controle_materiais_meta to authenticated;
grant select, insert, update, delete on public.controle_centros_custo to authenticated;
grant select, insert, update, delete on public.controle_envios_facilities to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'controle_materiais_meta'
  ) then
    alter publication supabase_realtime add table public.controle_materiais_meta;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'controle_centros_custo'
  ) then
    alter publication supabase_realtime add table public.controle_centros_custo;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'controle_envios_facilities'
  ) then
    alter publication supabase_realtime add table public.controle_envios_facilities;
  end if;
end $$;

notify pgrst, 'reload schema';
