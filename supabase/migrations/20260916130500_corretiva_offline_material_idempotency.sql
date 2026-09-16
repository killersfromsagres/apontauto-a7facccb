-- Offline-first Corretiva Novo: chaves idempotentes para solicitações de material.
-- Permite repetir sincronizações após perda de sinal sem criar solicitações/itens duplicados.

alter table public.material_solicitacoes
  add column if not exists client_uuid text;

alter table public.material_solicitacao_itens
  add column if not exists client_uuid text;

create unique index if not exists uq_material_solicitacoes_client_uuid
  on public.material_solicitacoes(client_uuid)
  where client_uuid is not null;

create unique index if not exists uq_material_solicitacao_itens_client_uuid
  on public.material_solicitacao_itens(client_uuid)
  where client_uuid is not null;
