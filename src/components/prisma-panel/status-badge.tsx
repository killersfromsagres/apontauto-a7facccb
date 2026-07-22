import { cn } from "@/lib/utils";
import type { LoteStatus, OsStatus } from "@/lib/prisma-panel/hooks";

const MAP: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-white/10 text-muted-foreground border-white/10" },
  pendente: { label: "Pendente", cls: "bg-amber-500/15 text-amber-300 border-amber-400/30" },
  em_execucao: { label: "Em execução", cls: "bg-blue-500/15 text-blue-300 border-blue-400/30 animate-pulse" },
  concluido: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
  erro: { label: "Erro", cls: "bg-rose-500/15 text-rose-300 border-rose-400/30" },
};

export function StatusBadge({ status }: { status: LoteStatus | OsStatus | string }) {
  const s = MAP[status] ?? MAP.rascunho;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight",
        s.cls,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
