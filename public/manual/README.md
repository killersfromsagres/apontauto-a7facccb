# Manual de Instalação - ApontAuto Premium

## Descrição do Projeto
O **ApontAuto Premium** é uma plataforma avançada de gestão operacional e inteligência de ativos, integrando monitoramento climático (Open-Meteo), gestão de ordens de serviço (corretivas, preventivas e backorders) e controle de frotas com recursos offline e sincronização em tempo real.

---

## 1. Requisitos
- **Supabase**: Conta ativa para banco de dados, autenticação e storage.
- **Node.js**: Versão 20.x ou superior (para execução local).
- **Ambiente**: Navegador moderno e conexão estável para a configuração inicial.

---

## 2. Configuração Supabase

1. Crie um novo projeto no dashboard da Supabase.
2. Aguarde a finalização do provisionamento.
3. Obtenha a **Project URL** e a **Anon Key** em `Project Settings > API`.
4. Obtenha a **Database Password** (definida na criação do projeto).

---

## 3. Banco de Dados (SQL Editor)

Acesse o **SQL Editor** no painel da Supabase e execute o script SQL completo.
Este script cria todas as tabelas, permissões RLS, triggers de auditoria e funções necessárias.

O arquivo SQL completo pode ser encontrado na pasta `/public/manual/full_schema.sql` deste projeto.

### Tabelas Principais:
- `public.corretiva_os`: Gestão de ordens de serviço corretivas.
- `public.user_roles`: Gerenciamento de papéis (admin, user).
- `public.taludes`: Monitoramento de áreas de risco geológico.

---

## 4. Storage Buckets

Crie os seguintes buckets no Supabase Storage:
- `evidencias`: (Público) Para fotos de campo.
- `checklist-fotos`: (Privado) Para evidências de frota.

Configure as Policies para permitir `SELECT` e `INSERT` para o role `authenticated`.

---

## 5. Variáveis de Ambiente (.env)

Configure as seguintes variáveis no seu ambiente de hospedagem:
- `VITE_SUPABASE_URL`: Sua URL do projeto.
- `VITE_SUPABASE_ANON_KEY`: Sua chave anônima.

---

## 6. Solução de Problemas Comuns

### Erro de Permissão (403/RLS)
Certifique-se de que a tabela possui o RLS habilitado e que existem policies para o role `authenticated`.

### Problemas de Login
Verifique se o e-mail inserido está cadastrado no Supabase Auth e se as chaves de API estão corretas.

---
© 2026 ApontAuto Premium - v1.0.0
