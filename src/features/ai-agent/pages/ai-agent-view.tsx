import { useCallback, useMemo, useRef, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Presentation,
  Sparkles,
  Table2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/download";
import { planDocumentAgent } from "@/lib/ai-agent/plan.functions";
import { buildPowerBiCsv, buildPptx, buildTabelaCsv, buildXlsx } from "../builders";
import { enrichDataset, summarizeDataset, validateFile } from "../dataset";
import { runSpecTables, type TabelaResultado } from "../spec-runner";
import type { Dataset, Spec } from "../types";

type Etapa = "idle" | "lendo" | "pensando" | "gerando" | "pronto";

interface Artefato {
  id: string;
  nome: string;
  arquivo: string;
  icon: typeof FileSpreadsheet;
  blob: Blob;
  descricao: string;
}

const SUGESTOES = [
  "Monte um relatório executivo separando os chamados por equipe, prédio e andar, com um PowerPoint de apresentação para a diretoria.",
  "Quero uma planilha profissional com uma aba por equipe e um ranking dos prédios com mais chamados.",
  "Gere a base pronta para Power BI e slides com os gráficos de distribuição por categoria e por prédio.",
];

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "relatorio";

export function AiAgentView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [pedido, setPedido] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [progresso, setProgresso] = useState(0);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [tabelas, setTabelas] = useState<TabelaResultado[]>([]);
  const [artefatos, setArtefatos] = useState<Artefato[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const ocupado = etapa === "lendo" || etapa === "pensando" || etapa === "gerando";

  const selecionar = useCallback(async (f: File) => {
    const problema = validateFile(f);
    if (problema) {
      toast.error(problema);
      return;
    }
    setErro(null);
    setFile(f);
    setSpec(null);
    setTabelas([]);
    setArtefatos([]);
    setEtapa("lendo");
    setProgresso(20);
    try {
      const ds = await enrichDataset(f);
      setDataset(ds);
      setProgresso(100);
      setEtapa("idle");
      toast.success(
        `${ds.rows.length} linhas processadas • ${ds.resolvidos} ativos localizados na base`,
      );
    } catch (e) {
      setEtapa("idle");
      setDataset(null);
      setProgresso(0);
      const msg = e instanceof Error ? e.message : "Falha ao ler a planilha.";
      setErro(msg);
      toast.error(msg);
    }
  }, []);

  const limpar = () => {
    setFile(null);
    setDataset(null);
    setSpec(null);
    setTabelas([]);
    setArtefatos([]);
    setProgresso(0);
    setEtapa("idle");
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const gerar = async () => {
    if (!dataset) {
      toast.error("Anexe uma planilha de chamados primeiro.");
      return;
    }
    if (pedido.trim().length < 5) {
      toast.error("Descreva o que você precisa que o agente monte.");
      return;
    }
    setErro(null);
    setArtefatos([]);
    setEtapa("pensando");
    setProgresso(30);
    try {
      const { spec: plano } = await planDocumentAgent({
        data: { pedido: pedido.trim(), contexto: summarizeDataset(dataset) },
      });
      setSpec(plano);
      setEtapa("gerando");
      setProgresso(60);

      const resultados = runSpecTables(dataset, plano.tabelas);
      setTabelas(resultados);

      const base = slug(plano.titulo);
      const out: Artefato[] = [];

      if (plano.formatos.includes("xlsx")) {
        out.push({
          id: "xlsx",
          nome: "Planilha Excel",
          arquivo: `${base}.xlsx`,
          icon: FileSpreadsheet,
          blob: await buildXlsx(plano, resultados, dataset),
          descricao: `Resumo executivo, ${resultados.length} análises e base enriquecida.`,
        });
      }
      setProgresso(75);

      if (plano.formatos.includes("pptx")) {
        out.push({
          id: "pptx",
          nome: "Apresentação PowerPoint",
          arquivo: `${base}.pptx`,
          icon: Presentation,
          blob: await buildPptx(plano, resultados, dataset),
          descricao: `${plano.slides.length + 2} slides com gráficos e tabelas.`,
        });
      }
      setProgresso(85);

      if (plano.formatos.includes("pdf")) {
        out.push({
          id: "pdf",
          nome: "Relatório em PDF",
          arquivo: `${base}.pdf`,
          icon: FileText,
          blob: await buildPdf(plano, resultados, dataset),
          descricao: "Relatório executivo A4 com resumo, KPIs e todas as análises.",
        });
      }
      setProgresso(92);

      if (plano.formatos.includes("powerbi") || plano.formatos.includes("csv")) {
        out.push({
          id: "powerbi",
          nome: "Base para Power BI",
          arquivo: `${base}-powerbi.csv`,
          icon: Table2,
          blob: buildPowerBiCsv(dataset),
          descricao: "CSV UTF-8 (separador ;) pronto para importar no Power BI.",
        });
      }

      setArtefatos(out);
      setProgresso(100);
      setEtapa("pronto");
      toast.success("Documentos prontos para download.");
    } catch (e) {
      setEtapa("idle");
      setProgresso(0);
      const msg = e instanceof Error ? e.message : "Falha ao gerar os documentos.";
      setErro(msg);
      toast.error(msg);
    }
  };

  const statusTexto = useMemo(() => {
    switch (etapa) {
      case "lendo":
        return "Lendo a planilha e resolvendo prédios, andares e equipes…";
      case "pensando":
        return "O agente está planejando o relatório…";
      case "gerando":
        return "Montando os arquivos com o design corporativo…";
      case "pronto":
        return "Tudo pronto.";
      default:
        return null;
    }
  }, [etapa]);

  return (
    <PageShell
      eyebrow="Inteligência e BI"
      title="Agente de Documentos (IA)"
      description="Anexe a planilha de chamados, descreva o que precisa e o agente entrega Excel, PowerPoint e base para Power BI já com equipes, prédios e andares resolvidos pela inteligência de ativos."
      actions={
        file ? (
          <Button variant="outline" size="sm" onClick={limpar} disabled={ocupado}>
            <X className="mr-2 size-4" /> Recomeçar
          </Button>
        ) : null
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Upload */}
        <GlassCard className="space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">1. Planilha de chamados</h2>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void selecionar(f);
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={ocupado}
            className="flex min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center transition hover:border-primary/60 hover:bg-primary/10 disabled:opacity-60"
          >
            <FileSpreadsheet className="size-7 text-primary" />
            <span className="text-sm font-medium">
              {file ? file.name : "Toque para anexar .xlsx, .xls ou .csv"}
            </span>
            <span className="text-xs text-muted-foreground">Até 25 MB</span>
          </button>

          {dataset ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Kpi label="Linhas" value={dataset.rows.length} />
              <Kpi label="Ativos OK" value={dataset.resolvidos} tone="ok" />
              <Kpi label="Sem match" value={dataset.naoResolvidos} tone="warn" />
            </div>
          ) : null}
        </GlassCard>

        {/* Pedido */}
        <GlassCard className="space-y-4">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">2. O que você precisa?</h2>
          </div>

          <Textarea
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            disabled={ocupado}
            rows={5}
            placeholder="Ex.: Monte um relatório separando os chamados por equipe e prédio, com ranking dos andares críticos e uma apresentação para a reunião de segunda."
            className="min-h-[120px] resize-y text-sm"
          />

          <div className="flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={ocupado}
                onClick={() => setPedido(s)}
                className="rounded-full border border-border/60 bg-background/40 px-3 py-1 text-left text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              >
                {s.slice(0, 58)}…
              </button>
            ))}
          </div>

          <Button onClick={gerar} disabled={ocupado || !dataset} className="w-full">
            {ocupado ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            {ocupado ? "Processando…" : "Gerar documentos"}
          </Button>
        </GlassCard>
      </div>

      {statusTexto && etapa !== "pronto" ? (
        <GlassCard className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>{statusTexto}</span>
          </div>
          <Progress value={progresso} className="h-2" />
        </GlassCard>
      ) : null}

      {erro ? (
        <GlassCard className="border-destructive/40">
          <p className="text-sm text-destructive">{erro}</p>
        </GlassCard>
      ) : null}

      {spec && artefatos.length > 0 ? (
        <GlassCard variant="block" className="space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold break-words">{spec.titulo}</h2>
              {spec.subtitulo ? (
                <p className="text-xs text-muted-foreground break-words">{spec.subtitulo}</p>
              ) : null}
            </div>
          </div>

          {spec.resumo.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {spec.resumo.map((linha, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{linha}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {artefatos.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/50 p-4"
              >
                <div className="flex items-center gap-2">
                  <a.icon className="size-5 text-primary" />
                  <span className="text-sm font-semibold">{a.nome}</span>
                </div>
                <p className="text-xs text-muted-foreground break-words">{a.descricao}</p>
                <Button
                  size="sm"
                  className="mt-auto w-full"
                  onClick={() => downloadBlob(a.blob, a.arquivo)}
                >
                  <Download className="mr-2 size-4" /> Baixar
                </Button>
              </div>
            ))}
          </div>

          {tabelas.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Análises geradas</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {tabelas.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{t.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.rows.length} linhas • {t.headers.length} colunas
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadBlob(buildTabelaCsv(t), `${slug(t.nome)}.csv`)}
                    >
                      CSV
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {spec.observacoes ? (
            <p className="text-xs text-muted-foreground break-words">{spec.observacoes}</p>
          ) : null}
        </GlassCard>
      ) : null}
    </PageShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <Badge
        variant="outline"
        className={
          tone === "ok"
            ? "border-emerald-500/40 text-emerald-500"
            : tone === "warn"
              ? "border-amber-500/40 text-amber-500"
              : ""
        }
      >
        {value}
      </Badge>
    </div>
  );
}
