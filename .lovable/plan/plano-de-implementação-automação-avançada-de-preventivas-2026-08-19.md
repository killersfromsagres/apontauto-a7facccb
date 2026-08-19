# Plano de Implementação: Automação Avançada de Preventivas

Melhoria do sistema de automação de preventivas com suporte a importação de planilhas, cálculo inteligente de prazos (dias úteis, feriados e distribuição equilibrada) e triagem automática para equipes de Civil, Hidráulica, Chaveiro, Refrigeração e Elétrica.

## Requisitos

1.  **Importação de Planilhas**:
    *   Botão "Importar Civil-Chaveiro-Hidráulica" (triagem automática entre as 3 equipes).
    *   Botão "Importar Refrigeração" (triagem automática entre as 3 equipes de refrigeração por prédio).
    *   Botão "Importar Elétrica".
2.  **Cálculo de Prazos e Distribuição**:
    *   Data de início: Hoje.
    *   Data fim: Último dia do mês atual.
    *   Considerar apenas dias úteis (segunda a sexta).
    *   Excluir feriados nacionais e feriado municipal (Aniversário da Cidade: 20 de Agosto - *conforme data da conversa 19/08 e "feriado de amanhã"*).
3.  **Capacidade e Tempo por OS**:
    *   Civil, Chaveiro e Elétrica: 30 minutos por OS.
    *   Refrigeração: 1 hora por OS.
4.  **Interface**:
    *   Novos botões com efeitos animados.
    *   Feedback visual de processamento "Motor IA".
    *   Histórico de gerações.

## Detalhes Técnicos

### 1. Ajuste de Feriados
*   Atualizar `src/lib/preventiva/business-days.ts` para incluir o feriado municipal fixo de 20 de Agosto (Aniversário da Cidade).

### 2. Motor de Programação Inteligente
*   Criar `src/lib/preventiva/automacao/intelligent-scheduler.ts` para:
    *   Receber a lista de OS triadas.
    *   Calcular os dias úteis disponíveis no intervalo (Hoje -> Fim do Mês).
    *   Distribuir as OSs respeitando o tempo de execução (30min ou 60min) e a jornada de 8h/dia.
    *   Garantir a ordem por Prédio -> Andar para otimizar o deslocamento.

### 3. Interface de Automação
*   Atualizar `src/components/preventiva-automacao/automacao-preventiva-main.tsx`:
    *   Adicionar seção de "Importação de Planilhas" com os 3 botões específicos.
    *   Integrar o `readPreventivaFiles` e `triage` existentes.
    *   Chamar o novo `intelligent-scheduler` antes de gerar o Excel.
    *   Adicionar animações de entrada e hover nos botões (estilo Glass Apple).

### 4. Lógica de Triagem de Refrigeração
*   Garantir que a triagem de Refrigeração use o mapeamento de prédios já existente em `src/lib/preventiva/triage.ts`.

## Artefatos a serem criados/modificados
*   `src/lib/preventiva/business-days.ts` (modificação)
*   `src/lib/preventiva/automacao/intelligent-scheduler.ts` (novo)
*   `src/components/preventiva-automacao/automacao-preventiva-main.tsx` (modificação)
*   `src/lib/preventiva/weekly-exporter.ts` (verificar suporte a tempos variáveis)
