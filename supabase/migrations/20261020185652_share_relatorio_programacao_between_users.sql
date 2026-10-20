-- Compartilha a programação semanal e as planilhas-fonte entre usuários autorizados.

create table if not exists public.relatorio_diario_programacao_rows (
  item_key text primary key,
  atividade_data date not null,
  source_file text,
  payload jsonb not null,
  imported_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.relatorio_diario_programacao_rows enable row level security;

drop policy if exists relatorio_diario_programacao_select on public.relatorio_diario_programacao_rows;
drop policy if exists relatorio_diario_programacao_insert on public.relatorio_diario_programacao_rows;
drop policy if exists relatorio_diario_programacao_update on public.relatorio_diario_programacao_rows;
drop policy if exists relatorio_diario_programacao_delete on public.relatorio_diario_programacao_rows;

create policy relatorio_diario_programacao_select
on public.relatorio_diario_programacao_rows
for select to authenticated
using (public.user_can_access_any(array['relatorio-diario']::text[]));

create policy relatorio_diario_programacao_insert
on public.relatorio_diario_programacao_rows
for insert to authenticated
with check (public.user_can_access_any(array['relatorio-diario']::text[]));

create policy relatorio_diario_programacao_update
on public.relatorio_diario_programacao_rows
for update to authenticated
using (public.user_can_access_any(array['relatorio-diario']::text[]))
with check (public.user_can_access_any(array['relatorio-diario']::text[]));

create policy relatorio_diario_programacao_delete
on public.relatorio_diario_programacao_rows
for delete to authenticated
using (public.user_can_access_any(array['relatorio-diario']::text[]));

create table if not exists public.programacao_importacoes (
  slot text primary key check (slot in ('CCH','REFRIG','ELETRICA')),
  filename text not null,
  storage_path text not null,
  file_size bigint,
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.programacao_importacoes enable row level security;

drop policy if exists programacao_importacoes_select on public.programacao_importacoes;
drop policy if exists programacao_importacoes_insert on public.programacao_importacoes;
drop policy if exists programacao_importacoes_update on public.programacao_importacoes;
drop policy if exists programacao_importacoes_delete on public.programacao_importacoes;

create policy programacao_importacoes_select
on public.programacao_importacoes
for select to authenticated
using (public.user_can_access_any(array['programacao']::text[]));

create policy programacao_importacoes_insert
on public.programacao_importacoes
for insert to authenticated
with check (public.user_can_access_any(array['programacao']::text[]));

create policy programacao_importacoes_update
on public.programacao_importacoes
for update to authenticated
using (public.user_can_access_any(array['programacao']::text[]))
with check (public.user_can_access_any(array['programacao']::text[]));

create policy programacao_importacoes_delete
on public.programacao_importacoes
for delete to authenticated
using (public.user_can_access_any(array['programacao']::text[]));

insert into storage.buckets (id, name, public)
values ('programacao-importacoes', 'programacao-importacoes', false)
on conflict (id) do nothing;

drop policy if exists programacao_importacoes_storage_select on storage.objects;
drop policy if exists programacao_importacoes_storage_insert on storage.objects;
drop policy if exists programacao_importacoes_storage_update on storage.objects;
drop policy if exists programacao_importacoes_storage_delete on storage.objects;

create policy programacao_importacoes_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'programacao-importacoes'
  and public.user_can_access_any(array['programacao']::text[])
);

create policy programacao_importacoes_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'programacao-importacoes'
  and public.user_can_access_any(array['programacao']::text[])
);

create policy programacao_importacoes_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'programacao-importacoes'
  and public.user_can_access_any(array['programacao']::text[])
)
with check (
  bucket_id = 'programacao-importacoes'
  and public.user_can_access_any(array['programacao']::text[])
);

create policy programacao_importacoes_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'programacao-importacoes'
  and public.user_can_access_any(array['programacao']::text[])
);

drop policy if exists programacao_arquivos_select_own on public.programacao_arquivos;
drop policy if exists programacao_arquivos_delete_own on public.programacao_arquivos;
drop policy if exists programacao_arquivos_select_shared on public.programacao_arquivos;
drop policy if exists programacao_arquivos_delete_shared on public.programacao_arquivos;

create policy programacao_arquivos_select_shared
on public.programacao_arquivos
for select to authenticated
using (public.user_can_access_any(array['programacao']::text[]));

create policy programacao_arquivos_delete_shared
on public.programacao_arquivos
for delete to authenticated
using (public.user_can_access_any(array['programacao']::text[]));

drop policy if exists programacao_historico_read_own on storage.objects;
drop policy if exists programacao_historico_delete_own on storage.objects;
drop policy if exists programacao_historico_read_shared on storage.objects;
drop policy if exists programacao_historico_delete_shared on storage.objects;

create policy programacao_historico_read_shared
on storage.objects for select to authenticated
using (
  bucket_id = 'programacao-historico'
  and public.user_can_access_any(array['programacao']::text[])
);

create policy programacao_historico_delete_shared
on storage.objects for delete to authenticated
using (
  bucket_id = 'programacao-historico'
  and public.user_can_access_any(array['programacao']::text[])
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'relatorio_diario_programacao_rows'
  ) then
    alter publication supabase_realtime add table public.relatorio_diario_programacao_rows;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'programacao_importacoes'
  ) then
    alter publication supabase_realtime add table public.programacao_importacoes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'programacao_arquivos'
  ) then
    alter publication supabase_realtime add table public.programacao_arquivos;
  end if;
end $$;
