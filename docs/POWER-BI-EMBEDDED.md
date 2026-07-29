# Power BI — conexão e Embedded (opcional)

O BI Studio interno já cobre gráficos, filtros e exportação. O Power BI é **opcional**, para quem já
tem licença corporativa.

## 1. Conectar o Power BI Desktop ao feed

1. Gere um token de acesso do usuário de serviço (usuário com o módulo `bi-studio` liberado em leitura).
2. No Power BI Desktop: **Obter Dados → Web → Avançado**.
   - URL: `https://apontauto.lovable.app/api/bi-feed?dataset=<nome>`
   - Cabeçalho: `Authorization` = `Bearer <token>`
3. Escolha o dataset (`os`, `frota`, `taludes`, `materiais`, `clima`).
4. **Transformar Dados** → confirme os tipos → **Fechar e Aplicar**.
5. Atualização agendada: configure no Power BI Service com as mesmas credenciais.

> O feed respeita as permissões do token: um usuário sem o módulo recebe 403 e nenhum dado.

## 2. Power BI Embedded dentro do sistema

Pré-requisitos: capacidade **Power BI Embedded (A SKU)** ou **Premium Per User**, e um
*service principal* no Entra ID com acesso ao workspace.

1. No Azure, crie o registro de aplicativo e conceda `Tenant.Read.All` / acesso ao workspace.
2. Guarde `PBI_TENANT_ID`, `PBI_CLIENT_ID`, `PBI_CLIENT_SECRET`, `PBI_WORKSPACE_ID`, `PBI_REPORT_ID`
   como segredos do backend (nunca no código do cliente).
3. Crie uma rota de servidor que gere o **embed token** (validade curta) chamando
   `POST https://api.powerbi.com/v1.0/myorg/groups/{workspace}/reports/{report}/GenerateToken`,
   **após** validar a permissão `bi-studio:read` do chamador.
4. No frontend, use `powerbi-client-react` para renderizar o relatório com a URL e o token recebidos.
5. Aplique **RLS do Power BI** com a mesma noção de papel usada aqui, para que o relatório não mostre
   mais do que o usuário pode ver no sistema.

## 3. Custos e cuidados

- Embedded cobra por capacidade reservada, mesmo ocioso — avalie se o BI Studio interno já resolve.
- Nunca envie o `client secret` ou o embed token para o navegador antes da validação de permissão.
- Mantenha o token de embed com validade máxima de 60 minutos e renove pelo servidor.
