import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle, Download, Upload, RefreshCw, Package, CheckCircle2,
  BarChart3, Boxes, Trash2,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
  RadialBarChart, RadialBar, PolarAngleAxis, CartesianGrid,
} from "recharts";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { downloadBlob } from "@/lib/download";
import { readBackorderFile, readAssetsRefFile } from "@/lib/backorder/reader";
import { ATIVIDADES, ATIVIDADE_COLOR, type Atividade } from "@/lib/backorder/classify";
import { buildAssetIndex, resolveAtivo } from "@/lib/backorder/assets";
import { generateBackorderXlsx } from "@/lib/backorder/export";
import {
  listBackorder, upsertBackorderRows, updateBackorderLocation,
  toggleFinalizado, setAtividadeManual, deleteBackorderOS,
  listAssetsRef, upsertAssetsRef,
} from "@/lib/backorder.functions";

export const Route = createFileRoute("/_authenticated/backorder")({
  component: BackorderPage,
});

interface BORow {
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

const MS_DAY = 86400000;
const TITULO = "SHERWIN WILLIAMS / DEMARCHI";

function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / MS_DAY);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function BackorderPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBackorder);
  const upsertFn = useServerFn(upsertBackorderRows);
  const updateLocFn = useServerFn(updateBackorderLocation);
  const toggleFn = useServerFn(toggleFinalizado);
  const setAtvFn = useServerFn(setAtividadeManual);
  const deleteFn = useServerFn(deleteBackorderOS);
  const listAssetsFn = useServerFn(listAssetsRef);
  const upsertAssetsFn = useServerFn(upsertAssetsRef);

  const backorderQuery = useQuery({
    queryKey: ["backorder"],
    queryFn: () => listFn() as unknown as Promise<BORow[]>,
  });
  const assetsQuery = useQuery({
    queryKey: ["assets_ref"],
    queryFn: () => listAssetsFn(),
  });

  const rows = backorderQuery.data ?? [];
  const assets = assetsQuery.data ?? [];
  const assetIndex = useMemo(() => buildAssetIndex(assets), [assets]);

  // Split ativos (30 dias corridos) vs finalizados
  const ativos = useMemo(
    () =>
      rows
        .filter((r) => !r.finalizado && daysSince(r.data_solicitacao) >= 30)
        .sort(
          (a, b) =>
            new Date(a.data_solicitacao).getTime() -
            new Date(b.data_solicitacao).getTime(),
        ),
    [rows],
  );
  const finalizados = useMemo(
    () => rows.filter((r) => r.finalizado),
    [rows],
  );
  const totalCorretivas = rows.filter((r) => !r.finalizado).length;
  const pctBackorder = totalCorretivas > 0 ? (ativos.length / totalCorretivas) * 100 : 0;

  /* ------ Import backorder ------ */
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const result = await readBackorderFile(file);
      if (result.rows.length === 0) {
        toast.warning("Nenhuma OS válida encontrada no arquivo.");
        return;
      }
      await upsertFn({
        data: {
          rows: result.rows.map((r) => ({
            os: r.os,
            nome: r.nome,
            ativo: r.ativo,
            equipe: r.equipe,
            termino_sla: r.termino_sla,
            data_solicitacao: r.data_solicitacao,
            outros: r.outros,
            atividade_auto: r.atividade_auto,
          })),
        },
      });

      // Resolve Prédio/Andar/Espaço via assets locais e envia ao banco
      const updates = result.rows.map((r) => {
        const res = resolveAtivo(assetIndex, r.ativo);
        return { os: r.os, predio: res.predio, andar: res.andar, espaco: res.espaco };
      });
      if (updates.length > 0) await updateLocFn({ data: { updates } });

      let msg = `${result.rows.length} OS importadas.`;
      if (result.ignoradasSemData) msg += ` ${result.ignoradasSemData} sem data.`;
      if (result.ignoradasSemOS) msg += ` ${result.ignoradasSemOS} sem número de OS.`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["backorder"] });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao importar planilha");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  /* ------ Import assets ref ------ */
  const assetsInputRef = useRef<HTMLInputElement>(null);
  const [importingAssets, setImportingAssets] = useState(false);
  const handleImportAssets = async (file: File) => {
    setImportingAssets(true);
    try {
      const parsed = await readAssetsRefFile(file);
      await upsertAssetsFn({ data: { rows: parsed, replaceAll: true } });
      toast.success(`${parsed.length} ativos importados.`);
      qc.invalidateQueries({ queryKey: ["assets_ref"] });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao importar tabela de ativos");
    } finally {
      setImportingAssets(false);
      if (assetsInputRef.current) assetsInputRef.current.value = "";
    }
  };

  /* ------ Export ------ */
  const handleExport = async () => {
    if (ativos.length === 0) {
      toast.warning("Não há OS ativas para exportar.");
      return;
    }
    try {
      const blob = await generateBackorderXlsx({
        titulo: TITULO,
        rows: ativos.map((r) => ({
          os: r.os,
          nome: r.nome,
          ativo: r.ativo,
          atividade: r.atividade,
          termino_sla: r.termino_sla,
          equipe: r.equipe,
          data_solicitacao: r.data_solicitacao,
          outros: r.outros,
        })),
        assets,
      });
      downloadBlob(blob, `PROGRAMACAO_BACKORDER_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar planilha");
    }
  };

  /* ------ Mutations ------ */
  const toggleMut = useMutation({
    mutationFn: (v: { os: string; finalizado: boolean }) =>
      toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backorder"] }),
  });
  const atvMut = useMutation({
    mutationFn: (v: { os: string; atividade: string }) => setAtvFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backorder"] }),
  });
  const delMut = useMutation({
    mutationFn: (os: string) => deleteFn({ data: { os } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backorder"] }),
  });

  return (
    <PageShell
      title="Backorder de Corretivas"
      description="OS corretivas em aberto há mais de 30 dias. Meta: até 5% do total."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => backorderQuery.refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {importing ? "Importando…" : "Importar planilha"}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
            }}
          />
          <Button size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar planilha
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard"><BarChart3 className="mr-1.5 h-4 w-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="ativos"><Package className="mr-1.5 h-4 w-4" />Ativos ({ativos.length})</TabsTrigger>
          <TabsTrigger value="finalizados"><CheckCircle2 className="mr-1.5 h-4 w-4" />Finalizados ({finalizados.length})</TabsTrigger>
          <TabsTrigger value="powerbi">Power BI</TabsTrigger>
          <TabsTrigger value="config"><Boxes className="mr-1.5 h-4 w-4" />Ativos (cadastro)</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardView
            ativos={ativos}
            finalizados={finalizados}
            pct={pctBackorder}
          />
        </TabsContent>

        <TabsContent value="ativos">
          <AtivosView
            rows={ativos}
            onToggle={(os, f) => toggleMut.mutate({ os, finalizado: f })}
            onAtividade={(os, a) => atvMut.mutate({ os, atividade: a })}
            onDelete={(os) => delMut.mutate(os)}
          />
        </TabsContent>

        <TabsContent value="finalizados">
          <FinalizadosView
            rows={finalizados}
            onUncheck={(os) => toggleMut.mutate({ os, finalizado: false })}
          />
        </TabsContent>

        <TabsContent value="powerbi">
          <PowerBIView />
        </TabsContent>

        <TabsContent value="config">
          <GlassCard>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Tabela de Ativos (referência)
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Colunas esperadas: <strong>Ativo</strong> e <strong>Denominação Ativo</strong>. Envio substitui toda a tabela atual.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => assetsInputRef.current?.click()}
                  disabled={importingAssets}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {importingAssets ? "Importando…" : "Importar tabela de Ativos"}
                </Button>
                <input
                  ref={assetsInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportAssets(f);
                  }}
                />
                <Badge variant="secondary">{assets.length} ativos cadastrados</Badge>
              </div>
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/* -------- Dashboard -------- */

function DashboardView({
  ativos, finalizados, pct,
}: {
  ativos: BORow[];
  finalizados: BORow[];
  pct: number;
}) {
  const meta = 5;
  const gaugeColor = pct <= 5 ? "#22c55e" : pct <= 8 ? "#eab308" : "#ef4444";

  const porAtividade = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of ativos) map.set(r.atividade, (map.get(r.atividade) ?? 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [ativos]);

  const porPredio = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of ativos) {
      const p = r.predio || "—";
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [ativos]);

  const mediaDias = useMemo(() => {
    if (ativos.length === 0) return 0;
    const total = ativos.reduce((sum, r) => sum + daysSince(r.data_solicitacao), 0);
    return Math.round(total / ativos.length);
  }, [ativos]);

  const finalizadosMes = useMemo(() => {
    const now = new Date();
    return finalizados.filter((r) => {
      if (!r.data_finalizacao) return false;
      const d = new Date(r.data_finalizacao);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [finalizados]);

  const top10 = ativos.slice(0, 10);

  const gaugeData = [{ name: "pct", value: Math.min(pct, 100), fill: gaugeColor }];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <GlassCard className="md:col-span-1">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            % Backorder (meta ≤ {meta}%)
          </h3>
          <div className="relative h-56">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="70%" outerRadius="100%" data={gaugeData}
                startAngle={180} endAngle={0}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" background cornerRadius={12} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold" style={{ color: gaugeColor }}>
                {pct.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">
                {ativos.length} de {ativos.length + finalizados.filter((r) => !r.finalizado).length + (ativos.length ? 0 : 0)} OS abertas
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="grid grid-cols-2 gap-3 md:h-full md:grid-cols-1">
          <SummaryCard label="Total em Backorder" value={ativos.length} />
          <SummaryCard label="Finalizados no mês" value={finalizadosMes} />
          <SummaryCard label="Média de dias em atraso" value={`${mediaDias}d`} />
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Por Atividade
        </h3>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={porAtividade} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {porAtividade.map((entry) => (
                  <cell
                    // recharts <Cell/>; using dynamic tag avoids extra import
                    key={entry.name}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard className="md:col-span-2">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Por Prédio
        </h3>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={porPredio} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Top 10 mais antigas
        </h3>
        <ul className="space-y-2">
          {top10.length === 0 && (
            <li className="text-xs text-muted-foreground">Nenhuma OS em backorder.</li>
          )}
          {top10.map((r) => (
            <li key={r.os} className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-xs">
              <div className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{r.os}</span>{" "}
                <span className="text-muted-foreground">· {r.nome}</span>
              </div>
              <Badge
                variant="destructive"
                className="shrink-0"
              >
                {daysSince(r.data_solicitacao)}d
              </Badge>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3 transition-transform hover:scale-[1.01]">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

/* -------- Ativos (tabela) -------- */

function AtivosView({
  rows, onToggle, onAtividade, onDelete,
}: {
  rows: BORow[];
  onToggle: (os: string, finalizado: boolean) => void;
  onAtividade: (os: string, atividade: string) => void;
  onDelete: (os: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [fEquipe, setFEquipe] = useState<string>("all");
  const [fAtividade, setFAtividade] = useState<string>("all");
  const [fPredio, setFPredio] = useState<string>("all");

  const equipes = useMemo(() => Array.from(new Set(rows.map((r) => r.equipe).filter(Boolean))).sort(), [rows]);
  const predios = useMemo(() => Array.from(new Set(rows.map((r) => r.predio).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fEquipe !== "all" && r.equipe !== fEquipe) return false;
      if (fAtividade !== "all" && r.atividade !== fAtividade) return false;
      if (fPredio !== "all" && r.predio !== fPredio) return false;
      if (!s) return true;
      return (
        r.os.toLowerCase().includes(s) ||
        r.nome.toLowerCase().includes(s) ||
        r.ativo.toLowerCase().includes(s)
      );
    });
  }, [rows, search, fEquipe, fAtividade, fPredio]);

  return (
    <GlassCard>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar OS, nome ou ativo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={fEquipe} onValueChange={setFEquipe}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Equipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas equipes</SelectItem>
              {equipes.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fAtividade} onValueChange={setFAtividade}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Atividade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas atividades</SelectItem>
              {ATIVIDADES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPredio} onValueChange={setFPredio}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Prédio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos prédios</SelectItem>
              {predios.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} OS</div>
        </div>

        <div className="overflow-auto rounded-lg border border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">✓</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Prédio</TableHead>
                <TableHead>Andar</TableHead>
                <TableHead>Espaço</TableHead>
                <TableHead>Atividade</TableHead>
                <TableHead>Término SLA</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Solicitação</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Outros</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} className="py-10 text-center text-xs text-muted-foreground">
                    Nenhuma OS em backorder.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => {
                const dias = daysSince(r.data_solicitacao);
                const isOutros = r.atividade === "Outros Serviços";
                return (
                  <TableRow key={r.os} className={isOutros ? "bg-amber-500/5" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={false}
                        onCheckedChange={(v) => onToggle(r.os, Boolean(v))}
                        aria-label="Finalizar"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.os}</TableCell>
                    <TableCell className="max-w-xs truncate" title={r.nome}>{r.nome}</TableCell>
                    <TableCell className="text-xs">{r.predio || "—"}</TableCell>
                    <TableCell className="text-xs">{r.andar || "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs" title={r.espaco}>{r.espaco || "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={r.atividade}
                        onValueChange={(v) => onAtividade(r.os, v)}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ATIVIDADES.map((a) => (
                            <SelectItem key={a} value={a}>
                              <span
                                className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                                style={{ background: ATIVIDADE_COLOR[a as Atividade] }}
                              />
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isOutros && (
                        <Badge variant="outline" className="ml-1 border-amber-500/60 bg-amber-500/10 text-[9px] text-amber-600">
                          revisar
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(r.termino_sla)}</TableCell>
                    <TableCell className="text-xs">{r.equipe || "—"}</TableCell>
                    <TableCell className="font-mono text-[11px]">{r.ativo || "—"}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.data_solicitacao)}</TableCell>
                    <TableCell>
                      <Badge variant={dias > 60 ? "destructive" : "secondary"}>{dias}d</Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs" title={r.outros}>{r.outros || "—"}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir OS ${r.os} definitivamente?`)) onDelete(r.os);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </GlassCard>
  );
}

/* -------- Finalizados -------- */

function FinalizadosView({
  rows, onUncheck,
}: {
  rows: BORow[];
  onUncheck: (os: string) => void;
}) {
  return (
    <GlassCard>
      <div className="overflow-auto rounded-lg border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">✓</TableHead>
              <TableHead>OS</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Atividade</TableHead>
              <TableHead>Equipe</TableHead>
              <TableHead>Solicitação</TableHead>
              <TableHead>Finalização</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                  Nenhum chamado finalizado ainda.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.os}>
                <TableCell>
                  <Checkbox
                    checked
                    onCheckedChange={() => onUncheck(r.os)}
                    aria-label="Reabrir"
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{r.os}</TableCell>
                <TableCell className="max-w-xs truncate" title={r.nome}>{r.nome}</TableCell>
                <TableCell className="text-xs">{r.atividade}</TableCell>
                <TableCell className="text-xs">{r.equipe || "—"}</TableCell>
                <TableCell className="text-xs">{formatDate(r.data_solicitacao)}</TableCell>
                <TableCell className="text-xs">{formatDate(r.data_finalizacao)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

/* -------- Power BI -------- */

const POWERBI_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiNDhjOGJiZjMtYWM0YS00MGUyLTkyYzItMDgyMzM5OTMxNThmIiwidCI6IjQyODUyNWQ5LTIzYmQtNGY4Yy1hZmEyLTU2MDBmNDAxZjMyNiJ9";

function PowerBIView() {
  return (
    <GlassCard>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Power BI — Demarchi</h3>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-[11px]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p>
            O filtro por unidade Demarchi deve ser selecionado manualmente dentro do próprio
            relatório. O Power BI Embed não permite forçar filtros por URL sem uma
            configuração de Row-Level Security compatível.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40 shadow-inner">
          <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
            <iframe
              title="Power BI — Demarchi"
              src={POWERBI_URL}
              className="absolute inset-0 h-full w-full"
              frameBorder={0}
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
