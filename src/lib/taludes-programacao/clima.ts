// Cliente Open-Meteo (público, sem chave) + persistência em taludes_clima_snapshot.
import { supabase } from "@/integrations/supabase/client";

export type ClimaDia = {
  data: string;
  temp_max: number | null;
  temp_min: number | null;
  precipitacao_mm_prev: number | null;
  precipitacao_mm_real: number | null;
  prob_chuva_prev: number | null;
  condicao: string | null;
  choveu: boolean;
};

export type ClimaAgora = {
  temperatura: number | null;
  condicao: string;
  prob_chuva: number | null;
  atualizado_em: string;
};

export type ClimaConfig = {
  latitude: number;
  longitude: number;
  limite_prob_chuva: number;
  limite_mm_chuva: number;
};

const DEFAULT_CONFIG: ClimaConfig = {
  latitude: -23.6939,
  longitude: -46.565,
  limite_prob_chuva: 60,
  limite_mm_chuva: 1.0,
};

// WMO weather code → texto curto pt-BR
export function wmoTexto(code: number | null | undefined): string {
  if (code == null) return "—";
  if (code === 0) return "Ensolarado";
  if ([1, 2].includes(code)) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if ([45, 48].includes(code)) return "Névoa";
  if ([51, 53, 55, 56, 57].includes(code)) return "Garoa";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Chuva";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neve";
  if ([95, 96, 99].includes(code)) return "Tempestade";
  return "Instável";
}

export function wmoIcone(code: number | null | undefined): "sun" | "cloud" | "rain" | "storm" {
  if (code == null) return "cloud";
  if (code === 0 || code === 1) return "sun";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 71, 73, 75, 77, 85, 86].includes(code))
    return "rain";
  return "cloud";
}

export async function getConfig(): Promise<ClimaConfig> {
  const { data } = await supabase
    .from("taludes_clima_config" as never)
    .select("latitude,longitude,limite_prob_chuva,limite_mm_chuva")
    .maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  const d = data as unknown as ClimaConfig;
  return {
    latitude: Number(d.latitude ?? DEFAULT_CONFIG.latitude),
    longitude: Number(d.longitude ?? DEFAULT_CONFIG.longitude),
    limite_prob_chuva: Number(d.limite_prob_chuva ?? DEFAULT_CONFIG.limite_prob_chuva),
    limite_mm_chuva: Number(d.limite_mm_chuva ?? DEFAULT_CONFIG.limite_mm_chuva),
  };
}

export async function salvarConfig(c: ClimaConfig): Promise<void> {
  await supabase
    .from("taludes_clima_config" as never)
    .upsert({ id: true, ...c } as never);
}

async function fetchForecast(cfg: ClimaConfig) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${cfg.latitude}&longitude=${cfg.longitude}` +
    `&current=temperature_2m,precipitation,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
    `&past_days=7&forecast_days=14&timezone=America%2FSao_Paulo`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("forecast fetch failed");
  return (await r.json()) as {
    current: {
      time: string;
      temperature_2m: number;
      precipitation: number;
      weather_code: number;
    };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      precipitation_probability_max: (number | null)[];
    };
  };
}

async function fetchArchive(cfg: ClimaConfig, days: number) {
  const end = new Date();
  end.setDate(end.getDate() - 8); // arquivo começa alguns dias atrás; past_days cobre próximo
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${cfg.latitude}&longitude=${cfg.longitude}` +
    `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America%2FSao_Paulo`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return (await r.json()) as {
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
    };
  };
}

export type ClimaBundle = {
  agora: ClimaAgora;
  dias: ClimaDia[]; // ordenado ASC
  config: ClimaConfig;
  atualizado_em: string;
  stale: boolean;
};

export async function loadClima(): Promise<ClimaBundle> {
  const config = await getConfig();
  const nowIso = new Date().toISOString();
  try {
    const [fc, arc] = await Promise.all([fetchForecast(config), fetchArchive(config, 90)]);
    const map = new Map<string, ClimaDia>();

    // Arquivo (real)
    if (arc?.daily) {
      arc.daily.time.forEach((data, i) => {
        const mm = arc.daily.precipitation_sum[i] ?? 0;
        map.set(data, {
          data,
          temp_max: arc.daily.temperature_2m_max[i] ?? null,
          temp_min: arc.daily.temperature_2m_min[i] ?? null,
          precipitacao_mm_prev: null,
          precipitacao_mm_real: mm,
          prob_chuva_prev: null,
          condicao: wmoTexto(arc.daily.weather_code[i]),
          choveu: mm >= config.limite_mm_chuva,
        });
      });
    }

    // Forecast (past_days + forecast_days). past_days traz "real" recente também.
    const hojeStr = new Date().toISOString().slice(0, 10);
    fc.daily.time.forEach((data, i) => {
      const isPast = data < hojeStr;
      const mm = fc.daily.precipitation_sum[i] ?? 0;
      const prob = fc.daily.precipitation_probability_max[i] ?? null;
      const cond = wmoTexto(fc.daily.weather_code[i]);
      const prev = map.get(data);
      map.set(data, {
        data,
        temp_max: fc.daily.temperature_2m_max[i] ?? prev?.temp_max ?? null,
        temp_min: fc.daily.temperature_2m_min[i] ?? prev?.temp_min ?? null,
        precipitacao_mm_prev: isPast ? prev?.precipitacao_mm_prev ?? null : mm,
        precipitacao_mm_real: isPast ? mm : prev?.precipitacao_mm_real ?? null,
        prob_chuva_prev: prob,
        condicao: cond,
        choveu: isPast ? mm >= config.limite_mm_chuva : prev?.choveu ?? false,
      });
    });

    const dias = Array.from(map.values()).sort((a, b) => a.data.localeCompare(b.data));

    // Persistir snapshot (upsert)
    if (dias.length) {
      const rows = dias.map((d) => ({
        data: d.data,
        temp_max: d.temp_max,
        temp_min: d.temp_min,
        precipitacao_mm_prev: d.precipitacao_mm_prev,
        precipitacao_mm_real: d.precipitacao_mm_real,
        prob_chuva_prev: d.prob_chuva_prev,
        condicao: d.condicao,
        choveu: d.choveu,
        atualizado_em: nowIso,
      }));
      await supabase
        .from("taludes_clima_snapshot" as never)
        .upsert(rows as never, { onConflict: "data" });
    }

    return {
      agora: {
        temperatura: fc.current.temperature_2m ?? null,
        condicao: wmoTexto(fc.current.weather_code),
        prob_chuva:
          fc.daily.precipitation_probability_max[
            fc.daily.time.findIndex((t) => t === hojeStr)
          ] ?? null,
        atualizado_em: nowIso,
      },
      dias,
      config,
      atualizado_em: nowIso,
      stale: false,
    };
  } catch {
    // Fallback: última cópia salva
    const { data } = await supabase
      .from("taludes_clima_snapshot" as never)
      .select("*")
      .order("data", { ascending: true });
    const dias = ((data ?? []) as unknown as ClimaDia[]).map((d) => ({
      ...d,
      temp_max: d.temp_max != null ? Number(d.temp_max) : null,
      temp_min: d.temp_min != null ? Number(d.temp_min) : null,
      precipitacao_mm_prev:
        d.precipitacao_mm_prev != null ? Number(d.precipitacao_mm_prev) : null,
      precipitacao_mm_real:
        d.precipitacao_mm_real != null ? Number(d.precipitacao_mm_real) : null,
      prob_chuva_prev: d.prob_chuva_prev != null ? Number(d.prob_chuva_prev) : null,
    }));
    const hojeStr = new Date().toISOString().slice(0, 10);
    const hoje = dias.find((d) => d.data === hojeStr);
    return {
      agora: {
        temperatura: hoje?.temp_max ?? null,
        condicao: hoje?.condicao ?? "—",
        prob_chuva: hoje?.prob_chuva_prev ?? null,
        atualizado_em: nowIso,
      },
      dias,
      config,
      atualizado_em: nowIso,
      stale: true,
    };
  }
}

export function statusClimatico(
  dataStr: string,
  dias: ClimaDia[],
  cfg: ClimaConfig,
): { nivel: "favoravel" | "atencao" | "chuva"; motivo: string } {
  const d = dias.find((x) => x.data === dataStr);
  if (!d) return { nivel: "atencao", motivo: "Sem dados climáticos" };
  const mmReal = d.precipitacao_mm_real ?? 0;
  if (mmReal >= cfg.limite_mm_chuva)
    return { nivel: "chuva", motivo: `Choveu ${mmReal.toFixed(1)} mm` };
  const prob = d.prob_chuva_prev ?? 0;
  const mmPrev = d.precipitacao_mm_prev ?? 0;
  if (prob >= cfg.limite_prob_chuva || mmPrev >= cfg.limite_mm_chuva)
    return {
      nivel: "chuva",
      motivo: `Chuva prevista (${Math.round(prob)}% • ${mmPrev.toFixed(1)} mm)`,
    };
  if (prob >= cfg.limite_prob_chuva - 20) return { nivel: "atencao", motivo: `Instável (${Math.round(prob)}%)` };
  return { nivel: "favoravel", motivo: "Favorável" };
}

export function proximaDataFavoravel(
  dataAtual: string,
  dias: ClimaDia[],
  cfg: ClimaConfig,
): string | null {
  const hoje = new Date().toISOString().slice(0, 10);
  const start = dataAtual > hoje ? dataAtual : hoje;
  for (const d of dias) {
    if (d.data <= start) continue;
    if (statusClimatico(d.data, dias, cfg).nivel === "favoravel") return d.data;
  }
  return null;
}
