# Plano de Correção: Dashboard Vazio no Menu Inicial

O usuário relatou que o dashboard do **Menu Inicial** (`/dashboard` ou `/`) está vazio (sem gráficos ou informações). Após análise, identifiquei que o `CentralInteligenciaView` utiliza a RPC `gestao_overview_v2` com filtros, mas as migrações recentes podem ter deixado a RPC em um estado onde falha ao retornar dados se os filtros não forem tratados perfeitamente ou se as tabelas subjacentes estiverem retornando vazias devido a inconsistências nas views.

## Problemas Identificados
1. **RPC Desatualizada ou com Erros Silenciosos**: A RPC `gestao_overview_v2` foi modificada múltiplas vezes. A versão mais recente (migração `20260812123439`) adicionou parâmetros de filtro, mas pode haver conflitos com a forma como o frontend os envia ou como as CTEs filtram os dados.
2. **Dependências em Views**: A RPC depende de `vw_gestao_os_consolidada` e `vw_gestao_os_corretiva_novo`. Se estas views falharem (ex: por causa de um `cast` inválido ou coluna ausente), a RPC retornará `null` ou um objeto vazio.
3. **Filtros no Frontend**: O estado inicial dos filtros no `CentralInteligenciaView` pode estar restringindo excessivamente os dados.

## Ações Propostas

### 1. Auditoria e Correção das Views e RPC
Vou criar uma migração para consolidar a RPC `gestao_overview_v2` e garantir que ela trate corretamente os nulos, além de simplificar as queries para evitar falhas seletivas.

- **Tabelas Alvo**: `backorder_os`, `corretiva_os`, `refrigeracao_os`.
- **Views**: Revalidar `vw_gestao_os_corretiva_novo` e `vw_gestao_os_consolidada`.
- **RPC**: Garantir que `gestao_overview_v2` retorne um JSON válido mesmo com 0 registros.

### 2. Ajuste no Frontend (`CentralInteligenciaView`)
- Adicionar logs de erro claros caso a query falhe.
- Garantir que o estado `filtros` seja sanitizado antes da query.
- Adicionar estados de "Empty State" informativos.

### 3. Verificação de Dados
- Executar uma query de teste para verificar se há dados nas tabelas base.

## Detalhes Técnicos
- **Migração SQL**: `DROP FUNCTION` e `CREATE OR REPLACE` com tratamento robusto de `NULL` em `COALESCE`.
- **React Query**: Ajustar `queryKey` e `staleTime` para garantir revalidação.

---
*Nota: Este plano foca na recuperação imediata da visibilidade dos dados no dashboard.*
