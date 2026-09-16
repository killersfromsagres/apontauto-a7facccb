-- Restauração do módulo Taludes após migração de Supabase.
-- Referência visual reconstruída a partir do mapa histórico de 03/09/2026.

create extension if not exists pgcrypto;

create table if not exists public.talude_maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null references auth.users(id) on delete set null,
  nome text not null,
  image_url text not null,
  image_width integer not null default 2048,
  image_height integer not null default 1670,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talude_marcacoes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.talude_maps(id) on delete cascade,
  owner_id uuid null references auth.users(id) on delete set null,
  nome text,
  rotulo text,
  polygon jsonb not null default '[]'::jsonb,
  cor text not null default '#3b82f6',
  opacidade numeric not null default 0.30,
  bloqueado boolean not null default false,
  visivel boolean not null default true,
  espessura_linha numeric not null default 4,
  numero integer,
  tamanho_legenda numeric not null default 1,
  numero_x numeric,
  numero_y numeric,
  numero_scale numeric not null default 1,
  data_x numeric,
  data_y numeric,
  data_scale numeric not null default 1,
  prazo_rotulo text,
  numero_visivel boolean not null default true,
  data_visivel boolean not null default true,
  icone_tipo text,
  icone_x numeric,
  icone_y numeric,
  icone_scale numeric not null default 1,
  icone_visivel boolean not null default true,
  icone_data_x numeric,
  icone_data_y numeric,
  icone_data_scale numeric not null default 1,
  icone_data_visivel boolean not null default true,
  icone_data_texto text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talude_marcacoes_numero_unique unique (map_id, numero)
);

create index if not exists talude_marcacoes_map_id_idx on public.talude_marcacoes(map_id);

alter table public.talude_maps enable row level security;
alter table public.talude_marcacoes enable row level security;

drop policy if exists talude_maps_authenticated_all on public.talude_maps;
create policy talude_maps_authenticated_all on public.talude_maps for all to authenticated using (true) with check (true);

drop policy if exists talude_marcacoes_authenticated_all on public.talude_marcacoes;
create policy talude_marcacoes_authenticated_all on public.talude_marcacoes for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images','images',true,52428800,array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])
on conflict (id) do update set public = true;

drop policy if exists images_authenticated_insert on storage.objects;
create policy images_authenticated_insert on storage.objects for insert to authenticated with check (bucket_id='images');
drop policy if exists images_authenticated_update on storage.objects;
create policy images_authenticated_update on storage.objects for update to authenticated using (bucket_id='images') with check (bucket_id='images');
drop policy if exists images_authenticated_delete on storage.objects;
create policy images_authenticated_delete on storage.objects for delete to authenticated using (bucket_id='images');
drop policy if exists images_public_select on storage.objects;
create policy images_public_select on storage.objects for select to public using (bucket_id='images');

create or replace function public.seed_talude_reference(p_map_id uuid, p_replace boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.talude_maps%rowtype;
  sx numeric;
  sy numeric;
  inserted_count integer := 0;
  owner uuid;
  rec record;
begin
  select * into m from public.talude_maps where id = p_map_id;
  if not found then raise exception 'Mapa de taludes não encontrado: %', p_map_id; end if;

  if p_replace then
    delete from public.talude_marcacoes where map_id = p_map_id;
  elsif exists (select 1 from public.talude_marcacoes where map_id = p_map_id) then
    return 0;
  end if;

  sx := coalesce(nullif(m.image_width,0),2048)::numeric / 2048.0;
  sy := coalesce(nullif(m.image_height,0),1670)::numeric / 1670.0;
  owner := m.owner_id;

  for rec in
    select * from (values
      (1,'Talude 1','Concluído - 2026-08-27','2026-08-28','#10B981','[[617,1040],[640,1090],[760,1125],[930,1140],[1075,1165],[1085,1148],[932,1120],[765,1102],[650,1060]]'::jsonb,806,1062,815,1138),
      (2,'Talude 2','Programado - 2026-09-21','2026-09-29','#3B82F6','[[472,1010],[455,952],[472,893],[504,836],[536,781],[566,735],[592,748],[570,806],[548,864],[521,925],[500,995]]'::jsonb,475,866,462,924),
      (3,'Talude 3','Programado - 2026-09-30','2026-10-01','#3B82F6','[[214,95],[230,150],[272,212],[334,276],[404,332],[492,389],[574,444],[606,430],[533,369],[454,307],[378,245],[314,182],[256,120]]'::jsonb,316,255,318,310),
      (4,'Talude 4','Em Execução - 2026-09-01','2026-09-04','#F59E0B','[[240,30],[315,24],[380,55],[455,60],[540,52],[630,78],[628,118],[570,110],[500,101],[430,112],[360,101],[300,75]]'::jsonb,290,64,296,116),
      (5,'Talude 5','Programado - 2026-10-17','2026-10-20','#3B82F6','[[650,480],[955,482],[970,548],[952,650],[985,734],[1218,736],[1222,772],[955,770],[925,681],[930,560],[650,548]]'::jsonb,969,515,949,566),
      (6,'Talude 6','Em Execução - 2026-08-31','2026-09-15','#F59E0B','[[935,388],[1155,356],[1195,572],[1262,603],[1260,456],[1405,458],[1660,474],[1700,510],[1728,694],[1764,882],[1850,903],[1858,949],[1788,942],[1710,900],[1680,718],[1650,540],[1430,518],[1265,520],[1260,610],[1180,598],[1120,420],[950,445]]'::jsonb,1673,527,1790,536),
      (7,'Talude 7','Programado - 2026-10-21','2026-10-22','#3B82F6','[[1376,1192],[1540,1190],[1548,1398],[1515,1404],[1510,1225],[1398,1226],[1398,1360],[1368,1360]]'::jsonb,1462,1204,1450,1250),
      (8,'Talude 8','Programado - 2026-10-23','2026-10-27','#3B82F6','[[1578,852],[1606,868],[1610,1060],[1650,1092],[1650,1232],[1610,1232],[1608,1115],[1568,1080]]'::jsonb,1634,1096,1620,1152),
      (9,'Talude 9','Concluído - 2026-08-14','2026-08-21','#10B981','[[1760,1110],[1815,1118],[1818,1340],[1850,1392],[1860,1440],[1832,1440],[1790,1370],[1780,1260]]'::jsonb,1816,1294,1788,1212),
      (10,'Talude 10','Concluído - 2026-08-24','2026-08-28','#10B981','[[1645,1534],[1780,1540],[1900,1550],[1990,1578],[2020,1628],[1978,1640],[1888,1612],[1782,1592],[1660,1575]]'::jsonb,1892,1456,1890,1516)
    ) as v(numero,nome,rotulo,prazo,cor,coords,nx,ny,dx,dy)
  loop
    insert into public.talude_marcacoes(
      map_id, owner_id, nome, rotulo, polygon, cor, opacidade, bloqueado, visivel,
      espessura_linha, numero, tamanho_legenda, numero_x, numero_y, numero_scale,
      data_x, data_y, data_scale, prazo_rotulo, numero_visivel, data_visivel,
      icone_tipo, icone_visivel, icone_data_visivel
    ) values (
      p_map_id, owner, rec.nome, rec.rotulo,
      (select jsonb_agg(jsonb_build_object('x',(p->>0)::numeric*sx,'y',(p->>1)::numeric*sy)) from jsonb_array_elements(rec.coords) p),
      rec.cor, 0.22, false, true, 4, rec.numero, 1,
      rec.nx*sx, rec.ny*sy, 1,
      rec.dx*sx, rec.dy*sy, 1,
      rec.prazo, true, true,
      null, true, true
    )
    on conflict (map_id, numero) do update set
      nome = excluded.nome, rotulo = excluded.rotulo, polygon = excluded.polygon,
      cor = excluded.cor, opacidade = excluded.opacidade, bloqueado = false, visivel = true,
      espessura_linha = excluded.espessura_linha, numero_x = excluded.numero_x,
      numero_y = excluded.numero_y, data_x = excluded.data_x, data_y = excluded.data_y,
      prazo_rotulo = excluded.prazo_rotulo, numero_visivel = true, data_visivel = true,
      updated_at = now();
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.auto_seed_talude_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_talude_reference(new.id, false);
  return new;
end;
$$;

drop trigger if exists trg_auto_seed_talude_reference on public.talude_maps;
create trigger trg_auto_seed_talude_reference
after insert on public.talude_maps
for each row execute function public.auto_seed_talude_reference();

grant execute on function public.seed_talude_reference(uuid, boolean) to authenticated;
