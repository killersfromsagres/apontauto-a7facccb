import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Droplets,
  Fuel,
  Lock,
  PackageOpen,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadBlob } from "@/lib/download";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import {
  createGestaoNota,
  deleteGestaoNota,
  fetchGestaoNotas,
  fetchGestaoOverview,
  updateGestaoNotaSituacao,
} from "../queries";
import { PRIORIDADES, type GestaoOverview } from "../types";

const PERIODOS = [7, 30, 90] as const;
const COLORS = ["#22d3ee", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#60a5fa", "#fb7185"];

const num = (v: number | undefined | null) => (v ?? 0).toLocaleString("pt-BR");
const brl = (v: number | undefined | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "alert" | "good";
}) {
  const toneCls =
    tone === "alert"
      ? "text-destructive"
      : tone === "good"
        ? "text-emerald-400"
        : "text-foreground";
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-1 font-display text-2xl font-bold ${toneCls}`}>{value}</p>
          {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        <Icon className="h-5 w-5 shrink-0 text-primary/80" />
      </div>
    </GlassCard>
  );
}

function exportCsv(d: GestaoOverview) {
  const linhas: Array<[string, string | number]> = [
    ["Gerado em", new Date(d.gerado_em).toLocaleString("pt-BR")],
    ["Período (dias)", d.periodo_dias],
    ["Backorder total", d.backorder.total],
    ["Backorder +30 dias", d.backorder_envelhecido],
    ...Object.entries(d.backorder.por_status).map(
      ([k, v]) => [`Backorder · ${k}`, v] as [string, number],
    ),
    ["Corretiva abertas", d.corretiva.abertas],
    ["Refrigeração abertas", d.refrigeracao.abertas],
    ["Entregas de água (período)", d.agua.entregas_periodo],
    ["Bags entregues (período)", d.agua.bags_periodo],
    ["Bebedouros com falha", d.agua.bebedouros_nok],
    ["Checklists de frota", d.frota.checklists_periodo],
    ["Checklists reprovados", d.frota.checklists_reprovados],
    ["Custo de abastecimento", d.frota.custo_periodo],
    ["Materiais pendentes", d.materiais.pendentes],
    ["Itens legais vencidos", d.legal.vencidos],
    ["Itens legais próximos 30 dias", d.legal.proximos_30],
    ["ASO vencidos", d.sst.aso_vencidos],
    ["PT de taludes ativas", d.taludes.pt_ativas],
  ];
  const csv = ["Indicador;Valor", ...linhas.map(([k, v]) => `${k};${v}`)].join("\n");
  downloadBlob(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    `centro-gestao-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function GestaoView() {
  const qc = useQueryClient();
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();
  const { allowed: canRead, isLoading: loadingRead } = useCanAccessModule(
    "gestao-executiva",
    "read",
  );
  const { allowed: canCreate } = useCanAccessModule("gestao-executiva", "create");
  const { allowed: canExport } = useCanAccessModule("gestao-executiva", "export");

  const canSee = isAdmin || canRead;
  const podeCriar = isAdmin || canCreate;
  const podeExportar = isAdmin || canExport || canCreate;

  const [dias, setDias] = useState<number>(30);
  const [titulo, setTitulo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [prioridade, setPrioridade] = useState<string>("media");

  const overview = useQuery({
    queryKey: ["gestao", "overview", dias],
    queryFn: () => fetchGestaoOverview(dias),
    enabled: canSee,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const notas = useQuery({
    queryKey: ["gestao", "notas"],
    queryFn: fetchGestaoNotas,
    enabled: canSee,
    staleTime: 30_000,
  });

  const criar = useMutation({
    mutationFn: () =>
      createGestaoNota({ titulo: titulo.trim(), detalhe: detalhe.trim(), modulo: "geral", prioridade }),
    onSuccess: () => {
      setTitulo("");
      setDetalhe("");
      toast.success("Ação registrada.");
      qc.invalidateQueries({ queryKey: ["gestao", "notas"] });
      qc.invalidateQueries({ queryKey: ["gestao", "overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarSituacao = useMutation({
    mutationFn: ({ id, situacao }: { id: string; situacao: string }) =>
      updateGestaoNotaSituacao(id, situacao),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", "notas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => deleteGestaoNota(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", "notas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const d = overview.data;

  const statusData = useMemo(
    () =>
      Object.entries(d?.backorder.por_status ?? {})
        .map(([name, value]) => ({ name, value: Number(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [d],
  );

  const riscos = useMemo(() => {
    if (!d) return [] as Array<{ titulo: string; detalhe: string }>;
    const out: Array<{ titulo: string; detalhe: string }> = [];
    if (d.backorder_envelhecido > 0)
      out.push({
        titulo: "Backorder envelhecido",
        detalhe: `${num(d.backorder_envelhecido)} OS abertas há mais de 30 dias.`,
      });
    if (d.legal.vencidos > 0)
      out.push({
        titulo: "Itens legais vencidos",
        detalhe: `${num(d.legal.vencidos)} itens fora do prazo legal.`,
      });
    if (d.sst.aso_vencidos > 0)
      out.push({
        titulo: "ASO vencidos",
        detalhe: `${num(d.sst.aso_vencidos)} colaboradores com exame vencido.`,
      });
    if (d.frota.checklists_reprovados > 0)
      out.push({
        titulo: "Frota com restrição",
        detalhe: `${num(d.frota.checklists_reprovados)} checklists reprovados no período.`,
      });
    if (d.agua.bebedouros_nok > 0)
      out.push({
        titulo: "Bebedouros com falha",
        detalhe: `${num(d.agua.bebedouros_nok)} apontamentos de falha na entrega de água.`,
      });
    if (d.taludes.pt_suspensas > 0)
      out.push({
        titulo: "Taludes suspensos",
        detalhe: `${num(d.taludes.pt_suspensas)} permissões de trabalho suspensas.`,
      });
    return out;
  }, [d]);

  if (loadingAdmin || loadingRead) {
    return (
      <PageShell title="Centro de Gestão">
        <GlassCard>
          <p className="text-sm text-muted-foreground">Verificando permissões…</p>
        </GlassCard>
      </PageShell>
    );
  }

  if (!canSee) {
    return (
      <PageShell title="Centro de Gestão" description="Área restrita à gestão executiva.">
        <GlassCard>
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Você não possui a permissão <strong>gestao-executiva</strong>. Solicite liberação à
              administração.
            </p>
          </div>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Visão executiva"
      title="Centro de Gestão"
      description="Consolidação em tempo real de OS, corretiva, refrigeração, água, frota, materiais, itens legais, saúde ocupacional e taludes — sem duplicar dados operacionais."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-border/60">
            {PERIODOS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDias(p)}
                className={`min-h-11 px-3 text-sm transition ${
                  dias === p ? "bg-primary/20 text-primary" : "text-muted-foreground"
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => overview.refetch()} className="min-h-11">
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
          {podeExportar && (
            <Button disabled={!d} onClick={() => d && exportCsv(d)} className="min-h-11">
              Exportar
            </Button>
          )}
        </div>
      }
    >
      {overview.isError && (
        <GlassCard className="mb-4 border-destructive/40">
          <p className="text-sm text-destructive">
            Não foi possível carregar os indicadores: {(overview.error as Error).message}
          </p>
        </GlassCard>
      )}

      <Tabs defaultValue="panorama" className="w-full">
        <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="panorama">Panorama</TabsTrigger>
          <TabsTrigger value="tendencias">Tendências</TabsTrigger>
          <TabsTrigger value="riscos">Riscos</TabsTrigger>
          <TabsTrigger value="acoes">Plano de ação</TabsTrigger>
        </TabsList>

        <TabsContent value="panorama" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={PackageOpen}
              label="Backorder total"
              value={num(d?.backorder.total)}
              hint={`${num(d?.backorder_envelhecido)} há mais de 30 dias`}
            />
            <Kpi icon={Wrench} label="Corretivas abertas" value={num(d?.corretiva.abertas)} hint={`${num(d?.corretiva.periodo)} no período`} />
            <Kpi icon={Activity} label="Refrigeração aberta" value={num(d?.refrigeracao.abertas)} hint={`${num(d?.refrigeracao.periodo)} no período`} />
            <Kpi icon={Droplets} label="Entregas de água" value={num(d?.agua.entregas_periodo)} hint={`${num(d?.agua.bags_periodo)} bags`} />
            <Kpi icon={Fuel} label="Custo de frota" value={brl(d?.frota.custo_periodo)} hint={`${num(d?.frota.litros_periodo)} litros`} />
            <Kpi icon={BadgeCheck} label="Checklists de frota" value={num(d?.frota.checklists_periodo)} hint={`${num(d?.frota.checklists_reprovados)} reprovados`} tone={d?.frota.checklists_reprovados ? "alert" : "good"} />
            <Kpi icon={Scale} label="Itens legais críticos" value={num(d?.legal.vencidos)} hint={`${num(d?.legal.proximos_30)} vencem em 30 dias`} tone={d?.legal.vencidos ? "alert" : "good"} />
            <Kpi icon={ShieldCheck} label="ASO vencidos" value={num(d?.sst.aso_vencidos)} hint={`${num(d?.sst.aso_proximos_30)} vencem em 30 dias`} tone={d?.sst.aso_vencidos ? "alert" : "good"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <h3 className="mb-3 font-display text-lg font-semibold">Backorder por status</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={90}>
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="mb-3 font-display text-lg font-semibold">Carga por equipe (abertas)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d?.backorder_equipes ?? []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="equipe" tick={{ fontSize: 11 }} interval={0} angle={-20} height={50} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="abertas" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="tendencias">
          <GlassCard>
            <h3 className="mb-3 font-display text-lg font-semibold">Evolução dos últimos 12 meses</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d?.backorder_mensal ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="Abertas" stroke="#22d3ee" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="concluidas" name="Concluídas" stroke="#34d399" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="canceladas" name="Canceladas" stroke="#f87171" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="riscos" className="space-y-3">
          {riscos.length === 0 ? (
            <GlassCard>
              <p className="text-sm text-muted-foreground">
                Nenhum risco crítico identificado nos módulos monitorados.
              </p>
            </GlassCard>
          ) : (
            riscos.map((r) => (
              <GlassCard key={r.titulo} className="border-amber-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="font-semibold">{r.titulo}</p>
                    <p className="text-sm text-muted-foreground">{r.detalhe}</p>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="acoes" className="space-y-4">
          {podeCriar && (
            <GlassCard>
              <h3 className="mb-3 font-display text-lg font-semibold">Nova ação de gestão</h3>
              <div className="space-y-3">
                <Input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Título da ação"
                  maxLength={140}
                />
                <Textarea
                  value={detalhe}
                  onChange={(e) => setDetalhe(e.target.value)}
                  placeholder="Contexto, responsável e prazo"
                  rows={3}
                  maxLength={2000}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPrioridade(p)}
                      className={`min-h-11 rounded-xl border px-3 text-sm capitalize transition ${
                        prioridade === p
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/60 text-muted-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <Button
                    className="ml-auto min-h-11"
                    disabled={!titulo.trim() || criar.isPending}
                    onClick={() => criar.mutate()}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Registrar
                  </Button>
                </div>
              </div>
            </GlassCard>
          )}

          {(notas.data ?? []).length === 0 ? (
            <GlassCard>
              <p className="text-sm text-muted-foreground">Nenhuma ação registrada.</p>
            </GlassCard>
          ) : (
            (notas.data ?? []).map((n) => (
              <GlassCard key={n.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{n.titulo}</p>
                      <Badge variant="outline" className="capitalize">
                        {n.prioridade}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {n.situacao}
                      </Badge>
                    </div>
                    {n.detalhe && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {n.detalhe}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  {podeCriar && (
                    <div className="flex gap-2">
                      {n.situacao !== "concluida" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() =>
                            mudarSituacao.mutate({
                              id: n.id,
                              situacao: n.situacao === "aberta" ? "andamento" : "concluida",
                            })
                          }
                        >
                          {n.situacao === "aberta" ? "Iniciar" : "Concluir"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => remover.mutate(n.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
