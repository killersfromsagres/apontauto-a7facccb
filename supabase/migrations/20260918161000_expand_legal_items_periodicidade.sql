-- Permite todas as periodicidades disponíveis no Painel Legal.
alter table public.legal_items
  drop constraint if exists legal_items_periodicidade_check;

alter table public.legal_items
  add constraint legal_items_periodicidade_check
  check (periodicidade = any (array[
    'bimestral'::text,
    'trimestral'::text,
    'quadrimestral'::text,
    'semestral'::text,
    'anual'::text
  ]));
