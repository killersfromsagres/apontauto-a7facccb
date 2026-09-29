
create or replace function public.clear_corretiva_programming_on_close()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in (
    'concluida'::public.corretiva_os_status,
    'cancelada'::public.corretiva_os_status
  ) then
    new.programacao_status := 'disponivel';
    new.programacao_periodo_inicio := null;
    new.programacao_periodo_fim := null;
    new.programacao_dia_indice := null;
    new.programacao_equipe := null;
    new.programacao_reservada_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_corretiva_programming_close_consistency
  on public.corretiva_os;
create trigger trg_corretiva_programming_close_consistency
before update of status on public.corretiva_os
for each row
execute function public.clear_corretiva_programming_on_close();
