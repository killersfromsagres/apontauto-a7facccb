alter table public.relatorio_diario_execucoes
  add column if not exists observacao text;

comment on column public.relatorio_diario_execucoes.observacao is
  'Observação operacional compacta da execução, como pendência de peça, retorno ou ressalva após conclusão.';
