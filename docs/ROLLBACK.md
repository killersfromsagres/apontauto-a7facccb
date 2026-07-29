# Plano de rollback

Ordem de reversão do menos ao mais invasivo. Nenhuma etapa apaga dados operacionais.

## 1. Reverter o código (rápido, sem tocar no banco)

1. No histórico do projeto, restaure a versão anterior à entrega (a plataforma mantém as versões do chat).
2. Publique novamente. As tabelas continuam intactas — o app antigo simplesmente ignora colunas novas.
3. Tempo estimado: minutos. Impacto: nenhum dado é perdido.

## 2. Reverter apenas a Fase 13

| Alteração | Como reverter |
| --- | --- |
| Gate de permissão em `/api/backorder-reclassificar` | Remover o bloco `callerCanAccessModule(request, "backorder", "create")` do handler |
| Remoção de `/api/public/imgbb-upload` | Recriar o arquivo da rota e apontar `src/lib/imgbb.ts` de volta para ela |
| Documentação `docs/` | Apagar os arquivos; não afeta o app |

## 3. Reverter permissões / RBAC

Sem migração: basta ajustar dados.

```sql
-- devolver acesso amplo temporário a um usuário
insert into public.user_module_access (user_id, module_key, actions)
values ('<uuid>', '<modulo>', array['all']);

-- remover um papel indevido
delete from public.user_pcm_roles where user_id = '<uuid>' and role_key = '<papel>';
```

## 4. Reverter uma migração de schema

1. Identifique o arquivo em `supabase/migrations/` pelo timestamp.
2. Escreva uma migração inversa (`drop policy`, `drop table`, `alter table ... drop column`).
3. **Nunca** faça `drop table` de tabelas com dados de campo (OS, checklists, fotos, PT, observações). Prefira renomear (`alter table x rename to x_backup`) e migrar depois.

## 5. Desligar automações

```sql
select cron.unschedule('<nome-do-job>');   -- para o monitor meteorológico
```
Ou revogue `PLUVIOMETRO_TOKEN` para cortar a ingestão externa.

## 6. Desligar integrações externas

- **ImgBB**: remova `IMGBB_API_KEY`. O upload cai automaticamente para o bucket privado do backend; nenhuma foto se perde.
- **IA (backorder)**: remova `LOVABLE_API_KEY`; a classificação por regras determinísticas continua funcionando.

## 7. Ponto de não retorno

Não há. Todas as operações destrutivas do app gravam trilha em `audit_events` com dados anteriores (`old_data`), permitindo reconstruir registros excluídos manualmente.
