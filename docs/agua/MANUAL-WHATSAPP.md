# Manual de Compartilhamento no WhatsApp

Existem dois modos. O do dia a dia é o **manual** (compartilhamento do próprio
celular). O **automático** é opcional e usa a API oficial da Meta — veja
`MANUAL-WHATSAPP-CLOUD-API.md`.

## Modo manual (padrão, sem configuração)

1. Ao final da rota (ou em Evidências), toque em **Enviar evidências ao
   WhatsApp**.
2. Escolha o conteúdo: resumo, fotos selecionadas ou PDF da rota.
3. O sistema tenta, nesta ordem:
   - compartilhamento nativo com **arquivos** (PDF ou fotos);
   - compartilhamento nativo apenas com **texto**;
   - **fallback por links** (`wa.me`) com o resumo e as URLs das evidências.

## Regras

- Abrir o compartilhamento **nunca** marca a parada como entregue. O status vem
  exclusivamente do registro da entrega.
- O histórico das evidências é independente do envio: continua disponível na
  galeria e nos relatórios mesmo que nada seja compartilhado.
- Todo envio fica registrado (quem, quando, o que) para auditoria.
- Em computadores sem compartilhamento nativo, o fallback por links é usado
  automaticamente.

## Conteúdo da mensagem

Data, rota, colaborador, total de paradas concluídas, bags entregues,
divergências, se houver, e os links das evidências. Nenhum dado pessoal
sensível é incluído.
