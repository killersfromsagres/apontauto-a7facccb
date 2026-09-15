# Corretiva Novo — integração operacional

## Projeto ativo

- Supabase project id: `fbhpdqykoptxnrbdcspr`
- Frontend: usa somente `VITE_SUPABASE_URL` e a publishable key.
- Administração de usuários: `admin-user-management` (Edge Function autenticada).
- Upload de imagens: `imgbb-upload` (Edge Function autenticada); o banco persiste somente a URL pública em `corretiva_fotos.image_url`.

## Regras que não podem regredir

1. Nunca expor `SUPABASE_SERVICE_ROLE_KEY`, senha do PostgreSQL ou chave do ImgBB no frontend ou no GitHub.
2. Usuário com acesso `corretiva-novo` deve conseguir consultar e atualizar OS conforme RLS.
3. Ao concluir uma OS, `status='concluida'` e `fim` deve ser preenchido. O trigger de consistência no banco garante o timestamp mesmo para clientes antigos.
4. Solicitações em `corretiva_pecas` recebem `client_uuid`, autor, data e `material_status`; o estado da OS é refletido automaticamente.
5. O dashboard principal lê `corretiva_os` e os status `aberta`, `em_andamento`, `concluida` e `cancelada`.
6. Histórico é derivado das OS concluídas/canceladas, sem duplicar a ordem de serviço.
7. Migrations e Edge Functions devem permanecer versionadas no repositório.

## Reset operacional

Para reiniciar Corretiva Novo, limpar somente dados operacionais de corretivas após backup validado. Não remover `auth.users`, `profiles`, `user_roles`, `user_module_access`, equipes ou configurações.

## Validação mínima após alterações

- Login e carregamento do Menu Inicial.
- Criação de usuário administrativo via Edge Function.
- Login do usuário criado e acesso ao módulo permitido.
- Importação/criação de OS.
- Solicitação de peça/material.
- Upload de foto e confirmação de `image_url` sem `storage_path`.
- Finalização e aparecimento imediato no Histórico.
- Dashboard exibindo os novos totais.
- `npm run typecheck`, `npm test` e `npm run build`.
