alter table public.estoque_epi_movimentos
  drop constraint if exists estoque_epi_saida_identificada;

alter table public.estoque_epi_movimentos
  add constraint estoque_epi_saida_identificada
  check (
    tipo <> 'saida'
    or colaborador_id is not null
    or coalesce(nullif(trim(colaborador_nome), ''), '') <> ''
  );

comment on constraint estoque_epi_saida_identificada
  on public.estoque_epi_movimentos
  is 'Toda saída deve identificar o colaborador que realizou a retirada.';

comment on column public.estoque_epi_movimentos.data_movimento
  is 'Data operacional informada pelo usuário: data da entrada, retirada ou ajuste.';

comment on column public.estoque_epi_entregas.data_entrega
  is 'Data real da retirada/entrega informada pelo usuário.';
