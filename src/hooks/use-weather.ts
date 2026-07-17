import { useQuery } from "@tanstack/react-query";
import { fetchWeather, type WeatherResponse } from "@/lib/weather/open-meteo";

/** Hook para consumir a previsão do Open-Meteo com auto-refresh de 30 min. */
export function useWeather() {
  return useQuery<WeatherResponse>({
    queryKey: ["open-meteo-weather"],
    queryFn: ({ signal }) => fetchWeather(signal),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 8000),
  });
}
