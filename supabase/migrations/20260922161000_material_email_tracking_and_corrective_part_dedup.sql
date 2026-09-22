alter table public.corretiva_pecas
  add column if not exists email_enviado_em timestamptz null;

alter table public.refrigeracao_pecas
  add column if not exists email_enviado_em timestamptz null;

create unique index if not exists corretiva_pecas_os_descricao_unique
  on public.corretiva_pecas (
    os_id,
    lower(regexp_replace(btrim(descricao), '\s+', ' ', 'g'))
  );

comment on column public.corretiva_pecas.email_enviado_em is
  'Data/hora em que a peça foi marcada como já encaminhada por e-mail. Itens marcados são excluídos das próximas exportações pendentes.';

comment on column public.refrigeracao_pecas.email_enviado_em is
  'Data/hora em que a peça foi marcada como já encaminhada por e-mail. Itens marcados são excluídos das próximas exportações pendentes.';
