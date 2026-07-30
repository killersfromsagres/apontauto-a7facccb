# Item 27 — Entregáveis do módulo Abastecimento de Água

Documento de fechamento. Data da verificação: 30/07/2026.

Índice de manuais (pasta `docs/agua/`):
[Gestor](agua/MANUAL-GESTOR.md) ·
[Operador mobile](agua/MANUAL-OPERADOR-MOBILE.md) ·
[Importação da planilha](agua/MANUAL-IMPORTACAO-PLANILHA.md) ·
[ImgBB](agua/MANUAL-IMGBB.md) ·
[WhatsApp](agua/MANUAL-WHATSAPP.md) ·
[Cloud API (opcional)](agua/MANUAL-WHATSAPP-CLOUD-API.md) ·
[Filtros](agua/MANUAL-FILTROS.md)

---

## 1. Resumo funcional

O módulo vive dentro de **Frota e Abastecimento → Água** e cobre o ciclo
completo da entrega de galões/bags:

1. **Cadastro de pontos** — 24 campos, normalização automática de grafia,
   detecção de duplicidade (exata, fonética e por similaridade) e QR por ponto.
2. **Importação da planilha** — assistente de 11 etapas com prévia por aba,
   divergências de período em âmbar, relatório final e desfazer do lote.
3. **Programação semanal** — arrastar e soltar, templates de rota, feriados,
   dias úteis, atribuição a colaborador/equipe e geração automática por hora.
4. **Rota do dia (campo)** — execução mobile com hodômetro, leitura de QR,
   evidência fotográfica obrigatória, assinatura e status por parada.
5. **Offline completo** — rota e fotos em IndexedDB, fila com retry/backoff,
   dead-letter, chave de idempotência (nunca duplica, nunca perde foto).
6. **Bags** — carga, entrega, retorno, vazias, danificadas; reconciliação no
   fechamento e ocorrência automática quando há divergência.
7. **Evidências e WhatsApp** — galeria paginada, PDF A4 com hash SHA-256 e
   compartilhamento nativo com fallback por links; Cloud API oficial opcional.
8. **Filtros de água** — ativos com periodicidade, solicitações em kanban com
   SLA, preventivas, fotos antes/depois e recálculo da próxima troca.
9. **Indicadores e relatórios** — taxa de conclusão, produtividade, km,
   previsto × realizado, SLA de filtros; exportação Excel/PDF/pacote.
10. **Administração** — configurações do módulo, tipos de bag, feriados,
    obrigatoriedades, qualidade de imagem e integrações (segredos mascarados).

---

## 2. Arquivos criados e alterados

### Feature (`src/features/water-delivery/`, 65 arquivos)

| Pasta | Arquivos |
|---|---|
| `components/` | admin-settings-card, bags-por-dia-chart, entrega-dialog, fila-fotos-aviso, fila-sincronizacao-card, metricas-upload-card, rota-execucao-cards |
| `pages/` | water-delivery-layout, water-delivery-dashboard, water-locations-view, weekly-water-planner, route-planner-view, route-day-view, bag-reconciliation, evidence-gallery, filter-request-kanban, water-history-view, water-delivery-reports, water-settings-view |
| `queries/` | api, bags, config, programacao |
| `mutations/` | execucao, notificacoes |
| `schemas/` | water, ponto/normalize, config, permissoes |
| `state-machines/` | estados |
| `offline/` | outbox-db, offline, fotos-db, fotos, image-worker, image-offthread, metrics |
| `importer/` | reader, importador-wizard |
| `reports/` | indicadores, relatorios |
| `whatsapp/` | whatsapp, whatsapp-cloud, whatsapp-config-card, whatsapp-share-dialog |
| `filters/` | filtros + 4 componentes |
| `hooks/` `types/` `index.ts` | use-agua, tipos e barrel |
| `tests/` | 11 arquivos + `harness/fake-supabase.ts` |

### Rotas

`src/routes/_authenticated/abastecimento.agua.tsx` e as 11 telas filhas
(`index`, `pontos`, `programacao`, `rotas`, `rota`, `bags`, `evidencias`,
`filtros`, `historico`, `indicadores`, `configuracoes`).

### Rotas de servidor

`src/routes/api/imgbb-upload.ts` · `src/routes/api/whatsapp-enviar.ts`
(+ webhook do WhatsApp sob `api/public/`, com verificação de assinatura).

### Alterados fora do módulo

Navegação (menu de Frota e Abastecimento), central de notificações, painel
técnico (aba Jobs e Rotinas), `eslint.config.js`, chaves de React Query.

### Documentação

`docs/AGUA-BANCO-DE-DADOS.md`, `docs/AGUA-JOBS-SERVER-SIDE.md`,
`docs/AGUA-CRITERIOS-DE-ACEITE.md`, `docs/AGUA-FASES-A-G.md`,
este arquivo e os 7 manuais em `docs/agua/`.

---

## 3. Migrations SQL

25 migrations aplicadas entre 29 e 30/07/2026 (`supabase/migrations/`),
agrupadas por finalidade:

| Grupo | Conteúdo |
|---|---|
| Base | 23 tabelas `agua_*`, GRANTs, índices e chaves únicas |
| Enums e estados | 3 enums + triggers de transição e imutabilidade |
| RBAC | 18 permissões `water_*`, papéis e funções auxiliares |
| Operação | `agua_gerar_rotas`, `agua_reordenar_programacao`, estoque de bags |
| Filtros | ativos, solicitações, eventos, SLA e trilha |
| Jobs | `job_runs`, `job_begin`, `job_finish`, `jobs_limpeza_filas` |
| Performance | índices compostos em `agua_visitas`, `agua_fotos`, `agua_rotas` |

Tabelas: `agua_pontos`, `agua_programacao`, `agua_excecoes`, `agua_feriados`,
`agua_rotas`, `agua_rota_templates`, `agua_rota_template_paradas`,
`agua_rota_versoes`, `agua_rota_ocorrencias`, `agua_visitas`,
`agua_visita_eventos`, `agua_fotos`, `agua_retificacoes`, `agua_bag_tipos`,
`agua_bag_movimentos`, `agua_filtro_ativos`, `agua_filtro_solicitacoes`,
`agua_filtro_eventos`, `agua_filtro_preventivas`, `agua_import_lotes`,
`agua_ponto_merges`, `agua_geracao_jobs`, `agua_whatsapp_envios`.

---

## 4. Políticas RLS

RLS **ativa nas 23 tabelas**, com 68 políticas, todas restritas ao papel
`authenticated`. Nenhuma política concede acesso a `anon`.

Padrão aplicado:

- **Leitura** — `agua_can('read')`; operador sem permissões de gestão fica
  restrito às rotas atribuídas a ele (`agua_escopo_restrito()` +
  `agua_rota_minha()`).
- **Escrita em campo** — permitida apenas em rota ativa
  (`agua_rota_ativa()`: pronta, em andamento ou pausada).
- **Finalizados** — `tg_agua_visita_imutavel` e `tg_agua_rota_imutavel`
  bloqueiam alteração após encerramento; só o gestor retifica, e a retificação
  fica registrada em `agua_retificacoes`.
- **Configuração** (`agua_bag_tipos`, `agua_feriados`, templates) — escrita só
  para gestor (`agua_is_gestor()`).
- **Trilhas** (`agua_visita_eventos`, `agua_filtro_eventos`,
  `agua_ponto_merges`, `agua_geracao_jobs`) — inserção pelo sistema, sem
  update nem delete.
- **Corretiva e climatização** não recebem nada por herança: `agua_can` e
  `agua_perm` só consideram permissões `water_*`, módulo `abastecimento-agua`
  ou papéis de frota.

---

## 5. Enums

| Enum | Valores |
|---|---|
| `agua_rota_status` | rascunho, planejada, atribuida, pronta, em_andamento, pausada, concluida, concluida_com_divergencia, cancelada |
| `agua_visita_status` | pendente, em_deslocamento, em_atendimento, concluida, parcial, sem_necessidade, acesso_bloqueado, local_fechado, falta_bags, endereco_divergente, reprogramada, nao_realizada, cancelada |
| `agua_filtro_situacao` | solicitada, aberta, em_triagem, aprovada, rejeitada, aguardando_material, programada, em_deslocamento, em_execucao, em_atendimento, concluida, validada, reaberta, cancelada |

As transições válidas estão espelhadas em `state-machines/estados.ts` (frontend)
e nos triggers `tg_agua_rota_transicao`, `tg_agua_visita_transicao` e
`tg_agua_filtro_transicao` (banco).

---

## 6. Funções e RPC

**Permissão/escopo:** `agua_can`, `agua_perm`, `agua_is_gestor`,
`agua_escopo_restrito`, `agua_filtro_escopo_restrito`, `agua_meu_nome`,
`agua_rota_minha`, `agua_rota_ativa`.

**Operação:** `agua_gerar_rotas(data, origem)` — geração idempotente de rotas e
paradas, respeitando feriados e exceções; `agua_reordenar_programacao(itens)` —
reordenação em lote (substituiu o laço de updates).

**Jobs:** `job_begin`, `job_finish`, `jobs_limpeza_filas`.

**Notificação:** `notificar_evento(...)` com anti-repetição de 12 h.

**Triggers:** transição e imutabilidade de rota/parada/solicitação, estoque de
bags (`tg_agua_bag_estoque`), SLA (`tg_agua_filtro_sla`), trilha de filtro
(`tg_agua_filtro_trilha`), próxima troca (`tg_agua_filtro_ativo_proxima`) e
auditoria com redação de dados sensíveis (`tg_audit_event` + `audit_redact`).

---

## 7. Edge Functions

**Nenhuma.** A arquitetura do projeto é TanStack Start: a lógica de servidor
usa `createServerFn` e rotas de servidor. Os endpoints HTTP do módulo são:

| Endpoint | Método | Proteção |
|---|---|---|
| `/api/imgbb-upload` | POST | Sessão + permissão `water_delivery.photos.upload` |
| `/api/whatsapp-enviar` | POST | Sessão + `water_delivery.whatsapp.automatic`; 409 se a Cloud API não estiver habilitada e validada |
| `/api/public/whatsapp-webhook` | GET/POST | Verificação de token e assinatura HMAC do corpo bruto |

---

## 8. Cron jobs

| Job | Agenda | Função |
|---|---|---|
| `agua-gerar-rotas` | `5 * * * *` | Gera rotas/paradas do dia (idempotente) |
| `agua-notificacoes-30min` | `*/30 * * * *` | Atrasos, foto pendente, divergências |
| `water-daily-report` | `0 23 * * *` | Consolida indicadores do dia |
| `water-filter-due-monitor` | `0 10 * * *` | Filtros vencendo/vencidos e SLA |
| `water-queue-cleanup` | `20 6 * * 0` | Limpeza de filas e logs (retenção 90 dias) |

Todos ativos e observáveis em Painel Técnico → Jobs e Rotinas.

---

## 9. Variáveis de ambiente (sem valores)

Servidor:

`SUPABASE_URL` · `SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SERVICE_ROLE_KEY` ·
`IMGBB_API_KEY` · `WHATSAPP_TOKEN` · `WHATSAPP_PHONE_NUMBER_ID` ·
`WHATSAPP_VERIFY_TOKEN` · `WHATSAPP_APP_SECRET` · `LOVABLE_API_KEY`

Cliente (públicas por natureza): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

Nenhum segredo é lido no navegador; todos são acessados apenas dentro de
`handler`/rota de servidor. A interface exibe apenas "configurado/ausente".

---

## 10. Permissões

**Entrega (11):** `water_delivery.view`, `.plan`, `.assign`, `.execute`,
`.correct`, `.manage`, `.export`, `.photos.view`, `.photos.upload`,
`.whatsapp.share`, `.whatsapp.automatic`.

**Bags (1):** `water_bags.manage`.

**Filtros (6):** `water_filters.view`, `.request`, `.triage`, `.execute`,
`.manage`, `.export`.

Total: 18 permissões.

Aplicadas em três camadas: menu/telas (frontend), rotas de servidor (backend) e
RLS/triggers (banco).

---

## 11. Matriz de acesso

| Permissão | Admin | Gestor de Frota | Programador | Operador de rota | Solicitante | Técnico de filtro | Corretiva / Climatização |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| view | ✅ | ✅ | ✅ | rotas próprias | — | — | ❌ |
| plan | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| assign | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| execute | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| correct | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| export | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| photos.view / upload | ✅ | ✅ | ver | ✅ | ver as suas | ✅ | ❌ |
| whatsapp.share | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| whatsapp.automatic | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| bags.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| filters.view | ✅ | ✅ | ✅ | — | as suas | ✅ | ❌ |
| filters.request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| filters.triage / manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| filters.execute | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

Corretiva e climatização não recebem nada automaticamente — o acesso é
concedido caso a caso pelo RBAC. Coberto por teste.

---

## 12. Testes

**223 testes · 27 arquivos · 100% verdes.** Do módulo de água, 11 arquivos:

| Arquivo | Cobre |
|---|---|
| `normalizacao.test.ts` | grafia, chave canônica, duplicidade fonética/similaridade |
| `importador.test.ts` | abas, cabeçalhos, consolidação, divergências, hash |
| `estados.test.ts` | transições válidas e inválidas dos 3 enums |
| `execucao.test.ts` | validação de quantidade, progresso, conclusão |
| `bags-whatsapp.test.ts` | reconciliação, mensagem, compactação de evidências |
| `filtros.test.ts` | SLA, vencidas, próxima troca, preventiva × corretiva |
| `offline.test.ts` | sanitização (remove CPF), guarda de evidência, backoff, dead-letter |
| `permissoes.test.ts` | 18 permissões, papéis, escopo do operador, bloqueio de corretiva/climatização |
| `indicadores.test.ts` | conclusão, km, duração, reincidências |
| `config.test.ts` | validação das configurações administrativas |
| `integracao.test.ts` | 54 pontos, 171 paradas, geração idempotente, foto obrigatória, offline→online único, RLS |

O harness `tests/harness/fake-supabase.ts` é um backend em memória que aplica
as regras de RLS, permitindo cenários de ponta a ponta sem rede.

---

## 13. Build, typecheck e lint

```text
build      ✔ vite build + nitro — sem erros
typecheck  ✔ tsgo --noEmit — sem erros
lint       ✔ eslint src — 0 erros, 337 avisos
testes     ✔ 27 arquivos, 223 testes, ~4 s
```

Os 337 avisos são `@typescript-eslint/no-explicit-any`, quase todos em acessos
a tabelas ainda ausentes dos tipos gerados do backend. Estão rebaixados a aviso
de propósito, como dívida técnica visível.

---

## 14. Plano de rollback

Rollback por camada, do menos ao mais invasivo — detalhes gerais em
`docs/ROLLBACK.md`.

1. **Desligar o módulo** (segundos, sem perda): Configurações → Água →
   *Módulo ativo* = não. O menu some e as rotas param de aceitar escrita.
2. **Desligar automações**: `UPDATE cron.job SET active = false WHERE jobname
   LIKE 'agua-%' OR jobname LIKE 'water-%';`
3. **Desligar integrações**: Cloud API desabilitada volta ao compartilhamento
   nativo; sem `IMGBB_API_KEY` as fotos ficam na fila local sem se perder.
4. **Desfazer uma importação**: botão *Desfazer lote* em Programação — remove a
   programação criada e **preserva** execuções já registradas.
5. **Reverter código**: publicar a versão anterior. As tabelas `agua_*` são
   isoladas; nenhum módulo antigo depende delas.
6. **Remover o schema** (último recurso, destrutivo): exportar antes
   (Relatórios → Exportar tudo) e então dropar as 23 tabelas, os 3 enums e as
   funções `agua_*`. Nenhuma tabela de outro módulo é afetada.

---

## 15. Riscos e pendências reais

| # | Item | Impacto | Situação |
|---|---|---|---|
| 1 | 337 avisos de `any` (tabelas fora dos tipos gerados) | Erros de digitação de coluna só aparecem em runtime | Dívida aceita; regenerar tipos e tipar os acessos |
| 2 | ImgBB é serviço externo de terceiros | Indisponibilidade atrasa a publicação da evidência | Mitigado: foto fica na fila local com retry; avaliar armazenamento próprio |
| 3 | Reconhecimento de colunas da planilha por heurística | Planilha muito fora do padrão pode exigir mapeamento manual | Assistente permite corrigir o mapeamento na etapa 3 |
| 4 | Atribuição de rota por nome do colaborador (`profiles.full_name`) | Homônimos ou nome alterado podem afetar o escopo do operador | Evoluir para `user_id` na rota |
| 5 | Cloud API depende de aprovação de template pela Meta | Envio automático indisponível até aprovar | Fica desligada; compartilhamento nativo cobre o dia a dia |
| 6 | Geolocalização depende de permissão do aparelho | Sem GPS, a conferência de local não valida | Configurável: pode ser exigida ou apenas informativa |
| 7 | Retenção de 90 dias em filas e logs | Auditoria antiga de fila não fica no banco | Relatórios e evidências não são afetados; exportar antes se necessário |
| 8 | Ausência de teste em navegador real (E2E é simulado) | Regressão visual/mobile pode passar | Cenários cobertos por integração; validar em campo no piloto |
