-- Corrige a persistência do botão "Marcar como verificado" em corretiva-historico.
-- O frontend usa upsert com ON CONFLICT (os_id), portanto os_id precisa ser único.
-- Também libera o DELETE para que uma conferência possa ser desmarcada.

create unique index if not exists corretiva_historico_verificacoes_os_id_uidx
  on public.corretiva_historico_verificacoes (os_id);

drop policy if exists corretiva_hist_delete on public.corretiva_historico_verificacoes;
create policy corretiva_hist_delete
  on public.corretiva_historico_verificacoes
  for delete
  to authenticated
  using (
    user_can_access_any(
      array[
        'corretiva-historico'::text,
        'corretiva-novo'::text,
        'corretiva'::text
      ]
    )
  );
