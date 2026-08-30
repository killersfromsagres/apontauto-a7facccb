-- Provisiona a Mensageria no mesmo projeto Supabase que já atende autenticação e perfis.
-- A migration é idempotente para reparar ambientes onde a criação anterior não foi aplicada.

create table if not exists public.mensageria_setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  responsavel text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mensageria_setores_nome_check check (char_length(btrim(nome)) between 2 and 120)
);

create table if not exists public.mensageria_malotes (
  id uuid primary key default gen_random_uuid(),
  remetente text not null,
  destinatario text not null,
  codigo_rastreio text,
  codigo_interno text,
  item_descricao text,
  local_recebimento text not null default 'Portaria',
  quantidade integer not null default 1,
  setor text not null default 'NÃO CLASSIFICADO'
    references public.mensageria_setores(nome) on update cascade on delete restrict,
  recebido_em timestamptz,
  recebido_por text not null default 'Não registrado',
  observacoes text,
  status text not null default 'aguardando_entrega',
  entregue_em timestamptz,
  entregue_para text,
  assinatura_data_url text,
  entrega_observacoes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_import boolean not null default false,
  legacy_source text,
  legacy_source_row integer,
  legacy_delivery_row integer,
  constraint mensageria_malotes_quantidade_check check (quantidade between 1 and 9999),
  constraint mensageria_malotes_status_check check (status in ('aguardando_entrega', 'entregue')),
  constraint mensageria_malotes_remetente_check check (char_length(btrim(remetente)) between 1 and 240),
  constraint mensageria_malotes_destinatario_check check (char_length(btrim(destinatario)) between 1 and 240),
  constraint mensageria_novos_exigem_recebimento check (legacy_import or recebido_em is not null),
  constraint mensageria_entrega_assinada_check check (
    status = 'aguardando_entrega'
    or legacy_import
    or (
      entregue_em is not null
      and char_length(btrim(coalesce(entregue_para, ''))) > 0
      and assinatura_data_url like 'data:image/%'
    )
  ),
  constraint mensageria_entrega_data_check check (
    status = 'aguardando_entrega'
    or recebido_em is null
    or entregue_em >= recebido_em
  )
);

-- Completa colunas auxiliares sem remover dados ou objetos existentes.
alter table public.mensageria_setores
  add column if not exists responsavel text,
  add column if not exists ativo boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.mensageria_malotes
  add column if not exists codigo_rastreio text,
  add column if not exists codigo_interno text,
  add column if not exists item_descricao text,
  add column if not exists local_recebimento text not null default 'Portaria',
  add column if not exists quantidade integer not null default 1,
  add column if not exists setor text not null default 'NÃO CLASSIFICADO',
  add column if not exists recebido_em timestamptz,
  add column if not exists recebido_por text not null default 'Não registrado',
  add column if not exists observacoes text,
  add column if not exists status text not null default 'aguardando_entrega',
  add column if not exists entregue_em timestamptz,
  add column if not exists entregue_para text,
  add column if not exists assinatura_data_url text,
  add column if not exists entrega_observacoes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists legacy_import boolean not null default false,
  add column if not exists legacy_source text,
  add column if not exists legacy_source_row integer,
  add column if not exists legacy_delivery_row integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensageria_malotes_setor_fkey' and conrelid = 'public.mensageria_malotes'::regclass) then
    alter table public.mensageria_malotes
      add constraint mensageria_malotes_setor_fkey
      foreign key (setor) references public.mensageria_setores(nome)
      on update cascade on delete restrict not valid;
  end if;
end
$$;

create index if not exists mensageria_malotes_status_idx on public.mensageria_malotes(status);
create index if not exists mensageria_malotes_setor_status_idx on public.mensageria_malotes(setor, status);
create index if not exists mensageria_malotes_recebido_em_idx on public.mensageria_malotes(recebido_em desc nulls last);
create index if not exists mensageria_malotes_entregue_em_idx on public.mensageria_malotes(entregue_em desc nulls last);
create index if not exists mensageria_malotes_codigo_interno_idx on public.mensageria_malotes(codigo_interno) where codigo_interno is not null;
create index if not exists mensageria_malotes_codigo_rastreio_idx on public.mensageria_malotes(codigo_rastreio) where codigo_rastreio is not null;
create index if not exists mensageria_malotes_created_by_idx on public.mensageria_malotes(created_by) where created_by is not null;
create unique index if not exists mensageria_malotes_legacy_source_row_uidx
  on public.mensageria_malotes(legacy_source, legacy_source_row)
  where legacy_import and legacy_source is not null and legacy_source_row is not null;

drop trigger if exists mensageria_setores_set_updated_at on public.mensageria_setores;
drop trigger if exists mensageria_malotes_set_updated_at on public.mensageria_malotes;

create trigger mensageria_setores_set_updated_at
before update on public.mensageria_setores
for each row execute function public.tg_set_updated_at();

create trigger mensageria_malotes_set_updated_at
before update on public.mensageria_malotes
for each row execute function public.tg_set_updated_at();

alter table public.mensageria_setores enable row level security;
alter table public.mensageria_malotes enable row level security;

revoke all on public.mensageria_setores from anon, authenticated;
revoke all on public.mensageria_malotes from anon, authenticated;
grant select on public.mensageria_setores to authenticated;
grant select, insert, update on public.mensageria_malotes to authenticated;
grant all on public.mensageria_setores to service_role;
grant all on public.mensageria_malotes to service_role;

drop policy if exists "Mensageria setores visiveis por usuarios autorizados" on public.mensageria_setores;
drop policy if exists "Mensageria malotes visiveis por usuarios autorizados" on public.mensageria_malotes;
drop policy if exists "Mensageria malotes inseriveis por usuarios autorizados" on public.mensageria_malotes;
drop policy if exists "Mensageria malotes atualizaveis por usuarios autorizados" on public.mensageria_malotes;

create policy "Mensageria setores visiveis por usuarios autorizados"
on public.mensageria_setores for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
);

create policy "Mensageria malotes visiveis por usuarios autorizados"
on public.mensageria_malotes for select to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
);

create policy "Mensageria malotes inseriveis por usuarios autorizados"
on public.mensageria_malotes for insert to authenticated
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
);

create policy "Mensageria malotes atualizaveis por usuarios autorizados"
on public.mensageria_malotes for update to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'admin'::public.app_role
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and 'mensageria' = any(coalesce(p.allowed_menus, '{}'::text[]))
  )
);

insert into public.mensageria_setores (nome, responsavel)
values
  ('NÃO CLASSIFICADO', 'Definir responsável conforme o destinatário'),
  ('JURIDICO', 'JURIDICO CORP - BR, JOYCE CRUZ E LUANA BOLZAN'),
  ('MULTAS', 'EDUARDA LOIOLA ARRUDA'),
  ('DOACOES', 'RH'),
  ('LOGISTICA', 'LARISSA TORETA E TIME'),
  ('COMPRAS', 'RODRIGO COSTA RODRIGUES'),
  ('CONTAS TELEFONIA', 'OSMAN'),
  ('FINANCAS - CREDITOS', 'ANDERSON CABRAL, EDINALDO SANTANA E RONALDO SOUSA'),
  ('SERASA E PROTESTO', 'LOCAL BR'),
  ('PAGAMENTOS DE FRETES/FEDEX CORREIOS', 'EDUARDA LOIOLA ARRUDA / FACILITIES')
on conflict (nome) do nothing;
