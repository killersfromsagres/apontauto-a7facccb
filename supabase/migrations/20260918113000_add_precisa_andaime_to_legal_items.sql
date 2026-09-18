-- Keep the Legal Panel schema aligned with the current application payload.
-- The migration is intentionally idempotent because the production column may
-- already have been provisioned during recovery of the active Supabase project.

alter table public.legal_items
  add column if not exists precisa_andaime boolean not null default false;

comment on column public.legal_items.precisa_andaime is
  'Indica se o item legal requer montagem de andaime para execução.';
