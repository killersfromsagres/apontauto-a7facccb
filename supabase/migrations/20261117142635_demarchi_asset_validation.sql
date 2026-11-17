-- Correct ambiguous PL/pgSQL table alias before importing the reference hierarchy.
create or replace function dem_private.validate_asset() returns trigger language plpgsql set search_path = public as $$
declare p public.dem_assets; begin
  if new.parent_id is not null then
    select * into p from public.dem_assets where id = new.parent_id;
    if not found then raise exception 'Ativo pai não encontrado.'; end if;
    if new.kind='planta' or (new.kind='predio' and p.kind<>'planta') or (new.kind='andar' and p.kind<>'predio') or (new.kind='ambiente' and p.kind<>'andar') or (new.kind='equipamento' and p.kind not in ('ambiente','andar','predio')) then
      raise exception 'Hierarquia inválida: selecione um pai do nível anterior.';
    end if;
    if exists(with recursive parents as (select id,parent_id from public.dem_assets where id=new.parent_id union all select a.id,a.parent_id from public.dem_assets a join parents ancestor on a.id=ancestor.parent_id) select 1 from parents where id=new.id) then raise exception 'A localização não pode ser filha de si mesma.'; end if;
  elsif new.kind <> 'planta' then raise exception 'Selecione a localização superior.';
  end if; return new;
end; $$;
