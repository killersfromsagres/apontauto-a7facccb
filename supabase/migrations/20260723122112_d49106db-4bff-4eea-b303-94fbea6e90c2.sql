ALTER TABLE public.refrigeracao_pecas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.refrigeracao_pecas;