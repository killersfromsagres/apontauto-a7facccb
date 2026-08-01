import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  Clock,
  Droplets,
  Fuel,
  Gauge,
  Layers,
  Lightbulb,
  Lock,
  Maximize2,
  Package,
  PackageOpen,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sliders,
  Star,
  Timer,
  Trash2,
  TrendingUp,
  Truck,
  Wifi,
  WifiOff,
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
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { useIsAdmin } from "@/hooks/use-is-admin";

import {
  createGestaoNota,
  deleteGestaoNota,
  fetchGestaoNotas,
  fetchGestaoOverview,
  fetchOsConsolidada,
  fetchPrefs,
  savePrefs,
  updateGestaoNotaSituacao,
} from "../queries";
import {
  CRITICIDADES,
  MODULOS,
  PERIODOS,
  PRIORIDADES,
  STATUS_CANONICOS,
  WIDGETS,
  type GestaoFiltros,
} from "../types";
import { derivarAtencao, type ItemAtencao } from "../lib/atencao";
import { gerarInsights } from "../lib/insights";
import { exportarCsv, exportarExcel, exportarPdf, filtrosLegenda } from "../lib/report";
import { KpiCard } from "./kpi-card";

const CORES = ["#22d3ee", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#60a5fa", "#fb7185"];
const num = (v: number | undefined | null) => (v ?? 0).toLocaleString("pt-BR");
const brl = (v: number | undefined | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FILTROS_PADRAO: GestaoFiltros = {
  dias: 30,
  modulo: null,
  equipe: null,
  predio: null,
  status: null,
  criticidade: null,
};

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-xs capitalize transition ${
        ativo
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

function Secao({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{titulo}</h3>
        {acao}
      </div>
      {children}
    </GlassCard>
  );
}

export function GestaoView() {
  const qc = useQueryClient();
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();
  const { allowed: canRead, isLoading: loadingRead } = useCanAccessModule("gestao-executiva", "read");
  const { allowed: canCreate } = useCanAccessModule("gestao-executiva", "create");
  const { allowed: canExport } = useCanAccessModule("gestao-executiva", "export");

  const canSee = isAdmin || canRead;
  const podeAgir = isAdmin || canCreate;
  const podeExportar = isAdmin || canExport || canCreate;

  const [filtros, setFiltros] = useState<GestaoFiltros>(FILTROS_PADRAO);
  const [aba, setAba] = useState("resumo");
  const [apresentacao, setApresentacao] = useState(false);
  const [personalizar, setPersonalizar] = useState(false);
  const [online, setOnline] = useState(true);
  const [titulo, setTitulo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [prioridade, setPrioridade] = useState("media");

  useEffect(() => {
    const atualiza = () => setOnline(navigator.onLine);
    atualiza();
    window.addEventListener("online", atualiza);
    window.addEventListener("offline", atualiza);
    return () => {
      window.removeEventListener("online", atualiza);
      window.removeEventListener("offline", atualiza);
    };
  }, []);

  const usuario = useQuery({
    queryKey: ["gestao", "usuario"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 5 * 60_000,
  });

  const prefs = useQuery({
    queryKey: ["gestao", "prefs"],
    queryFn: fetchPrefs,
    enabled: canSee,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (prefs.data?.filters_json && Object.keys(prefs.data.filters_json).length > 0) {
      setFiltros((f) => ({ ...f, ...prefs.data!.filters_json }));
    }
  }, [prefs.data]);

  const ocultos = prefs.data?.layout_json?.ocultos ?? [];
  const favoritos = prefs.data?.favorites_json ?? [];

  const overview = useQuery({
    queryKey: ["gestao", "overview", filtros.dias],
    queryFn: () => fetchGestaoOverview(filtros.dias),
    enabled: canSee,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const consolidada = useQuery({
    queryKey: ["gestao", "os", filtros],
    queryFn: () => fetchOsConsolidada(filtros),
    enabled: canSee,
    staleTime: 60_000,
  });

  const notas = useQuery({
    queryKey: ["gestao", "notas"],
    queryFn: fetchGestaoNotas,
    enabled: canSee,
    staleTime: 30_000,
  });

  const salvarPrefs = useMutation({
    mutationFn: savePrefs,
    onSuccess: () => {
      toast.success("Preferências salvas.");
      qc.invalidateQueries({ queryKey: ["gestao", "prefs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criar = useMutation({
    mutationFn: () =>
      createGestaoNota({
        titulo: titulo.trim(),
        detalhe: detalhe.trim(),
        modulo: "geral",
        prioridade,
      }),
    onSuccess: () => {
      setTitulo("");
      setDetalhe("");
      toast.success("Ação registrada.");
      qc.invalidateQueries({ queryKey: ["gestao", "notas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarSituacao = useMutation({
    mutationFn: (v: { id: string; situacao: string }) => updateGestaoNotaSituacao(v.id, v.situacao),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", "notas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: deleteGestaoNota,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", "notas"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const d = overview.data;
  const os = consolidada.data ?? [];
  const carregando = overview.isLoading;
  const erro = overview.isError;
  const atencao = useMemo(() => derivarAtencao(d), [d]);
  const insights = useMemo(() => gerarInsights(d, os), [d, os]);

  const equipes = useMemo(
    () => Array.from(new Set(os.map((o) => o.equipe).filter(Boolean) as string[])).sort(),
    [os],
  );
  const predios = useMemo(
    () => Array.from(new Set(os.map((o) => o.predio).filter(Boolean) as string[])).sort(),
    [os],
  );

  const statusData = useMemo(
    () =>
      Object.entries(d?.os_status ?? {}).map(([name, value]) => ({ name, value: Number(value) })),
    [d],
  );
  const agingData = useMemo(
    () =>
      ["0-7", "8-30", "31-90", "90+"].map((faixa) => ({
        faixa,
        qtd: Number(d?.os_aging?.[faixa] ?? 0),
      })),
    [d],
  );

  const slaPct =
    d && d.os.concluidas > 0 ? Math.round((d.os.sla_ok / d.os.concluidas) * 100) : null;

  const drill = (f: Partial<GestaoFiltros>) => {
    setFiltros((prev) => ({ ...prev, ...f }));
    setAba("os");
  };

  const ctxRelatorio = () => ({
    overview: d!,
    os,
    filtros,
    autor: usuario.data?.email ?? "Gestão",
    unidade: "São Bernardo do Campo — SP",
  });

  const exportar = async (tipo: "csv" | "xlsx" | "pdf") => {
    if (!d) return;
    try {
      if (tipo === "csv") exportarCsv(ctxRelatorio());
      if (tipo === "xlsx") await exportarExcel(ctxRelatorio());
      if (tipo === "pdf") await exportarPdf(ctxRelatorio());
      toast.success("Relatório gerado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const alternarWidget = (key: string) => {
    const novos = ocultos.includes(key) ? ocultos.filter((k) => k !== key) : [...ocultos, key];
    salvarPrefs.mutate({
      layout_json: { ...(prefs.data?.layout_json ?? {}), ocultos: novos },
      filters_json: prefs.data?.filters_json ?? {},
      favorites_json: favoritos,
    });
  };

  const alternarFavorito = (key: string) => {
    const novos = favoritos.includes(key)
      ? favoritos.filter((k) => k !== key)
      : [...favoritos, key];
    salvarPrefs.mutate({
      layout_json: prefs.data?.layout_json ?? {},
      filters_json: prefs.data?.filters_json ?? {},
      favorites_json: novos,
    });
  };

  const visivel = (key: string) => !ocultos.includes(key);

  if (loadingAdmin || loadingRead) {
    return (
      <PageShell title="Centro de Gestão">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
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

  const saudacao = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  })();
  const nome = usuario.data?.email?.split("@")[0] ?? "gestor";

  return (
    <div className={apresentacao ? "fixed inset-0 z-50 overflow-auto bg-background" : undefined}>
      <PageShell
        eyebrow="Visão executiva"
        title="Centro de Gestão"
        description={`${saudacao}, ${nome}. São Bernardo do Campo — SP · ${filtrosLegenda(filtros)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                overview.refetch();
                consolidada.refetch();
              }}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`} />
              Atualizar dados
            </Button>
            {podeExportar && (
              <>
                <Button variant="outline" className="min-h-11" disabled={!d} onClick={() => exportar("pdf")}>
                  PDF
                </Button>
                <Button variant="outline" className="min-h-11" disabled={!d} onClick={() => exportar("xlsx")}>
                  Excel
                </Button>
                <Button variant="outline" className="min-h-11" disabled={!d} onClick={() => exportar("csv")}>
                  CSV
                </Button>
              </>
            )}
            <Button variant="outline" className="min-h-11" onClick={() => setPersonalizar((v) => !v)}>
              <Sliders className="mr-2 h-4 w-4" /> Personalizar
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => setApresentacao((v) => !v)}>
              <Maximize2 className="mr-2 h-4 w-4" /> {apresentacao ? "Sair" : "Apresentação"}
            </Button>
          </div>
        }
      >
        {/* Barra de status executiva */}
        <GlassCard className="mb-4 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {online ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-destructive" />
              )}
              {online ? "Dados em tempo real" : "Sem conexão — exibindo cache"}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Última atualização:{" "}
              {d ? new Date(d.gerado_em).toLocaleTimeString("pt-BR") : "carregando…"}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {num(os.length)} OS carregadas
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Sincronização {overview.isFetching ? "em andamento" : "concluída"}
            </span>
          </div>
        </GlassCard>

        {/* Filtros globais */}
        <GlassCard className="mb-4 space-y-3 p-3">
          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <Chip
                key={p.label}
                ativo={filtros.dias === p.dias}
                onClick={() => setFiltros((f) => ({ ...f, dias: p.dias }))}
              >
                {p.label}
              </Chip>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Personalizado:</span>
              <Input
                type="number"
                min={1}
                max={730}
                value={filtros.dias}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, dias: Math.max(1, Number(e.target.value) || 1) }))
                }
                className="h-9 w-20"
              />
              <span className="text-xs text-muted-foreground">dias</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip ativo={!filtros.modulo} onClick={() => setFiltros((f) => ({ ...f, modulo: null }))}>
              Todos os módulos
            </Chip>
            {MODULOS.map((m) => (
              <Chip key={m} ativo={filtros.modulo === m} onClick={() => setFiltros((f) => ({ ...f, modulo: m }))}>
                {m}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip ativo={!filtros.status} onClick={() => setFiltros((f) => ({ ...f, status: null }))}>
              Todos os status
            </Chip>
            {STATUS_CANONICOS.map((s) => (
              <Chip key={s} ativo={filtros.status === s} onClick={() => setFiltros((f) => ({ ...f, status: s }))}>
                {s}
              </Chip>
            ))}
            {CRITICIDADES.map((c) => (
              <Chip
                key={c}
                ativo={filtros.criticidade === c}
                onClick={() =>
                  setFiltros((f) => ({ ...f, criticidade: f.criticidade === c ? null : c }))
                }
              >
                {c}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filtros.equipe ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, equipe: e.target.value || null }))}
              className="h-10 min-w-40 rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
            >
              <option value="">Todas as equipes</option>
              {equipes.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select
              value={filtros.predio ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, predio: e.target.value || null }))}
              className="h-10 min-w-40 rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
            >
              <option value="">Todos os prédios</option>
              {predios.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Button variant="ghost" className="min-h-10" onClick={() => setFiltros(FILTROS_PADRAO)}>
              Limpar filtros
            </Button>
            {podeAgir && (
              <Button
                variant="outline"
                className="ml-auto min-h-10"
                onClick={() =>
                  salvarPrefs.mutate({
                    layout_json: prefs.data?.layout_json ?? {},
                    filters_json: filtros,
                    favorites_json: favoritos,
                  })
                }
              >
                Salvar filtros
              </Button>
            )}
          </div>
        </GlassCard>

        {personalizar && (
          <GlassCard className="mb-4">
            <h3 className="mb-3 font-display text-lg font-semibold">Personalizar painel</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {WIDGETS.map((w) => (
                <div
                  key={w.key}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/50 p-2"
                >
                  <span className="text-sm">{w.label}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => alternarFavorito(w.key)}>
                      <Star
                        className={`h-4 w-4 ${favoritos.includes(w.key) ? "fill-amber-400 text-amber-400" : ""}`}
                      />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => alternarWidget(w.key)}>
                      {visivel(w.key) ? "Ocultar" : "Exibir"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() =>
                salvarPrefs.mutate({ layout_json: {}, filters_json: {}, favorites_json: [] })
              }
            >
              Restaurar layout original
            </Button>
          </GlassCard>
        )}

        {erro && (
          <GlassCard className="mb-4 border-destructive/40">
            <p className="text-sm text-destructive">
              Não foi possível carregar os indicadores: {(overview.error as Error).message}
            </p>
          </GlassCard>
        )}

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="atencao">
              Atenção
              {atencao.length > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 px-1.5 text-[10px]">
                  {atencao.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="os">Ordens de serviço</TabsTrigger>
            <TabsTrigger value="equipes">Equipes</TabsTrigger>
            <TabsTrigger value="frota">Frota</TabsTrigger>
            <TabsTrigger value="agua">Água</TabsTrigger>
            <TabsTrigger value="materiais">Materiais</TabsTrigger>
            <TabsTrigger value="conformidade">Conformidade</TabsTrigger>
            <TabsTrigger value="sistema">Sistema</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="acoes">Plano de ação</TabsTrigger>
          </TabsList>

          {/* RESUMO EXECUTIVO */}
          <TabsContent value="resumo" className="space-y-4">
            {visivel("resumo") && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard
                  icon={PackageOpen}
                  label="OS abertas"
                  valor={num(d?.os.abertas)}
                  hint={`${num(d?.os.backlog_30)} há mais de 30 dias`}
                  tooltip="Ordens de backorder, corretiva e refrigeração que não estão concluídas nem canceladas."
                  carregando={carregando}
                  erro={erro}
                  atualizadoEm={d?.gerado_em}
                  onClick={() => drill({ status: "aberta" })}
                />
                <KpiCard
                  icon={BadgeCheck}
                  label="Concluídas no período"
                  valor={num(d?.os.concluidas)}
                  atual={d?.os.concluidas}
                  anterior={d?.os.concluidas_ant}
                  tone="bom"
                  tooltip="OS concluídas dentro do período selecionado, comparadas ao período imediatamente anterior."
                  carregando={carregando}
                  erro={erro}
                  onClick={() => drill({ status: "concluida" })}
                />
                <KpiCard
                  icon={AlertTriangle}
                  label="OS vencidas"
                  valor={num(d?.os.vencidas)}
                  tone={d?.os.vencidas ? "critico" : "bom"}
                  tooltip="Ordens abertas cujo prazo de SLA já passou."
                  carregando={carregando}
                  erro={erro}
                  onClick={() => drill({ status: "aberta" })}
                />
                <KpiCard
                  icon={CalendarClock}
                  label="Vencendo em 24h / 48h"
                  valor={`${num(d?.os.vence_24h)} / ${num(d?.os.vence_48h)}`}
                  tone={d?.os.vence_24h ? "atencao" : "neutro"}
                  tooltip="Ordens abertas com prazo de SLA nas próximas 24 e 48 horas."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Layers}
                  label="Backlog total"
                  valor={num(d?.os.backlog)}
                  hint={`${num(d?.os.sem_responsavel)} sem responsável`}
                  tooltip="Total de ordens pendentes de execução em todos os módulos."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Gauge}
                  label="Cumprimento de SLA"
                  valor={slaPct === null ? "—" : `${slaPct}%`}
                  tone={slaPct !== null && slaPct >= 90 ? "bom" : slaPct !== null ? "atencao" : "neutro"}
                  tooltip="Percentual das OS concluídas no período que respeitaram o prazo registrado."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Timer}
                  label="Tempo médio de atendimento"
                  valor={`${num(d?.os.tma_horas)} h`}
                  tooltip="Média de horas entre a abertura e a conclusão das OS do período."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Wrench}
                  label="MTTR"
                  valor={`${num(d?.os.mttr_horas)} h`}
                  tooltip="Tempo médio de reparo: horas entre o início da execução e a conclusão."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={AlertTriangle}
                  label="Itens críticos"
                  valor={num(d?.os.criticas)}
                  tone={d?.os.criticas ? "critico" : "bom"}
                  tooltip="OS abertas classificadas como criticidade alta ou crítica."
                  carregando={carregando}
                  erro={erro}
                  onClick={() => drill({ criticidade: "alta" })}
                />
                <KpiCard
                  icon={Truck}
                  label="Veículos disponíveis"
                  valor={`${num(d?.frota.disponiveis)}/${num(d?.frota.total)}`}
                  hint={`${num(d?.frota.bloqueados)} bloqueados · ${num(d?.frota.manutencao)} em manutenção`}
                  tone={d?.frota.bloqueados ? "atencao" : "bom"}
                  tooltip="Situação atual da frota cadastrada."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={ClipboardList}
                  label="Checklists no período"
                  valor={num(d?.frota.checklists)}
                  atual={d?.frota.checklists}
                  anterior={d?.frota.checklists_ant}
                  hint={`${num(d?.frota.reprovados)} reprovados`}
                  tone={d?.frota.reprovados ? "atencao" : "bom"}
                  tooltip="Checklists veiculares realizados no período, com destaque para reprovações."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Fuel}
                  label="Custo de combustível"
                  valor={brl(d?.frota.custo)}
                  atual={d?.frota.custo}
                  anterior={d?.frota.custo_ant}
                  inverso
                  hint={`${num(d?.frota.litros)} litros`}
                  tooltip="Somatório dos abastecimentos registrados no período."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Droplets}
                  label="Entregas de água"
                  valor={num(d?.agua.entregas)}
                  atual={d?.agua.entregas}
                  anterior={d?.agua.entregas_ant}
                  hint={`${num(d?.agua.pendentes)} pendentes`}
                  tooltip="Entregas registradas no período, comparadas ao período anterior."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Package}
                  label="Bags entregues"
                  valor={num(d?.agua.bags)}
                  atual={d?.agua.bags}
                  anterior={d?.agua.bags_ant}
                  hint={`${num(d?.agua.sem_evidencia)} entregas sem foto`}
                  tone={d?.agua.sem_evidencia ? "atencao" : "bom"}
                  tooltip="Bags entregues no período e entregas sem evidência fotográfica."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Droplets}
                  label="Filtros vencidos"
                  valor={num(d?.filtros.vencidos)}
                  hint={`${num(d?.filtros.proximos_30)} vencem em 30 dias`}
                  tone={d?.filtros.vencidos ? "critico" : "bom"}
                  tooltip="Filtros de bebedouro com troca vencida ou próxima do vencimento."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Package}
                  label="Materiais pendentes"
                  valor={num(d?.materiais.pendentes)}
                  atual={d?.materiais.periodo}
                  anterior={d?.materiais.periodo_ant}
                  hint={`${num(d?.pecas.aguardando)} peças aguardando aprovação`}
                  tone={d?.materiais.pendentes ? "atencao" : "bom"}
                  tooltip="Solicitações de material em aberto e peças pendentes de decisão do gestor."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Scale}
                  label="Itens legais"
                  valor={num(d?.legal.vencidos)}
                  hint={`${num(d?.legal.proximos_30)} vencem em 30 dias`}
                  tone={d?.legal.vencidos ? "critico" : "bom"}
                  tooltip="Obrigações legais vencidas e próximas do vencimento."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={ShieldCheck}
                  label="ASO vencidos"
                  valor={num(d?.sst.aso_vencidos)}
                  hint={`${num(d?.sst.aso_proximos_30)} vencem em 30 dias`}
                  tone={d?.sst.aso_vencidos ? "critico" : "bom"}
                  tooltip="Exames ocupacionais vencidos de colaboradores ativos."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={AlertTriangle}
                  label="Riscos climáticos"
                  valor={num(d?.taludes.pt_suspensas)}
                  hint={`${num(d?.taludes.pt_ativas)} PT ativas · ${num(d?.taludes.pt_aguardando)} aguardando`}
                  tone={d?.taludes.pt_suspensas ? "atencao" : "bom"}
                  tooltip="Permissões de trabalho suspensas, normalmente por chuva em taludes."
                  carregando={carregando}
                  erro={erro}
                />
                <KpiCard
                  icon={Activity}
                  label="Ações de gestão abertas"
                  valor={num(d?.notas_abertas)}
                  tooltip="Itens registrados no plano de ação do Centro de Gestão ainda não concluídos."
                  carregando={carregando}
                  erro={erro}
                  onClick={() => setAba("acoes")}
                />
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Secao titulo="Funil por status">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={88}>
                        {statusData.map((_, i) => (
                          <Cell key={i} fill={CORES[i % CORES.length]} />
                        ))}
                      </Pie>
                      <RTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Secao>
              <Secao titulo="Aging do backlog">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agingData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Bar dataKey="qtd" name="OS abertas" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Secao>
            </div>

            <Secao titulo="Tendência mensal (12 meses)">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d?.os_mensal ?? []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip />
                    <Legend />
                    <Line type="monotone" dataKey="criadas" name="Abertas" stroke="#22d3ee" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="concluidas" name="Concluídas" stroke="#34d399" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="canceladas" name="Canceladas" stroke="#f87171" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Secao>
          </TabsContent>

          {/* REQUER SUA ATENÇÃO */}
          <TabsContent value="atencao" className="space-y-3">
            {carregando ? (
              <Skeleton className="h-40 w-full" />
            ) : atencao.length === 0 ? (
              <GlassCard>
                <p className="text-sm text-muted-foreground">
                  Nenhuma pendência crítica identificada nos módulos monitorados.
                </p>
              </GlassCard>
            ) : (
              atencao.map((item: ItemAtencao) => (
                <GlassCard
                  key={item.key}
                  className={
                    item.severidade === "critica"
                      ? "border-destructive/40"
                      : item.severidade === "alta"
                        ? "border-amber-500/30"
                        : ""
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 ${item.severidade === "critica" ? "text-destructive" : "text-amber-400"}`}
                        />
                        <p className="font-semibold">{item.titulo}</p>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {item.severidade}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {item.modulo}
                        </Badge>
                        <Badge className="text-[10px]">{num(item.quantidade)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.detalhe}</p>
                      <p className="mt-1 text-xs text-primary">Ação sugerida: {item.acao}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.filtro && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-10"
                          onClick={() => drill(item.filtro!)}
                        >
                          Abrir registros
                        </Button>
                      )}
                      {item.rota && (
                        <Button asChild size="sm" variant="outline" className="min-h-10">
                          <Link to={item.rota}>Ir ao módulo</Link>
                        </Button>
                      )}
                      {podeAgir && (
                        <Button
                          size="sm"
                          className="min-h-10"
                          onClick={() => {
                            setTitulo(item.titulo);
                            setDetalhe(`${item.detalhe} (${item.quantidade}). ${item.acao}.`);
                            setPrioridade(item.severidade === "critica" ? "alta" : "media");
                            setAba("acoes");
                          }}
                        >
                          Acompanhar
                        </Button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              ))
            )}
          </TabsContent>

          {/* OS CONSOLIDADAS */}
          <TabsContent value="os" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Secao titulo="OS abertas por equipe">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d?.os_equipes ?? []}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="equipe" tick={{ fontSize: 10 }} interval={0} angle={-20} height={56} textAnchor="end" />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Bar dataKey="abertas" name="Abertas" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Secao>
              <Secao titulo="Top prédios com maior volume">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d?.os_predios ?? []} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="predio" width={120} tick={{ fontSize: 10 }} />
                      <RTooltip />
                      <Bar dataKey="abertas" name="Abertas" fill="#a78bfa" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Secao>
            </div>

            <Secao
              titulo={`Ordens consolidadas (${num(os.length)})`}
              acao={<span className="text-xs text-muted-foreground">{filtrosLegenda(filtros)}</span>}
            >
              {consolidada.isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : os.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma OS encontrada com os filtros atuais.
                </p>
              ) : (
                <>
                  {/* Desktop */}
                  <div className="hidden max-h-[560px] overflow-auto rounded-xl border border-border/50 md:block">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background/95 backdrop-blur">
                        <tr className="text-left text-xs uppercase text-muted-foreground">
                          <th className="p-2">Origem</th>
                          <th className="p-2">OS</th>
                          <th className="p-2">Descrição</th>
                          <th className="p-2">Local</th>
                          <th className="p-2">Equipe</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Prazo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {os.slice(0, 400).map((o) => (
                          <tr key={`${o.origem}-${o.id}`} className="border-t border-border/40">
                            <td className="p-2">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {o.origem}
                              </Badge>
                            </td>
                            <td className="p-2 font-mono text-xs">{o.numero_os ?? "—"}</td>
                            <td className="max-w-sm truncate p-2">{o.descricao ?? "—"}</td>
                            <td className="p-2 text-xs text-muted-foreground">
                              {[o.predio, o.andar, o.local].filter(Boolean).join(" · ") || "—"}
                            </td>
                            <td className="p-2 text-xs">{o.equipe}</td>
                            <td className="p-2">
                              <Badge
                                variant={o.atrasada ? "destructive" : "secondary"}
                                className="text-[10px] capitalize"
                              >
                                {o.status_canonico}
                              </Badge>
                            </td>
                            <td className="p-2 text-xs">
                              {o.prazo_sla ? new Date(o.prazo_sla).toLocaleDateString("pt-BR") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile */}
                  <div className="space-y-2 md:hidden">
                    {os.slice(0, 120).map((o) => (
                      <div
                        key={`${o.origem}-${o.id}`}
                        className="rounded-xl border border-border/50 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs">{o.numero_os ?? "—"}</span>
                          <Badge
                            variant={o.atrasada ? "destructive" : "secondary"}
                            className="text-[10px] capitalize"
                          >
                            {o.status_canonico}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm">{o.descricao ?? "—"}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {[o.predio, o.andar, o.local].filter(Boolean).join(" · ") || "Local não informado"} ·{" "}
                          {o.equipe}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Secao>

            <Secao titulo="Ativos reincidentes">
              {(d?.os_reincidentes ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem reincidência relevante.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(d?.os_reincidentes ?? []).map((r) => (
                    <li key={r.ativo} className="flex justify-between gap-3 border-b border-border/30 py-1">
                      <span className="truncate">{r.ativo}</span>
                      <span className="text-muted-foreground">{num(r.ocorrencias)} OS</span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>
          </TabsContent>

          {/* EQUIPES */}
          <TabsContent value="equipes" className="space-y-4">
            <Secao titulo="Desempenho por equipe">
              <p className="mb-3 text-xs text-muted-foreground">
                Volume, atraso e tempo médio são apresentados juntos — o ranking sozinho não mede
                desempenho sem considerar a carga recebida.
              </p>
              <div className="overflow-auto rounded-xl border border-border/50">
                <table className="w-full text-sm">
                  <thead className="bg-background/80 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2">Equipe</th>
                      <th className="p-2">Abertas</th>
                      <th className="p-2">Concluídas</th>
                      <th className="p-2">Atrasadas</th>
                      <th className="p-2">TMA (h)</th>
                      <th className="p-2">Utilização</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d?.os_equipes ?? []).map((e) => {
                      const total = e.abertas + e.concluidas;
                      const util = total > 0 ? Math.round((e.concluidas / total) * 100) : 0;
                      return (
                        <tr key={e.equipe} className="border-t border-border/40">
                          <td className="p-2">
                            <button
                              className="text-primary underline-offset-2 hover:underline"
                              onClick={() => drill({ equipe: e.equipe })}
                            >
                              {e.equipe}
                            </button>
                          </td>
                          <td className="p-2">{num(e.abertas)}</td>
                          <td className="p-2">{num(e.concluidas)}</td>
                          <td className={`p-2 ${e.atrasadas ? "text-destructive" : ""}`}>
                            {num(e.atrasadas)}
                          </td>
                          <td className="p-2">{e.tma_horas}</td>
                          <td className="p-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-primary" style={{ width: `${util}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Secao>
          </TabsContent>

          {/* FROTA */}
          <TabsContent value="frota" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard icon={Truck} label="Frota total" valor={num(d?.frota.total)} tooltip="Veículos cadastrados." carregando={carregando} />
              <KpiCard icon={BadgeCheck} label="Disponíveis" valor={num(d?.frota.disponiveis)} tone="bom" tooltip="Veículos aptos à operação." carregando={carregando} />
              <KpiCard icon={Lock} label="Bloqueados" valor={num(d?.frota.bloqueados)} tone={d?.frota.bloqueados ? "critico" : "bom"} tooltip="Veículos impedidos de rodar." carregando={carregando} />
              <KpiCard icon={Wrench} label="Em manutenção" valor={num(d?.frota.manutencao)} tooltip="Veículos em oficina." carregando={carregando} />
              <KpiCard icon={ClipboardList} label="Checklists" valor={num(d?.frota.checklists)} atual={d?.frota.checklists} anterior={d?.frota.checklists_ant} tooltip="Checklists realizados no período." carregando={carregando} />
              <KpiCard icon={AlertTriangle} label="Reprovados" valor={num(d?.frota.reprovados)} tone={d?.frota.reprovados ? "atencao" : "bom"} tooltip="Checklists com itens reprovados." carregando={carregando} />
              <KpiCard icon={Fuel} label="Custo" valor={brl(d?.frota.custo)} atual={d?.frota.custo} anterior={d?.frota.custo_ant} inverso tooltip="Custo de abastecimento no período." carregando={carregando} />
              <KpiCard icon={Gauge} label="Litros" valor={num(d?.frota.litros)} tooltip="Litros abastecidos no período." carregando={carregando} />
            </div>
            <Secao
              titulo="Ações rápidas de frota"
              acao={
                <Button asChild variant="outline" size="sm" className="min-h-10">
                  <Link to="/frota">Abrir módulo de frota</Link>
                </Button>
              }
            >
              <p className="text-sm text-muted-foreground">
                {num(d?.frota.ocorrencias)} ocorrência(s) de frota em aberto. Bloqueio, liberação e
                registro de manutenção continuam no módulo de frota, onde a confirmação e o motivo
                são obrigatórios.
              </p>
            </Secao>
          </TabsContent>

          {/* ÁGUA */}
          <TabsContent value="agua" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard icon={Droplets} label="Entregas" valor={num(d?.agua.entregas)} atual={d?.agua.entregas} anterior={d?.agua.entregas_ant} tooltip="Entregas registradas no período." carregando={carregando} />
              <KpiCard icon={Package} label="Bags entregues" valor={num(d?.agua.bags)} atual={d?.agua.bags} anterior={d?.agua.bags_ant} tooltip="Total de bags entregues." carregando={carregando} />
              <KpiCard icon={Clock} label="Pendentes" valor={num(d?.agua.pendentes)} tone={d?.agua.pendentes ? "atencao" : "bom"} tooltip="Pontos programados sem conclusão." carregando={carregando} />
              <KpiCard icon={AlertTriangle} label="Sem evidência" valor={num(d?.agua.sem_evidencia)} tone={d?.agua.sem_evidencia ? "critico" : "bom"} tooltip="Entregas sem foto anexada." carregando={carregando} />
              <KpiCard icon={Wrench} label="Bebedouros com falha" valor={num(d?.agua.bebedouros_nok)} tone={d?.agua.bebedouros_nok ? "atencao" : "bom"} tooltip="Apontamentos de bebedouro fora de operação." carregando={carregando} />
              <KpiCard icon={Droplets} label="Filtros vencidos" valor={num(d?.filtros.vencidos)} tone={d?.filtros.vencidos ? "critico" : "bom"} tooltip="Filtros com troca vencida." carregando={carregando} />
              <KpiCard icon={CalendarClock} label="Filtros a vencer" valor={num(d?.filtros.proximos_30)} tooltip="Filtros com troca nos próximos 30 dias." carregando={carregando} />
            </div>
            <Secao
              titulo="Ações rápidas de água"
              acao={
                <Button asChild variant="outline" size="sm" className="min-h-10">
                  <Link to="/abastecimento/agua">Abrir entrega de água</Link>
                </Button>
              }
            >
              <p className="text-sm text-muted-foreground">
                Reatribuição de rota, reconciliação de bags e envio de relatório permanecem no
                módulo operacional, preservando as regras já validadas em campo.
              </p>
            </Secao>
          </TabsContent>

          {/* MATERIAIS */}
          <TabsContent value="materiais" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard icon={Package} label="Solicitações pendentes" valor={num(d?.materiais.pendentes)} tone={d?.materiais.pendentes ? "atencao" : "bom"} tooltip="Solicitações de material aguardando tratativa." carregando={carregando} />
              <KpiCard icon={TrendingUp} label="Solicitações no período" valor={num(d?.materiais.periodo)} atual={d?.materiais.periodo} anterior={d?.materiais.periodo_ant} tooltip="Volume de solicitações no período." carregando={carregando} />
              <KpiCard icon={Wrench} label="Peças aguardando aprovação" valor={num(d?.pecas.aguardando)} tone={d?.pecas.aguardando ? "atencao" : "bom"} tooltip="Peças pedidas em campo pendentes de decisão." carregando={carregando} />
              <KpiCard icon={AlertTriangle} label="Problemas reportados" valor={num(d?.pecas.problemas)} tooltip="Problemas de campo aguardando decisão." carregando={carregando} />
            </div>
            <Secao
              titulo="Risco de paralisação"
              acao={
                <Button asChild variant="outline" size="sm" className="min-h-10">
                  <Link to="/solicitacao-materiais">Abrir solicitações</Link>
                </Button>
              }
            >
              <p className="text-sm text-muted-foreground">
                {d && d.pecas.aguardando > 0
                  ? `${num(d.pecas.aguardando)} peça(s) travando o fechamento de OS em campo.`
                  : "Nenhuma peça bloqueando o fechamento de OS neste momento."}
              </p>
            </Secao>
          </TabsContent>

          {/* CONFORMIDADE */}
          <TabsContent value="conformidade" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard icon={Scale} label="Itens legais vencidos" valor={num(d?.legal.vencidos)} tone={d?.legal.vencidos ? "critico" : "bom"} tooltip="Obrigações legais fora do prazo." carregando={carregando} />
              <KpiCard icon={CalendarClock} label="Itens a vencer (30d)" valor={num(d?.legal.proximos_30)} tooltip="Obrigações legais próximas do vencimento." carregando={carregando} />
              <KpiCard icon={ShieldCheck} label="ASO vencidos" valor={num(d?.sst.aso_vencidos)} tone={d?.sst.aso_vencidos ? "critico" : "bom"} tooltip="Exames ocupacionais vencidos." carregando={carregando} />
              <KpiCard icon={ShieldCheck} label="ASO a vencer (30d)" valor={num(d?.sst.aso_proximos_30)} tooltip="Exames a vencer nos próximos 30 dias." carregando={carregando} />
              <KpiCard icon={Activity} label="PT ativas" valor={num(d?.taludes.pt_ativas)} tooltip="Permissões de trabalho liberadas ou em andamento." carregando={carregando} />
              <KpiCard icon={Clock} label="PT aguardando" valor={num(d?.taludes.pt_aguardando)} tone={d?.taludes.pt_aguardando ? "atencao" : "bom"} tooltip="Permissões aguardando análise ou liberação." carregando={carregando} />
              <KpiCard icon={AlertTriangle} label="PT suspensas" valor={num(d?.taludes.pt_suspensas)} tone={d?.taludes.pt_suspensas ? "atencao" : "bom"} tooltip="Trabalhos suspensos, geralmente por chuva." carregando={carregando} />
            </div>
            <Secao
              titulo="Clima e taludes"
              acao={
                <Button asChild variant="outline" size="sm" className="min-h-10">
                  <Link to="/taludes">Abrir taludes</Link>
                </Button>
              }
            >
              <p className="text-sm text-muted-foreground">
                A suspensão automática por chuva continua sendo aplicada pelo monitoramento
                climático do módulo de taludes; aqui o gestor vê apenas o impacto consolidado.
              </p>
            </Secao>
          </TabsContent>

          {/* SAÚDE DO SISTEMA */}
          <TabsContent value="sistema" className="space-y-3">
            <Secao
              titulo="Saúde do sistema (visão gerencial)"
              acao={
                isAdmin ? (
                  <Button asChild variant="outline" size="sm" className="min-h-10">
                    <Link to="/observabilidade">Detalhes técnicos</Link>
                  </Button>
                ) : undefined
              }
            >
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between gap-3 border-b border-border/30 pb-2">
                  <span>Conexão do navegador</span>
                  <Badge variant={online ? "secondary" : "destructive"}>
                    {online ? "Estável" : "Offline"}
                  </Badge>
                </li>
                <li className="flex items-center justify-between gap-3 border-b border-border/30 pb-2">
                  <span>Consolidação de OS</span>
                  <Badge variant={consolidada.isError ? "destructive" : "secondary"}>
                    {consolidada.isError ? "Falha na leitura" : `${num(os.length)} registros`}
                  </Badge>
                </li>
                <li className="flex items-center justify-between gap-3 border-b border-border/30 pb-2">
                  <span>Indicadores executivos</span>
                  <Badge variant={erro ? "destructive" : "secondary"}>
                    {erro ? "Falha" : "Atualizados"}
                  </Badge>
                </li>
                <li className="flex items-center justify-between gap-3 border-b border-border/30 pb-2">
                  <span>Evidências de campo faltantes</span>
                  <Badge variant={d?.agua.sem_evidencia ? "destructive" : "secondary"}>
                    {num(d?.agua.sem_evidencia)}
                  </Badge>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>Última atualização</span>
                  <span className="text-muted-foreground">
                    {d ? new Date(d.gerado_em).toLocaleString("pt-BR") : "—"}
                  </span>
                </li>
              </ul>
            </Secao>
          </TabsContent>

          {/* INSIGHTS */}
          <TabsContent value="insights" className="space-y-3">
            {insights.length === 0 ? (
              <GlassCard>
                <p className="text-sm text-muted-foreground">
                  Nenhum padrão relevante detectado com os dados do período.
                </p>
              </GlassCard>
            ) : (
              insights.map((i) => (
                <GlassCard key={i.key}>
                  <div className="flex items-start gap-3">
                    <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{i.titulo}</p>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          confiança {i.confianca}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <strong>Evidência:</strong> {i.evidencia}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong>Impacto:</strong> {i.impacto}
                      </p>
                      <p className="text-sm text-primary">
                        <strong>Recomendação:</strong> {i.recomendacao}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80">Fonte: {i.origem}</p>
                    </div>
                  </div>
                </GlassCard>
              ))
            )}
          </TabsContent>

          {/* PLANO DE AÇÃO */}
          <TabsContent value="acoes" className="space-y-4">
            {podeAgir && (
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
                      <Chip key={p} ativo={prioridade === p} onClick={() => setPrioridade(p)}>
                        {p}
                      </Chip>
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
                    {podeAgir && (
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
                          onClick={() => {
                            if (window.confirm(`Excluir definitivamente a ação "${n.titulo}"?`)) {
                              remover.mutate(n.id);
                            }
                          }}
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
    </div>
  );
}
