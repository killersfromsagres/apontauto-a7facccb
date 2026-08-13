# Plano de Melhoria da Precisão Climática para Taludes

O sistema de monitoramento climático será aprimorado com dados de precipitação em alta resolução (Open-Meteo), incluindo acumulados de curto prazo e detalhamento de intensidade (garoa vs. chuva forte) para garantir a segurança nas operações de talude.

## Alterações Propostas

### Backend e API
- Atualizar a API `open-meteo.ts` para capturar `precipitation` no bloco `current` e `rain` no bloco `hourly` com maior granularidade.
- Refinar a lógica de `detectRain` para identificar precipitações mínimas (0.1mm) que já impactam a segurança em taludes.
- Implementar cálculo de acumulado das últimas 3h, 6h e 24h para análise de saturação do solo.

### Interface (UI)
- **Novo Widget de Clima**: Substituir o widget estático em `/taludes` por um componente reativo conectado ao `useWeather`.
- **Detalhamento de Chuva**: Exibir intensidade (ex: "Garoa Fina", "Pancadas Moderadas") e o volume acumulado do dia.
- **Alertas Dinâmicos**: O painel de alertas agora mostrará avisos específicos baseados no volume de chuva previsto para a próxima hora.

## Detalhes Técnicos
- Utilização do parâmetro `&current=precipitation` e `&hourly=rain` da API Open-Meteo.
- Adição de novos tipos `RainDetection` com suporte a `intensity` e `mm_dia`.
- Atualização do componente `WeatherWidget` em `src/routes/_authenticated/taludes.tsx` para usar o hook `useWeather`.
- Sincronização da escala de risco entre o Dashboard principal e o módulo de Taludes.
