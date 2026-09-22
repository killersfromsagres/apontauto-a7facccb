with mapping(asset_code, cost_center, asset_name) as (
  values
    ('DEMDA', '9I670619', 'B130'),
    ('DEMEB', '9I670620', 'B158'),
    ('DEMED', '9I670620', 'B380'),
    ('DEMEE', '9I670620', 'B90'),
    ('DEMEF', '9I670649', 'C065/125'),
    ('DEMEI', '9I670649', 'C380'),
    ('DEMEJ', '9I670619', 'C45-C49'),
    ('DEMEK', '9I670620', 'CONTAINER Z500'),
    ('DEMEM', '9I670649', 'D35'),
    ('DEMEO', '9I670649', 'D55-D85'),
    ('DEMEP', '9I670649', 'D85'),
    ('DEMEQ', '9I670615', 'E170'),
    ('DEMER', '9I670620', 'E210'),
    ('DEMEU', '9I632017', 'PERIMETRO EXTERNO'),
    ('DEMEW', '9I632017', 'RUAS'),
    ('DEMEY', '9I670644', 'B450'),
    ('DEMEZ', '9I670619', 'C170'),
    ('DEMPA', '9I670617', 'A160'),
    ('DEMPB', '9I670619', 'A170'),
    ('DEMPC', '9I670620', 'A220'),
    ('DEMPD', '9I670646', 'ADC'),
    ('DEMPE', '9I670618', 'AMBULATORIO'),
    ('DEMPF', '9I670619', 'B115'),
    ('DEMPG', '9I670618', 'B203'),
    ('DEMPH', '9I670620', 'B290'),
    ('DEMPI', '9I670649', 'B350'),
    ('DEMPK', '9I670618', 'C110'),
    ('DEMPL', '9I670622', 'C120'),
    ('DEMPM', '9I670620', 'C340'),
    ('DEMPN', '9I670619', 'C45'),
    ('DEMPO', '9I670619', 'C46'),
    ('DEMPP', '9I670619', 'C49'),
    ('DEMPQ', '9I670619', 'C65'),
    ('DEMPR', '9I670616', 'C70'),
    ('DEMPS', '9I623000', 'D240'),
    ('DEMPT', '9I632017', 'D270'),
    ('DEMPU', '9I670619', 'D345'),
    ('DEMPV', '9I670649', 'D55'),
    ('DEMPW', '9I670615', 'E105'),
    ('DEMPX', '9I632017', 'E125'),
    ('DEMPY', '9I632017', 'E130'),
    ('DEMPZ', '9I670615', 'E171'),
    ('DEMRA', '9I632017', 'E200'),
    ('DEMRB', '9I678017', 'E310'),
    ('DEMRC', '9I670618', 'E35'),
    ('DEMRD', '9I632017', 'E70'),
    ('DEMRE', '9I670647', 'FUNDAÇÃO ECO+'),
    ('DEMRF', '9I670619', 'F30'),
    ('DEMRG', '9I670619', 'Z210'),
    ('DEMRH', '9I686001', 'Z310'),
    ('DEMRI', '9I670620', 'Z500'),
    ('DEMRJ', '9I632017', 'E80'),
    ('DEMRK', '9I120070', 'D295'),
    ('DEMRL', '9I120070', 'D246'),
    ('DEMRM', '9I670644', 'B440'),
    ('DEMRN', '9I632017', 'E165'),
    ('DEMRP', '9I670644', 'A470'),
    ('DEMRQ', '9I670622', 'B120'),
    ('DEMRR', '9I670619', 'B70'),
    ('DEMRS', '9I670615', 'D265'),
    ('DEMRT', '9I670621', 'F60'),
    ('DEMRU', '9I670620', 'Z400'),
    ('DEMRV', '9I670617', 'A100'),
    ('DEMRW', '9I660008', 'A180'),
    ('DEMRX', '9I670620', 'A380'),
    ('DEMRY', '9I670620', 'A460'),
    ('DEMSA', '9I670619', 'PORTARIA 3'),
    ('DEMSB', '9I670619', 'PORTARIA 4'),
    ('DEMSC', '9I632017', 'ESTACIONAMENTO'),
    ('DEMSD', '9I670619', 'PORTARIA 1'),
    ('DEMSG', '9I632017', 'AREA V.E'),
    ('DEMSH', '9I670617', 'E150'),
    ('DEMSI', '9I670617', 'E340'),
    ('DEMZU', '9I632017', 'JARDIM')
),
upserted as (
  insert into public.material_asset_cost_centers
    (asset_code, cost_center, asset_name, source_name, imported_at, updated_at)
  select
    asset_code, cost_center, asset_name, 'BM Demarchi - Limp - Jard - Abast - Maio - 2026 (2).xlsx', now(), now()
  from mapping
  on conflict (asset_code) do update
  set cost_center = excluded.cost_center,
      asset_name = excluded.asset_name,
      source_name = excluded.source_name,
      imported_at = excluded.imported_at,
      updated_at = now()
  returning asset_code
),
resolved as (
  select
    existing.asset_code,
    matched.cost_center
  from public.material_asset_cost_centers existing
  join lateral (
    select mapping.cost_center
    from mapping
    where existing.asset_code like mapping.asset_code || '%'
    order by length(mapping.asset_code) desc
    limit 1
  ) matched on true
  where existing.asset_code like 'DEM%'
)
update public.material_asset_cost_centers target
set cost_center = resolved.cost_center,
    source_name = 'BM Demarchi - Limp - Jard - Abast - Maio - 2026 (2).xlsx',
    imported_at = now(),
    updated_at = now()
from resolved
where target.asset_code = resolved.asset_code;
