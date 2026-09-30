
create extension if not exists pgcrypto;

create table if not exists public.estoque_epi_itens (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  descricao text not null,
  categoria text not null default 'Outros EPIs',
  tamanho text,
  ca_numero text,
  unidade text not null default 'UN',
  estoque_atual numeric(12,2) not null default 0 check (estoque_atual >= 0),
  estoque_ideal numeric(12,2),
  estoque_minimo numeric(12,2),
  valor_unitario numeric(14,4),
  ativo boolean not null default true,
  legacy_source_key text unique,
  origem_linha integer,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_estoque_epi_itens_categoria
  on public.estoque_epi_itens (categoria);
create index if not exists idx_estoque_epi_itens_ativo
  on public.estoque_epi_itens (ativo);

create table if not exists public.estoque_epi_colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text,
  setor text,
  cargo text,
  unidade text,
  ativo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_estoque_epi_colaboradores_matricula
  on public.estoque_epi_colaboradores (lower(matricula))
  where matricula is not null and trim(matricula) <> '';
create index if not exists idx_estoque_epi_colaboradores_nome
  on public.estoque_epi_colaboradores (lower(nome));

create table if not exists public.estoque_epi_entregas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references public.estoque_epi_colaboradores(id) on delete set null,
  colaborador_nome text not null,
  colaborador_matricula text,
  colaborador_setor text,
  data_entrega date not null default current_date,
  observacao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_estoque_epi_entregas_data
  on public.estoque_epi_entregas (data_entrega desc, created_at desc);
create index if not exists idx_estoque_epi_entregas_colaborador
  on public.estoque_epi_entregas (colaborador_id);

create table if not exists public.estoque_epi_movimentos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.estoque_epi_itens(id) on delete restrict,
  tipo text not null check (tipo in ('entrada','saida','devolucao','ajuste_positivo','ajuste_negativo','descarte')),
  quantidade numeric(12,2) not null check (quantidade > 0),
  saldo_anterior numeric(12,2) not null,
  saldo_apos numeric(12,2) not null,
  valor_unitario numeric(14,4),
  colaborador_id uuid references public.estoque_epi_colaboradores(id) on delete set null,
  colaborador_nome text,
  motivo text,
  documento text,
  observacao text,
  entrega_id uuid references public.estoque_epi_entregas(id) on delete set null,
  data_movimento date not null default current_date,
  origem text not null default 'manual',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_estoque_epi_movimentos_item
  on public.estoque_epi_movimentos (item_id, data_movimento desc, created_at desc);
create index if not exists idx_estoque_epi_movimentos_colaborador
  on public.estoque_epi_movimentos (colaborador_id, data_movimento desc);
create index if not exists idx_estoque_epi_movimentos_tipo
  on public.estoque_epi_movimentos (tipo, data_movimento desc);

create table if not exists public.estoque_epi_entrega_itens (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.estoque_epi_entregas(id) on delete cascade,
  item_id uuid references public.estoque_epi_itens(id) on delete set null,
  descricao text not null,
  ca_numero text,
  quantidade numeric(12,2) not null check (quantidade > 0),
  valor_unitario numeric(14,4),
  created_at timestamptz not null default now()
);
create index if not exists idx_estoque_epi_entrega_itens_entrega
  on public.estoque_epi_entrega_itens (entrega_id);

alter table public.estoque_epi_itens enable row level security;
alter table public.estoque_epi_colaboradores enable row level security;
alter table public.estoque_epi_entregas enable row level security;
alter table public.estoque_epi_movimentos enable row level security;
alter table public.estoque_epi_entrega_itens enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'estoque_epi_itens',
    'estoque_epi_colaboradores',
    'estoque_epi_entregas',
    'estoque_epi_movimentos',
    'estoque_epi_entrega_itens'
  ]
  loop
    execute format('drop policy if exists %I_read on public.%I', tbl, tbl);
    execute format(
      'create policy %I_read on public.%I for select to authenticated using (public.user_can_access_any(array[''estoque-epi'',''corretiva-pecas-status'',''controle-materiais'']))',
      tbl, tbl
    );
    execute format('drop policy if exists %I_write on public.%I', tbl, tbl);
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (public.user_can_access_any(array[''estoque-epi'',''corretiva-pecas-status'',''controle-materiais''])) with check (public.user_can_access_any(array[''estoque-epi'',''corretiva-pecas-status'',''controle-materiais'']))',
      tbl, tbl
    );
  end loop;
end $$;

grant select, insert, update, delete on
  public.estoque_epi_itens,
  public.estoque_epi_colaboradores,
  public.estoque_epi_entregas,
  public.estoque_epi_movimentos,
  public.estoque_epi_entrega_itens
to authenticated;

create or replace function public.registrar_movimento_estoque_epi(
  _item_id uuid,
  _tipo text,
  _quantidade numeric,
  _colaborador_id uuid default null,
  _colaborador_nome text default null,
  _motivo text default null,
  _documento text default null,
  _observacao text default null,
  _valor_unitario numeric default null,
  _data_movimento date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.estoque_epi_itens;
  colab public.estoque_epi_colaboradores;
  previous_qty numeric;
  next_qty numeric;
  effective_name text;
  effective_cost numeric;
  movement_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  if not public.user_can_access_any(array['estoque-epi','corretiva-pecas-status','controle-materiais']) then
    raise exception 'Sem permissão para movimentar estoque';
  end if;
  if _quantidade is null or _quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  if _tipo not in ('entrada','saida','devolucao','ajuste_positivo','ajuste_negativo','descarte') then
    raise exception 'Tipo de movimentação inválido';
  end if;

  select * into item from public.estoque_epi_itens
  where id = _item_id and ativo for update;
  if item.id is null then raise exception 'Item não encontrado ou inativo'; end if;

  previous_qty := item.estoque_atual;
  if _tipo in ('entrada','devolucao','ajuste_positivo') then
    next_qty := previous_qty + _quantidade;
  else
    next_qty := previous_qty - _quantidade;
    if next_qty < 0 then raise exception 'Saldo insuficiente. Disponível: %', previous_qty; end if;
  end if;

  if _colaborador_id is not null then
    select * into colab from public.estoque_epi_colaboradores where id = _colaborador_id;
  end if;
  effective_name := coalesce(nullif(trim(_colaborador_nome), ''), colab.nome);

  effective_cost := item.valor_unitario;
  if _tipo = 'entrada' and _valor_unitario is not null and _valor_unitario >= 0 and previous_qty + _quantidade > 0 then
    effective_cost := round(
      ((previous_qty * coalesce(item.valor_unitario, 0)) + (_quantidade * _valor_unitario))
      / (previous_qty + _quantidade), 4
    );
  end if;

  update public.estoque_epi_itens
  set estoque_atual = next_qty,
      valor_unitario = coalesce(effective_cost, valor_unitario),
      updated_at = now()
  where id = item.id;

  insert into public.estoque_epi_movimentos (
    item_id, tipo, quantidade, saldo_anterior, saldo_apos, valor_unitario,
    colaborador_id, colaborador_nome, motivo, documento, observacao,
    data_movimento, origem, created_by
  ) values (
    item.id, _tipo, _quantidade, previous_qty, next_qty,
    coalesce(_valor_unitario, item.valor_unitario),
    _colaborador_id, effective_name, nullif(trim(_motivo), ''),
    nullif(trim(_documento), ''), nullif(trim(_observacao), ''),
    coalesce(_data_movimento, current_date), 'manual', auth.uid()
  )
  returning id into movement_id;

  return jsonb_build_object(
    'movement_id', movement_id,
    'item_id', item.id,
    'saldo_anterior', previous_qty,
    'saldo_apos', next_qty,
    'valor_unitario', effective_cost
  );
end;
$$;

revoke all on function public.registrar_movimento_estoque_epi(uuid,text,numeric,uuid,text,text,text,text,numeric,date) from public;
revoke all on function public.registrar_movimento_estoque_epi(uuid,text,numeric,uuid,text,text,text,text,numeric,date) from anon;
grant execute on function public.registrar_movimento_estoque_epi(uuid,text,numeric,uuid,text,text,text,text,numeric,date) to authenticated;

create or replace function public.registrar_entrega_epi(
  _colaborador_id uuid,
  _itens jsonb,
  _observacao text default null,
  _data_entrega date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  colab public.estoque_epi_colaboradores;
  entrega uuid;
  entry jsonb;
  item public.estoque_epi_itens;
  qty numeric;
  previous_qty numeric;
  next_qty numeric;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  if not public.user_can_access_any(array['estoque-epi','corretiva-pecas-status','controle-materiais']) then
    raise exception 'Sem permissão para registrar entrega';
  end if;
  if _colaborador_id is null then raise exception 'Selecione o colaborador'; end if;
  if _itens is null or jsonb_typeof(_itens) <> 'array' or jsonb_array_length(_itens) = 0 then
    raise exception 'Adicione pelo menos um item';
  end if;

  select * into colab from public.estoque_epi_colaboradores
  where id = _colaborador_id and ativo;
  if colab.id is null then raise exception 'Colaborador não encontrado ou inativo'; end if;

  insert into public.estoque_epi_entregas (
    colaborador_id, colaborador_nome, colaborador_matricula,
    colaborador_setor, data_entrega, observacao, created_by
  ) values (
    colab.id, colab.nome, colab.matricula, colab.setor,
    coalesce(_data_entrega, current_date), nullif(trim(_observacao), ''), auth.uid()
  )
  returning id into entrega;

  for entry in select value from jsonb_array_elements(_itens)
  loop
    qty := coalesce(nullif(entry->>'quantidade','')::numeric, 0);
    if qty <= 0 then raise exception 'Quantidade inválida na entrega'; end if;

    select * into item from public.estoque_epi_itens
    where id = (entry->>'item_id')::uuid and ativo for update;
    if item.id is null then raise exception 'Item da entrega não encontrado'; end if;

    previous_qty := item.estoque_atual;
    next_qty := previous_qty - qty;
    if next_qty < 0 then raise exception 'Saldo insuficiente para %. Disponível: %', item.descricao, previous_qty; end if;

    update public.estoque_epi_itens
    set estoque_atual = next_qty, updated_at = now()
    where id = item.id;

    insert into public.estoque_epi_entrega_itens (
      entrega_id, item_id, descricao, ca_numero, quantidade, valor_unitario
    ) values (
      entrega, item.id, item.descricao, item.ca_numero, qty, item.valor_unitario
    );

    insert into public.estoque_epi_movimentos (
      item_id, tipo, quantidade, saldo_anterior, saldo_apos, valor_unitario,
      colaborador_id, colaborador_nome, motivo, observacao, entrega_id,
      data_movimento, origem, created_by
    ) values (
      item.id, 'saida', qty, previous_qty, next_qty, item.valor_unitario,
      colab.id, colab.nome, 'Entrega de EPI/Uniforme',
      nullif(trim(_observacao), ''), entrega,
      coalesce(_data_entrega, current_date), 'entrega_colaborador', auth.uid()
    );
  end loop;

  return entrega;
end;
$$;

revoke all on function public.registrar_entrega_epi(uuid,jsonb,text,date) from public;
revoke all on function public.registrar_entrega_epi(uuid,jsonb,text,date) from anon;
grant execute on function public.registrar_entrega_epi(uuid,jsonb,text,date) to authenticated;

insert into public.user_module_access (user_id, module_key, actions, granted_by)
select distinct user_id, 'estoque-epi', actions, granted_by
from public.user_module_access
where module_key = 'corretiva-pecas-status'
on conflict (user_id, module_key) do nothing;
