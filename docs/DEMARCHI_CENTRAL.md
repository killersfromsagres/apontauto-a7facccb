# Central Demarchi

O módulo usa o Supabase existente do Apont Auto. A interface é implementada neste repositório e publicada pela integração Git da Vercel.

## Acessos

- `/cliente`: portal independente, com login por e-mail e senha. O solicitante vê os próprios chamados. Técnicos também veem atividades atribuídas ao seu cadastro.
- `/central-chamados`: administração, disponível para as contas que já possuem o papel `admin` no banco. A autorização é validada no banco e no serviço de criação de contas.
- O login administrativo existente continua em `/auth`. Contas criadas para o portal são direcionadas para `/cliente`.

## Começar a operação

1. Na Central de Chamados, abra **Pessoas e acessos**. Cadastre nome, e-mail, perfil e senha inicial individual. O e-mail é o login. Para colaboradores que só receberão apontamentos, desmarque a criação de acesso ao portal.
2. Compartilhe o endereço `/cliente` com os solicitantes e entregue o acesso individualmente. A abertura tem três etapas: local, descrição/urgência e conferência.
3. Os chamados chegam à fila em tempo real, com aviso de nova solicitação. Se a conexão ao vivo cair, a tela informa a recuperação e atualiza a cada 30 segundos.
4. Abra o chamado para definir colaborador, data, situação e criticidade. O nome e e-mail do solicitante são copiados do cadastro pelo banco, sem digitação manual na abertura.
5. Registre os minutos trabalhados, a data e a atividade de cada colaborador. Para concluir, é obrigatório ter apontamento e descrever a solução.

## Criticidade e prazo

| Criticidade | Prazo |
| --- | --- |
| Emergencial | 1 dia corrido |
| Alta | 7 dias corridos |
| Baixa | 30 dias corridos |

Os prazos são calculados no banco a partir da abertura. Alterar a criticidade recalcula o limite sobre a mesma data de abertura. Programar ou aguardar material não reinicia o prazo. Datas da interface usam o horário de Brasília.

## Base de ativos e locais

A aba `ativos` de `formula.xlsx` contém 2.857 registros: 1 planta, 87 prédios/áreas, 152 andares, 2.192 ambientes/locais e 425 equipamentos. Todos são importados na hierarquia original. Os códigos são `DEM000001` até `DEM002857`; novos registros recebem o próximo número automaticamente.

O administrador pode editar código, nome, nível, localização superior e disponibilidade em **Ativos e locais**. Chamados e planos usam UUID para manter seus vínculos quando um código muda. A referência original é preservada para rastreabilidade. O catálogo não substitui registros das ordens de serviço já existentes.

## Preventivas

Os 3.344 planos da aba `Plano` foram importados com ativo, roteiro, descrição, intervalo, tolerância e data original. Como as datas da fonte são históricas, os planos começam pausados.

Em **Preventivas**, pesquise os planos, selecione os registros desejados, informe a próxima data e clique em **Definir data e ativar**. Depois use **Gerar até esta data**. A geração cria ordens programadas na mesma Central e avança o próximo vencimento. A combinação plano/data impede duplicação. Cada lote cria até 200 ordens; repita a ação se houver mais planos vencendo. Meses são intervalos de calendário. Dias são dias corridos. A tolerância histórica é preservada no plano; ela não amplia o SLA do chamado gerado.

Os planos também podem ser criados e editados manualmente. Planos que atendem à unidade inteira podem usar **Toda a planta Demarchi**.

## Planilha e produtividade

- **Chamados** e **Backorders** possuem busca e filtros por criticidade, situação e prédio, além de exportação XLSX da seleção. A exportação contém protocolo, solicitante, contato, problema, local, prioridade, SLA, datas, responsável, horas e solução.
- **Programação** agrupa ordens por data e separa as ainda não programadas.
- **Produtividade** mostra horas registradas, serviços concluídos com apontamento no período, colaboradores com atividade e horas por serviço. O gráfico de criticidade mostra as pendências atuais, independentemente do período selecionado. Não há estimativas ou dados demonstrativos nos indicadores.

## Implantação e validação

As migrações `20261117142155` a `20261117144746` instalam as tabelas, regras de acesso, catálogo e planos. A Edge Function `demarchi-accounts` cria contas pela API administrativa do Supabase e salva o perfil e a permissão de portal numa transação. A chave administrativa fica exclusivamente no ambiente da função. A função valida a sessão e o papel administrativo em cada requisição.

`scripts/import-demarchi-reference.mjs` reproduz a extração da planilha sem modificá-la. `scripts/test-demarchi.integration.sql` verifica permissões, SLAs, programação, apontamento, histórico e geração de preventivas numa transação revertida ao final. Os testes de domínio ficam em `src/features/demarchi/domain.test.ts`.

O Prisma/Cimo não pôde ser inspecionado internamente neste ambiente. A implementação foi construída com os requisitos informados e a hierarquia e os planos reais da planilha. Credenciais do Prisma não são armazenadas nem utilizadas pelo módulo.
