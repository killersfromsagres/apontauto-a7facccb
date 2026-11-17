create or replace function dem_private.is_member() returns boolean language sql stable security definer set search_path=public as $$ select dem_private.is_admin() or exists(select 1 from public.dem_people where user_id=auth.uid() and active and removed_at is null); $$;
revoke all on function dem_private.is_member() from public,anon;
grant execute on function dem_private.is_member() to authenticated;
