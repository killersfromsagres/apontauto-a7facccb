CREATE TABLE public.legal_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  periodicidade TEXT NOT NULL CHECK (periodicidade IN ('bimestral','semestral','anual')),
  ultima_execucao DATE,
  proxima_execucao DATE NOT NULL,
  responsavel TEXT,
  concluido BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_items TO authenticated;
GRANT ALL ON public.legal_items TO service_role;

ALTER TABLE public.legal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Legal items readable by authenticated" ON public.legal_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Legal items insertable by authenticated" ON public.legal_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Legal items updatable by authenticated" ON public.legal_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Legal items deletable by authenticated" ON public.legal_items FOR DELETE TO authenticated USING (true);

CREATE TRIGGER legal_items_set_updated_at
BEFORE UPDATE ON public.legal_items
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();