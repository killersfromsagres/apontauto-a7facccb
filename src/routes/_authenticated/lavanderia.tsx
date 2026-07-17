import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  Download,
  Search,
  Shirt,
  BarChart3,
  History,
  RefreshCw,
  Image as ImageIcon,
  ClipboardList,
  Trash2,
  ArrowUp,
  ChevronRight,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { supabase } from "@/integrations/supabase/client";
import {
  readMatrizFile,
  readMovimentacaoFile,
  type EventoRow,
  type MatrizRow,
} from "@/lib/lavanderia/reader";
import { computePecaStates, type PecaState, type PecaStatus } from "@/lib/lavanderia/crossing";
import {
  generateLavanderiaExport,
  type LavExportEvento,
  type LavExportPeca,
} from "@/lib/lavanderia/export";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/lavanderia")({
  component: LavanderiaPage,
});

interface ColabRow {
  matricula: string;
  nome: string;
  setor: string | null;
  tipo_peca_padrao: string | null;
}
interface PecaRow {
  codigo: string;
  matricula: string | null;
  tipo_peca: string;
  setor: string | null;
}
interface EvRow {
  codigo: string;
  tipo: "saida" | "entrada";
  data: string;
}

const STATUS_LABEL: Record<PecaStatus, string> = {
  em_higienizacao: "Em higienização",
  atrasada: "Atrasada",
  retornada: "Retornada",
};

const STATUS_BADGE: Record<PecaStatus, string> = {
  em_higienizacao: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  atrasada: "bg-red-500/15 text-red-600 dark:text-red-400",
  retornada: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

function fmtBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function LavanderiaPage() {
  const [colabs, setColabs] = useState<ColabRow[]>([]);
  const [pecas, setPecas] = useState<PecaRow[]>([]);
  const [eventos, setEventos] = useState<EvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState("abertas");

  const matrizInputRef = useRef<HTMLInputElement>(null);
  const movInputRef = useRef<HTMLInputElement>(null);

  interface ValidationIssue {
    level: "error" | "warning" | "info";
    message: string;
  }
  interface ValidationReport {
    origem: "Matriz" | "Movimentação";
    resumo: string[];
    issues: ValidationIssue[];
  }
  const [report, setReport] = useState<ValidationReport | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [c, p, e] = await Promise.all([
      supabase.from("lavanderia_colaboradores").select("matricula, nome, setor, tipo_peca_padrao"),
      supabase.from("lavanderia_pecas").select("codigo, matricula, tipo_peca, setor"),
      supabase.from("lavanderia_eventos").select("codigo, tipo, data").order("data"),
    ]);
    if (c.error || p.error || e.error) {
      toast.error("Falha ao carregar dados de lavanderia");
    }
    setColabs((c.data as ColabRow[]) ?? []);
    setPecas((p.data as PecaRow[]) ?? []);
    setEventos((e.data as EvRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---------- Estado computado ----------
  const colabByMat = useMemo(() => new Map(colabs.map((c) => [c.matricula, c])), [colabs]);
  const pecaByCodigo = useMemo(() => new Map(pecas.map((p) => [p.codigo, p])), [pecas]);

  const states = useMemo(() => computePecaStates(eventos), [eventos]);

  const pecasFull: LavExportPeca[] = useMemo(() => {
    const list: LavExportPeca[] = [];
    for (const [codigo, s] of states) {
      const peca = pecaByCodigo.get(codigo);
      const colab = peca?.matricula ? colabByMat.get(peca.matricula) : undefined;
      list.push({
        ...s,
        matricula: peca?.matricula ?? null,
        nome: colab?.nome ?? "Não cadastrado",
        tipoPeca: peca?.tipo_peca || "Não informado",
        setor: peca?.setor || colab?.setor || "Não informado",
      });
    }
    return list;
  }, [states, pecaByCodigo, colabByMat]);

  const totalHigienizacao = pecasFull.filter((p) => p.status === "em_higienizacao").length;
  const totalAtrasadas = pecasFull.filter((p) => p.status === "atrasada").length;
  const totalRetornadas = pecasFull.filter((p) => p.status === "retornada").length;

  // ---------- Importação ----------

  async function handleMatrizImport(file: File) {
    setImporting(true);
    try {
      const rows: MatrizRow[] = await readMatrizFile(file);
      const issues: ValidationIssue[] = [];
      if (rows.length === 0) {
        toast.warning("Nenhuma linha reconhecida na Matriz.");
        setReport({
          origem: "Matriz",
          resumo: ["A planilha não continha linhas com colaborador e código de barras válidos."],
          issues: [{ level: "error", message: "Verifique se a aba correta contém as colunas COLABORADOR e CODIGO BARRAS." }],
        });
        return;
      }

      const colabMap = new Map<string, { matricula: string; nome: string; setor: string | null }>();
      const codigoSeen = new Map<string, string>();
      const nomeParaMats = new Map<string, Set<string>>();
      const pecaRows: Array<{ codigo: string; matricula: string; setor: string | null }> = [];
      const duplicados: string[] = [];
      const contagemCat: Record<string, number> = { colaborador: 0, reserva: 0, visitante: 0, avulso: 0 };

      for (const r of rows) {
        // integridade básica
        if (!r.nome?.trim() || !r.codigo?.trim() || !r.matricula?.trim()) {
          issues.push({ level: "warning", message: `Linha ignorada por dados incompletos (codigo="${r.codigo}", nome="${r.nome}").` });
          continue;
        }
        if (!/^[A-Za-z0-9\-_.]+$/.test(r.codigo)) {
          issues.push({ level: "warning", message: `Código com caracteres suspeitos: "${r.codigo}".` });
        }
        const nomeK = r.nome.trim().toUpperCase();
        const set = nomeParaMats.get(nomeK) ?? new Set<string>();
        set.add(r.matricula);
        nomeParaMats.set(nomeK, set);

        if (!colabMap.has(r.matricula)) {
          colabMap.set(r.matricula, { matricula: r.matricula, nome: r.nome, setor: r.setor });
          contagemCat[r.categoria] = (contagemCat[r.categoria] ?? 0) + 1;
        }
        const prev = codigoSeen.get(r.codigo);
        if (prev && prev !== r.matricula) {
          duplicados.push(r.codigo);
          issues.push({ level: "warning", message: `Código "${r.codigo}" aparece para matrículas diferentes (${prev} e ${r.matricula}). Mantido o primeiro.` });
          continue;
        }
        codigoSeen.set(r.codigo, r.matricula);
        pecaRows.push({ codigo: r.codigo, matricula: r.matricula, setor: r.setor });
      }

      for (const [nome, mats] of nomeParaMats) {
        if (mats.size > 1) {
          issues.push({ level: "info", message: `"${nome}" aparece com ${mats.size} matrículas: ${Array.from(mats).join(", ")}.` });
        }
      }

      const colabPayload = Array.from(colabMap.values());
      for (let i = 0; i < colabPayload.length; i += 500) {
        const { error } = await supabase
          .from("lavanderia_colaboradores")
          .upsert(colabPayload.slice(i, i + 500), { onConflict: "matricula" });
        if (error) throw error;
      }
      for (let i = 0; i < pecaRows.length; i += 500) {
        const { error } = await supabase
          .from("lavanderia_pecas")
          .upsert(pecaRows.slice(i, i + 500), { onConflict: "codigo" });
        if (error) throw error;
      }

      const resumo = [
        `${contagemCat.colaborador} colaborador(es), ${contagemCat.reserva} reserva(s), ${contagemCat.visitante} visitante(s), ${contagemCat.avulso} avulso(s).`,
        `${pecaRows.length} código(s) de barras cadastrado(s).`,
        duplicados.length ? `${duplicados.length} código(s) duplicado(s) ignorado(s).` : "Sem códigos duplicados.",
      ];
      toast.success(`Matriz importada · ${resumo[0]}`, { duration: 6000 });
      setReport({ origem: "Matriz", resumo, issues });
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error((e as Error)?.message ?? "Falha ao importar Matriz");
    } finally {
      setImporting(false);
    }
  }

  async function handleMovImport(files: FileList | File[]) {
    setImporting(true);
    try {
      const all: EventoRow[] = [];
      for (const f of Array.from(files)) {
        const evs = await readMovimentacaoFile(f);
        all.push(...evs);
      }
      const issues: ValidationIssue[] = [];
      if (all.length === 0) {
        toast.warning("Nenhum evento reconhecido nos arquivos.");
        setReport({
          origem: "Movimentação",
          resumo: ["Nenhum evento reconhecido."],
          issues: [{ level: "error", message: "Confira se as colunas estão em pares Saída/Entrada com data na linha 2." }],
        });
        return;
      }

      // Validação de datas futuras e códigos inválidos
      const hoje = new Date().toISOString().slice(0, 10);
      let futuros = 0;
      for (const e of all) {
        if (e.data > hoje) futuros++;
      }
      if (futuros) issues.push({ level: "warning", message: `${futuros} evento(s) com data futura em relação a hoje.` });

      const seen = new Set<string>();
      const dedup = all.filter((e) => {
        const k = `${e.codigo}|${e.tipo}|${e.data}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const duplicadosArq = all.length - dedup.length;
      if (duplicadosArq) issues.push({ level: "info", message: `${duplicadosArq} evento(s) duplicado(s) dentro dos arquivos foram unificados.` });

      // Sequência lógica por código (2 saídas seguidas sem entrada)
      const porCodigo = new Map<string, EventoRow[]>();
      for (const e of dedup) {
        const arr = porCodigo.get(e.codigo) ?? [];
        arr.push(e);
        porCodigo.set(e.codigo, arr);
      }
      let seqQuebrada = 0;
      for (const [, arr] of porCodigo) {
        arr.sort((a, b) => a.data.localeCompare(b.data));
        let last: "saida" | "entrada" | null = null;
        for (const e of arr) {
          if (e.tipo === last) seqQuebrada++;
          last = e.tipo;
        }
      }
      if (seqQuebrada) issues.push({ level: "info", message: `${seqQuebrada} movimento(s) sem par correspondente (duas saídas ou duas entradas seguidas).` });

      const pecasSet = new Set(pecas.map((p) => p.codigo));
      const novasPecas = Array.from(new Set(dedup.map((e) => e.codigo))).filter((c) => !pecasSet.has(c));
      if (novasPecas.length) {
        issues.push({
          level: "warning",
          message: `${novasPecas.length} código(s) não estavam na Matriz e foram cadastrados sem colaborador: ${novasPecas.slice(0, 10).join(", ")}${novasPecas.length > 10 ? "…" : ""}.`,
        });
        for (let i = 0; i < novasPecas.length; i += 500) {
          const chunk = novasPecas.slice(i, i + 500).map((codigo) => ({ codigo }));
          const { error } = await supabase.from("lavanderia_pecas").upsert(chunk, { onConflict: "codigo" });
          if (error) throw error;
        }
      }

      let inseridos = 0;
      let ignorados = 0;
      for (let i = 0; i < dedup.length; i += 500) {
        const chunk = dedup.slice(i, i + 500);
        const { error, count } = await supabase
          .from("lavanderia_eventos")
          .upsert(chunk, { onConflict: "codigo,tipo,data", ignoreDuplicates: true, count: "exact" });
        if (error) throw error;
        const ins = count ?? 0;
        inseridos += ins;
        ignorados += chunk.length - ins;
      }

      const resumo = [
        `${inseridos} evento(s) novo(s) inserido(s).`,
        `${ignorados} evento(s) já existiam e foram ignorados.`,
        novasPecas.length ? `${novasPecas.length} código(s) novo(s) cadastrado(s).` : "Todos os códigos já constam na Matriz.",
      ];
      toast.success(`Movimentação importada · ${resumo[0]}`, { duration: 6000 });
      setReport({ origem: "Movimentação", resumo, issues });
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error((e as Error)?.message ?? "Falha ao importar movimentação");
    } finally {
      setImporting(false);
    }
  }

  async function downloadExcel() {
    const eventosFull: LavExportEvento[] = eventos.map((e) => {
      const peca = pecaByCodigo.get(e.codigo);
      const colab = peca?.matricula ? colabByMat.get(peca.matricula) : undefined;
      return {
        codigo: e.codigo,
        matricula: peca?.matricula ?? null,
        nome: colab?.nome ?? "Não cadastrado",
        tipo: e.tipo,
        data: e.data,
      };
    });
    const blob = await generateLavanderiaExport({ pecas: pecasFull, eventos: eventosFull });
    downloadBlob(blob, `LAVANDERIA_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const [clearing, setClearing] = useState(false);
  async function clearAll() {
    setClearing(true);
    try {
      const del1 = await supabase.from("lavanderia_eventos").delete().not("codigo", "is", null);
      if (del1.error) throw del1.error;
      const del2 = await supabase.from("lavanderia_pecas").delete().not("codigo", "is", null);
      if (del2.error) throw del2.error;
      const del3 = await supabase.from("lavanderia_colaboradores").delete().not("matricula", "is", null);
      if (del3.error) throw del3.error;
      toast.success("Conteúdo da lavanderia apagado com sucesso.");
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error((e as Error)?.message ?? "Falha ao limpar conteúdo");
    } finally {
      setClearing(false);
    }
  }

  return (
    <PageShell
      title="Controle de Lavanderia"
      description="Importe os relatórios de coleta (Elis Jaboatão) e acompanhe o giro de peças, atrasos e histórico por colaborador."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => matrizInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-2 h-4 w-4" /> Importar Matriz
          </Button>
          <Button variant="outline" onClick={() => movInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-2 h-4 w-4" /> Importar Movimentação
          </Button>
          <Button onClick={downloadExcel} disabled={pecasFull.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Baixar planilha Excel
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={clearing || importing}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {clearing ? "Limpando…" : "Limpar conteúdo"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar todo o conteúdo da lavanderia?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove permanentemente a matriz de colaboradores, as peças cadastradas
                  e todo o histórico de movimentação. Não é possível desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void clearAll()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sim, apagar tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" size="icon" onClick={() => void refresh()} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <input
            ref={matrizInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleMatrizImport(f);
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={movInputRef}
            type="file"
            accept=".xlsx"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = e.target.files;
              if (fs && fs.length) void handleMovImport(fs);
              e.currentTarget.value = "";
            }}
          />
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full lavanderia-scroll-scope">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="abertas">
            <Shirt className="mr-1.5 h-3.5 w-3.5" /> Em aberto
            <Badge variant="secondary" className="ml-2">
              {totalHigienizacao + totalAtrasadas}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="matriz">
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Matriz
            <Badge variant="secondary" className="ml-2">
              {colabs.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="historico">
            <History className="mr-1.5 h-3.5 w-3.5" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="giro">
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Giro
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abertas">
          <AbertasView loading={loading} pecas={pecasFull} />
        </TabsContent>

        <TabsContent value="matriz">
          <MatrizView colabs={colabs} pecas={pecas} />
        </TabsContent>

        <TabsContent value="historico">
          <HistoricoView eventos={eventos} pecaByCodigo={pecaByCodigo} colabByMat={colabByMat} />
        </TabsContent>

        <TabsContent value="giro">
          <GiroView pecas={pecasFull} />
        </TabsContent>

        <TabsContent value="dashboard">
          <DashboardView
            eventos={eventos}
            pecaByCodigo={pecaByCodigo}
            colabByMat={colabByMat}
          />
        </TabsContent>

      </Tabs>

      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {report && report.issues.some((i) => i.level === "error") ? (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              )}
              Verificação de {report?.origem}
            </DialogTitle>
            <DialogDescription>
              Relatório inteligente da última importação — revise antes de tomar decisões operacionais.
            </DialogDescription>
          </DialogHeader>
          {report && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Resumo
                </div>
                <ul className="space-y-1 text-sm">
                  {report.resumo.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Diagnóstico ({report.issues.length})
                </div>
                {report.issues.length === 0 ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                    Nenhuma inconsistência detectada. Dados prontos para uso.
                  </div>
                ) : (
                  <ScrollArea className="h-64 rounded-xl border border-border/60">
                    <ul className="divide-y divide-border/50">
                      {report.issues.map((it, i) => {
                        const color =
                          it.level === "error"
                            ? "text-red-600 dark:text-red-400"
                            : it.level === "warning"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-sky-600 dark:text-sky-400";
                        return (
                          <li key={i} className="flex gap-2 px-3 py-2 text-sm">
                            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                            <span>{it.message}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setReport(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ---------------- Abertas ----------------

function AbertasView({ loading, pecas }: { loading: boolean; pecas: LavExportPeca[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todas" | "atrasada" | "em_higienizacao">("todas");
  const [foraDoGiro, setForaDoGiro] = useState(false);

  const colabsAtrasados = useMemo(() => {
    const s = new Set<string>();
    for (const p of pecas) if (p.status === "atrasada" && p.matricula) s.add(p.matricula);
    return s;
  }, [pecas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pecas
      .filter((p) => p.status !== "retornada")
      .filter((p) => (statusFilter === "todas" ? true : p.status === statusFilter))
      .filter((p) => (foraDoGiro ? p.matricula && colabsAtrasados.has(p.matricula) : true))
      .filter(
        (p) =>
          !q ||
          p.codigo.toLowerCase().includes(q) ||
          p.nome.toLowerCase().includes(q) ||
          (p.matricula ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => (b.diasAtraso || 0) - (a.diasAtraso || 0));
  }, [pecas, search, statusFilter, foraDoGiro, colabsAtrasados]);

  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, colaborador ou matrícula…"
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas em aberto</SelectItem>
            <SelectItem value="em_higienizacao">Em higienização</SelectItem>
            <SelectItem value="atrasada">Atrasadas</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={foraDoGiro ? "default" : "outline"}
          size="sm"
          onClick={() => setForaDoGiro((v) => !v)}
        >
          Fora do giro
        </Button>
      </div>

      <div className="lavanderia-scroll relative max-h-[65vh] overflow-auto rounded-xl border border-border/60 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-background/95 [&_thead_th]:backdrop-blur">

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead>Previsto retorno</TableHead>
              <TableHead>Dias atraso</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma peça em aberto.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.codigo}>
                  <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                  <TableCell>
                    <div className="font-medium">{p.nome}</div>
                    {p.matricula && (
                      <div className="text-xs text-muted-foreground">Mat. {p.matricula}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{p.tipoPeca}</TableCell>
                  <TableCell className="text-sm">{fmtBR(p.ultimaSaida)}</TableCell>
                  <TableCell className="text-sm">{fmtBR(p.previstoRetorno)}</TableCell>
                  <TableCell className="text-sm font-semibold">
                    {p.status === "atrasada" ? `${p.diasAtraso}d` : "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

// ---------------- Histórico ----------------

function HistoricoView({
  eventos,
  pecaByCodigo,
  colabByMat,
}: {
  eventos: EvRow[];
  pecaByCodigo: Map<string, PecaRow>;
  colabByMat: Map<string, ColabRow>;
}) {
  const [query, setQuery] = useState("");
  const [movFilter, setMovFilter] = useState<"todos" | "saida" | "entrada">("todos");

  const emAberto = useMemo(() => {
    // Códigos com saída pendente (sem entrada posterior)
    const map = new Map<string, "saida" | "entrada">();
    const sorted = [...eventos].sort((a, b) => a.data.localeCompare(b.data));
    for (const e of sorted) map.set(e.codigo, e.tipo);
    let s = 0;
    for (const v of map.values()) if (v === "saida") s++;
    return s;
  }, [eventos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = eventos.filter((e) => (movFilter === "todos" ? true : e.tipo === movFilter));
    const searched = !q
      ? base
      : base.filter((e) => {
          const p = pecaByCodigo.get(e.codigo);
          const c = p?.matricula ? colabByMat.get(p.matricula) : undefined;
          return (
            e.codigo.toLowerCase().includes(q) ||
            (c?.nome ?? "").toLowerCase().includes(q) ||
            (p?.matricula ?? "").toLowerCase().includes(q)
          );
        });
    return searched.slice(-500).reverse();
  }, [eventos, query, pecaByCodigo, colabByMat, movFilter]);

  const totalSaidas = eventos.filter((e) => e.tipo === "saida").length;
  const totalEntradas = eventos.filter((e) => e.tipo === "entrada").length;

  return (
    <GlassCard>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          onClick={() => setMovFilter("todos")}
          className={`rounded-xl border p-3 text-left transition ${
            movFilter === "todos"
              ? "border-primary/60 bg-primary/5 ring-2 ring-primary"
              : "border-border/60 hover:bg-muted/40"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Em aberto</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{emAberto}</span>
            <span className="text-xs text-muted-foreground">peças sem retorno</span>
          </div>
        </button>
        <button
          onClick={() => setMovFilter("saida")}
          className={`rounded-xl border p-3 text-left transition ${
            movFilter === "saida"
              ? "border-amber-500/60 bg-amber-500/10 ring-2 ring-amber-500"
              : "border-border/60 hover:bg-muted/40"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <ArrowUpCircle className="h-3.5 w-3.5" /> Saídas
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {totalSaidas}
          </div>
        </button>
        <button
          onClick={() => setMovFilter("entrada")}
          className={`rounded-xl border p-3 text-left transition ${
            movFilter === "entrada"
              ? "border-emerald-500/60 bg-emerald-500/10 ring-2 ring-emerald-500"
              : "border-border/60 hover:bg-muted/40"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <ArrowDownCircle className="h-3.5 w-3.5" /> Entradas
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {totalEntradas}
          </div>
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar código ou colaborador…"
            className="pl-8"
          />
        </div>
        <Select value={movFilter} onValueChange={(v) => setMovFilter(v as typeof movFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os movimentos</SelectItem>
            <SelectItem value="saida">Somente saídas</SelectItem>
            <SelectItem value="entrada">Somente entradas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="lavanderia-scroll relative max-h-[65vh] overflow-auto rounded-xl border border-border/60 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-background/95 [&_thead_th]:backdrop-blur">

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Movimento</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Colaborador</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum evento.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e, i) => {
                const p = pecaByCodigo.get(e.codigo);
                const c = p?.matricula ? colabByMat.get(p.matricula) : undefined;
                return (
                  <TableRow key={`${e.codigo}-${e.tipo}-${e.data}-${i}`}>
                    <TableCell className="text-sm">{fmtBR(e.data)}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          e.tipo === "saida"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {e.tipo === "saida" ? "Saída" : "Entrada"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.codigo}</TableCell>
                    <TableCell className="text-sm">{c?.nome ?? "Não cadastrado"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

// ---------------- Giro ----------------

function GiroView({ pecas }: { pecas: LavExportPeca[] }) {
  const [modo, setModo] = useState<"colaborador" | "tipo" | "setor" | "peca">("colaborador");

  const rows = useMemo(() => {
    if (modo === "peca") {
      return pecas
        .map((p) => ({ chave: p.codigo, extra: p.nome, giro: p.giro }))
        .sort((a, b) => b.giro - a.giro);
    }
    const bucket = new Map<string, number>();
    for (const p of pecas) {
      const key =
        modo === "colaborador"
          ? p.nome + (p.matricula ? ` · ${p.matricula}` : "")
          : modo === "tipo"
            ? p.tipoPeca || "Não informado"
            : p.setor || "Não informado";
      bucket.set(key, (bucket.get(key) ?? 0) + p.giro);
    }
    return Array.from(bucket.entries())
      .map(([chave, giro]) => ({ chave, extra: "", giro }))
      .sort((a, b) => b.giro - a.giro);
  }, [pecas, modo]);

  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="colaborador">Por colaborador</SelectItem>
            <SelectItem value="tipo">Por tipo de peça</SelectItem>
            <SelectItem value="setor">Por setor</SelectItem>
            <SelectItem value="peca">Por peça</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="lavanderia-scroll relative max-h-[65vh] overflow-auto rounded-xl border border-border/60 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-background/95 [&_thead_th]:backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {modo === "peca"
                  ? "Código"
                  : modo === "colaborador"
                    ? "Colaborador"
                    : modo === "tipo"
                      ? "Tipo da peça"
                      : "Setor"}
              </TableHead>
              {modo === "peca" && <TableHead>Colaborador</TableHead>}
              <TableHead>Giro (ciclos)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={modo === "peca" ? 3 : 2} className="py-8 text-center text-sm text-muted-foreground">
                  Sem dados.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.chave}>
                  <TableCell className={modo === "peca" ? "font-mono text-xs" : ""}>{r.chave}</TableCell>
                  {modo === "peca" && <TableCell className="text-sm">{r.extra}</TableCell>}
                  <TableCell className="font-semibold">{r.giro}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

// ---------------- Dashboard ----------------

const PIE_COLORS = ["#2B3095", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

type PeriodoTipo = "tudo" | "semana" | "mes" | "custom";

function DashboardView({
  eventos,
  pecaByCodigo,
  colabByMat,
}: {
  eventos: EvRow[];
  pecaByCodigo: Map<string, PecaRow>;
  colabByMat: Map<string, ColabRow>;
}) {
  const dashRef = useRef<HTMLDivElement>(null);
  const [periodo, setPeriodo] = useState<PeriodoTipo>("tudo");
  const [dtInicio, setDtInicio] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");

  const range = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toISO = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    if (periodo === "semana") {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { ini: toISO(start), fim: toISO(today) };
    }
    if (periodo === "mes") {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { ini: toISO(start), fim: toISO(today) };
    }
    if (periodo === "custom" && dtInicio && dtFim) {
      return { ini: dtInicio, fim: dtFim };
    }
    return null;
  }, [periodo, dtInicio, dtFim]);

  const eventosFiltrados = useMemo(() => {
    if (!range) return eventos;
    return eventos.filter((e) => e.data >= range.ini && e.data <= range.fim);
  }, [eventos, range]);

  const states = useMemo(() => computePecaStates(eventosFiltrados), [eventosFiltrados]);

  const pecas: LavExportPeca[] = useMemo(() => {
    const list: LavExportPeca[] = [];
    for (const [codigo, s] of states) {
      const peca = pecaByCodigo.get(codigo);
      const colab = peca?.matricula ? colabByMat.get(peca.matricula) : undefined;
      list.push({
        ...s,
        matricula: peca?.matricula ?? null,
        nome: colab?.nome ?? "Não cadastrado",
        tipoPeca: peca?.tipo_peca || "Não informado",
        setor: peca?.setor || colab?.setor || "Não informado",
      });
    }
    return list;
  }, [states, pecaByCodigo, colabByMat]);

  const totalHigienizacao = pecas.filter((p) => p.status === "em_higienizacao").length;
  const totalAtrasadas = pecas.filter((p) => p.status === "atrasada").length;
  const totalRetornadas = pecas.filter((p) => p.status === "retornada").length;

  const foraGiroCount = useMemo(
    () => pecas.filter((p) => p.status === "atrasada" && p.diasAtraso > 7).length,
    [pecas],
  );


  const giroColaborador = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pecas) m.set(p.nome, (m.get(p.nome) ?? 0) + p.giro);
    return Array.from(m.entries())
      .map(([nome, giro]) => ({ nome, giro }))
      .sort((a, b) => b.giro - a.giro)
      .slice(0, 10);
  }, [pecas]);

  const giroTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pecas) {
      const k = p.tipoPeca || "Não informado";
      m.set(k, (m.get(k) ?? 0) + p.giro);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [pecas]);

  const giroSetor = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pecas) {
      const k = p.setor || "Não informado";
      m.set(k, (m.get(k) ?? 0) + p.giro);
    }
    return Array.from(m.entries()).map(([setor, giro]) => ({ setor, giro }));
  }, [pecas]);

  const [movView, setMovView] = useState<"ambos" | "saida" | "entrada">("ambos");

  const movTimeline = useMemo(() => {
    const map = new Map<string, { data: string; saidas: number; entradas: number }>();
    for (const e of eventosFiltrados) {
      const cur = map.get(e.data) ?? { data: e.data, saidas: 0, entradas: 0 };
      if (e.tipo === "saida") cur.saidas++;
      else cur.entradas++;
      map.set(e.data, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((r) => ({ ...r, label: fmtBR(r.data) }));
  }, [eventosFiltrados]);

  const porCategoria = useMemo(() => {
    const cats: Array<Exclude<CategoriaFiltro, "todas">> = [
      "colaborador",
      "reserva",
      "visitante",
      "avulso",
    ];
    const base = Object.fromEntries(
      cats.map((k) => [k, { categoria: CAT_LABEL[k], giro: 0, emAberto: 0, saidas: 0, entradas: 0 }]),
    ) as Record<Exclude<CategoriaFiltro, "todas">, { categoria: string; giro: number; emAberto: number; saidas: number; entradas: number }>;
    for (const p of pecas) {
      const cat = p.matricula ? classifyMatricula(p.matricula, p.setor) : "avulso";
      base[cat].giro += p.giro;
      if (p.status !== "retornada") base[cat].emAberto++;
    }
    for (const e of eventosFiltrados) {
      const peca = pecaByCodigo.get(e.codigo);
      const cat = peca?.matricula ? classifyMatricula(peca.matricula, peca.setor) : "avulso";
      if (e.tipo === "saida") base[cat].saidas++;
      else base[cat].entradas++;
    }
    return cats.map((k) => base[k]);
  }, [pecas, eventosFiltrados, pecaByCodigo]);


  async function downloadPNG() {
    if (!dashRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(dashRef.current, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `LAVANDERIA_DASHBOARD_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar imagem do dashboard");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoTipo)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tudo">Todo o período</SelectItem>
              <SelectItem value="semana">Últimos 7 dias</SelectItem>
              <SelectItem value="mes">Últimos 30 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {periodo === "custom" && (
            <>
              <Input
                type="date"
                value={dtInicio}
                onChange={(e) => setDtInicio(e.target.value)}
                className="w-[160px]"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                value={dtFim}
                onChange={(e) => setDtFim(e.target.value)}
                className="w-[160px]"
              />
            </>
          )}
          {range && (
            <span className="text-xs text-muted-foreground">
              {fmtBR(range.ini)} — {fmtBR(range.fim)}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={downloadPNG}>
          <ImageIcon className="mr-2 h-4 w-4" /> Baixar PNG
        </Button>
      </div>



      <div ref={dashRef} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Em higienização" value={totalHigienizacao} tone="amber" />
          <StatCard label="Retornadas" value={totalRetornadas} tone="emerald" />
          <StatCard label="Atrasadas" value={totalAtrasadas} tone="red" />
          <StatCard label="Fora do giro (>7d)" value={foraGiroCount} tone="red" />
        </div>

        <GlassCard>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Movimentações no período</h3>
              <p className="text-xs text-muted-foreground">
                Entradas e saídas registradas — selecione para comparar ou isolar cada fluxo.
              </p>
            </div>
            <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
              {(["ambos", "saida", "entrada"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setMovView(v)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    movView === v
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "ambos" ? "Ambos" : v === "saida" ? "Saídas" : "Entradas"}
                </button>
              ))}
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={movTimeline} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
                <defs>
                  <linearGradient id="gSai" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="gEnt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  angle={-30}
                  textAnchor="end"
                  height={54}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    color: "#111827",
                    fontSize: 12,
                    boxShadow: "0 8px 24px -6px rgba(0,0,0,0.15)",
                  }}
                  labelStyle={{ color: "#111827", fontWeight: 600 }}
                  itemStyle={{ color: "#111827" }}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Legend />
                {(movView === "ambos" || movView === "saida") && (
                  <Bar dataKey="saidas" name="Saídas" fill="url(#gSai)" radius={[4, 4, 0, 0]} />
                )}
                {(movView === "ambos" || movView === "entrada") && (
                  <Bar dataKey="entradas" name="Entradas" fill="url(#gEnt)" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="mb-1 text-sm font-semibold">Desempenho por categoria</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Comparativo consolidado entre Colaborador, Reserva, Visitante e Avulso.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {porCategoria.map((c, i) => (
              <div
                key={c.categoria}
                className="rounded-xl border border-border/60 bg-gradient-to-br from-background to-muted/40 p-3"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {c.categoria}
                  </div>
                </div>
                <div className="mt-1 text-2xl font-bold">{c.giro}</div>
                <div className="text-[11px] text-muted-foreground">ciclos concluídos</div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-amber-600 dark:text-amber-400">↑ {c.saidas}</span>
                  <span className="text-emerald-600 dark:text-emerald-400">↓ {c.entradas}</span>
                  <span className="text-muted-foreground">Aberto {c.emAberto}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porCategoria} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="saidas" name="Saídas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="giro" name="Giro (ciclos)" fill="#2B3095" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>



        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GlassCard>
            <h3 className="mb-2 text-sm font-semibold">Giro por colaborador (top 10)</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={giroColaborador} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="giro" fill="#2B3095" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="mb-2 text-sm font-semibold">Giro por tipo de peça</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={giroTipo} dataKey="value" nameKey="name" outerRadius={90} label>
                    {giroTipo.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold">Giro por setor</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={giroSetor} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="setor" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="giro" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "red";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "emerald"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";
  return (
    <GlassCard>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${toneCls}`}>{value}</div>
    </GlassCard>
  );
}

// ---------------- Matriz ----------------

type CategoriaFiltro = "todas" | "colaborador" | "reserva" | "visitante" | "avulso";

function classifyMatricula(
  matricula: string,
  setor: string | null,
): Exclude<CategoriaFiltro, "todas"> {
  if (matricula.startsWith("RESERVA__")) return "reserva";
  if (matricula.startsWith("VISITANTE__")) return "visitante";
  if (matricula.startsWith("AVULSO__")) return "avulso";
  if (/^\d{3,}$/.test(matricula)) return "colaborador";
  // Fallback via setor conhecido
  const s = (setor ?? "").toLowerCase();
  if (s.includes("reserva")) return "reserva";
  if (s.includes("visitante")) return "visitante";
  if (s) return "avulso";
  return "colaborador";
}

const CAT_LABEL: Record<Exclude<CategoriaFiltro, "todas">, string> = {
  colaborador: "Colaborador",
  reserva: "Reserva",
  visitante: "Visitante",
  avulso: "Avulso",
};

const CAT_BADGE: Record<Exclude<CategoriaFiltro, "todas">, string> = {
  colaborador: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  reserva: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  visitante: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  avulso: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function MatrizView({ colabs, pecas }: { colabs: ColabRow[]; pecas: PecaRow[] }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<CategoriaFiltro>("todas");

  const pecasPorMat = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of pecas) {
      if (!p.matricula) continue;
      const arr = m.get(p.matricula) ?? [];
      arr.push(p.codigo);
      m.set(p.matricula, arr);
    }
    return m;
  }, [pecas]);

  const enriched = useMemo(
    () =>
      colabs.map((c) => ({
        ...c,
        categoria: classifyMatricula(c.matricula, c.setor),
        totalPecas: pecasPorMat.get(c.matricula)?.length ?? 0,
      })),
    [colabs, pecasPorMat],
  );

  const counts = useMemo(() => {
    const acc = { colaborador: 0, reserva: 0, visitante: 0, avulso: 0 };
    for (const r of enriched) acc[r.categoria]++;
    return acc;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter((r) => (cat === "todas" ? true : r.categoria === cat))
      .filter(
        (r) =>
          !q ||
          r.nome.toLowerCase().includes(q) ||
          r.matricula.toLowerCase().includes(q) ||
          (r.setor ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [enriched, search, cat]);

  return (
    <GlassCard>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(counts) as Array<keyof typeof counts>).map((k) => (
          <button
            key={k}
            onClick={() => setCat(k)}
            className={`rounded-xl border border-border/60 p-3 text-left transition ${
              cat === k ? "ring-2 ring-primary" : "hover:bg-muted/40"
            }`}
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {CAT_LABEL[k]}
            </div>
            <div className="mt-1 text-2xl font-bold">{counts[k]}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, matrícula ou setor…"
            className="pl-8"
          />
        </div>
        <Select value={cat} onValueChange={(v) => setCat(v as CategoriaFiltro)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            <SelectItem value="colaborador">Colaboradores</SelectItem>
            <SelectItem value="reserva">Reservas</SelectItem>
            <SelectItem value="visitante">Visitantes</SelectItem>
            <SelectItem value="avulso">Avulsos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="lavanderia-scroll relative max-h-[65vh] overflow-auto rounded-xl border border-border/60 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-background/95 [&_thead_th]:backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">Nome / Item</TableHead>
              <TableHead className="text-center">Matrícula</TableHead>
              <TableHead className="text-center">Categoria</TableHead>
              <TableHead className="text-center">Setor</TableHead>
              <TableHead className="text-center">Códigos de barras</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                let displayNome = r.nome;
                let displayMat: string = r.categoria === "colaborador" ? r.matricula : "—";
                if (r.categoria !== "colaborador") {
                  const m = r.nome.match(/^(.*)\s[-–—]\s([^-–—]+)\s*$/);
                  if (m) {
                    displayNome = m[1].trim();
                    displayMat = m[2].trim();
                  }
                }
                return (
                  <TableRow key={r.matricula}>
                    <TableCell className="text-center font-medium">{displayNome}</TableCell>
                    <TableCell className="text-center font-mono text-xs">{displayMat}</TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${CAT_BADGE[r.categoria]}`}
                      >
                        {CAT_LABEL[r.categoria]}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm">{r.setor ?? "—"}</TableCell>
                    <TableCell className="text-center font-semibold">{r.totalPecas}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}
