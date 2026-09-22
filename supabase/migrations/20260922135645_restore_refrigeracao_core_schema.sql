do $$
begin
  if not exists (select 1 from pg_type where typname = 'refrig_os_status' and typnamespace = 'public'::regnamespace) then
    create type public.refrig_os_status as enum ('aberta','em_andamento','concluida','cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'refrig_urgencia' and typnamespace = 'public'::regnamespace) then
    create type public.refrig_urgencia as enum ('baixa','media','alta');
  end if;
  if not exists (select 1 from pg_type where typname = 'refrig_gravidade' and typnamespace = 'public'::regnamespace) then
    create type public.refrig_gravidade as enum ('observacao','falha','critico');
  end if;
  if not exists (select 1 from pg_type where typname = 'refrig_status_gestor' and typnamespace = 'public'::regnamespace) then
    create type public.refrig_status_gestor as enum ('pendente','em_analise','aprovado','rejeitado','concluido');
  end if;
end $$;

create table if not exists public.refrigeracao_os (
  id uuid primary key default gen_random_uuid(),
  numero_os text not null,
  nome_os text,
  predio text,
  andar text,
  local text,
  tipo text,
  equipe text,
  data_sla text,
  data_programada text,
  inicio text,
  fim text,
  ativo text not null,
  equipamento text not null,
  patrimonio text,
  status public.refrig_os_status not null default 'aberta',
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refrigeracao_os_numero_os_key unique (numero_os)
);

create table if not exists public.refrigeracao_pecas (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.refrigeracao_os(id) on delete cascade,
  descricao text not null,
  quantidade numeric not null default 1,
  urgencia public.refrig_urgencia not null default 'media',
  observacao text,
  patrimonio text,
  modelo text,
  btus text,
  status_gestor public.refrig_status_gestor not null default 'pendente',
  client_uuid text,
  enviado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.refrigeracao_problemas (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.refrigeracao_os(id) on delete cascade,
  descricao text not null,
  gravidade public.refrig_gravidade not null default 'falha',
  status_gestor public.refrig_status_gestor not null default 'pendente',
  client_uuid text,
  enviado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.refrigeracao_fotos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.refrigeracao_os(id) on delete cascade,
  image_url text,
  storage_path text,
  legenda text,
  client_uuid text,
  enviado_por uuid,
  created_at timestamptz not null default now(),
  constraint refrigeracao_fotos_tem_referencia check (image_url is not null or storage_path is not null)
);

create table if not exists public.refrigeracao_historico_permanente (
  ativo text not null,
  equipamento text not null,
  patrimonio text,
  informacoes_tecnicas text,
  data_ultima_atualizacao timestamptz,
  primary key (ativo, equipamento)
);

create index if not exists idx_refrigeracao_os_status on public.refrigeracao_os(status);
create index if not exists idx_refrigeracao_os_equipe on public.refrigeracao_os(equipe);
create index if not exists idx_refrigeracao_os_ativo_equipamento on public.refrigeracao_os(ativo,equipamento);
create index if not exists idx_refrigeracao_pecas_os_id on public.refrigeracao_pecas(os_id);
create index if not exists idx_refrigeracao_pecas_status_gestor on public.refrigeracao_pecas(status_gestor);
create index if not exists idx_refrigeracao_problemas_os_id on public.refrigeracao_problemas(os_id);
create index if not exists idx_refrigeracao_problemas_status_gestor on public.refrigeracao_problemas(status_gestor);
create index if not exists idx_refrigeracao_fotos_os_id on public.refrigeracao_fotos(os_id);
create unique index if not exists uq_refrigeracao_pecas_client_uuid on public.refrigeracao_pecas(client_uuid) where client_uuid is not null;
create unique index if not exists uq_refrigeracao_problemas_client_uuid on public.refrigeracao_problemas(client_uuid) where client_uuid is not null;
create unique index if not exists uq_refrigeracao_fotos_client_uuid on public.refrigeracao_fotos(client_uuid) where client_uuid is not null;

create or replace trigger trg_refrigeracao_os_updated_at
before update on public.refrigeracao_os
for each row execute function public.set_updated_at();
create or replace trigger trg_refrigeracao_pecas_updated_at
before update on public.refrigeracao_pecas
for each row execute function public.set_updated_at();
create or replace trigger trg_refrigeracao_problemas_updated_at
before update on public.refrigeracao_problemas
for each row execute function public.set_updated_at();

alter table public.refrigeracao_os enable row level security;
alter table public.refrigeracao_pecas enable row level security;
alter table public.refrigeracao_problemas enable row level security;
alter table public.refrigeracao_fotos enable row level security;
alter table public.refrigeracao_historico_permanente enable row level security;

create policy refrigeracao_os_select on public.refrigeracao_os for select to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-pecas-status','refrigeracao-historico','refrigeracao-historico-permanente','controle-materiais','central-materiais-unificada','dashboard','dashboard-chamados']::text[]));
create policy refrigeracao_os_insert on public.refrigeracao_os for insert to authenticated
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));
create policy refrigeracao_os_update on public.refrigeracao_os for update to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-pecas-status']::text[]))
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-pecas-status']::text[]));
create policy refrigeracao_os_delete on public.refrigeracao_os for delete to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy refrigeracao_pecas_select on public.refrigeracao_pecas for select to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-pecas-status','refrigeracao-historico','controle-materiais','central-materiais-unificada']::text[]));
create policy refrigeracao_pecas_insert on public.refrigeracao_pecas for insert to authenticated
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));
create policy refrigeracao_pecas_update on public.refrigeracao_pecas for update to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-pecas-status']::text[]))
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-pecas-status']::text[]));
create policy refrigeracao_pecas_delete on public.refrigeracao_pecas for delete to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy refrigeracao_problemas_select on public.refrigeracao_problemas for select to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-historico','controle-materiais','central-materiais-unificada']::text[]));
create policy refrigeracao_problemas_insert on public.refrigeracao_problemas for insert to authenticated
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));
create policy refrigeracao_problemas_update on public.refrigeracao_problemas for update to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]))
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));
create policy refrigeracao_problemas_delete on public.refrigeracao_problemas for delete to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy refrigeracao_fotos_select on public.refrigeracao_fotos for select to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-historico','controle-materiais','central-materiais-unificada']::text[]));
create policy refrigeracao_fotos_insert on public.refrigeracao_fotos for insert to authenticated
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));
create policy refrigeracao_fotos_update on public.refrigeracao_fotos for update to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]))
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));
create policy refrigeracao_fotos_delete on public.refrigeracao_fotos for delete to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy refrigeracao_historico_select on public.refrigeracao_historico_permanente for select to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-historico','refrigeracao-historico-permanente']::text[]));
create policy refrigeracao_historico_insert on public.refrigeracao_historico_permanente for insert to authenticated
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-historico-permanente']::text[]));
create policy refrigeracao_historico_update on public.refrigeracao_historico_permanente for update to authenticated
using (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-historico-permanente']::text[]))
with check (public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-historico-permanente']::text[]));
create policy refrigeracao_historico_delete on public.refrigeracao_historico_permanente for delete to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select,insert,update,delete on public.refrigeracao_os to authenticated;
grant select,insert,update,delete on public.refrigeracao_pecas to authenticated;
grant select,insert,update,delete on public.refrigeracao_problemas to authenticated;
grant select,insert,update,delete on public.refrigeracao_fotos to authenticated;
grant select,insert,update,delete on public.refrigeracao_historico_permanente to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('refrigeracao-fotos','refrigeracao-fotos',false,20971520,array['image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists refrigeracao_fotos_storage_select on storage.objects;
drop policy if exists refrigeracao_fotos_storage_insert on storage.objects;
drop policy if exists refrigeracao_fotos_storage_update on storage.objects;
drop policy if exists refrigeracao_fotos_storage_delete on storage.objects;
create policy refrigeracao_fotos_storage_select on storage.objects for select to authenticated
using (bucket_id='refrigeracao-fotos' and public.user_can_access_any(array['refrigeracao','refrigeracao-gestor','refrigeracao-historico']::text[]));
create policy refrigeracao_fotos_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='refrigeracao-fotos' and (storage.foldername(name))[1]=auth.uid()::text and public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));
create policy refrigeracao_fotos_storage_update on storage.objects for update to authenticated
using (bucket_id='refrigeracao-fotos' and (storage.foldername(name))[1]=auth.uid()::text and public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]))
with check (bucket_id='refrigeracao-fotos' and (storage.foldername(name))[1]=auth.uid()::text and public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));
create policy refrigeracao_fotos_storage_delete on storage.objects for delete to authenticated
using (bucket_id='refrigeracao-fotos' and (storage.foldername(name))[1]=auth.uid()::text and public.user_can_access_any(array['refrigeracao','refrigeracao-gestor']::text[]));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='refrigeracao_os') then
    alter publication supabase_realtime add table public.refrigeracao_os;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='refrigeracao_pecas') then
    alter publication supabase_realtime add table public.refrigeracao_pecas;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='refrigeracao_problemas') then
    alter publication supabase_realtime add table public.refrigeracao_problemas;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='refrigeracao_fotos') then
    alter publication supabase_realtime add table public.refrigeracao_fotos;
  end if;
end $$;

notify pgrst, 'reload schema';