# Item 13 — Banco de dados do módulo Abastecimento de Água

Migração incremental aplicada sobre o schema `agua_*` já existente (nenhuma tabela
foi duplicada em inglês; o mapeamento abaixo liga a especificação ao schema real).

## Mapa especificação → tabela real

| Especificação | Tabela no banco | Observações |
| --- | --- | --- |
| 13.1 water_delivery_locations | `agua_pontos` | + `bag_tipo_id`, `contato_nome`, `qr_token_hash`, `arquivado_em` |
| 13.2 water_delivery_schedule_rules | `agua_programacao` | + `janela_inicio/fim`, `vigencia_inicio/fim`, `criado_por` |
| 13.3 water_route_templates | `agua_rota_templates` | **nova** — chave, nome, equipe, turno, veículo padrão, versão |
| 13.4 water_route_template_stops | `agua_rota_template_paradas` | **nova** — ponto, dia da semana, ordem, bags, tempo estimado |
| 13.5 water_delivery_runs | `agua_rotas` | + `template_id`, `template_versao`, `geracao_job_id`, `veiculo_id` |
| 13.6 water_delivery_run_stops | `agua_visitas` | + `offline_idempotency_key` (único) |
| 13.7 water_delivery_photos | `agua_fotos` | já completo (hash, thumb, mime, dimensões, origem) |
| 13.8 water_bag_types | `agua_bag_tipos` | já completo |
| 13.9 water_bag_movements | `agua_bag_movimentos` | + `veiculo_id` (FK frota) |
| 13.10 water_filter_assets | `agua_filtro_ativos` | completo no item 12 (QR, foto, periodicidade) |
| 13.11 water_filter_requests | `agua_filtro_solicitacoes` | `numero` = protocol, `vence_em` = sla_due_at |
| 13.12 water_filter_request_events | `agua_filtro_eventos` | trilha imutável por trigger |
| 13.13 water_whatsapp_dispatches | `agua_whatsapp_envios` | telefone só mascarado + hash |
| 13.14 water_import_batches | `agua_import_lotes` | + `pontos_novos`, `pontos_atualizados`, `relatorio`, `rollback_permitido` |
| 13.15 Eventos e auditoria | `audit_events` | triggers `tg_audit_event('abastecimento-agua')` |

## Regras de unicidade e índices

- `agua_pontos_local_norm_uidx` — unicidade normalizada por prédio + andar/setor +
  espaço (`lower(btrim(...))`), ignorando pontos arquivados ou mesclados.
- `agua_rotas_data_turno_equipe_template_key_key` — chave idempotente da geração
  diária (data + turno + equipe + template).
- `agua_visitas_offline_key_uidx` — impede entrega duplicada na sincronização offline.
- `agua_bag_mov_idem_uniq` — idempotência das movimentações de bags.
- Índices de apoio: `agua_pontos_ativo_idx`, `agua_pontos_bag_tipo_idx`,
  `agua_programacao_vigencia_idx`, `agua_rotas_template_idx`, `agua_rotas_status_idx`,
  `agua_rota_template_paradas_dia_idx`.

## Segurança

- RLS ativa nas duas tabelas novas: leitura por `agua_can('read')`, escrita restrita
  a `agua_is_gestor()`.
- `GRANT` explícito para `authenticated` e `service_role`; nenhum acesso `anon`.
- Auditoria automática em pontos, programação, rotas, entregas, retificações, bags,
  fotos, envios de WhatsApp, importações, ativos e solicitações de filtro — os
  payloads passam por `audit_redact()`, que mascara CPF, telefones e segredos.
