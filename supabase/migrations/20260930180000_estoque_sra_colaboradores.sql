
alter table public.estoque_epi_colaboradores
  add column if not exists empresa_codigo text,
  add column if not exists filial_codigo text,
  add column if not exists filial_descricao text,
  add column if not exists regional text,
  add column if not exists local_trabalho text,
  add column if not exists data_treinamento date,
  add column if not exists data_admissao date,
  add column if not exists data_demissao date,
  add column if not exists centro_custo text,
  add column if not exists centro_resultado text,
  add column if not exists supervisor text,
  add column if not exists gerente text,
  add column if not exists gerente_regional text,
  add column if not exists cliente_codigo text,
  add column if not exists cliente text,
  add column if not exists setor_negocio text,
  add column if not exists codigo_funcao text,
  add column if not exists funcao text,
  add column if not exists escala text,
  add column if not exists situacao_sra text,
  add column if not exists sexo text,
  add column if not exists categoria_colaborador text,
  add column if not exists horario_trabalho text,
  add column if not exists intervalo_trabalho text,
  add column if not exists origem_sra boolean not null default false,
  add column if not exists sra_linha integer,
  add column if not exists sra_synced_at timestamptz;

create index if not exists idx_estoque_epi_colaboradores_sra_situacao
  on public.estoque_epi_colaboradores (situacao_sra)
  where origem_sra;

create index if not exists idx_estoque_epi_colaboradores_centro_resultado
  on public.estoque_epi_colaboradores (centro_resultado)
  where origem_sra;

create index if not exists idx_estoque_epi_colaboradores_funcao
  on public.estoque_epi_colaboradores (funcao)
  where origem_sra;

alter table public.estoque_epi_entregas
  add column if not exists colaborador_funcao text,
  add column if not exists colaborador_centro_resultado text,
  add column if not exists colaborador_situacao_sra text,
  add column if not exists colaborador_supervisor text;

create or replace function public.sincronizar_colaboradores_sra(
  _rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  existing_id uuid;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  matricula_value text;
  nome_value text;
  demissao_value date;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida';
  end if;

  if not public.user_can_access_any(array['estoque-epi','corretiva-pecas-status','controle-materiais']) then
    raise exception 'Sem permissão para sincronizar o SRA';
  end if;

  if _rows is null or jsonb_typeof(_rows) <> 'array' then
    raise exception 'Arquivo SRA inválido';
  end if;

  for entry in select value from jsonb_array_elements(_rows)
  loop
    matricula_value := nullif(trim(entry->>'matricula'), '');
    nome_value := nullif(trim(entry->>'nome'), '');

    if matricula_value is null or nome_value is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    demissao_value := nullif(entry->>'data_demissao', '')::date;

    select id
      into existing_id
    from public.estoque_epi_colaboradores
    where lower(trim(matricula)) = lower(matricula_value)
    order by created_at asc
    limit 1;

    if existing_id is null then
      insert into public.estoque_epi_colaboradores (
        nome, matricula, setor, cargo, unidade, ativo,
        empresa_codigo, filial_codigo, filial_descricao, regional,
        local_trabalho, data_treinamento, data_admissao, data_demissao,
        centro_custo, centro_resultado, supervisor, gerente, gerente_regional,
        cliente_codigo, cliente, setor_negocio, codigo_funcao, funcao,
        escala, situacao_sra, sexo, categoria_colaborador,
        horario_trabalho, intervalo_trabalho,
        origem_sra, sra_linha, sra_synced_at, created_by
      ) values (
        nome_value,
        matricula_value,
        nullif(trim(entry->>'setor_negocio'), ''),
        nullif(trim(entry->>'funcao'), ''),
        nullif(trim(entry->>'local_trabalho'), ''),
        demissao_value is null,
        nullif(trim(entry->>'empresa_codigo'), ''),
        nullif(trim(entry->>'filial_codigo'), ''),
        nullif(trim(entry->>'filial_descricao'), ''),
        nullif(trim(entry->>'regional'), ''),
        nullif(trim(entry->>'local_trabalho'), ''),
        nullif(entry->>'data_treinamento', '')::date,
        nullif(entry->>'data_admissao', '')::date,
        demissao_value,
        nullif(trim(entry->>'centro_custo'), ''),
        nullif(trim(entry->>'centro_resultado'), ''),
        nullif(trim(entry->>'supervisor'), ''),
        nullif(trim(entry->>'gerente'), ''),
        nullif(trim(entry->>'gerente_regional'), ''),
        nullif(trim(entry->>'cliente_codigo'), ''),
        nullif(trim(entry->>'cliente'), ''),
        nullif(trim(entry->>'setor_negocio'), ''),
        nullif(trim(entry->>'codigo_funcao'), ''),
        nullif(trim(entry->>'funcao'), ''),
        nullif(trim(entry->>'escala'), ''),
        nullif(trim(entry->>'situacao_sra'), ''),
        nullif(trim(entry->>'sexo'), ''),
        nullif(trim(entry->>'categoria_colaborador'), ''),
        nullif(trim(entry->>'horario_trabalho'), ''),
        nullif(trim(entry->>'intervalo_trabalho'), ''),
        true,
        nullif(entry->>'sra_linha', '')::integer,
        now(),
        auth.uid()
      );
      created_count := created_count + 1;
    else
      update public.estoque_epi_colaboradores
      set
        nome = nome_value,
        setor = nullif(trim(entry->>'setor_negocio'), ''),
        cargo = nullif(trim(entry->>'funcao'), ''),
        unidade = nullif(trim(entry->>'local_trabalho'), ''),
        ativo = demissao_value is null,
        empresa_codigo = nullif(trim(entry->>'empresa_codigo'), ''),
        filial_codigo = nullif(trim(entry->>'filial_codigo'), ''),
        filial_descricao = nullif(trim(entry->>'filial_descricao'), ''),
        regional = nullif(trim(entry->>'regional'), ''),
        local_trabalho = nullif(trim(entry->>'local_trabalho'), ''),
        data_treinamento = nullif(entry->>'data_treinamento', '')::date,
        data_admissao = nullif(entry->>'data_admissao', '')::date,
        data_demissao = demissao_value,
        centro_custo = nullif(trim(entry->>'centro_custo'), ''),
        centro_resultado = nullif(trim(entry->>'centro_resultado'), ''),
        supervisor = nullif(trim(entry->>'supervisor'), ''),
        gerente = nullif(trim(entry->>'gerente'), ''),
        gerente_regional = nullif(trim(entry->>'gerente_regional'), ''),
        cliente_codigo = nullif(trim(entry->>'cliente_codigo'), ''),
        cliente = nullif(trim(entry->>'cliente'), ''),
        setor_negocio = nullif(trim(entry->>'setor_negocio'), ''),
        codigo_funcao = nullif(trim(entry->>'codigo_funcao'), ''),
        funcao = nullif(trim(entry->>'funcao'), ''),
        escala = nullif(trim(entry->>'escala'), ''),
        situacao_sra = nullif(trim(entry->>'situacao_sra'), ''),
        sexo = nullif(trim(entry->>'sexo'), ''),
        categoria_colaborador = nullif(trim(entry->>'categoria_colaborador'), ''),
        horario_trabalho = nullif(trim(entry->>'horario_trabalho'), ''),
        intervalo_trabalho = nullif(trim(entry->>'intervalo_trabalho'), ''),
        origem_sra = true,
        sra_linha = nullif(entry->>'sra_linha', '')::integer,
        sra_synced_at = now(),
        updated_at = now()
      where id = existing_id;
      updated_count := updated_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'total', created_count + updated_count
  );
end;
$$;

revoke all on function public.sincronizar_colaboradores_sra(jsonb) from public;
revoke all on function public.sincronizar_colaboradores_sra(jsonb) from anon;
grant execute on function public.sincronizar_colaboradores_sra(jsonb) to authenticated;

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
  if _data_entrega is null then raise exception 'Informe a data da retirada'; end if;
  if _itens is null or jsonb_typeof(_itens) <> 'array' or jsonb_array_length(_itens) = 0 then
    raise exception 'Adicione pelo menos um item';
  end if;

  select * into colab from public.estoque_epi_colaboradores
  where id = _colaborador_id and ativo;
  if colab.id is null then raise exception 'Colaborador não encontrado ou inativo'; end if;

  insert into public.estoque_epi_entregas (
    colaborador_id, colaborador_nome, colaborador_matricula,
    colaborador_setor, colaborador_funcao, colaborador_centro_resultado,
    colaborador_situacao_sra, colaborador_supervisor,
    data_entrega, observacao, created_by
  ) values (
    colab.id, colab.nome, colab.matricula, colab.setor,
    coalesce(colab.funcao, colab.cargo), colab.centro_resultado,
    colab.situacao_sra, colab.supervisor,
    _data_entrega, nullif(trim(_observacao), ''), auth.uid()
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
      _data_entrega, 'entrega_colaborador', auth.uid()
    );
  end loop;

  return entrega;
end;
$$;

revoke all on function public.registrar_entrega_epi(uuid,jsonb,text,date) from public;
revoke all on function public.registrar_entrega_epi(uuid,jsonb,text,date) from anon;
grant execute on function public.registrar_entrega_epi(uuid,jsonb,text,date) to authenticated;
