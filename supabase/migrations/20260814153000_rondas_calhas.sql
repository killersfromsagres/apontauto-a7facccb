create type public.ronda_status as enum ('pendente', 'concluido');

create table public.rondas_calhas (
    id uuid primary key default gen_random_uuid(),
    predio text not null,
    preventiva_nome text not null,
    status public.ronda_status not null default 'pendente',
    realizado_por text,
    realizado_em timestamp with time zone,
    problemas_identificados text,
    fotos text[] default '{}',
    mes_referencia text not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

grant select, insert, update on public.rondas_calhas to authenticated;
grant all on public.rondas_calhas to service_role;

alter table public.rondas_calhas enable row level security;

create policy "Users can view all rondas"
on public.rondas_calhas for select
to authenticated
using (true);

create policy "Users can insert rondas"
on public.rondas_calhas for insert
to authenticated
with check (true);

create policy "Users can update rondas"
on public.rondas_calhas for update
to authenticated
using (true);
