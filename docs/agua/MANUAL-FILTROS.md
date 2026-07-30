# Manual — Solicitação e Troca de Filtros de Água

Caminho: **Água → Filtros**. Abas: Solicitações, Ativos e Preventiva.

## 1. Ativos

Cada filtro instalado é um ativo com ponto, modelo, data de instalação,
periodicidade e condição atual. A **próxima troca** é recalculada
automaticamente a partir da última troca e da periodicidade. Cada ativo tem QR
para abrir a ficha direto no celular.

## 2. Abrir uma solicitação

1. Toque em **Nova solicitação** (ou leia o QR do filtro).
2. Informe ponto/ativo, motivo, prioridade e descrição.
3. Anexe foto, se houver.

A prioridade define o SLA: alta 24 h, média 72 h, baixa 168 h. O prazo aparece
no cartão e o sistema avisa quando está perto de vencer.

## 3. Fluxo (kanban)

```text
solicitada → em triagem → aprovada → (aguardando material) → programada
          → em deslocamento → em execução → concluída → validada
```

Ainda existem: **rejeitada** (pode ser reaberta), **reaberta** e **cancelada**.
Transições inválidas são recusadas pelo próprio banco, então não há como pular
etapa por engano. Cada mudança gera um evento na trilha, com autor e comentário.

## 4. Executar a troca

Na conclusão são obrigatórias:

- **foto antes** da troca;
- **foto depois** da troca;
- filtro utilizado, lote e quantidade;
- condição do equipamento após a troca.

Ao concluir, o ativo recebe a nova data de última troca e a **próxima troca é
recalculada**.

## 5. Preventiva

A aba Preventiva lista o que vence nos próximos dias conforme a periodicidade.
Uma rotina diária avisa a gestão sobre filtros vencendo e vencidos.

## 6. Indicadores

Abertas, vencidas, cumprimento de SLA, tempo médio de atendimento, reaberturas
e a divisão entre preventiva e corretiva. Exportável em Excel e PDF.

## 7. Permissões

- *Abrir solicitação*: solicitante, operador, técnico.
- *Triagem, aprovação e gestão*: gestor.
- *Executar*: técnico de filtro.
- Corretiva e climatização não têm acesso automático.
