import { memo } from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "primary";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "border-border/60 bg-muted/40 text-muted-foreground",
  info: "border-sky-400/40 bg-sky-400/12 text-sky-300",
  success: "border-success/40 bg-success/12 text-success",
  warning: "border-warning/45 bg-warning/12 text-warning",
  danger: "border-destructive/45 bg-destructive/12 text-destructive",
  primary: "border-primary/45 bg-primary/12 text-primary",
};

/**
 * Mapa canônico de status usados nos módulos de OS/PCM.
 * Chaves são normalizadas (minúsculas, sem acento) antes da busca.
 */
const STATUS_TONE: Record<string, StatusTone> = {
  aberto: "info",
  aberta: "info",
  pendente: "warning",
  "em andamento": "primary",
  andamento: "primary",
  processando: "primary",
  programado: "primary",
  programada: "primary",
  aguardando: "warning",
  suspenso: "warning",
  suspensa: "warning",
  revisao: "warning",
  concluido: "success",
  concluida: "success",
  finalizado: "success",
  finalizada: "success",
  aprovado: "success",
  sincronizado: "success",
  erro: "danger",
  falha: "danger",
  cancelado: "danger",
  cancelada: "danger",
  reprovado: "danger",
  atrasado: "danger",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function statusTone(status: string): StatusTone {
  return STATUS_TONE[normalize(status)] ?? "neutral";
}

function StatusBadgeImpl({
  status,
  tone,
  icon,
  className,
}: {
  status: string;
  /** Sobrescreve o tom inferido a partir do texto do status. */
  tone?: StatusTone;
  icon?: React.ReactNode;
  className?: string;
}) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none tracking-wide",
        TONE_CLASS[resolved],
        className,
      )}
    >
      {icon}
      <span className="truncate">{status}</span>
    </span>
  );
}

export const StatusBadge = memo(StatusBadgeImpl);
