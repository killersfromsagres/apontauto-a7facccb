ALTER TABLE public.backorder_os REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.backorder_os;