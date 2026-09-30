
create table if not exists public.programacao_arquivos (
  id text primary key,
  filename text not null,
  week integer not null,
  slot text not null,
  slot_label text not null,
  total_os integer not null default 0,
  titulo text not null,
  storage_path text not null,
  file_size bigint,
  period_start date,
  period_end date,
  preventive_count integer not null default 0,
  corrective_count integer not null default 0,
  remaining_minutes integer not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_programacao_arquivos_user_created
  on public.programacao_arquivos (created_by, created_at desc);

alter table public.programacao_arquivos enable row level security;

drop policy if exists programacao_arquivos_select_own on public.programacao_arquivos;
create policy programacao_arquivos_select_own
  on public.programacao_arquivos
  for select to authenticated
  using (created_by = auth.uid());

drop policy if exists programacao_arquivos_insert_own on public.programacao_arquivos;
create policy programacao_arquivos_insert_own
  on public.programacao_arquivos
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists programacao_arquivos_delete_own on public.programacao_arquivos;
create policy programacao_arquivos_delete_own
  on public.programacao_arquivos
  for delete to authenticated
  using (created_by = auth.uid());

grant select, insert, delete on public.programacao_arquivos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'programacao-historico',
  'programacao-historico',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists programacao_historico_read_own on storage.objects;
create policy programacao_historico_read_own
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'programacao-historico'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists programacao_historico_insert_own on storage.objects;
create policy programacao_historico_insert_own
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'programacao-historico'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists programacao_historico_delete_own on storage.objects;
create policy programacao_historico_delete_own
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'programacao-historico'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
