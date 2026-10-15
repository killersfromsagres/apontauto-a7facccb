create or replace function public.normalize_corretiva_conclusao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Uma OS cancelada não pode ser reativada por uma conclusão offline antiga.
  if old.status::text = 'cancelada' and new.status::text = 'concluida' then
    new.status := old.status;
    new.fim := old.fim;
    return new;
  end if;

  if new.status::text = 'concluida' then
    -- Repetir "Concluir" nunca altera a data original de término.
    if old.status::text = 'concluida' and nullif(btrim(coalesce(old.fim, '')), '') is not null then
      new.fim := old.fim;
    else
      new.fim := coalesce(
        nullif(btrim(coalesce(new.fim, '')), ''),
        nullif(btrim(coalesce(old.fim, '')), ''),
        now()::text
      );
    end if;

    -- Chamado concluído não pode continuar preso em programação/reprogramação.
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

drop trigger if exists trg_corretiva_conclusao_idempotente on public.corretiva_os;
create trigger trg_corretiva_conclusao_idempotente
before update on public.corretiva_os
for each row
execute function public.normalize_corretiva_conclusao();
