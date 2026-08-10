insert into public.profiles (id, full_name, allowed_menus)
values ('c47ad322-a4d2-4efc-b43a-89ed5f55529b','Corretivas - Campo', array['corretiva','corretiva-historico'])
on conflict (id) do update set full_name = excluded.full_name, allowed_menus = excluded.allowed_menus;

delete from public.user_roles where user_id = 'c47ad322-a4d2-4efc-b43a-89ed5f55529b';
insert into public.user_roles (user_id, role) values ('c47ad322-a4d2-4efc-b43a-89ed5f55529b','user');

delete from public.user_module_access where user_id = 'c47ad322-a4d2-4efc-b43a-89ed5f55529b';
insert into public.user_module_access (user_id, module_key, actions, granted_by)
values
  ('c47ad322-a4d2-4efc-b43a-89ed5f55529b','corretiva', array['read','create','update'], '5cf1aedb-82f7-4d43-9892-4013f32f07b9'),
  ('c47ad322-a4d2-4efc-b43a-89ed5f55529b','corretiva-historico', array['read'], '5cf1aedb-82f7-4d43-9892-4013f32f07b9');