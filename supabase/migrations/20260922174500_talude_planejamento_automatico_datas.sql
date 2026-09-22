alter table public.talude_marcacoes
  add column if not exists planejamento_automatico boolean not null default false,
  add column if not exists duracao_dias integer null,
  add column if not exists considerar_sabado boolean not null default false,
  add column if not exists considerar_domingo boolean not null default false,
  add column if not exists chuva_prob_limite integer not null default 60,
  add column if not exists chuva_mm_limite numeric not null default 0.1,
  add column if not exists planejamento_atualizado_em timestamptz null,
  add column if not exists planejamento_previsao_ate date null,
  add column if not exists planejamento_provisorio boolean not null default false,
  add column if not exists planejamento_resumo jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'talude_marcacoes_duracao_dias_check'
  ) then
    alter table public.talude_marcacoes
      add constraint talude_marcacoes_duracao_dias_check
      check (duracao_dias is null or duracao_dias between 1 and 365);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'talude_marcacoes_chuva_prob_limite_check'
  ) then
    alter table public.talude_marcacoes
      add constraint talude_marcacoes_chuva_prob_limite_check
      check (chuva_prob_limite between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'talude_marcacoes_chuva_mm_limite_check'
  ) then
    alter table public.talude_marcacoes
      add constraint talude_marcacoes_chuva_mm_limite_check
      check (chuva_mm_limite >= 0);
  end if;
end $$;

comment on column public.talude_marcacoes.duracao_dias is
  'Quantidade de dias produtivos necessários para concluir o talude.';
comment on column public.talude_marcacoes.planejamento_provisorio is
  'Indica que parte do cronograma calculado está além da janela meteorológica disponível.';
comment on column public.talude_marcacoes.planejamento_resumo is
  'Resumo auditável do último cálculo automático de datas do talude.';
