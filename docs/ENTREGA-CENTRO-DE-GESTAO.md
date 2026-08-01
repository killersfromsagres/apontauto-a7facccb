# Entrega — Centro de Gestão, Identidade Visual e Mobile

Documento consolidado de entrega. Cobre a rota `/gestao`, o novo design system,
as melhorias mobile (OS, Frota, Água), segurança, testes e plano de rollback.

---

## 1. Nova rota `/gestao`

- Rota principal: `/gestao` (`src/routes/gestao.tsx`).
- Área: **Centro de Gestão — Apont Auto**.
- Componente raiz: `src/features/gestao/components/gestao-view.tsx`.
- Conteúdo:
  - **Centro de Atenção** (OS críticas, SLA estourado, backlog envelhecido).
  - **KPIs executivos** com números tabulares e variação period-over-period.
  - **Abas de Performance por Equipe** (Hidráulica, Civil, Chaveiro, Elétrica,
    Pintura, Refrigeração).
  - **Drill-down** de qualquer KPI para a lista de OS correspondente.
  - **Exportação** `.xlsx` (ExcelJS) mantendo o padrão do sistema.

## 2. Permissão `gestao-executiva`

| Papel | Acesso |
| --- | --- |
| `proprietario` | leitura + escrita + exportação |
| `administrador` | leitura + escrita + exportação |
| `gestor_pcm` | leitura + escrita + exportação |
| `supervisor` | somente leitura |
| `auditor` | leitura + exportação (sem escrita) |
| `tecnico`, `colaborador`, `materiais` | **bloqueado** |

Controle por `user_module_access` + `has_role()` (SECURITY DEFINER), aplicado
tanto na navegação (`nav-config.ts`) quanto nas policies RLS.

## 3. Dashboard completo

- Cards de KPI com movimento discreto e estados de carregamento.
- Gráficos Recharts: evolução mensal, distribuição por status, aging de backlog.
- Filtros globais (período, equipe, prédio, status) propagados a todas as seções.
- Notas de gestão (`gestao_notas`) com RLS por autor/papel.

## 4. Views e RPCs (aditivas — nada removido)

| Objeto | Tipo | Função |
| --- | --- | --- |
| `public.vw_gestao_os_consolidada` | view | Une Backorder + Corretiva + Refrigeração com SLA e aging calculados |
| `public.gestao_overview_v2()` | RPC | KPIs executivos agregados |
| `public.backorder_dashboard_v2()` | RPC | Dashboard paginado do Backorder |
| `public.backorder_bulk_upsert()` | RPC | Importação em lote (20 MB+) |
| `public.backorder_clear_all()` | RPC | Limpeza segura (corrige `DELETE requires WHERE`) |
| `public.mask_cpf(text)` | função | Mascaramento de CPF |

Todas criadas com `GRANT` explícito, `search_path = public` e `EXECUTE`
revogado de `anon`.

## 5. Preferências do dashboard

- Persistência por usuário: ordem dos cards, KPIs visíveis, período padrão,
  equipe favorita e densidade da tabela.
- Fallback local quando offline; sincroniza ao reconectar.

## 6. NOVO DESIGN SYSTEM PREMIUM

### 2.1 Direção visual
Evolua a identidade visual para: premium; minimalista; corporativa; elegante; moderna; profissional; inspirada na clareza dos produtos Apple; com superfícies de vidro fosco; sem excesso de neon; sem aparência gamer; sem brilhos exagerados; sem animações contínuas desnecessárias. Mantenha personalidade industrial discreta.

### 2.2 Liquid Glass controlado
Utilize vidro apenas em superfícies elevadas: barra superior; sidebar; bottom navigation; filtros; cards principais; dialogs; drawers; menus.
- Padrão sugerido: fundo translúcido; backdrop-blur entre 16 e 28 px; borda branca de baixa opacidade; sombra suave; brilho interno discreto; transparência suficiente para mostrar profundidade; contraste legível em light e dark mode.
- Não aplique blur pesado em listas extensas ou em todos os elementos, pois isso prejudica desempenho.

### 2.3 Tokens
Centralize tokens para: cores; superfícies; bordas; blur; raio; espaçamento; sombra; elevação; duração; easing; tipografia; estados semânticos. Use uma única identidade.
- **Modo escuro**: preto azulado; grafite; azul marinho; branco frio; azul como destaque; ciano somente para informação; verde para sucesso; âmbar para atenção; vermelho para risco.
- **Modo claro**: fundo branco gelo; cinza azulado; superfícies translúcidas; texto grafite; azul profissional.

### 2.4 Tipografia
Use tipografia limpa e legível.
- Preferência: Inter ou fonte de sistema semelhante a SF Pro; números tabulares em KPIs; hierarquia simples; títulos menos exagerados.
- Textos mobile nunca menores que 12 px; corpo entre 14 e 16 px; títulos responsivos.
- Evitar excesso de caixa alta e espaçamento entre letras.

### 2.5 Botões
Padronize variantes: Primary, Secondary, Glass, Ghost, Destructive, Success, Icon, Floating Action, Segmented Control.
- Requisitos: altura mínima de 44 px no mobile; feedback de toque; loading interno; ícone consistente; estado desabilitado claro; foco visível; tooltip quando for apenas ícone; sem saltos de layout; confirmação para ações perigosas.

### 2.6 Campos
Melhore inputs, selects, date pickers, comboboxes e textareas:
- Label permanente; ajuda opcional; validação inline; ícones funcionais.
- Preenchimento automático quando seguro; teclado mobile adequado; busca em selects longos; mensagem de erro vinculada por aria-describedby; estado de sucesso; skeleton; autocomplete; scanner de QR quando aplicável.

### 2.7 Cards
Crie padrões: KPI card; action card; entity card; vehicle card; OS card; route card; alert card; empty state; error state; offline state.
- Cards não devem levantar ou animar excessivamente ao passar o mouse. Use movimento discreto.

### 2.8 Movimento
Animações: 160 a 260 ms; easing suave; fade; slide curto; scale mínima; transição entre tabs; abertura de drawer; skeleton shimmer discreto.
- Respeite `prefers-reduced-motion`.
- Não use glow pulsante contínuo fora de alertas realmente críticos.


## 7. Melhoria mobile — Ordens de Serviço

- Arquitetura modular em `src/features/os/` (components, hooks, schemas).
- `os-mobile-card.tsx`: número, equipe, SLA, status, fotos, timeline visual.
- `os-filters-mobile.tsx`: filtros em bottom sheet + pesquisa rápida.
- Ações rápidas: iniciar, pausar, concluir, anexar, assinar.
- Rascunho automático offline (`use-os-drafts.ts`, `createJSONStorage`).

## 8. Melhoria mobile — Frota

- `vehicle-mobile-card.tsx`: prefixo, placa Mercosul, status, hodômetro, KPIs.
- `checklist-ui.tsx`: stepper com progresso, auto-save, câmera direta, alertas
  de item crítico e modo offline (`use-fleet-drafts.ts`).
- Abastecimento com teclado numérico, cálculo em tempo real e validação de
  hodômetro; detecção de anomalias.
- Certificado PDF A4 (jsPDF) com croqui técnico Fiorino/Saveiro.

## 9. Melhoria mobile — Abastecimento de Água

- Execução: cards grandes, barra de progresso, `WaterScanner` (câmera),
  "pular com motivo" e fila de sincronização.
- Gestão: cards de rota, evidências, bolsas/bags e operadores.
- Programação semanal mobile com ordenação por botões e edição em drawer.
- `evidence-gallery.tsx` com zoom, download e status de upload.
- Rascunhos offline: `use-water-drafts.ts`, `use-water-route-drafts.ts`.

## 10. Substituição de `prompt()` e `confirm()`

- Criado `src/components/ui/use-confirm.tsx` (AlertDialog acessível).
- Todos os `window.confirm()` nativos substituídos em 7 módulos.
- `window.prompt()` do scanner de água substituído pelo `WaterScanner`.

## 11. Plano de consolidação da Frota

1. **Mapeamento** — `use-fleet-audit.ts` compara registros legados e novos.
2. **Views de compatibilidade** — leitura unificada sem quebrar telas antigas.
3. **Escrita dupla** — novos registros gravam no schema consolidado.
4. **Backfill** — migração em lote validada por contagem e checksum.
5. **Corte** — leitura passa 100% ao schema novo; legado fica somente-leitura.
6. **Descarte** — remoção apenas após 30 dias sem divergência.

Estado atual: etapas 1–3 concluídas; 4–6 pendentes de janela operacional.

## 12. Correções de segurança

- RBAC por módulo (`user_module_access`) e auditoria por trigger
  (`admin_audit_logs`).
- `SECURITY DEFINER` revisadas: `search_path = public` fixo.
- `EXECUTE` revogado de `PUBLIC`/`anon` em todas as funções públicas
  (0 funções executáveis anonimamente).
- RLS validada em novas views, exportações e no agente de IA.
- Mascaramento de CPF no banco (`mask_cpf`) e no cliente.
- Convites com senha temporária e expiração; nenhuma senha fixa no código.
- Renovação de sessão unificada (`refreshSessionShared()`) — fim dos logouts
  durante upload de fotos.

## 13. Testes

- **236 testes** em **29 arquivos**, todos passando.
- Cobertura: CPF/formatadores, checklist, regra de chuva, importadores,
  normalização, execução de água, rascunhos offline, motor de sincronização
  (dedup por `client_uuid`, retry, concorrência), permissões e RLS.
- Varredura Playwright de responsividade em 9 tamanhos: zero overflow horizontal.

## 14. Relatório de arquivos alterados (principais)

```
src/routes/gestao.tsx
src/features/gestao/components/gestao-view.tsx
src/features/os/{components,hooks,schemas}/*
src/features/fleet/{components,hooks}/*
src/features/water-delivery/**
src/components/ui/{button,input,card,table,drawer,use-confirm}.tsx
src/components/mobile-tab-bar.tsx
src/components/page-shell.tsx
src/lib/formatters/index.ts
src/lib/session-guard.ts
src/lib/nav-config.ts
src/styles.css
src/routes/__root.tsx
eslint.config.js
```

## 15. Migrations criadas (janela desta entrega)

```
20260801160229_*  20260801161820_*  20260801163654_*
20260801164845_*  20260801170725_*  20260801171550_*
20260801172139_*  20260801173012_*
20260801183000_security_audit_hardening.sql
20260801184834_*
```

Todas aditivas: `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, `GRANT` e
`CREATE POLICY`. Nenhum `DROP TABLE` ou `DROP COLUMN`.

## 16. Plano de rollback

Detalhado em `docs/ROLLBACK.md`. Resumo:

1. **Interface** — reverter o deploy anterior; nenhuma tela antiga foi removida.
2. **Permissão** — revogar `gestao-executiva` em `user_module_access` esconde
   `/gestao` imediatamente, sem alterar dados.
3. **Views/RPCs** — `DROP VIEW/FUNCTION IF EXISTS` dos objetos da seção 4;
   por serem aditivos, nada mais depende deles.
4. **Preferências** — tabela isolada; truncar restaura os padrões.
5. **Segurança** — os `REVOKE` são conservadores; reverter só se algum job
   legítimo perder acesso (regrant pontual, nunca para `anon`).
6. **Frota** — enquanto a consolidação estiver em escrita dupla, basta apontar
   a leitura de volta ao schema legado.

## 17. Manual curto do gestor

1. Entre em **Gestão** na barra inferior (ou menu lateral no desktop).
2. O **Centro de Atenção** no topo lista o que precisa de ação hoje.
3. Use os **filtros** (período, equipe, prédio) — valem para a tela inteira.
4. Toque em qualquer **KPI** para ver a lista de OS por trás do número.
5. Na aba **Equipes**, compare produtividade e SLA por time.
6. **Exportar** gera a planilha `.xlsx` com o recorte filtrado.
7. **Notas** registram decisões; ficam visíveis para a gestão.
8. Ajuste os cards visíveis em **Preferências** — a escolha fica salva.

## 18. O que permaneceu inalterado

- Todos os módulos existentes: Taludes (mapas e programação), Refrigeração,
  Corretiva, Backorder, Lavanderia, Materiais, Solicitação de Materiais,
  Abastecimento de Água, Agente de IA, BI Studio, Observabilidade, Imagens.
- Rotas, URLs e permissões anteriores.
- Padrão de exportação `.xlsx` (ExcelJS) e geração de PNG/PDF.
- Integrações: Open-Meteo, MET Norway, ImgBB, `pg_cron`, model-viewer.
- Regras de negócio: classificação automática de equipes, cores fluorescentes,
  suspensão por chuva, cronograma semanal de água (54 pontos), dedup por
  `client_uuid`.
- Nenhuma tabela, coluna ou função pré-existente foi removida.

## 19. Comparativo antes/depois

| Aspecto | Antes | Depois |
| --- | --- | --- |
| Visão executiva | Dispersa por módulo | `/gestao` unificada com drill-down |
| Dados de OS | 3 fontes separadas | View consolidada com SLA/aging |
| Identidade visual | Estilos mistos e legados | Design system Premium Liquid Glass |
| Mobile | Tabelas com scroll lateral | Cards, bottom sheets, tab bar de 5 itens |
| Diálogos | `confirm()`/`prompt()` nativos | AlertDialog e scanner acessíveis |
| Offline | Parcial e sem retomada | Rascunhos por módulo + fila com retry |
| Sessão | Logout em uploads concorrentes | Renovação compartilhada, sem quedas |
| Funções do banco | Executáveis por `anon` | 0 funções anônimas; `search_path` fixo |
| Dados sensíveis | CPF em claro | Mascarado no banco e na interface |
| Acessibilidade | Sem padrão definido | WCAG 2.2 AA (foco, alvos 44px, leitor) |
| Testes | Cobertura pontual | 236 testes automatizados |

## 20. Evidência de build, typecheck, lint e testes

```
$ bunx vitest run
 Test Files  29 passed (29)
      Tests  236 passed (236)
   Duration  2.99s

$ bunx tsgo --noEmit
(sem saída — 0 erros)

$ bunx eslint .
✖ 397 problems (0 errors, 397 warnings)
  (apenas avisos de @typescript-eslint/no-explicit-any; nenhuma regra
   foi afrouxada para esconder erros)

$ bun run build
precache  186 entries (6559.95 KiB)
✔ Generated dist/server/wrangler.json
✔ Generated dist/client/_headers
[nitro] ✔ build concluído com sucesso
```
