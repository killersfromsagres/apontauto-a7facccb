-- Painel Legal: provision the private certificates bucket and separate the
-- current certificate from historical certificates.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-certificates',
  'legal-certificates',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.legal_item_attachments
  add column if not exists is_current boolean not null default false;

-- For installations that already have attachments, keep the newest one as
-- the current certificate and preserve the remaining files as history.
with ranked as (
  select id,
         row_number() over (partition by item_id order by created_at desc, id desc) as rn
  from public.legal_item_attachments
)
update public.legal_item_attachments a
set is_current = (ranked.rn = 1)
from ranked
where ranked.id = a.id;

create unique index if not exists legal_item_attachments_one_current_per_item
  on public.legal_item_attachments (item_id)
  where is_current = true;

drop policy if exists "Attachments updatable by authenticated" on public.legal_item_attachments;
create policy "Attachments updatable by authenticated"
on public.legal_item_attachments
for update
to authenticated
using (true)
with check (true);

create or replace function public.set_legal_attachment_current(
  p_item_id uuid,
  p_attachment_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.legal_item_attachments
    where id = p_attachment_id and item_id = p_item_id
  ) then
    raise exception 'Certificado não encontrado para este item legal.';
  end if;

  update public.legal_item_attachments
  set is_current = false
  where item_id = p_item_id and is_current = true;

  update public.legal_item_attachments
  set is_current = true
  where id = p_attachment_id and item_id = p_item_id;
end;
$$;

grant execute on function public.set_legal_attachment_current(uuid, uuid) to authenticated;
