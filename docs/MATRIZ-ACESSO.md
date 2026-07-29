# Matriz de acesso por papel

Ações possíveis: **R** leitura · **C** criação · **U** edição · **D** exclusão · **X** exportação · **A** administração.
Papéis são atribuídos em **Configurações → Usuários** (`user_pcm_roles`). Exceções individuais em `user_module_access`.
Módulos sensíveis são **negados por padrão** (abastecimento, frota-*, bi-studio, auditoria, observabilidade, confiabilidade, notificacoes-admin).

| Papel | Escopo | Módulos liberados |
| --- | --- | --- |
| `proprietario` | Total | Todos os módulos, todas as ações (242 permissões) |
| `administrador` | Total | Todos os módulos, todas as ações (242) |
| `gestor_pcm` | Operação completa exceto configurações do sistema | PCM, OS, ativos, materiais, frota, taludes, clima, BI, notificações, auditoria (206) |
| `planejador` | Planejamento e OS | Programação, backlog, capacidade, apontamentos, corretiva, refrigeração, ativos, materiais, BI, taludes (157) — **sem frota** |
| `supervisor` | Acompanhamento e validação | Igual planejador, sem criação de catálogos (140) — **sem frota** |
| `auditor` | Leitura ampla + auditoria | Todos os módulos operacionais em leitura/exportação + auditoria (78) |
| `gestor_frota` | Frota | abastecimento, frota-checklist, frota-historico, frota-gestao (R/C/U/D/X/A) |
| `operador_frota` | Frota — campo | abastecimento (R/C), frota-checklist (R/C), frota-historico (R) |
| `gestor_taludes` | Taludes | taludes, taludes-editor, taludes-pt, taludes-clima, clima-tempo (30) |
| `operador_taludes` | Taludes — campo | taludes (R), taludes-pt (R/C), taludes-clima (R) |
| `bombeiros_pt` | Liberação de PT | taludes (R), taludes-pt (R/U), taludes-clima (R), clima-tempo (R) |
| `tecnico` | Campo multidisciplinar | corretiva, refrigeracao, preventiva-ac, históricos, QR de ativo, qualidade (19) |
| `tecnico_corretiva` | Corretiva | corretiva (R/C/U), corretiva-historico (R), corretiva-pecas-status (R) |
| `tecnico_climatizacao` | Climatização | refrigeracao (R/C/U), refrigeracao-historico (R), refrigeracao-pecas-status (R), preventiva-ac (R/C/U) |
| `tecnico_multidisciplinar` | Corretiva + climatização | união dos dois acima (15) |
| `almoxarifado` | Materiais | controle-materiais, status de peças (corretiva e refrigeração), capacidade, confiabilidade, QR (22) |
| `sst` | Segurança do trabalho | seguranca-trabalho, painel-legal (12) |
| `visualizador` | Somente leitura | Módulos operacionais em leitura (30) — **sem frota, sem auditoria, sem BI Studio** |

## Regras adicionais aplicadas em todas as camadas

1. **Banco (RLS)** — `can_access_module(modulo, ação)` decide; funções agregadoras cobrem grupos (`can_write_corretiva`, `frota_can`, `sst_can_access`…).
2. **Servidor (rotas `/api`)** — `callerCanAccessModule(request, modulo, ação)` antes de qualquer efeito colateral ou custo de IA.
3. **Cliente (menu/rotas)** — `useCanAccessModule` e `canSeeMenuItem` escondem o que o usuário não pode usar; nunca é a única barreira.

Cenários de aceite validados: usuário de corretiva não enxerga nem acessa `/abastecimento`; usuário de climatização recebe erro de RLS ao consultar tabelas de frota; CPF completo só aparece para `frota_is_gestor()`.
