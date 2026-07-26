import { useMemo, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RotateCcw, WifiOff, Inbox, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { JobStatusRow } from "./JobStatusRow";
import { JobDetailsDrawer } from "./JobDetailsDrawer";
import { cancelQueuedJob, retryJob } from "../services/pointingService";
import type { PointingBatch, PointingJob } from "../types/pointing";

export function LiveBatchPanel({
  batches,
  jobs,
  loading,
  error,
  selectedBatchId,
  onSelectBatch,
  onRefetch,
  realtimeConnected,
  agentOffline,
}: {
  batches: PointingBatch[];
  jobs: PointingJob[];
  loading: boolean;
  error: unknown;
  selectedBatchId: string | null;
  onSelectBatch: (id: string) => void;
  onRefetch: () => void;
  realtimeConnected: boolean;
  agentOffline: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PointingJob | null>(null);
  const [confirmRetryAll, setConfirmRetryAll] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<PointingJob | null>(null);

  const stats = useMemo(() => {
    const completed = jobs.filter((j) => j.status === "completed").length;
    const failed = jobs.filter((j) => j.status === "failed").length;
    const review = jobs.filter((j) => j.status === "review").length;
    const remaining = jobs.filter((j) => j.status === "queued" || j.status === "processing");
    const remainingMinutes = remaining.reduce((sum, j) => sum + j.duration_minutes, 0);
    const started = jobs
      .map((j) => (j.started_at ? new Date(j.started_at).getTime() : null))
      .filter((v): v is number => v !== null);
    const elapsed = started.length ? Math.round((Date.now() - Math.min(...started)) / 60000) : 0;
    return {
      completed,
      failed,
      review,
      total: jobs.length,
      remainingMinutes,
      elapsed,
      percent: jobs.length ? Math.round(((completed + failed) / jobs.length) * 100) : 0,
    };
  }, [jobs]);

  const act = async (job: PointingJob, kind: "cancel" | "retry") => {
    setBusyId(job.id);
    try {
      if (kind === "cancel") await cancelQueuedJob(job.id);
      else await retryJob(job.id);
      toast.success(kind === "cancel" ? "OS cancelada." : "OS reenviada para a fila.");
      onRefetch();
    } catch {
      toast.error("Não foi possível concluir a ação. Atualize e tente novamente.");
    } finally {
      setBusyId(null);
      setConfirmCancel(null);
    }
  };

  const retryAllFailed = async () => {
    const failed = jobs.filter((j) => j.status === "failed");
    setConfirmRetryAll(false);
    let ok = 0;
    for (const job of failed) {
      try {
        await retryJob(job.id);
        ok += 1;
      } catch {
        /* segue */
      }
    }
    toast.success(`${ok} de ${failed.length} OS reenviadas.`);
    onRefetch();
  };

  if (error) {
    return (
      <GlassCard className="space-y-3 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-amber-300" />
        <p className="text-sm text-muted-foreground">Não foi possível carregar a execução.</p>
        <Button size="sm" variant="outline" onClick={onRefetch}>
          Tentar novamente
        </Button>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <Select value={selectedBatchId ?? undefined} onValueChange={onSelectBatch}>
              <SelectTrigger className="w-full sm:max-w-md">
                <SelectValue placeholder="Selecione um lote" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {(batch.name || "Lote sem nome") +
                      ` · ${new Date(batch.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {!realtimeConnected && (
              <Badge variant="outline" className="gap-1 border-amber-400/40 text-amber-200">
                <WifiOff className="h-3 w-3" /> tempo real indisponível — atualizando a cada 20 s
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => setConfirmRetryAll(true)} disabled={stats.failed === 0}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reenviar falhas do lote
            </Button>
          </div>
        </div>

        {agentOffline && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">
            Agente offline. O lote fica na fila e será iniciado assim que o Apont Arcano Desktop se conectar.
          </p>
        )}

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
            <span>
              {stats.completed}/{stats.total} concluídas · {stats.failed} falhas · {stats.review} revisões
            </span>
            <span>
              decorrido {stats.elapsed} min · estimativa restante ~{stats.remainingMinutes} min
            </span>
          </div>
          <Progress value={stats.percent} />
        </div>
      </GlassCard>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <GlassCard className="space-y-2 text-center">
          <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma OS neste lote.</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobStatusRow
              key={job.id}
              job={job}
              busy={busyId === job.id}
              onDetails={setDetail}
              onRetry={(j) => act(j, "retry")}
              onCancel={(j) => setConfirmCancel(j)}
            />
          ))}
        </div>
      )}

      <JobDetailsDrawer job={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />

      <AlertDialog open={confirmRetryAll} onOpenChange={setConfirmRetryAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reenviar todas as falhas?</AlertDialogTitle>
            <AlertDialogDescription>
              As OS com falha voltam para a fila e serão executadas novamente pelo agente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={retryAllFailed}>Reenviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a OS {confirmCancel?.os_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Somente OS ainda na fila podem ser canceladas pelo painel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCancel && act(confirmCancel, "cancel")}>
              Cancelar OS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
