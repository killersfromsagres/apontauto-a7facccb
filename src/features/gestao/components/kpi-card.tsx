import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type KpiTone = "neutro" | "bom" | "atencao" | "critico";

export type KpiProps = {
  icon: LucideIcon;
  label: string;
  valor: string;
  anterior?: number;
  atual?: number;
  /** true quando um aumento é ruim (ex.: OS vencidas). */
  inverso?: boolean;
  hint?: string;
  tooltip: string;
  tone?: KpiTone;
  atualizadoEm?: string;
  carregando?: boolean;
  erro?: boolean;
  onClick?: () => void;
};

const toneClass: Record<KpiTone, string> = {
  neutro: "text-foreground",
  bom: "text-emerald-400",
  atencao: "text-amber-400",
  critico: "text-destructive",
};

export function KpiCard({
  icon: Icon,
  label,
  valor,
  anterior,
  atual,
  inverso = false,
  hint,
  tooltip,
  tone = "neutro",
  atualizadoEm,
  carregando,
  erro,
  onClick,
}: KpiProps) {
  const temDelta =
    typeof anterior === "number" && typeof atual === "number" && (anterior > 0 || atual > 0);
  const variacao = temDelta
    ? anterior === 0
      ? 100
      : Math.round(((atual! - anterior!) / anterior!) * 100)
    : null;
  const positivo = variacao !== null && (inverso ? variacao < 0 : variacao > 0);
  const neutro = variacao === 0;

  const conteudo = (
    <GlassCard
      className={`h-full p-4 transition ${onClick ? "cursor-pointer hover:border-primary/50 active:scale-[0.99]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="truncate">{label}</span>
            <Info className="h-3 w-3 shrink-0 opacity-60" />
          </p>
          {carregando ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : erro ? (
            <p className="mt-1 font-display text-lg font-semibold text-destructive">Erro</p>
          ) : (
            <p className={`mt-1 font-display text-2xl font-bold ${toneClass[tone]}`}>{valor}</p>
          )}
          {!carregando && !erro && hint && (
            <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
          )}
          {!carregando && !erro && variacao !== null && (
            <p
              className={`mt-1 flex items-center gap-1 text-[11px] ${
                neutro ? "text-muted-foreground" : positivo ? "text-emerald-400" : "text-destructive"
              }`}
            >
              {neutro ? (
                <ArrowRight className="h-3 w-3" />
              ) : variacao > 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {variacao > 0 ? "+" : ""}
              {variacao}% vs. período anterior
            </p>
          )}
          {!carregando && atualizadoEm && (
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              Atualizado {new Date(atualizadoEm).toLocaleTimeString("pt-BR")}
            </p>
          )}
        </div>
        <Icon className="h-5 w-5 shrink-0 text-primary/80" />
      </div>
    </GlassCard>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : -1} onClick={onClick}>
            {conteudo}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
