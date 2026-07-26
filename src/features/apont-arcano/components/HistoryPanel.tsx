import { useMemo, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, History, ChevronDown, ChevronUp } from "lucide-react";
import { downloadBlob } from "@/lib/download";
import { JOB_STATUS_LABELS } from "../utils/statusLabels";
import type { PointingBatch, PointingJob } from "../types/pointing";

const PAGE_SIZE = 10;

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function HistoryPanel({
  batches,
  jobs,
  loading,
}: {
  batches: PointingBatch[];
  jobs: PointingJob[];
  loading: boolean;
}) {
  const [page, setPage] = useState(0);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [osFilter, setOsFilter] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [onlyReview, setOnlyReview] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const jobsByBatch = useMemo(() => {
    const map = new Map<string, PointingJob[]>();
    for (const job of jobs) {
      const list = map.get(job.batch_id) ?? [];
      list.push(job);
      map.set(job.batch_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [jobs]);

  const teams = useMemo(
    () => Array.from(new Set(batches.map((b) => b.team_name).filter(Boolean) as string[])),
    [batches],
  );

  const filtered = useMemo(() => {
    return batches.filter((batch) => {
      const list = jobsByBatch.get(batch.id) ?? [];
      if (teamFilter !== "all" && batch.team_name !== teamFilter) return false;
      if (onlyFailed && !list.some((j) => j.status === "failed")) return false;
      if (onlyReview && !list.some((j) => j.status === "review")) return false;
      if (osFilter.trim() && !list.some((j) => j.os_number.includes(osFilter.trim()))) return false;
      return true;
    });
  }, [batches, jobsByBatch, teamFilter, onlyFailed, onlyReview, osFilter]);

  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const exportCsv = (batch: PointingBatch) => {
    const list = jobsByBatch.get(batch.id) ?? [];
    const header = [
      "os",
      "equipe",
      "categoria",
      "tecnicos",
      "duracao",
      "inicio_programado",
      "fim_programado",
      "status",
      "etapa",
      "inicio_real",
      "fim_real",
      "tentativas",
      "resultado",
      "erro",
    ];
    const rows = list.map((j) =>
      [
        j.os_number,
        j.team_name,
        j.category,
        j.technicians.join(" "),
        j.duration_text,
        j.scheduled_start,
        j.scheduled_end,
        JOB_STATUS_LABELS[j.status],
        j.stage ?? "",
        j.started_at ?? "",
        j.finished_at ?? "",
        String(j.attempts),
        j.result_message ?? "",
        j.error_message ?? "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const csv = [header.join(";"), ...rows].join("\n");
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }), `lote-${batch.id.slice(0, 8)}.csv`);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Equipe</Label>
          <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setPage(0); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Número da OS</Label>
          <Input value={osFilter} onChange={(e) => { setOsFilter(e.target.value); setPage(0); }} className="font-mono" placeholder="1540100" />
        </div>
        <label className="flex items-end gap-2 text-xs text-muted-foreground">
          <Switch checked={onlyFailed} onCheckedChange={(v) => { setOnlyFailed(v); setPage(0); }} /> somente com falhas
        </label>
        <label className="flex items-end gap-2 text-xs text-muted-foreground">
          <Switch checked={onlyReview} onCheckedChange={(v) => { setOnlyReview(v); setPage(0); }} /> somente com revisão
        </label>
      </GlassCard>

      {pageItems.length === 0 ? (
        <GlassCard className="space-y-2 text-center">
          <History className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum lote encontrado com esses filtros.</p>
        </GlassCard>
      ) : (
        pageItems.map((batch) => {
          const list = jobsByBatch.get(batch.id) ?? [];
          const completed = list.filter((j) => j.status === "completed").length;
          const failed = list.filter((j) => j.status === "failed").length;
          const review = list.filter((j) => j.status === "review").length;
          const cancelled = list.filter((j) => j.status === "cancelled").length;
          const percent = list.length ? Math.round(((completed + failed + cancelled) / list.length) * 100) : 0;
          const open = expanded === batch.id;

          return (
            <GlassCard key={batch.id} className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold">
                    {batch.name || "Lote sem nome"}
                  </h3>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {fmt(batch.created_at)} · {batch.team_name || "—"} · {list.length || batch.total_jobs} OS
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <Badge variant="outline" className="border-emerald-400/40 text-emerald-200">{completed} ok</Badge>
                  <Badge variant="outline" className="border-red-400/40 text-red-200">{failed} falhas</Badge>
                  <Badge variant="outline" className="border-amber-400/40 text-amber-200">{review} revisões</Badge>
                  <Badge variant="outline">{cancelled} canceladas</Badge>
                </div>
              </div>

              <Progress value={percent} />

              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                <span>
                  {list[0] ? `${fmt(list[0].scheduled_start)} → ${fmt(list[list.length - 1].scheduled_end)}` : "—"}
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => exportCsv(batch)}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : batch.id)}>
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {open && (
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border/50 p-2">
                  {list.map((job) => (
                    <div key={job.id} className="flex flex-wrap justify-between gap-2 font-mono text-[11px]">
                      <span className="font-semibold">OS {job.os_number}</span>
                      <span className="text-muted-foreground">{JOB_STATUS_LABELS[job.status]}</span>
                      <span className="text-muted-foreground">{fmt(job.scheduled_start)}</span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          );
        })
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {page + 1} / {Math.ceil(filtered.length / PAGE_SIZE)}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * PAGE_SIZE >= filtered.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
