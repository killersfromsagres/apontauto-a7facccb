-- Amplia a Mensageria com controle de envios e importacao idempotente do legado.
-- Mantem o acesso restrito a sessoes autenticadas; o papel anonimo nao recebe acesso.

create table if not exists public.mensageria_envios (
  id uuid primary key default gen_random_uuid(),
  categoria text not null default 'malote_interno',
  remetente text not null,
  destinatario text not null,
  codigo_rastreio text,
  item_descricao text,
  nota_fiscal text,
  enviado_em timestamptz,
  enviado_por text,
  status text not null default 'preparando',
  finalizado_em timestamptz,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_import boolean not null default false,
  legacy_source text,
  legacy_source_row integer,
  constraint mensageria_envios_categoria_check
    check (categoria in ('correios', 'juridico', 'malote_interno', 'outro')),
  constraint mensageria_envios_status_check
    check (status in ('preparando', 'enviado', 'finalizado', 'devolvido')),
  constraint mensageria_envios_remetente_check
    check (char_length(btrim(remetente)) between 1 and 240),
  constraint mensageria_envios_destinatario_check
    check (char_length(btrim(destinatario)) between 1 and 240),
  constraint mensageria_envios_finalizacao_check
    check (status <> 'finalizado' or legacy_import or finalizado_em is not null),
  constraint mensageria_envios_datas_check
    check (finalizado_em is null or enviado_em is null or finalizado_em >= enviado_em)
);

alter table public.mensageria_envios
  add column if not exists categoria text not null default 'malote_interno',
  add column if not exists remetente text,
  add column if not exists destinatario text,
  add column if not exists codigo_rastreio text,
  add column if not exists item_descricao text,
  add column if not exists nota_fiscal text,
  add column if not exists enviado_em timestamptz,
  add column if not exists enviado_por text,
  add column if not exists status text not null default 'preparando',
  add column if not exists finalizado_em timestamptz,
  add column if not exists observacoes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists legacy_import boolean not null default false,
  add column if not exists legacy_source text,
  add column if not exists legacy_source_row integer;

create index if not exists mensageria_envios_status_idx
  on public.mensageria_envios(status);
create index if not exists mensageria_envios_enviado_em_idx
  on public.mensageria_envios(enviado_em desc nulls last);
create index if not exists mensageria_envios_codigo_rastreio_idx
  on public.mensageria_envios(codigo_rastreio)
  where codigo_rastreio is not null;
create index if not exists mensageria_envios_created_by_idx
  on public.mensageria_envios(created_by)
  where created_by is not null;
create unique index if not exists mensageria_envios_legacy_source_row_uidx
  on public.mensageria_envios(legacy_source, legacy_source_row);

-- O indice sem predicado permite que o Data API use upsert por origem e linha.
-- Valores nulos continuam podendo se repetir nos registros criados manualmente.
create unique index if not exists mensageria_malotes_legacy_source_row_all_uidx
  on public.mensageria_malotes(legacy_source, legacy_source_row);

drop trigger if exists mensageria_envios_set_updated_at on public.mensageria_envios;
create trigger mensageria_envios_set_updated_at
before update on public.mensageria_envios
for each row execute function public.tg_set_updated_at();

alter table public.mensageria_envios enable row level security;

revoke all on public.mensageria_envios from anon, authenticated;
grant select, insert, update on public.mensageria_envios to authenticated;
grant all on public.mensageria_envios to service_role;

drop policy if exists "Mensageria envios leitura para autenticados"
  on public.mensageria_envios;
drop policy if exists "Mensageria envios inclusao para autenticados"
  on public.mensageria_envios;
drop policy if exists "Mensageria envios atualizacao para autenticados"
  on public.mensageria_envios;

create policy "Mensageria envios leitura para autenticados"
on public.mensageria_envios
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Mensageria envios inclusao para autenticados"
on public.mensageria_envios
for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Mensageria envios atualizacao para autenticados"
on public.mensageria_envios
for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

notify pgrst, 'reload schema';
