# Manual curto — Administrador

## Primeiro acesso
1. Entre com seu e-mail e senha. No primeiro acesso o sistema **obriga a troca de senha**.
2. Leia e aceite os Termos de Uso (o aceite fica registrado com data/hora).

## Criar e liberar um usuário
1. **Configurações → Usuários** → *Novo usuário*: informe nome e e-mail. O sistema gera uma senha temporária de uso único.
2. Atribua **um papel** (ex.: `tecnico_corretiva`, `operador_frota`, `gestor_taludes`).
3. Se precisar de uma exceção pontual, libere um módulo específico na mesma tela.
4. Regra de ouro: módulos sensíveis (frota, BI Studio, auditoria, painel técnico) **só aparecem se liberados**.

## Enviar um aviso
1. **Administração → Administração de Avisos** → *Novo aviso*.
2. Escolha o público: todos, papel, módulo, equipe ou usuários específicos.
3. Publique ou agende. Acompanhe leitura por pessoa na aba de recibos.

## Acompanhar o sistema
- **Trilha de Auditoria**: quem criou/alterou/excluiu o quê, com comparação campo a campo (dados sensíveis já saem mascarados).
- **Painel Técnico**: erros de tela, falhas de rotinas automáticas, saúde das integrações (clima, imagens, IA), uploads com erro e fila offline pendente.
- **Qualidade de Dados**: inconsistências de cadastro (CPF, hodômetro, ativos) com correção assistida.

## Rotinas automáticas
- O monitoramento de chuva roda no servidor a cada 5 minutos, **sem depender de navegador aberto**. Em chuva, os trabalhos em talude são suspensos automaticamente e a evidência é registrada.
- A retomada é manual e exige liberação de PT.

## Exportações
Todos os módulos exportam `.xlsx` no padrão da empresa. As exportações **não incluem CPF completo nem segredos** — apenas os últimos dígitos quando necessário.

## Se algo der errado
Consulte o [plano de rollback](./ROLLBACK.md). Nenhum dado operacional é apagado por reversão de versão.
