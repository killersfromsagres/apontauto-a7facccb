# Item 26 — Ordem de implementação: fechamento das fases A–G

Este documento registra o estado de cada fase e o "portão" (build + testes)
que autorizou o avanço. Nenhuma fase avançou com build ou testes falhando.

Verificação final: build OK · typecheck limpo · lint 0 erros (337 avisos de
`any`, dívida técnica documentada) · 223 testes em 27 arquivos passando.

---

## Fase A — Base e segurança ✅

| Entrega | Onde |
|---|---|
| Inventário | `docs/AGUA-BANCO-DE-DADOS.md` (23 tabelas `agua_*`) |
| RBAC | 18 permissões `water_*` + papéis sugeridos (`schemas/permissoes.ts`) |
| Migrations | Tabelas, enums, triggers de transição e imutabilidade, RLS em 100% das tabelas |
| Endpoint ImgBB autenticado | `src/routes/api/imgbb-upload.ts` (exige sessão e permissão; chave só no servidor) |
| Testes de segurança | `tests/permissoes.test.ts` + blocos de RLS em `tests/integracao.test.ts` |

**Portão:** RLS ativa nas 23 tabelas; corretiva e climatização sem acesso automático.

## Fase B — Cadastro e importação ✅

| Entrega | Onde |
|---|---|
| Pontos | `pages/water-locations-view.tsx`, `agua_pontos` (24 campos) |
| Regras | `schemas/ponto.ts` (Zod) + `agua_programacao` |
| Importador | `importer/importador-wizard.tsx` — assistente de 11 etapas |
| Normalização | `importer/normalizacao.ts` (chave canônica, fonética, similaridade) |
| Seed | Importação da planilha atual: 54 pontos, 171 paradas |
| Relatório | Etapa final do assistente + `agua_import_lotes` (com desfazer) |

**Portão:** 31/31/40/43/26 por dia; reimportar não duplica (`tests/importador.test.ts`, `tests/integracao.test.ts`).

## Fase C — Programação ✅

| Entrega | Onde |
|---|---|
| Templates | `agua_rota_templates` / `agua_rota_template_paradas` |
| Calendário | `pages/weekly-water-planner.tsx` (arrastar e soltar, feriados, dias úteis) |
| Atribuição | `pages/route-planner-view.tsx` |
| Cron | `agua-gerar-rotas` (horário), `water-daily-report`, `water-filter-due-monitor`, `water-queue-cleanup` |
| Notificações | `notificacoes.ts` (16 eventos) + `agua-notificacoes-30min` |

**Portão:** geração idempotente — gerar duas vezes no mesmo dia não duplica paradas.

## Fase D — Campo mobile ✅

| Entrega | Onde |
|---|---|
| Rota do dia | `pages/route-day-view.tsx` (hodômetro, QR, assinatura) |
| Offline | `offline/outbox-db.ts` + `offline/offline.ts` (retry, backoff, dead-letter) |
| Fotos | Fila local, processamento em worker (`image-worker.ts`), upload autenticado |
| Status | Máquina de estados de rota e parada (`state-machines/estados.ts` + triggers) |
| Reconciliação | `components/bag-reconciliation.tsx` + ocorrência automática na divergência |

**Portão:** conclusão sem evidência bloqueada em três camadas; sincronização única ao voltar a rede.

## Fase E — Evidências e WhatsApp ✅

| Entrega | Onde |
|---|---|
| Galeria | `pages/water-evidence-view.tsx` (paginada, com miniaturas) |
| PDF | `reports/relatorios.ts` — A4 com hash SHA-256 e miniaturas |
| Web Share | `whatsapp/whatsapp.ts` — arquivos → texto |
| Fallback por links | `wa.me` quando o compartilhamento nativo não existe |
| Cloud API opcional | `/api/whatsapp-enviar`, desativada enquanto não configurada e validada |

**Portão:** compartilhar nunca altera o status da parada; histórico independe do envio.

## Fase F — Filtros ✅

| Entrega | Onde |
|---|---|
| Ativos | `agua_filtro_ativos` + QR por ativo |
| Solicitações | `filters/components/filter-request-kanban.tsx` |
| Workflow | Aberta → triagem → aprovada → execução → concluída |
| Preventiva | `agua_filtro_preventivas` e periodicidades configuráveis |
| SLA | `filters/filtros.ts` (vencidas, a vencer, tempo de atendimento) |
| Evidências | `foto_antes_url` e `foto_depois_url` obrigatórias; próxima troca recalculada |

**Portão:** `tests/filtros.test.ts` + cenário de ponta a ponta de solicitação.

## Fase G — BI, testes e acabamento ✅

| Entrega | Onde |
|---|---|
| Dashboards | `pages/water-delivery-dashboard.tsx` + BI Studio |
| Relatórios | `pages/water-delivery-reports.tsx`, exportação Excel/PDF/pacote de evidências |
| E2E | Cenários no `tests/integracao.test.ts` com backend falso que aplica RLS |
| Performance | Reordenação por RPC (fim do N+1), lazy load de gráficos e assistente, paginação incremental, índices compostos |
| Acessibilidade | Alvos de toque ≥44 px, rótulos ARIA, foco visível, contraste no tema escuro |
| Documentação | `AGUA-BANCO-DE-DADOS.md`, `AGUA-JOBS-SERVER-SIDE.md`, `AGUA-CRITERIOS-DE-ACEITE.md`, manuais |

**Portão final:** build, typecheck, lint e 223 testes passando.
