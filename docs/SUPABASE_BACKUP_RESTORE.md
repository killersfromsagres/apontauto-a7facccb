# Backup e restauração do Supabase — Apont Auto

## Estratégia

O repositório mantém duas camadas independentes de proteção:

1. **Schema versionado** em `supabase/migrations/` e Edge Functions em `supabase/functions/`.
2. **Backup dos dados** via GitHub Actions em `.github/workflows/supabase-backup.yml`.

O workflow executa diariamente e também pode ser iniciado manualmente. Ele cria um `pg_dump` no formato custom, valida o arquivo, criptografa com AES-256-CBC/PBKDF2 e salva o resultado como artifact e também como asset de uma Release privada do repositório.

Nenhuma senha de banco, service-role key ou chave do ImgBB deve ser gravada neste repositório.

## Segredos obrigatórios no GitHub

Em **Settings → Secrets and variables → Actions**, configure:

- `SUPABASE_DB_URL`: string de conexão PostgreSQL do projeto Supabase ativo, preferencialmente conexão direta apropriada para `pg_dump`.
- `BACKUP_ENCRYPTION_KEY`: senha longa e exclusiva usada somente para criptografar os backups. Guarde uma cópia fora do GitHub; sem ela o backup não pode ser restaurado.

O workflow falha de forma explícita se um desses segredos não estiver configurado.

## Validar um backup

Depois de baixar os dois assets de uma Release de backup:

```bash
sha256sum -c apontauto-supabase.dump.enc.sha256
```

## Descriptografar

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in apontauto-supabase.dump.enc \
  -out apontauto-supabase.dump \
  -pass env:BACKUP_ENCRYPTION_KEY
```

## Inspecionar antes de restaurar

```bash
pg_restore --list apontauto-supabase.dump
```

Sempre restaure primeiro em um projeto de homologação/novo projeto quando o banco de produção ainda estiver acessível.

## Restaurar para outro Supabase

Com `TARGET_DB_URL` apontando para o banco de destino:

```bash
pg_restore \
  --dbname="$TARGET_DB_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  apontauto-supabase.dump
```

A restauração completa pode incluir schemas gerenciados pelo Supabase. Para migrações entre projetos, a sequência recomendada é:

1. criar o projeto de destino;
2. aplicar `supabase/migrations/`;
3. implantar `supabase/functions/`;
4. restaurar os dados necessários do dump;
5. recriar segredos externos no Supabase Vault/Secrets;
6. validar Auth, RLS, Corretiva Novo, materiais e upload de imagens;
7. somente depois apontar a aplicação para o novo projeto.

## ImgBB

A chave do ImgBB não faz parte do dump versionado no GitHub. No projeto atual ela é mantida no **Supabase Vault**, com acesso restrito ao backend `service_role`. Ao trocar de projeto, cadastre o segredo `IMGBB_API_KEY` no Vault do novo banco antes de liberar uploads.

## Regra de segurança

Nunca faça commit de `.env` contendo credenciais administrativas, `SUPABASE_SERVICE_ROLE_KEY`, senha de banco, `SUPABASE_DB_URL`, `BACKUP_ENCRYPTION_KEY` ou chave do ImgBB. O frontend usa somente a URL pública do projeto e a publishable key.
