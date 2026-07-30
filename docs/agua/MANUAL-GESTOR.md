# Manual do Gestor — Abastecimento de Água

Público: gestão de frota, PCM e coordenação. Caminho no sistema:
**Frota e Abastecimento → Água**.

## 1. Visão geral

A tela inicial mostra, do dia: paradas previstas, concluídas, pendentes,
bags entregues, evidências faltantes e rotas em andamento. O gráfico de bags por
dia carrega sob demanda.

## 2. Cadastro de pontos

- **Pontos** lista os 54 locais canônicos com busca e filtros.
- Ao cadastrar, o sistema padroniza a grafia (acentos, siglas, preposições) e
  avisa se o ponto já existe — por escrita exata, por som parecido ou por
  similaridade. Confirme antes de salvar duplicado.
- Cada ponto tem QR próprio, usado pelo operador para confirmar o local.

## 3. Programação semanal

1. **Programação** mostra a semana em colunas (segunda a sexta).
2. Arraste os pontos entre dias ou reordene dentro do dia — a ordem é salva em
   uma única operação.
3. Ajuste a quantidade de bags por ponto/dia.
4. Use **Exceções** para incluir uma entrega extra ou remover um dia pontual.
5. **Feriados** bloqueiam a geração automática da data.

## 4. Rotas e atribuição

Em **Rotas** você cria, atribui e acompanha. A geração automática roda a cada
hora e é idempotente: rodar de novo não duplica paradas. Também é possível
gerar manualmente para uma data.

Estados da rota: rascunho → planejada → atribuída → pronta → em andamento →
(pausada) → concluída ou concluída com divergência. Cancelamento é permitido ao
gestor em qualquer estado não encerrado.

## 5. Acompanhamento em tempo real

A rota do dia atualiza sozinha conforme o operador registra. Você vê progresso,
hodômetro, horário de cada parada e as evidências assim que chegam.

## 6. Bags

**Bags** traz o fechamento: carregadas, entregues, vazias recolhidas,
danificadas e restantes. Se o fechamento não bater, o sistema abre uma
ocorrência automaticamente e a rota termina como *concluída com divergência*.

## 7. Retificação

Registros encerrados são imutáveis para o campo. Só o gestor corrige, e toda
correção fica registrada com autor, motivo, valor anterior e novo.

## 8. Indicadores e relatórios

- Taxa de conclusão, produtividade, quilometragem, previsto × realizado.
- SLA de filtros, preventiva × corretiva.
- Exportações: Excel, PDF da rota (com hash e miniaturas das fotos) e pacote de
  evidências.

## 9. Configurações

Em **Configurações** ficam: ativar/desativar o módulo, bags padrão, tipos de
bag, horários, feriados, dias úteis, obrigatoriedade de foto e geolocalização,
tolerância de atraso, SLA e periodicidade de filtros, retenção, qualidade de
imagem, WhatsApp e notificações. Segredos nunca são exibidos depois de salvos —
apenas "configurado" ou "ausente".

## 10. Permissões

Conceda acesso pelo RBAC, permissão a permissão. Perfis de corretiva e
climatização **não** recebem acesso automático a este módulo.
