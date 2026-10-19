create table if not exists public.relatorio_diario_execucoes (
  item_key text primary key,
  atividade_data date not null,
  os text not null default '',
  atividade text not null default '',
  equipe text,
  descricao text,
  concluida_em timestamptz not null default now(),
  concluida_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists relatorio_diario_execucoes_data_idx
  on public.relatorio_diario_execucoes (atividade_data desc);

alter table public.relatorio_diario_execucoes enable row level security;

drop policy if exists relatorio_diario_execucoes_select on public.relatorio_diario_execucoes;
create policy relatorio_diario_execucoes_select
  on public.relatorio_diario_execucoes
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists relatorio_diario_execucoes_insert on public.relatorio_diario_execucoes;
create policy relatorio_diario_execucoes_insert
  on public.relatorio_diario_execucoes
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists relatorio_diario_execucoes_update on public.relatorio_diario_execucoes;
create policy relatorio_diario_execucoes_update
  on public.relatorio_diario_execucoes
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists relatorio_diario_execucoes_delete on public.relatorio_diario_execucoes;
create policy relatorio_diario_execucoes_delete
  on public.relatorio_diario_execucoes
  for delete
  to authenticated
  using (auth.uid() is not null);

comment on table public.relatorio_diario_execucoes is
  'Registra atividades marcadas como executadas no Relatorio Diario, de forma compartilhada entre usuarios autenticados.';
