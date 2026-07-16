import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  Download,
  RefreshCw,
  ExternalLink,
  PackageX,
  Database,
  ArrowUpDown,
  BarChart3,
  Search,
  AlertTriangle,
  Flame,
  Settings2,
  Printer,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Trash2,
  Plus,
} from "lucide-react";
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
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { readAssetsFile, readBackorderFile, type BackorderRow } from "@/lib/backorder/reader";
import { makeAssetsMap } from "@/lib/backorder/assets";
import {
  CATEGORIAS,
  CATEGORIA_COLOR,
  CATEGORIA_TO_EQUIPE,
  type Categoria,
} from "@/lib/backorder/classify";
import { generateBackorderExport } from "@/lib/backorder/export";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/backorder")({
  component: BackorderPage,
});

interface BOSRow {
  os: string;
  nome: string;
  ativo: string;
  predio: string;
  andar: string;
  espaco: string;
  atividade: string;
  atividade_manual: boolean;
  equipe: string;
  termino_sla: string | null;
  data_solicitacao: string;
  outros: string;
  finalizado: boolean;
  data_finalizacao: string | null;
}

const POWERBI_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiNDhjOGJiZjMtYWM0YS00MGUyLTkyYzItMDgyMzM5OTMxNThmIiwidCI6IjQyODUyNWQ5LTIzYmQtNGY4Yy1hZmEyLTU2MDBmNDAxZjMyNiJ9";

const TARGET_PCT_DEFAULT = 5;

function daysBetween(iso: string): number {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}

function BackorderPage() {
  const [rows, setRows] = useState<BOSRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tabela");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("__all__");
  const [importing, setImporting] = useState(false);
  const backorderInputRef = useRef<HTMLInputElement>(null);
  const assetsInputRef = useRef<HTMLInputElement>(null);
  const targetPct = TARGET_PCT_DEFAULT;

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("backorder_os")
      .select("*")
      .order("data_solicitacao", { ascending: true });
    if (error) toast.error("Falha ao carregar backorder");
    setRows((data as BOSRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const abertas = useMemo(() => rows.filter((r) => !r.finalizado), [rows]);
  const finalizadas = useMemo(() => rows.filter((r) => r.finalizado), [rows]);

  // Backorder = abertas com mais de 30 dias corridos
  const backorderAbertas = useMemo(
    () => abertas.filter((r) => daysBetween(r.data_solicitacao) > 30),
    [abertas],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = abertas.filter((r) => {
      if (filterCat !== "__all__" && r.atividade !== filterCat) return false;
      if (!q) return true;
      return (
        r.os.toLowerCase().includes(q) ||
        r.nome.toLowerCase().includes(q) ||
        r.ativo.toLowerCase().includes(q) ||
        r.predio.toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      const da = new Date(a.data_solicitacao).getTime();
      const db = new Date(b.data_solicitacao).getTime();
      return order === "asc" ? da - db : db - da;
    });
    return list;
  }, [abertas, search, filterCat, order]);

  // ----- Importação -----

  async function handleBackorderImport(file: File) {
    setImporting(true);
    try {
      // 1) carrega assets_ref inteiro em memória
      const { data: assetsRaw, error: assetsErr } = await supabase
        .from("assets_ref")
        .select("ativo, denominacao");
      if (assetsErr) throw assetsErr;
      const assetsMap = makeAssetsMap((assetsRaw as Array<{ ativo: string; denominacao: string }>) ?? []);

      const parsed = await readBackorderFile(file, assetsMap);
      if (parsed.length === 0) {
        toast.warning("Nenhuma OS reconhecida na planilha.");
        return;
      }

      // Overrides manuais persistidos (Atividade corrigida à mão)
      const { data: overrides } = await supabase
        .from("backorder_atividade_override")
        .select("os, atividade");
      const overrideMap = new Map<string, string>();
      (overrides ?? []).forEach((o: any) => overrideMap.set(o.os, o.atividade));

      // Preserva "finalizado" local (nunca reabrir automaticamente por reimport)
      const { data: existing } = await supabase
        .from("backorder_os")
        .select("os, finalizado, atividade_manual, atividade, equipe, data_finalizacao");
      const existMap = new Map<string, any>();
      (existing ?? []).forEach((e: any) => existMap.set(e.os, e));

      let novas = 0;
      let atualizadas = 0;
      let ignoradas = 0;

      const toUpsert: BackorderRow[] = [];
      for (const r of parsed) {
        const prev = existMap.get(r.os);
        // Se já está finalizado localmente, ignora reimport (mas garante upsert com finalizado=true)
        if (prev?.finalizado) {
          ignoradas++;
          continue;
        }
        const override = overrideMap.get(r.os);
        const atividade = (override as Categoria | undefined) ?? (prev?.atividade_manual ? prev.atividade : r.atividade);
        const equipe = override
          ? CATEGORIA_TO_EQUIPE[override as Categoria]
          : prev?.atividade_manual
            ? prev.equipe
            : r.equipe;
        toUpsert.push({
          ...r,
          atividade: atividade as Categoria,
          equipe,
        });
        if (prev) atualizadas++;
        else novas++;
      }

      // Upsert em lotes de 500
      for (let i = 0; i < toUpsert.length; i += 500) {
        const chunk = toUpsert.slice(i, i + 500).map((r) => ({
          os: r.os,
          nome: r.nome,
          ativo: r.ativo,
          predio: r.predio,
          andar: r.andar,
          espaco: r.espaco,
          atividade: r.atividade,
          atividade_manual: !!overrideMap.get(r.os),
          equipe: r.equipe,
          termino_sla: r.termino_sla,
          data_solicitacao: r.data_solicitacao,
          outros: r.outros,
        }));
        const { error } = await supabase.from("backorder_os").upsert(chunk, { onConflict: "os" });
        if (error) throw error;
      }

      toast.success(
        `Importado: ${novas} nova(s), ${atualizadas} atualizada(s), ${ignoradas} ignorada(s).`,
      );
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao importar planilha");
    } finally {
      setImporting(false);
    }
  }

  async function handleAssetsImport(file: File) {
    setImporting(true);
    try {
      const parsed = await readAssetsFile(file);
      if (parsed.length === 0) {
        toast.warning("Nenhum ativo reconhecido na planilha.");
        return;
      }
      for (let i = 0; i < parsed.length; i += 1000) {
        const chunk = parsed.slice(i, i + 1000);
        const { error } = await supabase.from("assets_ref").upsert(chunk, { onConflict: "ativo" });
        if (error) throw error;
      }
      toast.success(`Base de Ativos atualizada: ${parsed.length} registros.`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao importar Ativos");
    } finally {
      setImporting(false);
    }
  }

  async function toggleFinalizado(r: BOSRow, next: boolean) {
    const { error } = await supabase
      .from("backorder_os")
      .update({
        finalizado: next,
        data_finalizacao: next ? new Date().toISOString() : null,
      })
      .eq("os", r.os);
    if (error) return toast.error("Falha ao atualizar");
    setRows((prev) =>
      prev.map((x) =>
        x.os === r.os
          ? { ...x, finalizado: next, data_finalizacao: next ? new Date().toISOString() : null }
          : x,
      ),
    );
  }

  async function updateAtividade(r: BOSRow, atividade: Categoria) {
    const equipe = CATEGORIA_TO_EQUIPE[atividade];
    const { error } = await supabase
      .from("backorder_os")
      .update({ atividade, atividade_manual: true, equipe })
      .eq("os", r.os);
    if (error) return toast.error("Falha ao atualizar categoria");
    await supabase
      .from("backorder_atividade_override")
      .upsert({ os: r.os, atividade }, { onConflict: "os" });
    setRows((prev) =>
      prev.map((x) => (x.os === r.os ? { ...x, atividade, atividade_manual: true, equipe } : x)),
    );
  }

  async function exportar() {
    const rowsExp: BackorderRow[] = filtered.map((r) => ({
      os: r.os,
      nome: r.nome,
      ativo: r.ativo,
      predio: r.predio,
      andar: r.andar,
      espaco: r.espaco,
      atividade: r.atividade as Categoria,
      equipe: r.equipe,
      termino_sla: r.termino_sla,
      data_solicitacao: r.data_solicitacao,
      outros: r.outros,
      finalizado: false,
      status_origem: "",
    }));
    const blob = await generateBackorderExport({ titulo: "DEMARCHI", rows: rowsExp });
    downloadBlob(blob, `PROGRAMACAO_BACKORDER_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <PageShell
      title="Backorder de Corretivas"
      description="OS corretivas em aberto há mais de 30 dias. Importe a planilha para sincronizar a base e acompanhe o fechamento das pendências."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => assetsInputRef.current?.click()} disabled={importing}>
            <Database className="mr-2 h-4 w-4" /> Importar Ativos
          </Button>
          <Button variant="outline" onClick={() => backorderInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-2 h-4 w-4" /> Importar planilha
          </Button>
          <Button onClick={exportar} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
          <input
            ref={backorderInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleBackorderImport(f);
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={assetsInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleAssetsImport(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="tabela">
            <PackageX className="mr-1.5 h-3.5 w-3.5" /> Em aberto
            <Badge variant="secondary" className="ml-2">{abertas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="finalizados">
            Finalizados <Badge variant="secondary" className="ml-2">{finalizadas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="powerbi">Power BI</TabsTrigger>
        </TabsList>

        <TabsContent value="tabela">
          <TableView
            rows={filtered}
            loading={loading}
            search={search}
            setSearch={setSearch}
            filterCat={filterCat}
            setFilterCat={setFilterCat}
            order={order}
            setOrder={setOrder}
            onToggle={toggleFinalizado}
            onCategoria={updateAtividade}
          />
        </TabsContent>

        <TabsContent value="finalizados">
          <FinalizadosView rows={finalizadas} onReabrir={(r) => toggleFinalizado(r, false)} />
        </TabsContent>

        <TabsContent value="dashboard">
          <Dashboard
            abertas={abertas}
            backorder={backorderAbertas}
            finalizadas={finalizadas}
            targetPct={targetPct}
          />
        </TabsContent>

        <TabsContent value="powerbi">
          <PowerBIView />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

// ---------- Tabela principal ----------

function TableView({
  rows,
  loading,
  search,
  setSearch,
  filterCat,
  setFilterCat,
  order,
  setOrder,
  onToggle,
  onCategoria,
}: {
  rows: BOSRow[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  filterCat: string;
  setFilterCat: (v: string) => void;
  order: "asc" | "desc";
  setOrder: (v: "asc" | "desc") => void;
  onToggle: (r: BOSRow, next: boolean) => void;
  onCategoria: (r: BOSRow, c: Categoria) => void;
}) {
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [rows.length, search, filterCat, order]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar OS, nome, ativo ou prédio…"
            className="pl-8"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas categorias</SelectItem>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
        >
          <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
          {order === "asc" ? "Mais antigos" : "Mais recentes"}
        </Button>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {rows.length === 0
            ? "0 registros"
            : `Mostrando ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, rows.length)} de ${rows.length}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Anterior
            </Button>
            <span className="font-mono">
              {currentPage}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima →
            </Button>
          </div>
        )}
      </div>

      <div className="max-h-[65vh] overflow-auto rounded-xl border border-border/60">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <TableRow>
              <TableHead className="w-10">✓</TableHead>
              <TableHead>OS</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Prédio</TableHead>
              <TableHead>Andar</TableHead>
              <TableHead>Espaço</TableHead>
              <TableHead>Atividade</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Equipe</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Dias</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma OS.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => {
                const dias = daysBetween(r.data_solicitacao);
                const isBackorder = dias > 30;
                return (
                  <TableRow key={r.os} className={isBackorder ? "bg-red-500/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={r.finalizado}
                        onCheckedChange={(v) => onToggle(r, Boolean(v))}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.os}</TableCell>
                    <TableCell className="max-w-[320px] truncate" title={r.nome}>
                      {r.nome}
                    </TableCell>
                    <TableCell className="text-xs">{r.predio}</TableCell>
                    <TableCell className="text-xs">{r.andar}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs" title={r.espaco}>
                      {r.espaco}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={r.atividade}
                        onValueChange={(v) => onCategoria(r, v as Categoria)}
                      >
                        <SelectTrigger className="h-8 w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS.map((c) => (
                            <SelectItem key={c} value={c}>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: CATEGORIA_COLOR[c] }}
                                />
                                {c}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.termino_sla ? new Date(r.termino_sla).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.equipe}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs" title={r.outros}>
                      {r.outros}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          dias > 90
                            ? "bg-red-500/20 text-red-600"
                            : dias > 60
                              ? "bg-orange-500/20 text-orange-600"
                              : dias > 30
                                ? "bg-amber-500/20 text-amber-600"
                                : "bg-emerald-500/20 text-emerald-600"
                        }
                      >
                        {dias}d
                      </Badge>
                    </TableCell>
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

function FinalizadosView({
  rows,
  onReabrir,
}: {
  rows: BOSRow[];
  onReabrir: (r: BOSRow) => void;
}) {
  return (
    <GlassCard>
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OS</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Prédio</TableHead>
              <TableHead>Atividade</TableHead>
              <TableHead>Concluído em</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma OS finalizada.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.os}>
                  <TableCell className="font-mono text-xs">{r.os}</TableCell>
                  <TableCell className="max-w-[360px] truncate">{r.nome}</TableCell>
                  <TableCell className="text-xs">{r.predio}</TableCell>
                  <TableCell className="text-xs">{r.atividade}</TableCell>
                  <TableCell className="text-xs">
                    {r.data_finalizacao
                      ? new Date(r.data_finalizacao).toLocaleString("pt-BR")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => onReabrir(r)}>
                      <RefreshCw className="mr-1 h-3 w-3" /> Reabrir
                    </Button>
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

// ---------- Dashboard ----------

function Dashboard({
  abertas,
  backorder,
  finalizadas,
  targetPct,
}: {
  abertas: BOSRow[];
  backorder: BOSRow[];
  finalizadas: BOSRow[];
  targetPct: number;
}) {
  const total = abertas.length;
  const pct = total === 0 ? 0 : (backorder.length / total) * 100;
  const dentroMeta = pct <= targetPct;

  const porCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of backorder) map.set(r.atividade, (map.get(r.atividade) ?? 0) + 1);
    return CATEGORIAS.map((c) => ({ name: c, value: map.get(c) ?? 0, color: CATEGORIA_COLOR[c] }));
  }, [backorder]);

  const aging = useMemo(() => {
    const b = { "31-45": 0, "46-60": 0, "61-90": 0, "90+": 0 };
    for (const r of backorder) {
      const d = daysBetween(r.data_solicitacao);
      if (d <= 45) b["31-45"]++;
      else if (d <= 60) b["46-60"]++;
      else if (d <= 90) b["61-90"]++;
      else b["90+"]++;
    }
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [backorder]);

  const porPredio = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of backorder) {
      const k = r.predio || "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [backorder]);

  const porCriticidade = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of backorder) {
      const k = r.outros || "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [backorder]);

  const gaugeData = [{ name: "pct", value: Math.min(pct, 100), fill: dentroMeta ? "#10B981" : "#EF4444" }];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* KPI Principal */}
      <GlassCard className="lg:col-span-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          % de Backorder
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          Meta: até {targetPct}%
        </div>
        <div className="mt-3 h-[220px]">
          <ResponsiveContainer>
            <RadialBarChart
              innerRadius="70%"
              outerRadius="100%"
              data={gaugeData}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background dataKey="value" cornerRadius={16} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <div className="-mt-32 text-center">
          <div
            className={`text-4xl font-bold ${dentroMeta ? "text-emerald-500" : "text-red-500"}`}
          >
            {pct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {backorder.length} de {total} OS abertas
          </div>
        </div>
        <div className="mt-24 flex justify-center">
          <Badge
            className={
              dentroMeta ? "bg-emerald-500/20 text-emerald-600" : "bg-red-500/20 text-red-600"
            }
          >
            {dentroMeta ? "Dentro da meta" : "Acima da meta"}
          </Badge>
        </div>
      </GlassCard>

      {/* Categoria */}
      <GlassCard className="lg:col-span-2">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Distribuição por categoria
        </h3>
        <div className="h-[260px]">
          <ResponsiveContainer>
            <BarChart data={porCategoria}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {porCategoria.map((c) => (
                  <Cell key={c.name} fill={c.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Aging */}
      <GlassCard>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Aging (dias em aberto)
        </h3>
        <div className="h-[220px]">
          <ResponsiveContainer>
            <BarChart data={aging}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Ranking Prédio */}
      <GlassCard className="lg:col-span-2">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Top 10 prédios
        </h3>
        <div className="h-[220px]">
          <ResponsiveContainer>
            <BarChart data={porPredio} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="name" fontSize={11} width={100} />
              <Tooltip />
              <Bar dataKey="value" fill="#8B5CF6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Criticidade */}
      <GlassCard>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Por criticidade
        </h3>
        <div className="h-[220px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={porCriticidade} dataKey="value" nameKey="name" outerRadius={80} label>
                {porCriticidade.map((_, i) => (
                  <Cell key={i} fill={["#EF4444", "#F59E0B", "#3B82F6", "#10B981", "#64748B"][i % 5]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Contadores */}
      <GlassCard className="lg:col-span-2">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold text-red-500">{backorder.length}</div>
            <div className="text-xs text-muted-foreground">Em backorder</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-amber-500">{abertas.length - backorder.length}</div>
            <div className="text-xs text-muted-foreground">Abertas &lt; 30d</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-emerald-500">{finalizadas.length}</div>
            <div className="text-xs text-muted-foreground">Finalizadas</div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function PowerBIView() {
  const [key, setKey] = useState(0);
  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Painel Power BI — Demarchi</h3>
          <p className="text-xs text-muted-foreground">
            Se o relatório mostrar múltiplas unidades, aplique manualmente o filtro para
            "Demarchi" no próprio Power BI.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setKey((k) => k + 1)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Recarregar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={POWERBI_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Tela cheia
            </a>
          </Button>
        </div>
      </div>
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-black/40">
        <iframe
          key={key}
          title="Power BI — Demarchi"
          src={POWERBI_URL}
          className="h-full w-full"
          allowFullScreen
        />
      </div>
    </GlassCard>
  );
}
