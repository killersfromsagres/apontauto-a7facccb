export type TaludeStatus = "programado" | "em_execucao" | "finalizado";

export const STATUS_META: Record<
  TaludeStatus,
  { label: string; fill: string; stroke: string; text: string; glow: string }
> = {
  programado: {
    label: "Programado",
    fill: "#1d4ed8",
    stroke: "#1e3a8a",
    text: "#ffffff",
    glow: "rgba(59,130,246,0.55)",
  },
  em_execucao: {
    label: "Em Execução",
    fill: "#f59e0b",
    stroke: "#b45309",
    text: "#111827",
    glow: "rgba(251,191,36,0.65)",
  },
  finalizado: {
    label: "Finalizado",
    fill: "#16a34a",
    stroke: "#14532d",
    text: "#ffffff",
    glow: "rgba(34,197,94,0.55)",
  },
};
