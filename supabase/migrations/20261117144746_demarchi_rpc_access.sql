-- Keep privileged comment insertion outside the exposed API schema.
create or replace function dem_private.comment_ticket(target_ticket uuid, comment_text text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not dem_private.can_read_ticket(target_ticket) then raise exception 'Sem acesso a este chamado.'; end if;
  if length(trim(comment_text)) not between 2 and 2000 then raise exception 'Escreva entre 2 e 2000 caracteres.'; end if;
  insert into public.dem_ticket_events(ticket_id,actor_id,actor_name,message)
    values(target_ticket,auth.uid(),coalesce((select name from public.dem_people where user_id=auth.uid()),'Administração'),trim(comment_text));
end; $$;

revoke all on function dem_private.comment_ticket(uuid,text) from public,anon;
grant execute on function dem_private.comment_ticket(uuid,text) to authenticated;
create or replace function public.dem_comment_ticket(target_ticket uuid, comment_text text) returns void language sql security invoker set search_path=public as $$ select dem_private.comment_ticket(target_ticket,comment_text); $$;
alter function public.dem_generate_preventives(date) security invoker;
