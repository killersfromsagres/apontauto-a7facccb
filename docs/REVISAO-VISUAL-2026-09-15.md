# ApontAuto — revisão visual e validação

Base: `Apont-Auto`, commit `80ccab2ad4f1b403cd11d1cc21066855467d6a54`.

## Escopo

Inventário do código da aplicação e revisão dos componentes compartilhados, da composição global, do acesso, do painel inicial e dos dashboards de chamados. O trabalho altera apresentação e feedback de navegação. Não constitui certificação de todos os fluxos de negócio, segurança ou integrações em produção.

## Achados e alterações

| Área | Achado | Alteração |
| --- | --- | --- |
| Identidade | Aurora, brilho especular, gradientes e sombras coloridas competiam com dados e ações. | Tema neutro grafite/claro, azul contido, bordas definidas e superfícies sólidas. |
| Estilos | Várias folhas globais e correções específicas convivem na raiz. | Tema final explicitamente carregado após as folhas existentes, sem remover correções de layout dos módulos. |
| Tokens | Tokens de gráficos e alguns tokens de navegação eram referenciados sem definição na folha principal. | Paleta de cinco cores adaptada a cada tema e tokens completos da navegação. |
| Cabeçalhos | Título em outro card decorativo, excessivamente grande; descrição truncada no celular. | Separador discreto, título com escala mais contida, descrição completa e ações que podem quebrar linha. |
| Cards | Brilho no hover e animação de entrada em painéis sem ação. | Cards estáveis, menos camadas de composição e diferenciação de cards clicáveis. |
| Teclado | GlassCard com onClick não recebia foco nem ativação pelo teclado. | Foco e ativação por Enter/Espaço, sem capturar teclas de controles descendentes. |
| Campos | Select menor que input no desktop, fundos transparentes e contraste variável. | Altura padrão de 44px, superfícies legíveis, foco e estado inválido explícitos. |
| Abas | No desktop, a lista deixava de conter overflow horizontal. | Rolagem horizontal mantida; transições restritas a propriedades visuais. |
| Navegação | Carregamento cobria a aplicação inteira com mascote. | Indicador superior sem bloquear interação, mostrado apenas após 250ms. |
| Tipagem | `isTransitioning` não faz parte do RouterState disponível. | Uso de `isLoading` e do estado público `pending`. |
| Skeletons | Pulso colorido genérico; carregamento inicial podia aparentar lista vazia. | Skeleton neutro com movimento suave e alternativa estática; skeleton nas métricas e execuções enquanto a consulta inicial está pendente. |
| Login | Inclinação do formulário acompanhava o cursor; vários halos e feixes animados. | Formulário estável, superfícies discretas, campos coerentes com o tema e indicação aria-busy no envio. |
| Gráficos | Tooltip e textos fixos no tema escuro; animações repetidas em atualizações; meses sem ano. | Cores do tema, melhor legibilidade, animação de séries desativada e mês/ano nos rótulos do dashboard de chamados. |
| Diálogos | Texto acessível de fechamento em inglês. | “Fechar”, com sombra e overlay mais suaves. |

As cores que indicam status de negócio, os valores e as séries dos gráficos continuam representando as mesmas informações. O CSS não altera transformações de mapas, canvas, assinaturas, tabelas virtualizadas ou drawers. Nenhuma migration, regra de acesso, consulta, rotina de sincronização, exportador ou dependência foi alterada.

## Verificação

- Compilação de produção: aprovada (`npm run build`).
- TypeScript: aprovado (`node_modules/.bin/tsc --noEmit`). O script existente `typecheck` aponta para `tsgo`, que não é declarado nas dependências; foi usado o compilador TypeScript disponível.
- Suíte existente: 280 testes aprovados e 3 falhas.
- Os três testes com falha foram executados também em uma cópia separada do código original; reproduziram exatamente as mesmas falhas.
- Nenhum dado ou sessão de produção foi utilizado nos testes.

Falhas anteriores reproduzidas:

| Teste | Resultado |
| --- | --- |
| `src/lib/__tests__/permissoes-abastecimento.test.ts` | Espera `false` para acesso à configuração/gestão; recebe `true`. Requer revisão própria de permissões. |
| `src/lib/preventiva/weekly-exporter.test.ts` | Espera altura 45 e recebe 60. A base já contém alteração de altura das linhas da programação. |
| `src/features/water-delivery/tests/filtros.test.ts` | Espera SLA `atencao` e recebe `vencido`. Requer revisão própria da regra e da referência temporal do teste. |

## Limites e conferência operacional

A prévia local foi bloqueada no navegador do ambiente (`ERR_BLOCKED_BY_CLIENT`). Portanto, não houve inspeção visual renderizada nem teste ponta a ponta com login, gravações, filtros de dados reais, upload, exportação ou sincronização offline. Compilação e verificação de tipos não substituem essa conferência.

Na aplicação integrada, conferir os temas claro/escuro em desktop e celular: acesso, painel inicial, navegação lateral/abas, diálogo, campos inválidos e tabelas extensas. Confirmar contraste dos estilos específicos de PCM/frota e os fluxos de registro e exportação com dados de teste autorizados.

## Reversão

Reverter o commit desta revisão com um novo commit de `git revert`. Não usar force push nem reescrever o histórico da branch conectada ao Lovable.
