import {
  Sun,
  CloudSun,
  Cloud,
  Cloudy,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Thermometer,
  HelpCircle,
  CircleCheck,
  CircleAlert,
  TriangleAlert,
  OctagonAlert,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { WeatherCodeInfo, OperationalStatus } from "./open-meteo";

/**
 * Mapa código WMO → ícone Lucide profissional.
 * Mantém a mesma classificação de "bucket" usada em open-meteo.ts.
 */
const CODE_ICON: Record<number, ComponentType<LucideProps>> = {
  0: Sun,
  1: CloudSun,
  2: CloudSun,
  3: Cloudy,
  45: CloudFog,
  48: CloudFog,
  51: CloudDrizzle,
  53: CloudDrizzle,
  55: CloudDrizzle,
  56: CloudDrizzle,
  57: CloudDrizzle,
  61: CloudRain,
  63: CloudRain,
  65: CloudRain,
  66: CloudRain,
  67: CloudRain,
  71: CloudSnow,
  73: CloudSnow,
  75: CloudSnow,
  77: CloudSnow,
  80: CloudRain,
  81: CloudRain,
  82: CloudLightning,
  85: CloudSnow,
  86: CloudSnow,
  95: CloudLightning,
  96: CloudLightning,
  99: CloudLightning,
};

const BUCKET_COLOR: Record<WeatherCodeInfo["bucket"], string> = {
  sol: "text-amber-500",
  nublado: "text-slate-400",
  neblina: "text-slate-400",
  garoa: "text-sky-400",
  chuva: "text-sky-500",
  neve: "text-cyan-300",
  tempestade: "text-indigo-500",
};

export function WeatherIcon({
  code,
  bucket,
  className,
}: {
  code: number | null | undefined;
  bucket?: WeatherCodeInfo["bucket"];
  className?: string;
}) {
  const Icon = (code != null && CODE_ICON[code]) || (code == null ? HelpCircle : Thermometer);
  const color = bucket ? BUCKET_COLOR[bucket] : "text-foreground";
  return <Icon className={className ?? `h-6 w-6 ${color}`} strokeWidth={1.75} />;
}

const STATUS_ICON: Record<OperationalStatus["nivel"], ComponentType<LucideProps>> = {
  normal: CircleCheck,
  atencao: CircleAlert,
  alto: TriangleAlert,
  reprogramar: OctagonAlert,
};

const STATUS_COLOR: Record<OperationalStatus["nivel"], string> = {
  normal: "text-emerald-500",
  atencao: "text-amber-500",
  alto: "text-orange-500",
  reprogramar: "text-red-500",
};

export function StatusIcon({
  nivel,
  className,
}: {
  nivel: OperationalStatus["nivel"];
  className?: string;
}) {
  const Icon = STATUS_ICON[nivel];
  return <Icon className={className ?? `h-6 w-6 ${STATUS_COLOR[nivel]}`} strokeWidth={1.75} />;
}
