# Plano de Implementação: Módulo de Avaliação de Chamados

Este plano detalha a criação de um novo módulo para gestão e solicitação de avaliações de serviços concluídos (OS), integrado à seção de Corretivas.

## User Review Required

> [!IMPORTANT]
> - O envio de e-mail dependerá das integrações disponíveis no sistema. Caso não haja uma API de envio configurada, implementaremos a funcionalidade de "Copiar E-mail" e "Gerar via IA".
> - A IA utilizará o provedor configurado no Lovable AI Gateway para gerar os textos personalizados.

## Proposed Changes

### Database & Backend
- **Tabela `corretiva_avaliacoes`**: Criar tabela para registrar o histórico de solicitações enviadas.
    - Campos: `id`, `os_ids` (array), `solicitante`, `email_destinatario`, `status` (Pendente, Preparado, Enviado, Avaliado), `corpo_email`, `criado_em`, `enviado_em`.
- **Server Function `getOsParaAvaliacao`**: Buscar OS com status 'concluida' agrupadas por solicitante.
- **Server Function `gerarTextoAvaliacaoIA`**: Utilizar IA para compor o e-mail formal baseado nos dados das OS selecionadas.

### Navigation
- Adicionar "Avaliação de Chamados" ao menu lateral sob o grupo "Programação de Corretivas" (`src/lib/nav-config.ts`).
- Registrar a permissão `avaliacao-chamados` no sistema de usuários (`src/lib/users.functions.ts`).

### UI / Frontend
- **Nova Rota `/avaliacao-chamados`**: Interface principal do módulo.
- **Dashboard de Indicadores**: Topo da página com KPIs (OS Concluídas, Solicitantes Únicos, etc.).
- **Lista de Solicitantes**: Tabela moderna com busca inteligente e filtros (período, equipe, etc.).
- **Drawer/Modal de Composição**: Interface premium para selecionar OS de um solicitante e gerar o e-mail via IA.
- **Preview de E-mail**: Visualização do template HTML responsivo antes do envio.

## Technical Details
- **IA Gateway**: Integração com Gemini ou GPT via Lovable AI Gateway para geração de conteúdo.
- **Template HTML**: Uso de estilos inline compatíveis com clientes de e-mail (Outlook, Gmail).
- **Framer Motion**: Adição de microinterações e transições suaves entre estados.
- **TanStack Table**: Implementação de filtros e ordenação avançada para os solicitantes.

## Context Monitoring
- Reutilização dos dados da tabela `corretiva_os` existente.
- Garantia de que as funcionalidades atuais de campo e IA não sejam afetadas.
