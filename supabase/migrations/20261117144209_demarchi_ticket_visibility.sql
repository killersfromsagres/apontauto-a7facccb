-- Evaluate ownership directly on the row. INSERT ... RETURNING must not depend
-- on a separate stable lookup that cannot yet see the newly inserted ticket.
drop policy if exists dem_tickets_read on public.dem_tickets;
create policy dem_tickets_read on public.dem_tickets for select to authenticated using (
  (select dem_private.is_admin()) or (
    (select dem_private.is_member()) and (
      requester_id = (select auth.uid()) or
      assigned_to in (select id from public.dem_people where user_id=(select auth.uid()) and active)
    )
  )
);
