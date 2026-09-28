-- Frota: cadastro de veículos com template de certificado e checklist fiel aos modelos In-Haus.
-- Esta migração também provisiona as tabelas do módulo quando ainda não existem.

create extension if not exists pgcrypto;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  prefix text not null,
  plate text,
  brand text not null,
  model text not null,
  version text,
  year_model integer,
  color text,
  fuel_type text not null default 'flex',
  current_odometer_km numeric not null default 0,
  status text not null default 'disponivel',
  notes text,
  unit text,
  sector_default text,
  checklist_template_code text not null default 'fiorino_van',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_checklist_template_code_ck
    check (checklist_template_code in ('pickup','fiorino_van'))
);

alter table public.vehicles
  add column if not exists unit text,
  add column if not exists sector_default text,
  add column if not exists checklist_template_code text not null default 'fiorino_van',
  add column if not exists notes text,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists vehicles_prefix_uq
  on public.vehicles (upper(trim(prefix)));

create unique index if not exists vehicles_plate_uq
  on public.vehicles (upper(regexp_replace(trim(plate), '[^A-Za-z0-9]', '', 'g')))
  where plate is not null and trim(plate) <> '';

create table if not exists public.fleet_checklists (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  template_code text not null default 'fiorino_van',
  kind text not null default 'saida',
  inspection_date date not null default current_date,
  driver_name text not null,
  sector text,
  unit text,
  odometer_km numeric not null default 0,
  odometer_initial_km numeric,
  odometer_final_km numeric,
  fuel_level_pct integer,
  itinerary_destination text,
  departure_time time,
  arrival_time time,
  inspector_name text,
  items jsonb not null default '[]'::jsonb,
  damages jsonb not null default '[]'::jsonb,
  overall_status text not null default 'ok',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_checklists_template_code_ck
    check (template_code in ('pickup','fiorino_van')),
  constraint fleet_checklists_fuel_ck
    check (fuel_level_pct is null or (fuel_level_pct between 0 and 100)),
  constraint fleet_checklists_odometer_order_ck
    check (
      odometer_initial_km is null
      or odometer_final_km is null
      or odometer_final_km >= odometer_initial_km
    )
);

alter table public.fleet_checklists
  add column if not exists template_code text not null default 'fiorino_van',
  add column if not exists inspection_date date not null default current_date,
  add column if not exists sector text,
  add column if not exists unit text,
  add column if not exists odometer_initial_km numeric,
  add column if not exists odometer_final_km numeric,
  add column if not exists itinerary_destination text,
  add column if not exists departure_time time,
  add column if not exists arrival_time time,
  add column if not exists inspector_name text,
  add column if not exists damages jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists fleet_checklists_vehicle_created_idx
  on public.fleet_checklists (vehicle_id, created_at desc);

create table if not exists public.fleet_checklist_photos (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.fleet_checklists(id) on delete cascade,
  category text not null,
  storage_path text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists fleet_checklist_photos_checklist_idx
  on public.fleet_checklist_photos (checklist_id);

alter table public.vehicles enable row level security;
alter table public.fleet_checklists enable row level security;
alter table public.fleet_checklist_photos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='vehicles' and policyname='vehicles_authenticated_select'
  ) then
    create policy vehicles_authenticated_select on public.vehicles
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='vehicles' and policyname='vehicles_authenticated_write'
  ) then
    create policy vehicles_authenticated_write on public.vehicles
      for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fleet_checklists' and policyname='fleet_checklists_authenticated_select'
  ) then
    create policy fleet_checklists_authenticated_select on public.fleet_checklists
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fleet_checklists' and policyname='fleet_checklists_authenticated_write'
  ) then
    create policy fleet_checklists_authenticated_write on public.fleet_checklists
      for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fleet_checklist_photos' and policyname='fleet_checklist_photos_authenticated_select'
  ) then
    create policy fleet_checklist_photos_authenticated_select on public.fleet_checklist_photos
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fleet_checklist_photos' and policyname='fleet_checklist_photos_authenticated_write'
  ) then
    create policy fleet_checklist_photos_authenticated_write on public.fleet_checklist_photos
      for all to authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.fleet_checklists to authenticated;
grant select, insert, update, delete on public.fleet_checklist_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'frota-fotos',
  'frota-fotos',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='frota_fotos_authenticated_read'
  ) then
    create policy frota_fotos_authenticated_read on storage.objects
      for select to authenticated
      using (bucket_id = 'frota-fotos');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='frota_fotos_owner_insert'
  ) then
    create policy frota_fotos_owner_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'frota-fotos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='frota_fotos_owner_update'
  ) then
    create policy frota_fotos_owner_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'frota-fotos'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'frota-fotos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='frota_fotos_owner_delete'
  ) then
    create policy frota_fotos_owner_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'frota-fotos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
