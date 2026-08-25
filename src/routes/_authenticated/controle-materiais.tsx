import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Package,
  RefreshCw,
  FileSpreadsheet,
  Search as SearchIcon,
  Send,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  CalendarClock,
  Plus,
  Trash2,
  Loader2,
  Building2,
  History,
  FilterX,
  RadioTower,
  X,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob } from "@/lib/download";
import {
  fetchControleItems,
  fetchCentrosCusto,
  fetchEnvios,
  upsertMeta,
  saveCentroCusto,
  deleteCentroCusto,
  registrarEnvioFacilities,
  STATUS_COMPRA_LABEL,
  STATUS_COMPRA_ORDER,
  type ControleItem,
  type CentroCusto,
  type EnvioFacilities,
  type StatusCompra,
} from "@/lib/controle/data";
import { exportControleMateriais } from "@/lib/controle/export";

export const Route = createFileRoute("/_authenticated/controle-materiais")({
  component: ControlePage,
  head: () => ({
    meta: [
      { title: "Central de Materiais — Apont Auto" },
      {
        name: "description",
        content:
          "Central operacional de materiais solicitados em Corretiva e Refrigeração, com acompanhamento de compra, centro de custo e histórico de Facilities.",
      },
      { property: "og:title", content: "Central de Materiais" },
      {
        property: "og:description",
        content: "Fila operacional, compras, centros de custo e comprovação de solicitações à Facilities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const statusBadge: Record<StatusCompra, string> = {
  aguardando: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  solicitado: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  em_cotacao: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  comprado: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  recebido: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  cancelado: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const statusAccent: Record<StatusCompra, string> = {
  aguardando: "border-l-amber-400",
  solicitado: "border-l-sky-400",
  em_cotacao: "border-l-indigo-400",
  comprado: "border-l-emerald-400",
  recebido: "border-l-teal-400",
  cancelado: "border-l-rose-400",
};

const origemBadge: Record<string, string> = {
  refrigeracao: "border-sky-400/35 bg-sky-400/10 text-sky-700 dark:text-sky-300",
  corretiva: "border-orange-400/35 bg-orange-400/10 text-orange-700 dark:text-orange-300",
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function toLocalInput(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Package;
  label: string;
  value: number | string;
  hint: string;
  tone: string;
}) {
  return (
    <GlassCard className="group relative overflow-hidden border-white/10 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-60" />
      <div className="flex min-w-0 items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ring-inset ring-white/10 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-0.5 font-display text-2xl font-bold leading-none sm:text-3xl">{value}</div>
          <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</div>
        </div>
      </div>
    </GlassCard>
  );
}

function ControlePage() {
  const [items, setItems] = useState<ControleItem[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [envios, setEnvios] = useState<EnvioFacilities[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [busca, setBusca] = useState("");
  const [fOrigem, setFOrigem] = useState("todas");
  const [fTipo, setFTipo] = useState("todos");
  const [fStatus, setFStatus] = useState("todos");
  const [fFonte, setFFonte] = useState("todas");
  const [somenteSemCC, setSomenteSemCC] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ControleItem | null>(null);
  const [envioOpen, setEnvioOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const [loadedItems, loadedCentros, loadedEnvios] = await Promise.all([
        fetchControleItems(),
        fetchCentrosCusto(),
        fetchEnvios(),
      ]);
      setItems(loadedItems);
      setCentros(loadedCentros);
      setEnvios(loadedEnvios);
      setLastSync(new Date());
      setSelected((previous) => {
        const validKeys = new Set(loadedItems.map((item) => item.key));
        return new Set([...previous].filter((key) => validKeys.has(key)));
      });
    } catch (error: any) {
      const message = error?.message ?? "Falha ao carregar os dados da Central de Materiais.";
      setLoadError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let refreshTimer: number | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(true), 450);
    };

    const channel = supabase
      .channel("central-materiais-live-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "corretiva_pecas" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "corretiva_problemas" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "refrigeracao_pecas" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "refrigeracao_problemas" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_solicitacoes" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_solicitacao_itens" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "controle_materiais_meta" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "controle_envios_facilities" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const query = busca.trim().toLowerCase();
    return items.filter((item) => {
      if (fOrigem !== "todas" && item.origem !== fOrigem) return false;
      if (fTipo !== "todos" && item.tipo !== fTipo) return false;
      if (fFonte !== "todas" && item.fonte !== fFonte) return false;
      const status = item.meta?.status_compra ?? "aguardando";
      if (fStatus !== "todos" && status !== fStatus) return false;
      if (somenteSemCC && item.meta?.centro_custo) return false;
      if (!query) return true;

      return [
        item.descricao,
        item.numeroOs,
        item.solicitacaoNumero,
        item.descricaoOs,
        item.predio,
        item.andar,
        item.local,
        item.equipe,
        item.solicitante,
        item.meta?.centro_custo,
        item.meta?.numero_requisicao,
        item.meta?.fornecedor,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [items, busca, fOrigem, fTipo, fStatus, fFonte, somenteSemCC]);

  const kpis = useMemo(() => {
    const requested = items.filter((item) => item.meta?.data_solicitacao_facilities).length;
    const withoutCc = items.filter((item) => !item.meta?.centro_custo).length;
    const fieldRequests = items.filter((item) => item.fonte === "execucao_campo").length;
    const received = items.filter((item) => item.meta?.status_compra === "recebido").length;
    const inPurchase = items.filter((item) =>
      ["solicitado", "em_cotacao", "comprado"].includes(item.meta?.status_compra ?? ""),
    ).length;
    return {
      total: items.length,
      fieldRequests,
      withoutCc,
      requested,
      pending: items.length - requested,
      received,
      inPurchase,
      completion: items.length ? Math.round((received / items.length) * 100) : 0,
    };
  }, [items]);

  const selectedItems = useMemo(
    () => filtered.filter((item) => selected.has(item.key)),
    [filtered, selected],
  );

  const hasFilters =
    Boolean(busca) ||
    fOrigem !== "todas" ||
    fTipo !== "todos" ||
    fStatus !== "todos" ||
    fFonte !== "todas" ||
    somenteSemCC;

  const resetFilters = () => {
    setBusca("");
    setFOrigem("todas");
    setFTipo("todos");
    setFStatus("todos");
    setFFonte("todas");
    setSomenteSemCC(false);
  };

  const toggle = (key: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    const allSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.key));
    setSelected((previous) => {
      const next = new Set(previous);
      filtered.forEach((item) => (allSelected ? next.delete(item.key) : next.add(item.key)));
      return next;
    });
  };

  const doExport = async () => {
    if (!filtered.length) {
      toast.error("Não há registros nos filtros atuais para exportar.");
      return;
    }

    setExporting(true);
    try {
      const blob = await exportControleMateriais({ itens: filtered, centros, envios });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `central-materiais-${stamp}.xlsx`);
      toast.success("Planilha premium da Central de Materiais gerada com sucesso.");
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao gerar a planilha.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageShell
      eyebrow="Suprimentos · Central operacional"
      title="Central de Materiais"
      description="Materiais solicitados na Execução de Campo entram automaticamente nesta fila, sem depender da conclusão do chamado. Acompanhe centro de custo, compra e envio à Facilities em um único fluxo."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void load(true)} disabled={refreshing || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={() => void doExport()} disabled={exporting || loading || filtered.length === 0}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Exportar planilha
          </Button>
        </div>
      }
    >
      <GlassCard className="relative overflow-hidden border-primary/15 p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
              <RadioTower className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-semibold sm:text-lg">Sincronização operacional ativa</h2>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                  Tempo real
                </Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Solicitações feitas em Corretiva → Novo → Execução de Campo são conciliadas com os apontamentos técnicos e aparecem aqui assim que persistidas no Supabase.
              </p>
              <div className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                {lastSync ? `Última sincronização: ${lastSync.toLocaleTimeString("pt-BR")}` : "Aguardando primeira sincronização…"}
                {refreshing ? " · atualizando dados" : ""}
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-background/35 p-3 backdrop-blur-xl">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Materiais recebidos</span>
              <span className="font-semibold">{kpis.completion}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-sky-500 to-emerald-500 transition-[width] duration-500"
                style={{ width: `${kpis.completion}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>{kpis.inPurchase} em fluxo de compra</span>
              <span>{kpis.received} recebidos</span>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={ClipboardList} label="Fila total" value={kpis.total} hint="Todos os registros ativos" tone="bg-primary/12 text-primary" />
        <Kpi icon={Package} label="Execução de Campo" value={kpis.fieldRequests} hint="Pedidos originados em Corretiva" tone="bg-orange-500/12 text-orange-500" />
        <Kpi icon={Wallet} label="Sem centro de custo" value={kpis.withoutCc} hint="Precisam de classificação" tone="bg-rose-500/12 text-rose-500" />
        <Kpi icon={Send} label="Facilities" value={kpis.requested} hint="Pedidos já encaminhados" tone="bg-sky-500/12 text-sky-500" />
        <Kpi icon={CalendarClock} label="A solicitar" value={kpis.pending} hint="Ainda não enviados" tone="bg-amber-500/12 text-amber-500" />
      </div>

      <Tabs defaultValue="pedidos" className="mt-5">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-muted/35 p-1 sm:w-auto">
          <TabsTrigger value="pedidos" className="rounded-xl px-4 py-2">Pedidos <span className="ml-2 text-xs opacity-60">{items.length}</span></TabsTrigger>
          <TabsTrigger value="centros" className="rounded-xl px-4 py-2">Centros de custo <span className="ml-2 text-xs opacity-60">{centros.length}</span></TabsTrigger>
          <TabsTrigger value="envios" className="rounded-xl px-4 py-2">Envios à Facilities <span className="ml-2 text-xs opacity-60">{envios.length}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="mt-4 space-y-4">
          <GlassCard className="border-white/10 p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              <div className="relative sm:col-span-2 xl:col-span-2">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar material, OS, solicitação, local, equipe…"
                  className="h-10 pl-9"
                />
              </div>
              <Select value={fOrigem} onValueChange={setFOrigem}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as origens</SelectItem>
                  <SelectItem value="refrigeracao">Refrigeração</SelectItem>
                  <SelectItem value="corretiva">Corretiva</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fFonte} onValueChange={setFFonte}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Fonte" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as fontes</SelectItem>
                  <SelectItem value="execucao_campo">Execução de Campo</SelectItem>
                  <SelectItem value="apontamento">Apontamento técnico</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fTipo} onValueChange={setFTipo}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Peças e defeitos</SelectItem>
                  <SelectItem value="peca">Somente materiais</SelectItem>
                  <SelectItem value="problema">Somente defeitos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Situação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as situações</SelectItem>
                  {STATUS_COMPRA_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>{STATUS_COMPRA_LABEL[status]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={somenteSemCC} onCheckedChange={(value) => setSomenteSemCC(Boolean(value))} />
                Somente sem centro de custo
              </label>
              <span className="text-xs text-muted-foreground">{filtered.length} de {items.length} registros</span>
              {hasFilters && (
                <Button size="sm" variant="ghost" onClick={resetFilters} className="h-8 gap-1.5">
                  <FilterX className="h-3.5 w-3.5" /> Limpar filtros
                </Button>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={toggleAll} disabled={!filtered.length}>
                  {filtered.length > 0 && filtered.every((item) => selected.has(item.key)) ? "Limpar seleção" : "Selecionar visíveis"}
                </Button>
                <Button size="sm" onClick={() => setEnvioOpen(true)} disabled={!selectedItems.length}>
                  <Send className="mr-2 h-4 w-4" /> Registrar envio ({selectedItems.length})
                </Button>
              </div>
            </div>
          </GlassCard>

          {loadError ? (
            <GlassCard className="border-rose-500/20 p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold">Não foi possível atualizar a Central</h3>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{loadError}</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
              </Button>
            </GlassCard>
          ) : loading ? (
            <div className="grid gap-3" aria-label="Carregando pedidos">
              {Array.from({ length: 4 }).map((_, index) => (
                <GlassCard key={index} className="animate-pulse p-4">
                  <div className="h-4 w-1/3 rounded bg-muted" />
                  <div className="mt-3 h-3 w-4/5 rounded bg-muted/70" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-muted/50" />
                </GlassCard>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <GlassCard className="grid min-h-[32vh] place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
                  <Package className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold">Nenhum material encontrado</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasFilters ? "Ajuste ou limpe os filtros para ampliar a busca." : "Novas solicitações aparecerão aqui automaticamente."}
                </p>
                {hasFilters && <Button variant="outline" className="mt-4" onClick={resetFilters}>Limpar filtros</Button>}
              </div>
            </GlassCard>
          ) : (
            <div className="grid gap-3">
              {filtered.map((item) => {
                const status = item.meta?.status_compra ?? "aguardando";
                const withoutCc = !item.meta?.centro_custo;
                return (
                  <GlassCard
                    key={item.key}
                    className={`border-l-4 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 sm:p-4 ${statusAccent[status]} ${selected.has(item.key) ? "ring-1 ring-primary/50" : ""}`}
                  >
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
                      <Checkbox
                        className="mt-1"
                        checked={selected.has(item.key)}
                        onCheckedChange={() => toggle(item.key)}
                        aria-label={`Selecionar ${item.descricao}`}
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={origemBadge[item.origem]}>
                            {item.origem === "refrigeracao" ? "Refrigeração" : "Corretiva"}
                          </Badge>
                          <Badge variant="outline" className={item.fonte === "execucao_campo" ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" : ""}>
                            {item.fonte === "execucao_campo" ? "Execução de Campo" : "Apontamento técnico"}
                          </Badge>
                          <Badge variant="outline">{item.tipo === "peca" ? "Material" : "Defeito"}</Badge>
                          <Badge variant="outline" className="font-mono">OS {item.numeroOs}</Badge>
                          <Badge variant="outline" className={statusBadge[status]}>{STATUS_COMPRA_LABEL[status]}</Badge>
                          {withoutCc && (
                            <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300">
                              Sem centro de custo
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold leading-relaxed sm:text-[15px]">
                              {item.descricao}
                              {item.quantidade ? <span className="ml-2 text-muted-foreground">× {item.quantidade}</span> : null}
                            </p>
                            {item.descricaoOs && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.descricaoOs}</p>}
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-white/5 bg-muted/25 px-3 py-2">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">Local</span>
                            <span className="mt-0.5 block text-foreground/80">{[item.predio, item.andar, item.local].filter(Boolean).join(" · ") || "Não informado"}</span>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-muted/25 px-3 py-2">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">Responsável</span>
                            <span className="mt-0.5 block text-foreground/80">{item.equipe || "Equipe não informada"}{item.solicitante ? ` · ${item.solicitante}` : ""}</span>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-muted/25 px-3 py-2">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">Entrada na fila</span>
                            <span className="mt-0.5 block text-foreground/80">{fmt(item.criadoEm)}{item.solicitacaoNumero ? ` · ${item.solicitacaoNumero}` : ""}</span>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-muted/25 px-3 py-2">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-60">Compra</span>
                            <span className="mt-0.5 block text-foreground/80">{item.meta?.centro_custo ? `CC ${item.meta.centro_custo}` : "Centro de custo pendente"}{item.meta?.numero_requisicao ? ` · Req. ${item.meta.numero_requisicao}` : ""}</span>
                          </div>
                        </div>
                      </div>

                      <Button size="sm" variant="outline" onClick={() => setEditing(item)} className="col-start-2 justify-self-start lg:col-start-3 lg:row-start-1 lg:justify-self-end">
                        Gerenciar
                      </Button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="centros" className="mt-4">
          <CentrosCustoPanel centros={centros} onChanged={() => load(true)} />
        </TabsContent>

        <TabsContent value="envios" className="mt-4 space-y-3">
          {envios.length === 0 ? (
            <GlassCard className="grid min-h-[30vh] place-items-center p-8 text-center text-sm text-muted-foreground">
              Nenhum envio à Facilities registrado até o momento.
            </GlassCard>
          ) : (
            envios.map((envio) => (
              <GlassCard key={envio.id} className="border-l-4 border-l-emerald-400 p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        <History className="mr-1 h-3 w-3" /> {fmt(envio.enviado_em)}
                      </Badge>
                      {envio.centro_custo && <Badge variant="outline">CC {envio.centro_custo}</Badge>}
                      {envio.canal && <Badge variant="outline">{envio.canal}</Badge>}
                    </div>
                    {envio.destinatario && <p className="mt-2 text-sm font-semibold">Destinatário: {envio.destinatario}</p>}
                    {envio.observacao && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{envio.observacao}</p>}
                    <div className="mt-3 max-h-36 overflow-y-auto rounded-2xl border border-white/5 bg-muted/30 p-3 text-xs">
                      {(envio.itens ?? []).map((item, index) => (
                        <div key={`${envio.id}-${index}`} className="border-b border-white/5 py-1.5 last:border-0">OS {item.numeroOs} — {item.descricao}</div>
                      ))}
                    </div>
                  </div>
                  <Badge variant="outline" className="h-fit">{envio.total_itens} itens</Badge>
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>
      </Tabs>

      <ItemDialog item={editing} centros={centros} onClose={() => setEditing(null)} onSaved={() => load(true)} />
      <EnvioDialog
        open={envioOpen}
        itens={selectedItems}
        centros={centros}
        onOpenChange={setEnvioOpen}
        onSaved={async () => {
          setSelected(new Set());
          await load(true);
        }}
      />
    </PageShell>
  );
}

function ItemDialog({
  item,
  centros,
  onClose,
  onSaved,
}: {
  item: ControleItem | null;
  centros: CentroCusto[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [cc, setCc] = useState("");
  const [req, setReq] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [status, setStatus] = useState<StatusCompra>("aguardando");
  const [data, setData] = useState("");
  const [solicitadoPor, setSolicitadoPor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const meta = item.meta;
    setCc(meta?.centro_custo ?? "");
    setReq(meta?.numero_requisicao ?? "");
    setFornecedor(meta?.fornecedor ?? "");
    setValor(meta?.valor_estimado != null ? String(meta.valor_estimado) : "");
    setStatus(meta?.status_compra ?? "aguardando");
    setData(meta?.data_solicitacao_facilities ? toLocalInput(meta.data_solicitacao_facilities) : "");
    setSolicitadoPor(meta?.solicitado_por ?? "");
    setObservacao(meta?.observacao ?? "");
  }, [item]);

  const save = async () => {
    if (!item) return;
    const numericValue = valor.trim() ? Number(valor.replace(/\./g, "").replace(",", ".")) : null;
    if (numericValue !== null && (!Number.isFinite(numericValue) || numericValue < 0)) {
      toast.error("Informe um valor estimado válido.");
      return;
    }

    setSaving(true);
    try {
      await upsertMeta(item, {
        centro_custo: cc.trim() || null,
        numero_requisicao: req.trim() || null,
        fornecedor: fornecedor.trim() || null,
        valor_estimado: numericValue,
        status_compra: status,
        data_solicitacao_facilities: data ? new Date(data).toISOString() : null,
        solicitado_por: solicitadoPor.trim() || null,
        observacao: observacao.trim() || null,
      });
      toast.success("Material atualizado na Central.");
      await onSaved();
      onClose();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao salvar o controle do material.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/10 sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex flex-wrap gap-1.5">
            {item && <Badge variant="outline" className={origemBadge[item.origem]}>{item.origem === "refrigeracao" ? "Refrigeração" : "Corretiva"}</Badge>}
            {item?.fonte === "execucao_campo" && <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">Execução de Campo</Badge>}
            {item && <Badge variant="outline" className="font-mono">OS {item.numeroOs}</Badge>}
          </div>
          <DialogTitle className="break-words text-xl">{item?.descricao}</DialogTitle>
          <DialogDescription>
            Controle de compra, centro de custo e comprovação do encaminhamento à Facilities.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-white/8 bg-muted/25 p-3 text-xs text-muted-foreground">
            <div className="grid gap-2 sm:grid-cols-2">
              <span><strong className="text-foreground/80">Local:</strong> {[item?.predio, item?.andar, item?.local].filter(Boolean).join(" · ") || "—"}</span>
              <span><strong className="text-foreground/80">Equipe:</strong> {item?.equipe || "—"}</span>
              <span><strong className="text-foreground/80">Solicitante:</strong> {item?.solicitante || "—"}</span>
              <span><strong className="text-foreground/80">Entrada:</strong> {fmt(item?.criadoEm)}</span>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/8 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Compras e classificação</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Centro de custo</Label>
                <Input value={cc} onChange={(event) => setCc(event.target.value)} list="centros-custo-list" placeholder="Ex.: 4102-MANUT" />
                <datalist id="centros-custo-list">
                  {centros.map((centro) => <option key={centro.id} value={centro.codigo}>{centro.descricao ?? ""}</option>)}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label>Situação da compra</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as StatusCompra)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_COMPRA_ORDER.map((option) => <SelectItem key={option} value={option}>{STATUS_COMPRA_LABEL[option]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Nº da requisição</Label>
                <Input value={req} onChange={(event) => setReq(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Fornecedor</Label>
                <Input value={fornecedor} onChange={(event) => setFornecedor(event.target.value)} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Valor estimado (R$)</Label>
                <Input value={valor} onChange={(event) => setValor(event.target.value)} inputMode="decimal" placeholder="0,00" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/8 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Facilities e rastreabilidade</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Data/hora da solicitação</Label>
                <Input type="datetime-local" value={data} onChange={(event) => setData(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Solicitado por</Label>
                <Input value={solicitadoPor} onChange={(event) => setSolicitadoPor(event.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Observação</Label>
              <Textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} rows={3} />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setData(toLocalInput());
                if (status === "aguardando") setStatus("solicitado");
              }}
              className="justify-self-start"
            >
              <CalendarClock className="mr-2 h-4 w-4" /> Marcar envio agora
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnvioDialog({
  open,
  itens,
  centros,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  itens: ControleItem[];
  centros: CentroCusto[];
  onOpenChange: (value: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [quando, setQuando] = useState(toLocalInput());
  const [cc, setCc] = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [canal, setCanal] = useState("E-mail");
  const [solicitante, setSolicitante] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setQuando(toLocalInput());
  }, [open]);

  const submit = async () => {
    if (!itens.length) return;
    const date = new Date(quando);
    if (Number.isNaN(date.getTime())) {
      toast.error("Informe uma data e hora válidas.");
      return;
    }

    setSaving(true);
    try {
      await registrarEnvioFacilities({
        itens,
        enviadoEm: date.toISOString(),
        centroCusto: cc.trim() || null,
        destinatario: destinatario.trim() || null,
        canal: canal.trim() || null,
        observacao: observacao.trim() || null,
        solicitadoPor: solicitante.trim() || null,
      });
      toast.success("Envio à Facilities registrado e itens atualizados.");
      onOpenChange(false);
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao registrar o envio.");
    } finally {
      setSaving(false);
    }
  };

  const missingCc = itens.filter((item) => !item.meta?.centro_custo).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/10 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar envio à Facilities</DialogTitle>
          <DialogDescription>{itens.length} item(ns) serão registrados no histórico e marcados como solicitados.</DialogDescription>
        </DialogHeader>

        {missingCc > 0 && (
          <div className="flex gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{missingCc} item(ns) ainda não possuem centro de custo. Você pode aplicar um centro de custo comum neste envio.</span>
          </div>
        )}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Data e hora do envio</Label>
            <Input type="datetime-local" value={quando} onChange={(event) => setQuando(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Centro de custo comum</Label>
              <Input value={cc} onChange={(event) => setCc(event.target.value)} list="centros-custo-list-envio" />
              <datalist id="centros-custo-list-envio">
                {centros.map((centro) => <option key={centro.id} value={centro.codigo}>{centro.descricao ?? ""}</option>)}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label>Canal</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="E-mail">E-mail</SelectItem>
                  <SelectItem value="Sistema">Sistema</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Presencial">Presencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Destinatário</Label>
              <Input value={destinatario} onChange={(event) => setDestinatario(event.target.value)} placeholder="Facilities" />
            </div>
            <div className="grid gap-1.5">
              <Label>Solicitado por</Label>
              <Input value={solicitante} onChange={(event) => setSolicitante(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Observação / protocolo</Label>
            <Textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} rows={3} />
          </div>
          <div className="max-h-44 overflow-y-auto rounded-2xl border border-white/5 bg-muted/30 p-3 text-xs">
            {itens.map((item) => <div key={item.key} className="border-b border-white/5 py-1.5 last:border-0">OS {item.numeroOs} — {item.descricao}</div>)}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={saving || !itens.length}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Registrar envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CentrosCustoPanel({
  centros,
  onChanged,
}: {
  centros: CentroCusto[];
  onChanged: () => Promise<void>;
}) {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!codigo.trim()) {
      toast.error("Informe o código do centro de custo.");
      return;
    }

    setSaving(true);
    try {
      await saveCentroCusto({
        codigo: codigo.trim(),
        descricao: descricao.trim() || null,
        responsavel: responsavel.trim() || null,
      } as any);
      setCodigo("");
      setDescricao("");
      setResponsavel("");
      toast.success("Centro de custo salvo.");
      await onChanged();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao salvar o centro de custo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="border-primary/10 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></div>
          <div>
            <div className="text-sm font-semibold">Cadastrar centro de custo</div>
            <div className="text-xs text-muted-foreground">Mantenha a referência de compras organizada e reutilizável.</div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input value={codigo} onChange={(event) => setCodigo(event.target.value)} placeholder="Código" />
          <Input value={descricao} onChange={(event) => setDescricao(event.target.value)} placeholder="Descrição / área" />
          <Input value={responsavel} onChange={(event) => setResponsavel(event.target.value)} placeholder="Responsável" />
          <Button onClick={() => void add()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Adicionar
          </Button>
        </div>
      </GlassCard>

      {centros.length === 0 ? (
        <GlassCard className="grid min-h-[22vh] place-items-center text-sm text-muted-foreground">Nenhum centro de custo cadastrado.</GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {centros.map((centro) => (
            <GlassCard key={centro.id} className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-bold text-primary">{centro.codigo}</div>
                  <div className="mt-1 truncate text-sm">{centro.descricao ?? "Sem descrição"}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{centro.responsavel ? `Responsável: ${centro.responsavel}` : "Responsável não informado"}</div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Excluir centro de custo ${centro.codigo}`}
                  onClick={async () => {
                    if (!window.confirm(`Excluir o centro de custo ${centro.codigo}?`)) return;
                    try {
                      await deleteCentroCusto(centro.id);
                      toast.success("Centro de custo removido.");
                      await onChanged();
                    } catch (error: any) {
                      toast.error(error?.message ?? "Falha ao remover o centro de custo.");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
