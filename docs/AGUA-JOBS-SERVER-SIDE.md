# Item 21 — Processos server-side (jobs, cron e webhooks)

Todos os processos rodam como **rotas TanStack** (`src/routes/api/...`), não como
Edge Functions, conforme a arquitetura do projeto.

## Rotinas

| Job (`job_key`)               | Rota                                             | Cron (SP)         | Idempotência        |
| ----------------------------- | ------------------------------------------------ | ----------------- | ------------------- |
| `generate-water-delivery-runs`| `/api/public/hooks/agua-gerar-rotas`             | a cada hora (executa na hora configurada) | `rotas:<data>` |
| `water-delivery-reminders`    | `/api/public/hooks/agua-notificacoes`            | */30 min          | dedupe por aviso    |
| `water-filter-due-monitor`    | `/api/public/hooks/water-filter-due-monitor`     | 07:00             | `filtros:<data>`    |
| `water-daily-report`          | `/api/public/hooks/water-daily-report`           | 20:00             | `relatorio:<data>`  |
| `water-queue-cleanup`         | `/api/public/hooks/water-queue-cleanup`          | dom 03:20         | `limpeza:<data>`    |
| WhatsApp (opcional)           | `/api/whatsapp-enviar` (autenticado, gestor)     | sob demanda       | chave por envio     |
| Webhook WhatsApp (opcional)   | `/api/public/hooks/whatsapp-status`              | Meta              | verify token + HMAC |
| Upload de evidência           | `/api/imgbb-upload` (autenticado + permissão)    | sob demanda       | hash SHA-256        |

## Runner comum — `src/lib/jobs/runner.server.ts`

- **Trava/concorrência**: `job_begin` impede execução simultânea (padrão 1) e
  libera travas presas pelo TTL.
- **Idempotência**: chave opcional; execução repetida devolve o resultado anterior.
- **Timeout** duro por execução (`AbortSignal`).
- **Retry controlado** com backoff exponencial; `PermanentJobError` não repete.
- **Logs** estruturados em `public.job_runs` (status, tentativa, duração, erro).
- **Alarme de falha** na central de notificações, com dedupe por job.

Visualização: **Painel Técnico → Rotinas e cron** (`/observabilidade`),
restrito a administradores e ao módulo `observabilidade`.

## Segredos

Ficam nos secrets do backend e são lidos apenas dentro dos handlers:
`IMGBB_API_KEY`, `WHATSAPP_*`, `SUPABASE_SERVICE_ROLE_KEY`.

## Limpeza segura

`jobs_limpeza_filas(dias)` remove **apenas** histórico técnico com mais de 90 dias:
execuções concluídas, disparos de WhatsApp encerrados, jobs de geração e logs de
erro do cliente. **Nunca** apaga fotos, evidências, visitas, rotas, bags,
solicitações de filtro ou registros de auditoria.
