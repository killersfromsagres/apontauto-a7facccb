CREATE TABLE public.organizational_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    photo_url TEXT,
    level INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#6366f1',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizational_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.organizational_members TO authenticated;
GRANT ALL ON public.organizational_members TO service_role;
GRANT SELECT ON public.organizational_members TO anon;

CREATE POLICY "Allow public read access" ON public.organizational_members FOR SELECT USING (true);
CREATE POLICY "Allow admin all access" ON public.organizational_members 
    FOR ALL TO authenticated 
    USING (auth.jwt() ->> 'email' = 'admin@admin.com' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

INSERT INTO public.organizational_members (name, role, level, color, display_order) VALUES
('Anne H. Cavalcante', 'ADM/RH', 0, '#ec4899', 1),
('Adriana Gergye', 'TST', 1, '#f59e0b', 2),
('Carlos G. Marrese', 'Coordenador de operações IFM', 1, '#10b981', 3),
('Risomar P. Costa', 'Supervisora Soft', 2, '#06b6d4', 4),
('Reynaldo Carpinetti', 'Supervisor de manutenção', 2, '#8b5cf6', 5),
('Thalita T. Correa', 'Mensageria', 3, '#ec4899', 6),
('Debora Keiko', 'Supervisora Uniformes', 3, '#f59e0b', 7),
('Edimacio Messias', 'Encarregado Manutenção', 3, '#8b5cf6', 8),
('Jessica C. Barone', 'Supervisora Serviços', 3, '#06b6d4', 9),
('Felipe França', 'Encarregado Manutenção', 3, '#8b5cf6', 10),
('Zilda F. de Souza', 'Líder Limpeza', 4, '#06b6d4', 11),
('Gabriel V. Lemos', 'Planejador/Programador', 4, '#6366f1', 12),
('José Erisvaldo', 'Líder Jardinagem', 4, '#10b981', 13),
('Solange Maria', 'Líder Limpeza', 4, '#06b6d4', 14);