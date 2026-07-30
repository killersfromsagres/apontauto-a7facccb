/** Identificação funcional do veículo (para quê ele é usado). */
export type VehicleUse = "agua" | "mascara" | "manutencao" | "outro";

export const VEHICLE_USE_LABEL: Record<VehicleUse, string> = {
  agua: "Água",
  mascara: "Máscara",
  manutencao: "Manutenção",
  outro: "Frota",
};

export const VEHICLE_USE_TONE: Record<VehicleUse, string> = {
  agua: "border-sky-400/50 bg-sky-500/15 text-sky-600 dark:text-sky-300",
  mascara: "border-violet-400/50 bg-violet-500/15 text-violet-600 dark:text-violet-300",
  manutencao: "border-amber-400/50 bg-amber-500/15 text-amber-600 dark:text-amber-300",
  outro: "border-border/60 bg-muted/40 text-muted-foreground",
};

/** Deduz o uso do veículo pelo nome/versão cadastrada. */
export function inferVehicleUse(text?: string | null): VehicleUse {
  const t = (text ?? "").toLowerCase();
  if (/\b[áa]gua\b/.test(t)) return "agua";
  if (/m[áa]scara/.test(t)) return "mascara";
  if (/manuten[cç][ãa]o/.test(t)) return "manutencao";
  return "outro";
}
