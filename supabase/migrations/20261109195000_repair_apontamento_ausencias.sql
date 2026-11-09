-- Reparo aditivo: alguns ambientes receberam a UI de ausências antes da
-- migração original 20261015190000. Não exclui nenhum registro existente.
create table if not exists public.apontamento_ausencias (
  id text primary key,
  matricula text not null,
  tipo text not null check (tipo in ('falta', 'ferias')),
  inicio date not null,
  fim date not null,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  constraint apontamento_ausencias_periodo_ck check (fim >= inicio)
);

create index if not exists apontamento_ausencias_matricula_idx
  on public.apontamento_ausencias (matricula);
create index if not exists apontamento_ausencias_periodo_idx
  on public.apontamento_ausencias (inicio, fim);

alter table public.apontamento_ausencias enable row level security;

drop policy if exists "apontamento_ausencias_select" on public.apontamento_ausencias;
create policy "apontamento_ausencias_select"
  on public.apontamento_ausencias for select to authenticated
  using (public.user_can_access('apontamentos'));

drop policy if exists "apontamento_ausencias_insert" on public.apontamento_ausencias;
create policy "apontamento_ausencias_insert"
  on public.apontamento_ausencias for insert to authenticated
  with check (public.user_can_access('apontamentos'));

drop policy if exists "apontamento_ausencias_update" on public.apontamento_ausencias;
create policy "apontamento_ausencias_update"
  on public.apontamento_ausencias for update to authenticated
  using (public.user_can_access('apontamentos'))
  with check (public.user_can_access('apontamentos'));

drop policy if exists "apontamento_ausencias_delete" on public.apontamento_ausencias;
create policy "apontamento_ausencias_delete"
  on public.apontamento_ausencias for delete to authenticated
  using (public.user_can_access('apontamentos'));

grant select, insert, update, delete on public.apontamento_ausencias to authenticated;

-- Solicita ao PostgREST a atualização do cache de schema após a transação.
notify pgrst, 'reload schema';
