import { memo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { JOB_STATUS_CLASSES, JOB_STATUS_LABELS } from "../utils/statusLabels";
import type { PointingJob } from "../types/pointing";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export const JobDetailsDrawer = memo(function JobDetailsDrawer({
  job,
  open,
  onOpenChange,
}: {
  job: PointingJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!job) return null;

  const realDuration =
    job.started_at && job.finished_at
      ? `${Math.max(0, Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 60000))} min`
      : "—";

  const rows: [string, string][] = [
    ["Status", JOB_STATUS_LABELS[job.status]],
    ["Etapa", job.stage ?? "—"],
    ["Equipe", job.team_name || "—"],
    ["Categoria", job.category || "—"],
    ["Técnicos", job.technicians.join(", ") || "—"],
    ["Duração prevista", job.duration_text],
    ["Início programado", fmt(job.scheduled_start)],
    ["Fim programado", fmt(job.scheduled_end)],
    ["Reservado em", fmt(job.claimed_at)],
    ["Início real", fmt(job.started_at)],
    ["Término real", fmt(job.finished_at)],
    ["Duração real", realDuration],
    ["Tentativas", String(job.attempts)],
    ["Agente", job.agent_id ? job.agent_id.slice(0, 8) : "—"],
    ["Resultado", job.result_message ?? "—"],
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono">
            OS {job.os_number}
            <Badge variant="outline" className={JOB_STATUS_CLASSES[job.status]}>
              {JOB_STATUS_LABELS[job.status]}
            </Badge>
          </SheetTitle>
          <SheetDescription>Detalhes do apontamento enviados ao agente Windows.</SheetDescription>
        </SheetHeader>

        <div className="space-y-2 px-4 pb-6">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-border/40 py-1.5">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
              <span className="text-right font-mono text-xs">{value}</span>
            </div>
          ))}

          {job.error_message && (
            <div className="mt-4 space-y-2 rounded-xl border border-red-400/30 bg-red-500/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-red-300">Erro</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(job.error_message ?? "");
                    toast.success("Erro copiado.");
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar erro
                </Button>
              </div>
              <p className="whitespace-pre-wrap break-words font-mono text-[11px] text-red-200">
                {job.error_message}
              </p>
            </div>
          )}

          {job.screenshot_path && (
            <p className="mt-4 rounded-xl border border-border/50 bg-background/40 p-3 text-[11px] text-muted-foreground">
              Evidência salva no computador do agente:{" "}
              <span className="font-mono break-all">{job.screenshot_path}</span>. O arquivo é local e não fica
              disponível pelo navegador.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});
