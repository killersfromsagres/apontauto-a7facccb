import { useQuery } from "@tanstack/react-query";
import { fetchWeather, type WeatherResponse } from "@/lib/weather/open-meteo";

/**
 * Condição meteorológica operacional para Taludes.
 * Atualiza a cada 2 min porque chuva convectiva/local pode mudar rapidamente.
 */
export function useWeather() {
  return useQuery<WeatherResponse>({
    queryKey: ["taludes-weather-consensus-v2"],
    queryFn: ({ signal }) => fetchWeather(signal),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    retry: 2,
    retryDelay: (attempt) => Math.min(1200 * 2 ** attempt, 6000),
  });
}
