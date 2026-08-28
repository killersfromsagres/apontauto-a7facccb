alter table public.mensageria_malotes
add constraint mensageria_entrega_data_ordem_check
check (entregue_em is null or recebido_em is null or entregue_em >= recebido_em);
