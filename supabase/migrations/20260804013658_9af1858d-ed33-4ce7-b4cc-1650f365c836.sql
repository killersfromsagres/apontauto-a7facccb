insert into public.user_module_access (user_id, module_key)
select u.id, k
from auth.users u
cross join unnest(array['corretiva','corretiva-historico','corretiva-pecas-status','refrigeracao','refrigeracao-historico','refrigeracao-pecas-status','preventiva-ac','materiais-os','programacao','apontamentos']) as k
where u.email in ('corretivas@apontauto.local','manutencao@apontauto.local')
on conflict do nothing;