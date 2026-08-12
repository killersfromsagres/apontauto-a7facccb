# Plano de Implementação: Posição Manual e Redimensionamento de Legendas em Taludes

Este plano descreve a restauração do sistema de demarcação de taludes e a implementação de ferramentas para posicionar manualmente e redimensionar os números e datas de status nos mapas, removendo as etiquetas fixas automáticas.

## Alterações Realizadas

### Banco de Dados
- Criada a migração `20260812170451_e39c21a4-19ff-4bbf-bd33-332a9b84ecb4.sql` para adicionar colunas de posicionamento e escala na tabela `talude_marcacoes`:
  - `numero_x`, `numero_y`, `numero_scale` (Padrão: 1.0)
  - `data_x`, `data_y`, `data_scale` (Padrão: 1.0)

### API Backend (`src/lib/taludes/api.ts`)
- Atualizada a interface `TaludeMarcacao` para incluir os novos campos.
- Atualizada a função `saveTaludeMarcacao` para persistir as coordenadas e escalas manuais.

## Próximos Passos

### 1. Restauração e Aprimoramento do Editor (`src/components/taludes/polygon-editor.tsx`)
- **Restaurar Código:** Recuperar a lógica completa do editor (que foi acidentalmente truncada) a partir do histórico do Git.
- **Remover Rótulos Automáticos:** Substituir a lógica que fixa as legendas no primeiro ponto do polígono.
- **Novo Modo de Edição de Legendas:**
  - Adicionar o ícone `Move` à barra de ferramentas para ativar o modo de posicionamento.
  - Implementar o arraste individual (drag-and-drop) para o **Número do Talude** e para a **Data de Status**.
  - As coordenadas `numero_x/y` e `data_x/y` serão calculadas em relação ao sistema de coordenadas do mapa original.
- **Sliders de Redimensionamento:**
  - Adicionar sliders na interface lateral para ajustar a escala (`numero_scale` e `data_scale`) da legenda selecionada.

### 2. Renderização Dinâmica e Exportação
- Atualizar a renderização no SVG para usar as coordenadas manuais (se existirem) ou o fallback inteligente (centroide do polígono).
- Atualizar a lógica de exportação em Canvas (`handleExport`) para respeitar o posicionamento e escala manual de cada elemento visual.

## Detalhes Técnicos
- O arraste será implementado utilizando eventos de `onMouseDown` e `onMouseMove` sobre os elementos `foreignObject` da legenda quando o modo `move` estiver ativo.
- As escalas serão aplicadas via transformações CSS no SVG e via multiplicadores de fonte no Canvas.
