import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, FileSpreadsheet, Upload, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { readPreventivaFiles, type FileAlert, type ReadResult } from "@/lib/preventiva/reader";
import {
  EQUIPES_ORDEM,
  triage,
  equipesRelacionadas,
  EQUIPE_COLOR,
  type Equipe,
} from "@/lib/preventiva/triage";
import { sliceIntoWeeks, weeksUntilEndOfMonth } from "@/lib/preventiva/capacity";
import { generateWeeklyProgramacao } from "@/lib/preventiva/weekly-exporter";
import { generateBlankTemplate } from "@/lib/preventiva/blank-templates";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/programacao")({
  component: ProgramacaoPage,
});

interface GeneratedFile {
  id: string;
  filename: string;
  blob: Blob;
  week: number;
  equipe: Equipe;
  totalOS: number;
}

const TITULO_PADRAO = "SHERWIN WILLIAMS / DEMARCHI";

function ProgramacaoPage() {
  const [equipe, setEquipe] = useState<Equipe>("CIVIL");
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [generated, setGenerated] = useState<GeneratedFile[]>([]);
  const [alerts, setAlerts] = useState<FileAlert[]>([]);
  const [overflowMsg, setOverflowMsg] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<ReadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".xlsx"));
    if (arr.length === 0) return toast.error("Envie arquivos .xlsx");
    setFiles((prev) => [...prev, ...arr]);
  }, []);

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const generate = async () => {
    if (files.length === 0) return toast.error("Adicione ao menos um arquivo .xlsx");
    setReading(true);
    setOverflowMsg(null);
    setAlerts([]);
    try {
      const read = await readPreventivaFiles(files);
      setLastRead(read);
      setAlerts(read.alerts);

      const triaged = triage(read.rows);
      const equipesAlvo = equipesRelacionadas(equipe);
      const relevantes = triaged.filter((o) => equipesAlvo.includes(o.equipe));

      if (relevantes.length === 0) {
        toast.warning("Nenhuma OS encontrada para a equipe selecionada.");
        setReading(false);
        return;
      }

      const semanas = weeksUntilEndOfMonth(new Date());
      const out: GeneratedFile[] = [];
      let overflowTotal = 0;

      // Um arquivo por semana, contendo TODAS as equipes relacionadas juntas.
      // Fatiar cada equipe em semanas separadamente e reagrupar por semana.
      const porEquipeBuckets = new Map<
        Equipe,
        ReturnType<typeof sliceIntoWeeks>
      >();
      for (const eq of equipesAlvo) {
        const osEq = relevantes.filter((o) => o.equipe === eq);
        porEquipeBuckets.set(eq, sliceIntoWeeks(osEq, semanas));
      }

      for (let i = 0; i < semanas.length; i++) {
        const week = semanas[i];
        const bucketsPorEquipe = new Map<Equipe, ReturnType<typeof sliceIntoWeeks>["buckets"][number]>();
        let totalSemana = 0;
        for (const eq of equipesAlvo) {
          const sliced = porEquipeBuckets.get(eq);
          if (!sliced) continue;
          const b = sliced.buckets[i];
          if (b && b.os.length > 0) {
            bucketsPorEquipe.set(eq, b);
            totalSemana += b.os.length;
          }
        }
        if (totalSemana === 0) continue;
        const blob = await generateWeeklyProgramacao({
          titulo: TITULO_PADRAO,
          week,
          bucketsPorEquipe,
          ativoIndex: read.ativoIndex,
        });
        out.push({
          id: `${week.isoWeek}-${equipe}-${Date.now()}-${i}`,
          filename: `PROGRAMACAO_SEM${week.isoWeek}_${equipe.replace(/[^A-Z0-9]+/gi, "_")}.xlsx`,
          blob,
          week: week.isoWeek,
          equipe,
          totalOS: totalSemana,
        });
      }

      for (const eq of equipesAlvo) {
        overflowTotal += porEquipeBuckets.get(eq)?.overflow.length ?? 0;
      }
      if (overflowTotal > 0) {
        setOverflowMsg(
          `${overflowTotal} OS não cabem até o fim do mês com a capacidade atual — ficam para o próximo ciclo.`,
        );
      }

      setGenerated((prev) => [...out, ...prev]);
      toast.success(`${out.length} arquivo(s) semanal(is) gerado(s)`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao processar os arquivos");
    } finally {
      setReading(false);
    }
  };

  const downloadTemplate = async (titulo: string) => {
    try {
      const blob = await generateBlankTemplate(titulo);
      const slug = titulo.replace(/[^A-Z0-9]+/gi, "_");
      downloadBlob(blob, `TEMPLATE_${slug}.xlsx`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar template");
    }
  };

  const totalByCat = useMemo(() => lastRead?.porCategoria, [lastRead]);

  return (
    <PageShell
      title="Programação Semanal"
      description="Envie 1 ou N planilhas de preventivas — o sistema reclassifica, triaga e gera um arquivo por semana restante do mês."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadTemplate("GRUPO GPS")}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Template GPS
          </Button>
          <Button variant="outline" onClick={() => downloadTemplate(TITULO_PADRAO)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Template Sherwin
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Campo 1 — Enviar e gerar */}
        <GlassCard>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                1 · Enviar e gerar
              </h3>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Equipe</label>
              <Select value={equipe} onValueChange={(v) => setEquipe(v as Equipe)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPES_ORDEM.map((e) => (
                    <SelectItem key={e} value={e}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-sm"
                          style={{ background: EQUIPE_COLOR[e] }}
                        />
                        {e}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(equipe === "CIVIL" || equipe === "CHAVEIRO" || equipe === "HIDRÁULICA") && (
                <p className="text-[11px] text-muted-foreground">
                  Ao escolher Civil/Chaveiro/Hidráulica o sistema separa as 3 automaticamente.
                </p>
              )}
            </div>

            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFiles(e.dataTransfer.files);
              }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 p-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/30"
            >
              <div className="rounded-xl bg-primary/10 p-3">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Arraste 1..N planilhas .xlsx ou clique</p>
              <p className="text-xs text-muted-foreground">
                Nome do arquivo é ignorado — a Categoria é lida linha a linha.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                multiple
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-xs"
                  >
                    <span className="truncate">{f.name}</span>
                    <button onClick={() => removeFile(f.name)} className="opacity-60 hover:opacity-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={generate} disabled={reading || files.length === 0} className="w-full">
              {reading ? "Processando…" : `Gerar arquivos semanais`}
            </Button>

            {alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div
                    key={a.arquivo}
                    className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div>
                      <strong>{a.arquivo}</strong> foi enviado como{" "}
                      <em>{a.esperado}</em> mas contém {Math.round(a.percentual * 100)}% de{" "}
                      <em>{a.real}</em>. Os dados foram reclassificados automaticamente — confira antes de gerar.
                    </div>
                  </div>
                ))}
              </div>
            )}

            {overflowMsg && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
                {overflowMsg}
              </div>
            )}

            {totalByCat && (
              <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
                {Object.entries(totalByCat).map(([cat, n]) => (
                  <div key={cat} className="flex items-center justify-between text-[11px]">
                    <span className="truncate text-muted-foreground">{cat}</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {n}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Campo 2 — Downloads */}
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                2 · Arquivos gerados
              </h3>
              {generated.length > 0 && (
                <button
                  onClick={() => setGenerated([])}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>

            {generated.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 py-12 text-center text-muted-foreground">
                <FileSpreadsheet className="h-6 w-6" />
                <p className="text-xs">Nenhum arquivo gerado ainda.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {generated.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">Semana {f.week} · {f.equipe}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {f.totalOS} OS · {f.filename}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadBlob(f.blob, f.filename)}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}

