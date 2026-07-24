import { useQuery } from "@tanstack/react-query";
import { fetchWeather, type WeatherResponse } from "@/lib/weather/open-meteo";

/** Hook para consumir a previsão do Open-Meteo com auto-refresh de 30 min. */
export function useWeather() {
  return useQuery<WeatherResponse>({
    queryKey: ["open-meteo-weather"],
    queryFn: ({ signal }) => fetchWeather(signal),
    // Precisão: refetch a cada 5 min + ao voltar o foco da aba (para detectar
    // chuva iniciando o quanto antes na operação de taludes).
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 8000),
  });
}
