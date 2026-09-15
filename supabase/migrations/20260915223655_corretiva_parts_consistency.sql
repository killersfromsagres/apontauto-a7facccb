create or replace function public.normalize_corretiva_peca()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.urgencia::text = 'Media' then
    new.urgencia := 'media'::public.corretiva_urgencia;
  end if;

  if nullif(btrim(new.client_uuid), '') is null then
    new.client_uuid := gen_random_uuid()::text;
  end if;

  if new.enviado_por is null then
    new.enviado_por := auth.uid();
  end if;

  if nullif(btrim(new.material_status), '') is null then
    new.material_status := 'solicitado';
  end if;

  if nullif(btrim(new.material_request_date), '') is null then
    new.material_request_date := now()::text;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.reflect_corretiva_peca_on_os()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  summary text;
begin
  summary := concat_ws(' ',
    nullif(btrim(new.descricao), ''),
    case
      when new.quantidade is not null
        then '(qtd. ' || trim(to_char(new.quantidade, 'FM999999990.##')) || ')'
      else null
    end
  );

  update public.corretiva_os
     set material_status = 'solicitado',
         pecas_solicitadas = case
           when nullif(btrim(coalesce(pecas_solicitadas, '')), '') is null then summary
           when position(lower(summary) in lower(pecas_solicitadas)) > 0 then pecas_solicitadas
           else pecas_solicitadas || E'\n' || summary
         end,
         updated_at = now()
   where id = new.os_id;

  return new;
end;
$$;

drop trigger if exists trg_normalize_corretiva_peca on public.corretiva_pecas;
create trigger trg_normalize_corretiva_peca
before insert or update on public.corretiva_pecas
for each row execute function public.normalize_corretiva_peca();

drop trigger if exists trg_reflect_corretiva_peca_on_os on public.corretiva_pecas;
create trigger trg_reflect_corretiva_peca_on_os
after insert or update of descricao, quantidade, material_status on public.corretiva_pecas
for each row execute function public.reflect_corretiva_peca_on_os();

create unique index if not exists corretiva_pecas_os_client_uuid_uq
on public.corretiva_pecas (os_id, client_uuid)
where client_uuid is not null;
