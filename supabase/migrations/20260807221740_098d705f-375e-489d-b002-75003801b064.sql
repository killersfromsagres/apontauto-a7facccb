DELETE FROM public.talude_marcacoes WHERE map_id IN (SELECT id FROM public.talude_maps WHERE nome = 'Mapa Principal Demarchi');
DELETE FROM public.talude_maps WHERE nome = 'Mapa Principal Demarchi';