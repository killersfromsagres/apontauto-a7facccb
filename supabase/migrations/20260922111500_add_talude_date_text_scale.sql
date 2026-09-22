-- Escala independente para os números exibidos nos campos de data dos Taludes.
-- A coluna pode já existir no ambiente ativo; esta migration é idempotente.

alter table public.talude_marcacoes
  add column if not exists data_text_scale numeric not null default 1;

comment on column public.talude_marcacoes.data_text_scale is
  'Escala independente dos números das datas DE/ATÉ, sem depender da escala do card.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'talude_marcacoes_data_text_scale_check'
      and conrelid = 'public.talude_marcacoes'::regclass
  ) then
    alter table public.talude_marcacoes
      add constraint talude_marcacoes_data_text_scale_check
      check (data_text_scale >= 0.6 and data_text_scale <= 3.0);
  end if;
end $$;
