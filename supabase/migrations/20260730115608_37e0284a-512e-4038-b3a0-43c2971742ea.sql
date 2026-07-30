-- Item 24 — índices para consultas por data e atribuição.
CREATE INDEX IF NOT EXISTS agua_visitas_data_ordem_idx
  ON public.agua_visitas (data DESC, ordem ASC);

CREATE INDEX IF NOT EXISTS agua_visitas_responsavel_data_idx
  ON public.agua_visitas (responsavel, data DESC)
  WHERE responsavel IS NOT NULL;

CREATE INDEX IF NOT EXISTS agua_visitas_veiculo_data_idx
  ON public.agua_visitas (veiculo, data DESC)
  WHERE veiculo IS NOT NULL;

CREATE INDEX IF NOT EXISTS agua_visitas_status_data_idx
  ON public.agua_visitas (status, data DESC);

CREATE INDEX IF NOT EXISTS agua_visitas_ponto_data_idx
  ON public.agua_visitas (ponto_id, data DESC);

-- Galeria de evidências: paginação por período, ponto e tipo.
CREATE INDEX IF NOT EXISTS agua_fotos_ponto_data_idx
  ON public.agua_fotos (ponto_id, enviada_em DESC)
  WHERE ponto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agua_fotos_tipo_data_idx
  ON public.agua_fotos (tipo, enviada_em DESC);

-- Rotas por equipe/veículo e data.
CREATE INDEX IF NOT EXISTS agua_rotas_equipe_data_idx
  ON public.agua_rotas (equipe, data DESC)
  WHERE equipe IS NOT NULL;

CREATE INDEX IF NOT EXISTS agua_rotas_veiculo_data_idx
  ON public.agua_rotas (veiculo, data DESC)
  WHERE veiculo IS NOT NULL;
