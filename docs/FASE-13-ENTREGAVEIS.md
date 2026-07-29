# Fase 13 — Entregáveis obrigatórios

Documento de fechamento do roadmap (Fases 0 a 12) do **Apont Auto**.
Complementos: [Matriz de acesso](./MATRIZ-ACESSO.md) · [Plano de rollback](./ROLLBACK.md) ·
[Manual do administrador](./MANUAL-ADMINISTRADOR.md) · [Manual do colaborador mobile](./MANUAL-COLABORADOR-MOBILE.md) ·
[Modelos 3D e placas](./MODELOS-3D-E-PLACAS.md) · [Power BI Embedded (opcional)](./POWER-BI-EMBEDDED.md)

---

## 1. Resumo das alterações por módulo

| Módulo | O que existe hoje |
| --- | --- |
| **Acesso e segurança** | Login por e-mail/senha sem credencial fixa no código, troca obrigatória de senha no primeiro acesso, aceite de termos persistido (`terms_acceptances`), RBAC por papéis (`pcm_roles`) + permissões por módulo/ação (`pcm_permissions`), RLS em 100% das tabelas públicas, trilha de auditoria com redação de dados sensíveis. |
| **Home PCM / navegação** | Home operacional com KPIs, busca global, atalhos por permissão, sidebar e barra inferior mobile filtradas por `can_access_module` (deny-by-default para módulos sensíveis). |
| **Planejamento** | Programação semanal, backlog inteligente com score, capacidade das equipes (jornada, ausências, gargalo), apontamentos de OS em lote. |
| **Ordens de serviço** | Núcleo único (`WorkOrderEngine`) com 11 estados canônicos e transições registradas em `work_order_transitions`; Corretiva (campo, peças, histórico, gestão, rubrica digital, cores por equipe), Refrigeração (campo offline, peças, histórico, gestão), Preventiva AC/PMOC, Backorder com classificação automática e IA. |
| **Ativos e confiabilidade** | Catálogo de ativos versionado, preenchimento automático de localização em planilhas, pendências não encontradas, QR Code de ativo, criticidade, MTBF/MTTR, Pareto e RCA (5 porquês / Ishikawa). |
| **Taludes e clima** | Editor de polígonos com zoom/pan/vértices, calibração metros↔pixel, undo/redo, exportação PNG/XLSX, PT com histórico imutável, monitoramento meteorológico multi-fonte com suspensão automática por chuva e evidências em ImgBB. |
| **Frota** | Veículos com prefixo único e placa editável, checklist mobile em 6 passos (até 2 colaboradores, CPF validado, fotos, bloqueio por item crítico), abastecimentos com consumo/custo por km e detecção de anomalia, relatórios PDF A4, seletor 3D com fallback estático. |
| **Materiais e serviços** | Controle de materiais com centro de custo e data de solicitação a Facilities, exportação XLSX multiabas, materiais por OS com reserva/lead time, controle de lavanderia. |
| **Notificações** | Central de avisos com alvo por usuário/papel/módulo/equipe, recibos de leitura, tempo real e métricas administrativas. |
| **BI** | BI Studio com grade drag-and-drop, 11 tipos de gráfico, dashboards e widgets persistidos, exportação Excel/CSV/PDF e feed `/api/bi-feed` para Power BI. |
| **Qualidade e observabilidade** | Checagens automáticas de qualidade de dados; Painel Técnico com erros de frontend, falhas de rotinas, saúde de integrações, uploads com erro e fila offline. |
| **Offline/PWA** | Service worker, outbox em IndexedDB e sincronização automática (30 s) para Corretiva, Refrigeração e checklist de frota. |

### Alterações desta fase (13)

1. `/api/backorder-reclassificar` passou a exigir **permissão de escrita no módulo `backorder`**, além da sessão válida (evita consumo de IA por usuário sem o módulo).
2. Rota legada `/api/public/imgbb-upload` **removida**; todo upload passa pelo proxy autenticado `/api/imgbb-upload`, que valida módulo, tipo/assinatura do arquivo, tamanho, hash e registra em `image_uploads`.
3. Documentação de entrega criada em `docs/`.

## 2. Arquivos criados e alterados nesta fase

**Alterados**
- `src/routes/api/backorder-reclassificar.ts` — gate de permissão de módulo.
- `src/lib/imgbb.ts` — passa a chamar `/api/imgbb-upload`.

**Removidos**
- `src/routes/api/public/imgbb-upload.ts` (rota duplicada e mais permissiva).

**Criados**
- `docs/FASE-13-ENTREGAVEIS.md`, `docs/MATRIZ-ACESSO.md`, `docs/ROLLBACK.md`,
  `docs/MANUAL-ADMINISTRADOR.md`, `docs/MANUAL-COLABORADOR-MOBILE.md`,
  `docs/MODELOS-3D-E-PLACAS.md`, `docs/POWER-BI-EMBEDDED.md`.

> O histórico completo de arquivos das fases anteriores está no versionamento do projeto; as migrações estão em `supabase/migrations/` (30 arquivos, de `20260726…` a `20260729160226…`).

## 3. Migrações SQL

Todas as migrações aplicadas estão versionadas em `supabase/migrations/`, em ordem cronológica. Elas cobrem, resumidamente:

- **Base e segurança**: `profiles`, `user_roles` + enum `app_role`, `has_role`, `handle_new_user`, `terms_acceptances`, `app_settings`.
- **RBAC**: `pcm_roles`, `pcm_permissions`, `pcm_role_permissions`, `user_pcm_roles`, `user_module_access`, `can_access_module`, `get_my_allowed_menus`.
- **Auditoria**: `audit_events`, `audit_redact`, `tg_audit_event`, `sst_audit_log`.
- **OS**: corretiva (`corretiva_os`, `_pecas`, `_problemas`, `_fotos`, `_equipes`), refrigeração (idem) e `preventiva_ac_registros`, `backorder_os` e configurações de prioridade.
- **Taludes/Clima**: `talude_maps`, `talude_map_versions`, `talude_marcacoes`, `talude_geometry_events`, `talude_pt_releases`, `talude_pt_events`, `weather_observations`, `weather_events`, `weather_source_health`.
- **Frota**: `vehicles`, `vehicle_checklists`, `vehicle_checklist_items`, `vehicle_checklist_photos`, `vehicle_checklist_collaborators`, `vehicle_checklist_collaborator_pii`, `vehicle_fuelings`, `vehicle_occurrences`, `frota_*`.
- **BI**: `bi_dashboards`, `bi_widgets` e views `security invoker`.
- **PCM avançado**: `work_order_transitions`, `capacity_settings`, `team_absences`, `asset_catalogs`, `assets`, `asset_criticality`, `rca_analyses`, `rca_actions`, `material_reservations`, `material_movements`, `data_quality_fixes`.
- **Notificações**: `notifications`, `notification_targets`, `notification_reads`, `notification_receipts`.
- **Observabilidade**: `client_error_logs`, `integration_heartbeats`, `image_uploads`.

Para reproduzir o banco do zero: aplicar os arquivos de `supabase/migrations/` em ordem alfabética.

## 4. Políticas RLS

Regra geral vigente (verificada por consulta ao catálogo):

- **RLS habilitada em 100% das tabelas do schema `public`** (86 tabelas), todas com pelo menos uma policy.
- **Nenhuma policy concedida a `anon`/`public`** — leitura pública não existe.
- Padrões usados:
  - *Dono do registro*: `auth.uid() = user_id` (ex.: `maintenance_teams`, `pointing_jobs`, `agent_devices`, `terms_acceptances`, `notification_reads`).
  - *Por módulo*: `can_access_module('<modulo>', '<ação>')` com funções agregadoras `can_access_corretiva`, `can_write_corretiva`, `can_access_refrigeracao`, `can_write_refrigeracao`, `can_access_backorder`, `frota_can`, `frota_is_gestor`, `sst_can_access`, `can_manage_notifications`.
  - *Somente admin*: `has_role(auth.uid(), 'admin')` para configurações, catálogos e operações destrutivas.
  - *Histórico imutável*: tabelas de eventos (`audit_events`, `talude_pt_events`, `talude_geometry_events`, `work_order_transitions`, `sst_audit_log`) aceitam inserção e leitura controlada, sem `UPDATE`/`DELETE`.
  - *PII separada*: `vehicle_checklist_collaborator_pii` (CPF) só é lida por `frota_is_gestor()`.
- Consulta de conferência:

```sql
select c.relname, c.relrowsecurity, count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by 1,2 order by 1;
```

## 5. Edge Functions

**Nenhuma Edge Function foi criada.** O projeto é TanStack Start: toda a lógica de servidor vive em
`createServerFn` (`src/lib/**/*.functions.ts`) e em rotas HTTP (`src/routes/api/**`):

| Rota | Autenticação | Uso |
| --- | --- | --- |
| `POST /api/imgbb-upload` | Bearer + permissão `<modulo>:create` | Upload de evidências (fotos, rubricas) |
| `POST /api/backorder-reclassificar` | Bearer + `backorder:create` | Reclassificação por IA |
| `GET /api/bi-feed` | Bearer + `bi-studio:read` | Conector para Power BI |
| `GET /api/public/clima`, `/api/public/clima-forecast` | Pública (somente leitura, sem PII) | Proxy de clima |
| `POST /api/public/hooks/weather-monitor` | `apikey` do banco (cron) | Coleta meteorológica e suspensão automática |
| `POST /api/public/hooks/pluviometro` | Token `PLUVIOMETRO_TOKEN` | Ingestão de pluviômetro externo |

Server functions relevantes: `src/lib/users.functions.ts` (admin de usuários), `src/lib/backorder/ai-classify.functions.ts`, `src/lib/refrigeracao/migrate-to-imgbb.functions.ts`.

## 6. Cron jobs

Executados por `pg_cron` + `pg_net` (ambas extensões ativas no banco):

| Job | Frequência | Ação |
| --- | --- | --- |
| Monitor meteorológico | a cada 5 min | `POST /api/public/hooks/weather-monitor` — grava observação, agrupa evento de chuva e suspende taludes |
| Consolidação/limpeza de observações | diária | manutenção de `weather_observations` / `weather_events` |

Verificação: `select jobname, schedule, active from cron.job;` (requer role com acesso ao schema `cron`).
Última observação gravada confirma execução autônoma sem navegador aberto.

## 7. Variáveis de ambiente necessárias (sem valores)

**Cliente (`import.meta.env`)** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

**Servidor (`process.env`)** — `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`LOVABLE_API_KEY` (IA), `IMGBB_API_KEY` (evidências), `PLUVIOMETRO_TOKEN` (webhook de chuva),
`INMET_STATION_URL` e `CEMADEN_STATION_URL` (fontes meteorológicas opcionais),
`CONTROLE_USER_PASSWORD` (provisionamento da conta de controle, usada só no servidor).

Nenhum segredo fica no repositório; todos são lidos dentro dos handlers.

## 8. Papéis e permissões finais

Papel técnico (`app_role`): `admin`, `user`. Papéis funcionais (`pcm_roles`, aplicados via `user_pcm_roles`):

`proprietario`, `administrador`, `gestor_pcm`, `planejador`, `supervisor`, `auditor`,
`gestor_frota`, `operador_frota`, `gestor_taludes`, `operador_taludes`, `bombeiros_pt`,
`tecnico`, `tecnico_corretiva`, `tecnico_climatizacao`, `tecnico_multidisciplinar`,
`almoxarifado`, `sst`, `visualizador`.

Permissões são pares `modulo:ação` com ações `read`, `create`, `update`, `delete`, `export`, `admin`.
Além dos papéis, um usuário pode receber exceções pontuais em `user_module_access`.
Detalhamento completo em [MATRIZ-ACESSO.md](./MATRIZ-ACESSO.md).

## 9. Plano de rollback

Ver [ROLLBACK.md](./ROLLBACK.md).

## 10. Testes adicionados e resultados

`bun run test` → **16 arquivos, 120 testes, 100% aprovados** (2,1 s).

| Área | Arquivo |
| --- | --- |
| CPF | `src/lib/frota/__tests__/cpf.test.ts` |
| Checklist (integridade e bloqueio crítico) | `src/lib/frota/__tests__/checklist.test.ts` |
| Consumo e custo por km | `src/lib/frota/__tests__/consumo.test.ts` |
| Chuva / suspensão e retomada | `src/lib/weather/__tests__/chuva.test.ts` |
| Agrupamento de evento de chuva | `src/lib/weather/__tests__/agrupamento.test.ts` |
| Transições da PT | `src/lib/taludes/__tests__/pt.test.ts` |
| Área calibrada | `src/lib/taludes/__tests__/geometry.test.ts` |
| Undo/redo do polígono | `src/lib/taludes/__tests__/history.test.ts` |
| Indicadores de BI | `src/features/bi/__tests__/indicadores.test.ts` |
| Permissões do módulo abastecimento | `src/lib/__tests__/permissoes-abastecimento.test.ts` |
| Ciclo de vida da OS | `src/modules/work-orders/__tests__/state-machine.test.ts` |
| Score de backlog | `src/modules/planning/__tests__/backlog-score.test.ts` |
| Agendamento automático | `src/modules/automation/__tests__/scheduling.test.ts` |
| Outbox offline | `src/lib/offline/__tests__/outbox-core.test.ts` |
| Resolução de ativos / preenchimento de planilha | `src/features/assets/services/__tests__/*.test.ts` |

## 11. Riscos e pendências reais

1. **`app_settings` é legível por qualquer usuário autenticado** (`USING (true)`) e o JSON guarda histórico operacional, incluindo e-mails de quem liberou PT. Escrita já é restrita a gestores. *Recomendado*: restringir a leitura por módulo ou remover identificadores do JSON.
2. **`sst_colaboradores`** concentra 45 colunas de dados pessoais/de saúde atrás de uma única permissão de leitura de módulo. Espelhar o padrão de `vehicle_checklist_collaborator_pii` (campos sensíveis em tabela separada, com permissão mais estrita) reduziria a exposição.
3. **Testes de integração e E2E** ainda são manuais/roteirizados: não há runner Playwright no repositório. Os cenários da Fase 12 estão descritos, mas a automação é pendência.
4. **Fontes meteorológicas externas** (INMET/CEMADEN) dependem de URLs configuráveis; se indisponíveis, o sistema cai para Open-Meteo/MET Norway — a confiança do alerta diminui, o que fica visível no Painel Técnico.
5. **ImgBB** é serviço externo gratuito: em falha, o upload cai para o bucket privado do backend (nenhuma foto se perde), mas os links deixam de ser públicos.
6. **Modelos 3D** dos veículos ainda usam placeholders; ver [MODELOS-3D-E-PLACAS.md](./MODELOS-3D-E-PLACAS.md).

## 12. Manuais e instruções

- [Manual curto do administrador](./MANUAL-ADMINISTRADOR.md)
- [Manual curto do colaborador mobile](./MANUAL-COLABORADOR-MOBILE.md)
- [Modelos 3D e placas reais](./MODELOS-3D-E-PLACAS.md)
- [Power BI Embedded (opcional)](./POWER-BI-EMBEDDED.md)
