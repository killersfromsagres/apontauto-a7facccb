
create table if not exists public.agua_prog_pontos (
  id uuid primary key default gen_random_uuid(),
  predio text not null,
  andar text,
  espaco text,
  periodo text,
  dias int[] not null default '{}',
  bags numeric not null default 1,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.agua_prog_pontos to authenticated;
grant all on public.agua_prog_pontos to service_role;
alter table public.agua_prog_pontos enable row level security;
drop policy if exists "agua_prog_pontos_auth" on public.agua_prog_pontos;
create policy "agua_prog_pontos_auth" on public.agua_prog_pontos for all to authenticated using (true) with check (true);

create table if not exists public.agua_prog_entregas (
  id uuid primary key default gen_random_uuid(),
  ponto_id uuid not null references public.agua_prog_pontos(id) on delete cascade,
  data date not null,
  colaboradores text[] not null default '{}',
  veiculo text,
  bags numeric not null default 1,
  observacao text,
  status text not null default 'concluida',
  registrado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ponto_id, data)
);
create index if not exists agua_prog_entregas_data_idx on public.agua_prog_entregas (data desc);
grant select, insert, update, delete on public.agua_prog_entregas to authenticated;
grant all on public.agua_prog_entregas to service_role;
alter table public.agua_prog_entregas enable row level security;
drop policy if exists "agua_prog_entregas_auth" on public.agua_prog_entregas;
create policy "agua_prog_entregas_auth" on public.agua_prog_entregas for all to authenticated using (true) with check (true);

create table if not exists public.agua_prog_fotos (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.agua_prog_entregas(id) on delete cascade,
  url text not null,
  storage_path text,
  criado_em timestamptz not null default now()
);
create index if not exists agua_prog_fotos_entrega_idx on public.agua_prog_fotos (entrega_id);
grant select, insert, update, delete on public.agua_prog_fotos to authenticated;
grant all on public.agua_prog_fotos to service_role;
alter table public.agua_prog_fotos enable row level security;
drop policy if exists "agua_prog_fotos_auth" on public.agua_prog_fotos;
create policy "agua_prog_fotos_auth" on public.agua_prog_fotos for all to authenticated using (true) with check (true);

insert into public.agua_prog_pontos (predio, andar, espaco, periodo, dias, ordem)
select * from (values
('A170','TÉRREO','PORTARIA 1','SEGUNDA-FEIRA',ARRAY[1]::int[],1),
('C65','TÉRREO','FÁBRICA 1','SEGUNDA E QUINTA-FEIRA',ARRAY[1,4]::int[],2),
('COMISSÃO','TÉRREO','GERAL','SEGUNDA E QUINTA-FEIRA',ARRAY[1,4]::int[],3),
('E171','TÉRREO','ENGENHARIA','SEGUNDA E QUINTA-FEIRA',ARRAY[1,4]::int[],4),
('A460','ENGEKO','GERAL','SEGUNDA E QUINTA-FEIRA',ARRAY[1,4]::int[],5),
('A160','TÉRREO','CICULAÇÃO','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],6),
('A160','TÉRREO','COPA','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],7),
('B440','TÉRREO','CANTEIRO DE OBRAS','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],8),
('C340','TÉRREO','LOGISTICA INTERNA','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],9),
('ADC','VCE','ADC','TERÇA-FEIRA',ARRAY[2]::int[],10),
('B90','TÉRREO','SALA FACILITES EHS','QUINTA-FEIRA',ARRAY[4]::int[],11),
('B115','TÉRREO','LAVANDERIA','QUINTA-FEIRA',ARRAY[4]::int[],12),
('C46','TÉRREO','PORTARIA 2','SEGUNDA - QUARTA - SEXTA',ARRAY[1,3,5]::int[],13),
('A220','TÉRREO','SALA CAFÉ','1x POR DIA',ARRAY[1]::int[],14),
('A220','TÉRREO','LOGISTICA','1x POR DIA',ARRAY[1]::int[],15),
('A460','TÉRREO','GERAL','1x POR DIA',ARRAY[1]::int[],16),
('C110','TÉRREO','AMBULATÓRIO - RH - COPA','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],17),
('A460','CANTEIRO DE OBRAS','GERAL','1x POR DIA',ARRAY[1]::int[],18),
('A460','GRI','GERAL','1x POR DIA',ARRAY[2]::int[],19),
('B203','TÉRREO','SUVINIL','1x POR DIA',ARRAY[2]::int[],20),
('B203','TÉRREO','ÁREA ADM','1x POR DIA',ARRAY[2]::int[],21),
('B290','TÉRREO','SALA CAFÉ','1x POR DIA',ARRAY[3]::int[],22),
('C120','TÉRREO','AWETA','1x POR DIA',ARRAY[3]::int[],23),
('C120','TÉRREO','COPA','1x POR DIA',ARRAY[3]::int[],24),
('C46','TÉRREO','COMISSÃO DE FÁBRICA - SALA PATRIMONIAL','QUINTA-FEIRA',ARRAY[4]::int[],25),
('C120','TÉRREO','GERAL','1x POR DIA',ARRAY[3]::int[],26),
('D295','6ª ANDAR','PESAGEM','TERÇA-FEIRA',ARRAY[2]::int[],27),
('C120','TÉRREO','HALL','1x POR DIA',ARRAY[3]::int[],28),
('D240','GERAL','CENTRAL DE ENERGIA','QUINTA-FEIRA',ARRAY[4]::int[],29),
('D270','CCM','COPA','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],30),
('C380','TÉRREO','ALMOXARIFADO','1x POR DIA',ARRAY[4]::int[],31),
('D270','GERAL','PREPARAÇÃO','1x POR DIA',ARRAY[5]::int[],32),
('D270','4ª ANDAR','ADMINISTRAÇÃO','1x POR DIA',ARRAY[5]::int[],33),
('E310','TÉRREO','RECUPERAÇÃO DE SOLVENTES','TERÇA-FEIRA',ARRAY[2]::int[],34),
('C70','TÉRREO','RESTAURANTE','QUARTA-FEIRA',ARRAY[3]::int[],35),
('D345','TÉRREO','COPA','QUARTA-FEIRA',ARRAY[3]::int[],36),
('D345','1ª ANDAR','ALMOXARIFADO - DESENVASE','QUARTA-FEIRA',ARRAY[3]::int[],37),
('D270','1ª ANDAR','RESINAS','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],38),
('D240','TÉRREO','CENTRAL DE UTILIDADES','QUINTA-FEIRA',ARRAY[4]::int[],39),
('D55 - D85','TÉRREO','SALA ADM','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],40),
('D270','5ª ANDAR','GERAL','1x POR DIA',ARRAY[5]::int[],41),
('E165','TÉRREO','PESAGEM FÁBRICA 3','QUINTA-FEIRA',ARRAY[4]::int[],42),
('E105','TÉRREO','ENGENHARIA DE CAMPO - ECO','1x POR DIA',ARRAY[1]::int[],43),
('D345','TÉRREO','LABORATÓRIO MP','QUARTA-FEIRA',ARRAY[3]::int[],44),
('E130','TÉRREO','FÁBRICA 3','QUARTA-FEIRA',ARRAY[3]::int[],45),
('E35','TÉRREO','EHS','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],46),
('E35','TÉRREO','SALA CAFÉ','1x POR DIA',ARRAY[2]::int[],47),
('E70','TÉRREO','FÁBRICA 5','1x POR DIA',ARRAY[2]::int[],48),
('F30','TÉRREO','PORTARIA 3','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],49),
('F60','TÉRREO','LOJA SUVINIL','TERÇA E QUINTA-FEIRA',ARRAY[2,4]::int[],50),
('Z210','TÉRREO','PORTARIA 4','QUARTA-FEIRA',ARRAY[3]::int[],51),
('Z310','TÉRREO','ETE','QUARTA-FEIRA',ARRAY[3]::int[],52),
('Z500','TÉRREO','SALA ADM','1x POR DIA',ARRAY[3]::int[],53),
('Z500','TÉRREO','SALA CAFÉ','1x POR DIA',ARRAY[3]::int[],54)
) as v(predio, andar, espaco, periodo, dias, ordem)
where not exists (select 1 from public.agua_prog_pontos);
