# Manual opcional — WhatsApp Cloud API (envio automático)

Este modo é **opcional e vem desligado**. Sem configuração completa e validada,
o sistema recusa qualquer envio automático e continua usando o compartilhamento
manual.

## Pré-requisitos

- Conta WhatsApp Business e app na Meta.
- Número verificado (Phone Number ID).
- Template de mensagem **aprovado** pela Meta.

## Segredos (servidor, sem valores na interface)

| Segredo | Uso |
|---|---|
| `WHATSAPP_TOKEN` | Token de acesso da Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | Número remetente |
| `WHATSAPP_VERIFY_TOKEN` | Verificação do webhook |
| `WHATSAPP_APP_SECRET` | Conferência da assinatura das chamadas recebidas |

## Ativar

1. Cadastre os quatro segredos no ambiente.
2. **Água → Configurações → WhatsApp**: escolha *Modo Cloud API*, informe
   destinatários padrão, template, limite de envios e janela de horário.
3. Clique em **Testar integração**. Só depois de um teste bem-sucedido o modo
   automático é liberado.
4. Ative a chave *Envio automático*.

Enquanto o teste não passar, o endpoint responde 409 e nada é enviado.

## Webhook

O endereço de retorno é `/api/public/whatsapp-webhook`. Ele valida o token de
verificação e a assinatura HMAC do corpo bruto antes de processar qualquer
coisa. Chamadas sem assinatura válida são recusadas.

## Limites e segurança

- Apenas quem tem a permissão *Envio automático WhatsApp* pode disparar.
- Há limite de envios por período, configurável.
- Cada envio é registrado com status (enviado, entregue, lido, falha).
- Nenhum segredo é exibido após salvo; a tela mostra só "configurado".

## Desligar

Basta desmarcar *Envio automático*. O compartilhamento manual continua
funcionando normalmente.
