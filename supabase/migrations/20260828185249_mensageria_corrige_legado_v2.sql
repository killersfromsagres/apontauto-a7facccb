update public.mensageria_malotes
set entregue_em = null
where legacy_import = true
  and entregue_em is not null
  and recebido_em is not null
  and entregue_em < recebido_em;

update public.mensageria_malotes
set quantidade = 1
where legacy_import = true
  and legacy_source = 'ENTREGA'
  and legacy_source_row = 64
  and remetente = 'MORUMBI';
