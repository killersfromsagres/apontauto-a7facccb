import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ban, RotateCcw, Info } from "lucide-react";
import { JOB_STATUS_CLASSES, JOB_STATUS_LABELS } from "../utils/statusLabels";
import type { PointingJob } from "../types/pointing";

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export const JobStatusRow = memo(function JobStatusRow({
  job,
  onCancel,
  onRetry,
  onDetails,
  busy,
}: {
  job: PointingJob;
  onCancel: (job: PointingJob) => void;
  onRetry: (job: PointingJob) => void;
  onDetails: (job: PointingJob) => void;
  busy: boolean;
}) {
  const canCancel = job.status === "queued";
  const canRetry = job.status === "failed" || job.status === "review" || job.status === "cancelled";

  return (
    <div className="arcano-row flex flex-col gap-2 rounded-2xl border border-border/50 bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold">OS {job.os_number}</span>
          <Badge variant="outline" className={JOB_STATUS_CLASSES[job.status]}>
            {JOB_STATUS_LABELS[job.status]}
          </Badge>
          {job.stage && (
            <span className="truncate font-mono text-[11px] text-muted-foreground">· {job.stage}</span>
          )}
          {job.attempts > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">tentativas: {job.attempts}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
          <span>{job.team_name || "—"}</span>
          <span>{job.technicians.join(", ") || "sem matrículas"}</span>
          <span>
            prog. {fmtDateTime(job.scheduled_start)} → {fmtDateTime(job.scheduled_end)}
          </span>
          {job.started_at && <span>real {fmtDateTime(job.started_at)}</span>}
          {job.finished_at && <span>fim {fmtDateTime(job.finished_at)}</span>}
        </div>
        {job.result_message && <p className="text-[11px] text-emerald-300">{job.result_message}</p>}
        {job.error_message && <p className="line-clamp-2 text-[11px] text-red-300">{job.error_message}</p>}
        {job.status === "review" && (
          <p className="text-[11px] text-amber-300">
            Abra o Apont Arcano Desktop no computador, confira o Prisma4 e escolha a ação de revisão no
            programa.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => onDetails(job)}>
          <Info className="mr-1.5 h-3.5 w-3.5" /> Detalhes
        </Button>
        {canRetry && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onRetry(job)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reenviar
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onCancel(job)}>
            <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancelar
          </Button>
        )}
      </div>
    </div>
  );
});
