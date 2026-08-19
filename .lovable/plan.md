# Plano de Implementação: Edição Manual de Numeração de Taludes

O objetivo deste plano é permitir que o usuário altere manualmente a numeração das demarcações de taludes no editor, em vez de depender apenas do incremento automático.

## Requisitos
- Adicionar um campo de entrada (input) no painel de configurações da demarcação selecionada para editar o número.
- Sincronizar a alteração com o banco de dados via a função `onSave`.
- Atualizar a visualização em tempo real (SVG e Canvas para exportação).

## Detalhes Técnicos

### 1. Componente `PolygonEditor` (`src/components/taludes/polygon-editor.tsx`)
- Adicionar um novo estado local `numeroEditavel` para gerenciar o valor do input enquanto o usuário digita.
- Inserir um novo campo de configuração no painel lateral (abaixo de "Configurar Legenda"):
    ```tsx
    <div className="space-y-2">
      <span className="text-[10px] text-white/70 uppercase font-bold">Numeração do Talude</span>
      <input 
        type="number"
        value={numeroEditavel}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          setNumeroEditavel(val);
          // Atualiza visualmente no mapa
          setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, numero: val } : m));
        }}
        onBlur={() => {
          // Salva no banco ao perder o foco
          const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
          if (target) onSave({ ...target, numero: numeroEditavel });
        }}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-blue-500/50"
      />
    </div>
    ```
- Atualizar a lógica de `handleClick` para carregar o número atual da demarcação selecionada no estado `numeroEditavel`.

### 2. Verificação
- Abrir o editor de taludes.
- Selecionar um talude existente.
- Alterar o número no novo campo.
- Verificar se o número no mapa muda imediatamente.
- Verificar se a alteração persiste após recarregar a página.
