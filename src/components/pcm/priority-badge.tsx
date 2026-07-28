import { memo } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type Priority = "critica" | "alta" | "media" | "baixa";

const CONFIG: Record<
  Priority,
  { label: string; className: string; icon: React.ReactNode }
> = {
  critica: {
    label: "Crítica",
    className: "border-destructive/50 bg-destructive/14 text-destructive",
    icon: <AlertTriangle className="size-3" aria-hidden />,
  },
  alta: {
    label: "Alta",
    className: "border-warning/50 bg-warning/14 text-warning",
    icon: <ArrowUp className="size-3" aria-hidden />,
  },
  media: {
    label: "Média",
    className: "border-primary/45 bg-primary/12 text-primary",
    icon: <Minus className="size-3" aria-hidden />,
  },
  baixa: {
    label: "Baixa",
    className: "border-border/60 bg-muted/40 text-muted-foreground",
    icon: <ArrowDown className="size-3" aria-hidden />,
  },
};

export function normalizePriority(value: string | null | undefined): Priority {
  const raw = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (raw.startsWith("crit") || raw === "urgente") return "critica";
  if (raw.startsWith("alt") || raw === "high") return "alta";
  if (raw.startsWith("baix") || raw === "low") return "baixa";
  return "media";
}

function PriorityBadgeImpl({
  priority,
  className,
}: {
  priority: Priority | string;
  className?: string;
}) {
  const key = normalizePriority(priority);
  const cfg = CONFIG[key];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none tracking-wide",
        cfg.className,
        className,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export const PriorityBadge = memo(PriorityBadgeImpl);
