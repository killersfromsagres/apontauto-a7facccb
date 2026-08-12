# Plano de Aprimoramento da Demarcação de Taludes

Remover a exibição automática e fixa de números e datas nas demarcações de taludes, substituindo por um sistema de etiquetas manuais reposicionáveis e redimensionáveis.

## Mudanças Sugeridas

### Banco de Dados (Lovable Cloud)
- Adicionar colunas `numero_x`, `numero_y`, `numero_scale`, `data_x`, `data_y`, `data_scale` na tabela `talude_marcacoes` para persistir as posições e tamanhos manuais.

### Backend (Server Functions)
- Atualizar `src/lib/taludes/api.ts` para suportar os novos campos de posicionamento e escala no salvamento e leitura.

### Frontend (Componente de Edição)
- Modificar `src/components/taludes/polygon-editor.tsx`:
    - Remover a renderização automática das etiquetas fixas no primeiro ponto do polígono.
    - Implementar um novo modo de "Edição de Etiquetas" onde o usuário pode arrastar o número e a data independentemente.
    - Adicionar controles de escala (sliders) para ajustar o tamanho do número e da data selecionados.
    - Garantir que as etiquetas manuais sejam incluídas corretamente na exportação para PNG.

## Detalhes Técnicos
- Utilizar `foreignObject` no SVG para renderizar as etiquetas móveis, facilitando o arraste via coordenadas (x, y).
- Sincronizar as alterações de posição via `onSave` ao finalizar o arraste.
- Manter a estética "Apple Glass" nos novos componentes de controle.
