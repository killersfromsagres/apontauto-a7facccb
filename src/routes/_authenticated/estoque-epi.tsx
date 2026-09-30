import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardCheck,
  Download,
  Edit3,
  FileSpreadsheet,
  HardHat,
  History,
  Loader2,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Shirt,
  UserRoundPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BrandedLoadingState } from "@/components/branded-loading-state";
import { GlassCard } from "@/components/glass-card";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import {
  ESTOQUE_CATEGORIAS,
  estoqueStatus,
  fetchEstoqueSnapshot,
  inventoryValue,
  registerEstoqueDelivery,
  registerEstoqueMovement,
  saveEstoqueColaborador,
  saveEstoqueItem,
  type EstoqueColaborador,
  type EstoqueColaboradorInput,
  type EstoqueEntrega,
  type EstoqueItem,
  type EstoqueItemInput,
  type EstoqueMovementType,
  type EstoqueMovimento,
  type EstoqueSnapshot,
} from "@/lib/estoque-epi/data";
import { generateEstoqueWorkbook } from "@/lib/estoque-epi/export";

export const Route = createFileRoute("/_authenticated/estoque-epi")({
  component: EstoqueEpiPage,
});

const EMPTY: EstoqueSnapshot = {
  items: [],
  colaboradores: [],
  movimentos: [],
  entregas: [],
};

const MOVEMENT_LABELS: Record<EstoqueMovementType, string> = {
  entrada: "Entrada",
  saida: "Saída",
  devolucao: "Devolução",
  ajuste_positivo: "Ajuste positivo",
  ajuste_negativo: "Ajuste negativo",
  descarte: "Descarte",
};

const STATUS_STYLES: Record<string, string> = {
  ZERADO: "border-rose-500/25 bg-rose-500/[0.08] text-rose-600 dark:text-rose-300",
  CRÍTICO: "border-rose-500/25 bg-rose-500/[0.08] text-rose-600 dark:text-rose-300",
  COMPRAR: "border-amber-500/25 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300",
  IDEAL: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300",
  ACIMA: "border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300",
  "SEM META": "border-border/70 bg-muted/30 text-muted-foreground",
};

function numberValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function EstoqueEpiPage() {
  const [data, setData] = useState<EstoqueSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState("visao");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("TODAS");
  const [statusFilter, setStatusFilter] = useState("TODOS");

  const [itemDialog, setItemDialog] = useState<EstoqueItem | "new" | null>(null);
  const [movementItem, setMovementItem] = useState<EstoqueItem | null>(null);
  const [movementKind, setMovementKind] =
    useState<EstoqueMovementType>("entrada");
  const [collabDialog, setCollabDialog] =
    useState<EstoqueColaborador | "new" | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const snapshot = await fetchEstoqueSnapshot();
      setData(snapshot);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Não foi possível carregar o estoque.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeItems = useMemo(
    () => data.items.filter((item) => item.ativo),
    [data.items],
  );

  const kpis = useMemo(() => {
    const totalQty = activeItems.reduce(
      (sum, item) => sum + Number(item.estoque_atual || 0),
      0,
    );
    const totalValue = activeItems.reduce(
      (sum, item) => sum + inventoryValue(item),
      0,
    );
    const attention = activeItems.filter((item) =>
      ["ZERADO", "CRÍTICO", "COMPRAR"].includes(estoqueStatus(item)),
    );
    const zeroed = activeItems.filter(
      (item) => estoqueStatus(item) === "ZERADO",
    );
    return {
      totalItems: activeItems.length,
      totalQty,
      totalValue,
      attention: attention.length,
      zeroed: zeroed.length,
      collaborators: data.colaboradores.filter((c) => c.ativo).length,
    };
  }, [activeItems, data.colaboradores]);

  const categories = useMemo(() => {
    const map = new Map<string, { items: number; qty: number; value: number }>();
    activeItems.forEach((item) => {
      const current = map.get(item.categoria) ?? {
        items: 0,
        qty: 0,
        value: 0,
      };
      current.items += 1;
      current.qty += Number(item.estoque_atual || 0);
      current.value += inventoryValue(item);
      map.set(item.categoria, current);
    });
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR"),
    );
  }, [activeItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return data.items.filter((item) => {
      const status = estoqueStatus(item);
      const matchesSearch =
        !q ||
        [
          item.codigo,
          item.descricao,
          item.categoria,
          item.tamanho,
          item.ca_numero,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(q);
      const matchesCategory =
        category === "TODAS" || item.categoria === category;
      const matchesStatus =
        statusFilter === "TODOS" || status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [category, data.items, search, statusFilter]);

  const attentionItems = useMemo(
    () =>
      activeItems
        .filter((item) =>
          ["ZERADO", "CRÍTICO", "COMPRAR"].includes(estoqueStatus(item)),
        )
        .sort(
          (a, b) =>
            Number(a.estoque_atual || 0) - Number(b.estoque_atual || 0),
        )
        .slice(0, 12),
    [activeItems],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const snapshot = await fetchEstoqueSnapshot();
      const file = await generateEstoqueWorkbook(snapshot);
      downloadBlob(file.blob, file.filename);
      toast.success("Planilha profissional de estoque atualizada.");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Falha ao gerar a planilha.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <PageShell
        title="Estoque EPI & Uniformes"
        description="Carregando o controle de estoque."
      >
        <BrandedLoadingState variant="page" label="Carregando estoque" />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Estoque EPI & Uniformes"
      description="Controle integrado de uniformes, EPIs, entradas, saídas e retiradas por colaborador."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="glass"
            className="h-10 rounded-xl border-emerald-500/20 bg-emerald-500/[0.05]"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
            )}
            Baixar planilha
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => void reload()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            icon={Boxes}
            label="Itens cadastrados"
            value={String(kpis.totalItems)}
            detail={`${kpis.totalQty.toLocaleString("pt-BR")} unidades`}
          />
          <MetricCard
            icon={WalletCards}
            label="Valor em estoque"
            value={money(kpis.totalValue)}
            detail="Custo estimado disponível"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Atenção / compra"
            value={String(kpis.attention)}
            detail={`${kpis.zeroed} item(ns) zerado(s)`}
            tone="warning"
          />
          <MetricCard
            icon={Users}
            label="Colaboradores"
            value={String(kpis.collaborators)}
            detail="Ativos no controle"
          />
          <MetricCard
            icon={Activity}
            label="Movimentações"
            value={String(data.movimentos.length)}
            detail="Registros auditáveis carregados"
          />
        </div>

        <GlassCard className="!p-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-muted/25 p-1">
              <TabsTrigger value="visao" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                Visão geral
              </TabsTrigger>
              <TabsTrigger value="estoque" className="gap-2">
                <PackageOpen className="h-4 w-4" />
                Estoque
              </TabsTrigger>
              <TabsTrigger value="retiradas" className="gap-2">
                <PackageCheck className="h-4 w-4" />
                Retiradas
              </TabsTrigger>
              <TabsTrigger value="movimentos" className="gap-2">
                <History className="h-4 w-4" />
                Movimentações
              </TabsTrigger>
              <TabsTrigger value="colaboradores" className="gap-2">
                <Users className="h-4 w-4" />
                Colaboradores
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visao" className="mt-3">
              <div className="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
                <GlassCard className="!p-4">
                  <SectionTitle
                    icon={AlertTriangle}
                    title="Reposição e atenção"
                    description="Itens zerados, críticos ou abaixo do estoque ideal."
                  />
                  <div className="mt-3 space-y-1.5">
                    {attentionItems.length === 0 ? (
                      <EmptyState text="Nenhum item exige reposição agora." />
                    ) : (
                      attentionItems.map((item) => (
                        <StockRow
                          key={item.id}
                          item={item}
                          compact
                          onMovement={(kind) => {
                            setMovementKind(kind);
                            setMovementItem(item);
                          }}
                          onEdit={() => setItemDialog(item)}
                        />
                      ))
                    )}
                  </div>
                </GlassCard>

                <GlassCard className="!p-4">
                  <SectionTitle
                    icon={Shirt}
                    title="Distribuição por categoria"
                    description="Quantidade física e valor por grupo."
                  />
                  <div className="mt-3 space-y-2">
                    {categories.map(([name, stats]) => {
                      const share =
                        kpis.totalQty > 0
                          ? Math.min(100, (stats.qty / kpis.totalQty) * 100)
                          : 0;
                      return (
                        <div
                          key={name}
                          className="rounded-xl border border-border/45 bg-background/35 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold">
                                {name}
                              </p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {stats.items} itens · {stats.qty.toLocaleString("pt-BR")} un.
                              </p>
                            </div>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {money(stats.value)}
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/40">
                            <div
                              className="h-full rounded-full bg-primary/70"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>

                <GlassCard className="!p-4 xl:col-span-2">
                  <SectionTitle
                    icon={History}
                    title="Atividade recente"
                    description="Últimas movimentações registradas no estoque."
                  />
                  <MovementList movimentos={data.movimentos.slice(0, 12)} />
                </GlassCard>
              </div>
            </TabsContent>

            <TabsContent value="estoque" className="mt-3">
              <GlassCard className="!p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <SectionTitle
                    icon={PackageOpen}
                    title="Catálogo e saldo"
                    description="A base original da sua planilha já foi importada para este controle."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setItemDialog("new")}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Novo item
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const first = activeItems[0];
                        if (!first) return toast.warning("Cadastre um item primeiro.");
                        setMovementKind("entrada");
                        setMovementItem(first);
                      }}
                    >
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      Registrar movimento
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_180px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="pl-9"
                      placeholder="Buscar por descrição, código, CA ou tamanho..."
                    />
                  </div>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODAS">Todas as categorias</SelectItem>
                      {[
                        ...new Set(data.items.map((item) => item.categoria)),
                      ]
                        .sort((a, b) => a.localeCompare(b, "pt-BR"))
                        .map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "TODOS",
                        "ZERADO",
                        "CRÍTICO",
                        "COMPRAR",
                        "IDEAL",
                        "ACIMA",
                        "SEM META",
                      ].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value === "TODOS" ? "Todos os status" : value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-3 space-y-1.5">
                  {filteredItems.map((item) => (
                    <StockRow
                      key={item.id}
                      item={item}
                      onMovement={(kind) => {
                        setMovementKind(kind);
                        setMovementItem(item);
                      }}
                      onEdit={() => setItemDialog(item)}
                    />
                  ))}
                </div>
              </GlassCard>
            </TabsContent>

            <TabsContent value="retiradas" className="mt-3">
              <div className="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
                <GlassCard className="!p-4">
                  <SectionTitle
                    icon={PackageCheck}
                    title="Entrega de EPI / uniforme"
                    description="Registre uma retirada vinculada ao colaborador."
                  />
                  <Button
                    className="mt-4 w-full"
                    onClick={() => setDeliveryOpen(true)}
                  >
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Registrar retirada
                  </Button>
                  <div className="mt-4 rounded-xl border border-border/45 bg-background/30 p-3 text-xs text-muted-foreground">
                    A entrega pode conter vários itens. Cada saída reduz o saldo
                    automaticamente e fica vinculada ao colaborador para auditoria.
                  </div>
                </GlassCard>

                <GlassCard className="!p-4">
                  <SectionTitle
                    icon={History}
                    title="Últimas retiradas"
                    description="Histórico nominal de entrega aos colaboradores."
                  />
                  <DeliveryList entregas={data.entregas.slice(0, 60)} />
                </GlassCard>
              </div>
            </TabsContent>

            <TabsContent value="movimentos" className="mt-3">
              <GlassCard className="!p-4">
                <SectionTitle
                  icon={History}
                  title="Livro de movimentações"
                  description="Rastreabilidade completa de entradas, saídas, devoluções, ajustes e descartes."
                />
                <MovementList movimentos={data.movimentos} />
              </GlassCard>
            </TabsContent>

            <TabsContent value="colaboradores" className="mt-3">
              <GlassCard className="!p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <SectionTitle
                    icon={Users}
                    title="Cadastro de colaboradores"
                    description="Pessoas que podem receber uniformes e EPIs."
                  />
                  <Button
                    size="sm"
                    onClick={() => setCollabDialog("new")}
                  >
                    <UserRoundPlus className="mr-2 h-4 w-4" />
                    Novo colaborador
                  </Button>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {data.colaboradores.map((colab) => (
                    <button
                      type="button"
                      key={colab.id}
                      onClick={() => setCollabDialog(colab)}
                      className="rounded-xl border border-border/50 bg-background/30 p-3 text-left transition hover:border-primary/25 hover:bg-background/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {colab.nome}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {colab.matricula || "Sem matrícula"} ·{" "}
                            {colab.setor || "Sem setor"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full text-[9px]",
                            colab.ativo
                              ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                              : "text-muted-foreground",
                          )}
                        >
                          {colab.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {colab.cargo || "Cargo não informado"}
                        {colab.unidade ? ` · ${colab.unidade}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>
        </GlassCard>
      </div>

      <ItemDialog
        target={itemDialog}
        onClose={() => setItemDialog(null)}
        onSaved={async () => {
          setItemDialog(null);
          await reload();
        }}
      />

      <MovementDialog
        item={movementItem}
        initialType={movementKind}
        colaboradores={data.colaboradores.filter((c) => c.ativo)}
        onClose={() => setMovementItem(null)}
        onSaved={async () => {
          setMovementItem(null);
          await reload();
        }}
      />

      <CollaboratorDialog
        target={collabDialog}
        onClose={() => setCollabDialog(null)}
        onSaved={async () => {
          setCollabDialog(null);
          await reload();
        }}
      />

      <DeliveryDialog
        open={deliveryOpen}
        items={activeItems}
        colaboradores={data.colaboradores.filter((c) => c.ativo)}
        onClose={() => setDeliveryOpen(false)}
        onSaved={async () => {
          setDeliveryOpen(false);
          await reload();
        }}
      />
    </PageShell>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <GlassCard className="!p-3.5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            tone === "warning"
              ? "bg-amber-500/[0.08] text-amber-500"
              : "bg-primary/[0.07] text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-lg font-bold tracking-tight">{value}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
        </div>
      </div>
    </GlassCard>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Boxes;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.07] text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function StockRow({
  item,
  compact = false,
  onMovement,
  onEdit,
}: {
  item: EstoqueItem;
  compact?: boolean;
  onMovement: (type: EstoqueMovementType) => void;
  onEdit: () => void;
}) {
  const status = estoqueStatus(item);
  return (
    <div className="grid gap-2 rounded-xl border border-border/45 bg-background/30 p-2.5 transition-colors hover:bg-background/50 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-xs font-semibold">
            {item.descricao}
          </p>
          <Badge
            variant="outline"
            className={cn("rounded-full px-2 text-[8px]", STATUS_STYLES[status])}
          >
            {status}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-muted-foreground">
          {item.codigo && <span>Cód. {item.codigo}</span>}
          <span>{item.categoria}</span>
          {item.tamanho && <span>Tam. {item.tamanho}</span>}
          {item.ca_numero && <span>CA {item.ca_numero}</span>}
          {!compact && item.valor_unitario !== null && (
            <span>{money(item.valor_unitario)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 md:justify-end">
        <div className="text-right">
          <p className="text-sm font-bold">
            {item.estoque_atual.toLocaleString("pt-BR")}{" "}
            <span className="text-[9px] font-medium text-muted-foreground">
              {item.unidade}
            </span>
          </p>
          <p className="text-[8px] text-muted-foreground">
            Ideal {item.estoque_ideal ?? "—"}
          </p>
        </div>
        {!compact && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-emerald-600"
              title="Registrar entrada"
              onClick={() => onMovement("entrada")}
            >
              <ArrowDownToLine className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-amber-600"
              title="Registrar saída"
              onClick={() => onMovement("saida")}
            >
              <ArrowUpFromLine className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg"
              title="Editar item"
              onClick={onEdit}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MovementList({ movimentos }: { movimentos: EstoqueMovimento[] }) {
  if (movimentos.length === 0) return <EmptyState text="Sem movimentações registradas." />;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border/45">
      {movimentos.map((mov, index) => (
        <div
          key={mov.id}
          className={cn(
            "grid gap-2 bg-background/25 px-3 py-2.5 md:grid-cols-[110px_120px_minmax(0,1fr)_auto] md:items-center",
            index > 0 && "border-t border-border/35",
          )}
        >
          <span className="text-[10px] text-muted-foreground">
            {fmtDate(mov.data_movimento)}
          </span>
          <Badge variant="outline" className="w-fit rounded-full text-[9px]">
            {MOVEMENT_LABELS[mov.tipo]}
          </Badge>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold">
              {mov.item?.descricao || "Item"}
            </p>
            <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
              {mov.colaborador_nome ||
                mov.motivo ||
                mov.observacao ||
                "Movimentação de estoque"}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-xs font-bold",
                ["entrada", "devolucao", "ajuste_positivo"].includes(mov.tipo)
                  ? "text-emerald-600"
                  : "text-amber-600",
              )}
            >
              {["entrada", "devolucao", "ajuste_positivo"].includes(mov.tipo)
                ? "+"
                : "-"}
              {mov.quantidade.toLocaleString("pt-BR")}
            </p>
            <p className="text-[8px] text-muted-foreground">
              saldo {mov.saldo_apos.toLocaleString("pt-BR")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeliveryList({ entregas }: { entregas: EstoqueEntrega[] }) {
  if (entregas.length === 0) return <EmptyState text="Nenhuma retirada registrada." />;

  return (
    <div className="mt-3 space-y-1.5">
      {entregas.map((entrega) => {
        const qty = (entrega.itens ?? []).reduce(
          (sum, item) => sum + Number(item.quantidade || 0),
          0,
        );
        return (
          <div
            key={entrega.id}
            className="rounded-xl border border-border/45 bg-background/30 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  {entrega.colaborador_nome}
                </p>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  {fmtDate(entrega.data_entrega)} ·{" "}
                  {entrega.colaborador_setor || "Setor não informado"}
                </p>
              </div>
              <Badge variant="outline" className="rounded-full text-[9px]">
                {qty} item(ns)
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(entrega.itens ?? []).slice(0, 5).map((item) => (
                <span
                  key={item.id}
                  className="rounded-md border border-border/40 bg-muted/20 px-2 py-1 text-[8px] text-muted-foreground"
                >
                  {item.quantidade}× {item.descricao}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EstoqueItem | "new" | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const item = target && target !== "new" ? target : null;
  const [form, setForm] = useState<EstoqueItemInput>({
    descricao: "",
    categoria: "Outros EPIs",
    unidade: "UN",
    ativo: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setForm(
      item
        ? {
            codigo: item.codigo,
            descricao: item.descricao,
            categoria: item.categoria,
            tamanho: item.tamanho,
            ca_numero: item.ca_numero,
            unidade: item.unidade,
            estoque_ideal: item.estoque_ideal,
            estoque_minimo: item.estoque_minimo,
            valor_unitario: item.valor_unitario,
            ativo: item.ativo,
          }
        : {
            descricao: "",
            categoria: "Outros EPIs",
            unidade: "UN",
            ativo: true,
          },
    );
  }, [item, target]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Novo item de estoque"}</DialogTitle>
          <DialogDescription>
            Cadastre uniforme, EPI, calçado ou consumível com meta de estoque e CA.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Descrição" className="sm:col-span-2">
            <Input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </Field>
          <Field label="Código">
            <Input
              value={form.codigo ?? ""}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            />
          </Field>
          <Field label="Categoria">
            <Select
              value={form.categoria}
              onValueChange={(value) => setForm({ ...form, categoria: value })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTOQUE_CATEGORIAS.map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tamanho">
            <Input
              value={form.tamanho ?? ""}
              onChange={(e) => setForm({ ...form, tamanho: e.target.value })}
            />
          </Field>
          <Field label="CA">
            <Input
              value={form.ca_numero ?? ""}
              onChange={(e) => setForm({ ...form, ca_numero: e.target.value })}
            />
          </Field>
          <Field label="Estoque mínimo">
            <Input
              inputMode="decimal"
              value={form.estoque_minimo ?? ""}
              onChange={(e) =>
                setForm({ ...form, estoque_minimo: numberValue(e.target.value) })
              }
            />
          </Field>
          <Field label="Estoque ideal">
            <Input
              inputMode="decimal"
              value={form.estoque_ideal ?? ""}
              onChange={(e) =>
                setForm({ ...form, estoque_ideal: numberValue(e.target.value) })
              }
            />
          </Field>
          <Field label="Valor unitário">
            <Input
              inputMode="decimal"
              value={form.valor_unitario ?? ""}
              onChange={(e) =>
                setForm({ ...form, valor_unitario: numberValue(e.target.value) })
              }
            />
          </Field>
          <Field label="Unidade">
            <Input
              value={form.unidade ?? "UN"}
              onChange={(e) => setForm({ ...form, unidade: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={saving || !form.descricao.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await saveEstoqueItem(form, item?.id);
                toast.success(item ? "Item atualizado." : "Item cadastrado.");
                await onSaved();
              } catch (error: any) {
                toast.error(error?.message ?? "Falha ao salvar item.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({
  item,
  initialType,
  colaboradores,
  onClose,
  onSaved,
}: {
  item: EstoqueItem | null;
  initialType: EstoqueMovementType;
  colaboradores: EstoqueColaborador[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<EstoqueMovementType>(initialType);
  const [quantidade, setQuantidade] = useState("1");
  const [colaboradorId, setColaboradorId] = useState("SEM_COLABORADOR");
  const [motivo, setMotivo] = useState("");
  const [documento, setDocumento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [dataMovimento, setDataMovimento] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTipo(initialType);
    setQuantidade("1");
    setColaboradorId("SEM_COLABORADOR");
    setMotivo("");
    setDocumento("");
    setObservacao("");
    setValorUnitario("");
    setDataMovimento(todayIso());
  }, [initialType, item?.id]);

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>
            {item?.descricao} · Saldo atual {item?.estoque_atual ?? 0} {item?.unidade}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <Select value={tipo} onValueChange={(value) => setTipo(value as EstoqueMovementType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MOVEMENT_LABELS) as EstoqueMovementType[]).map((key) => (
                  <SelectItem key={key} value={key}>{MOVEMENT_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Quantidade">
            <Input
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </Field>
          <Field label="Data">
            <Input
              type="date"
              value={dataMovimento}
              onChange={(e) => setDataMovimento(e.target.value)}
            />
          </Field>
          <Field label="Colaborador">
            <Select value={colaboradorId} onValueChange={setColaboradorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SEM_COLABORADOR">Não vincular</SelectItem>
                {colaboradores.map((colab) => (
                  <SelectItem key={colab.id} value={colab.id}>{colab.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {tipo === "entrada" && (
            <Field label="Valor unitário da compra">
              <Input
                inputMode="decimal"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
              />
            </Field>
          )}
          <Field label="Documento / NF">
            <Input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
            />
          </Field>
          <Field label="Motivo" className="sm:col-span-2">
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: compra, entrega, inventário, avaria..."
            />
          </Field>
          <Field label="Observação" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={saving || !item || Number(quantidade.replace(",", ".")) <= 0}
            onClick={async () => {
              if (!item) return;
              setSaving(true);
              try {
                await registerEstoqueMovement({
                  itemId: item.id,
                  tipo,
                  quantidade: Number(quantidade.replace(",", ".")),
                  colaboradorId:
                    colaboradorId === "SEM_COLABORADOR" ? null : colaboradorId,
                  motivo,
                  documento,
                  observacao,
                  valorUnitario: numberValue(valorUnitario),
                  dataMovimento,
                });
                toast.success("Movimentação registrada e saldo atualizado.");
                await onSaved();
              } catch (error: any) {
                toast.error(error?.message ?? "Falha ao movimentar estoque.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollaboratorDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EstoqueColaborador | "new" | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const collaborator = target && target !== "new" ? target : null;
  const [form, setForm] = useState<EstoqueColaboradorInput>({
    nome: "",
    ativo: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setForm(
      collaborator
        ? {
            nome: collaborator.nome,
            matricula: collaborator.matricula,
            setor: collaborator.setor,
            cargo: collaborator.cargo,
            unidade: collaborator.unidade,
            ativo: collaborator.ativo,
          }
        : { nome: "", ativo: true },
    );
  }, [collaborator, target]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {collaborator ? "Editar colaborador" : "Novo colaborador"}
          </DialogTitle>
          <DialogDescription>
            Cadastro usado para rastrear quem recebeu cada EPI ou uniforme.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" className="sm:col-span-2">
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </Field>
          <Field label="Matrícula">
            <Input
              value={form.matricula ?? ""}
              onChange={(e) => setForm({ ...form, matricula: e.target.value })}
            />
          </Field>
          <Field label="Setor / equipe">
            <Input
              value={form.setor ?? ""}
              onChange={(e) => setForm({ ...form, setor: e.target.value })}
            />
          </Field>
          <Field label="Cargo">
            <Input
              value={form.cargo ?? ""}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
            />
          </Field>
          <Field label="Unidade">
            <Input
              value={form.unidade ?? ""}
              onChange={(e) => setForm({ ...form, unidade: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={saving || !form.nome.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await saveEstoqueColaborador(form, collaborator?.id);
                toast.success(
                  collaborator ? "Colaborador atualizado." : "Colaborador cadastrado.",
                );
                await onSaved();
              } catch (error: any) {
                toast.error(error?.message ?? "Falha ao salvar colaborador.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({
  open,
  items,
  colaboradores,
  onClose,
  onSaved,
}: {
  open: boolean;
  items: EstoqueItem[];
  colaboradores: EstoqueColaborador[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [colaboradorId, setColaboradorId] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [qty, setQty] = useState("1");
  const [cart, setCart] = useState<Array<{ itemId: string; quantidade: number }>>([]);
  const [dataEntrega, setDataEntrega] = useState(todayIso());
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setColaboradorId("");
    setSelectedItem("");
    setQty("1");
    setCart([]);
    setDataEntrega(todayIso());
    setObservacao("");
  }, [open]);

  const addItem = () => {
    const amount = Number(qty.replace(",", "."));
    if (!selectedItem || !Number.isFinite(amount) || amount <= 0) return;
    const item = items.find((entry) => entry.id === selectedItem);
    if (!item) return;
    if (amount > item.estoque_atual) {
      toast.warning(`Saldo disponível: ${item.estoque_atual} ${item.unidade}.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((entry) => entry.itemId === selectedItem);
      if (existing) {
        return current.map((entry) =>
          entry.itemId === selectedItem
            ? { ...entry, quantidade: entry.quantidade + amount }
            : entry,
        );
      }
      return [...current, { itemId: selectedItem, quantidade: amount }];
    });
    setSelectedItem("");
    setQty("1");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar retirada de EPI / uniforme</DialogTitle>
          <DialogDescription>
            Selecione o colaborador e adicione todos os itens entregues na mesma operação.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Colaborador" className="sm:col-span-2">
            <Select value={colaboradorId} onValueChange={setColaboradorId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {colaboradores.map((colab) => (
                  <SelectItem key={colab.id} value={colab.id}>
                    {colab.nome}{colab.matricula ? ` · ${colab.matricula}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data da entrega">
            <Input
              type="date"
              value={dataEntrega}
              onChange={(e) => setDataEntrega(e.target.value)}
            />
          </Field>
          <Field label="Observação">
            <Input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: admissão, troca, reposição..."
            />
          </Field>
        </div>

        <div className="rounded-xl border border-border/50 bg-background/30 p-3">
          <p className="text-xs font-semibold">Itens da retirada</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_auto]">
            <Select value={selectedItem} onValueChange={setSelectedItem}>
              <SelectTrigger><SelectValue placeholder="Selecionar item..." /></SelectTrigger>
              <SelectContent>
                {items
                  .filter((item) => item.estoque_atual > 0)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.descricao} · {item.estoque_atual} {item.unidade}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Qtd."
            />
            <Button type="button" variant="outline" onClick={addItem}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 space-y-1.5">
            {cart.length === 0 ? (
              <p className="py-4 text-center text-[10px] text-muted-foreground">
                Nenhum item adicionado.
              </p>
            ) : (
              cart.map((entry) => {
                const item = items.find((candidate) => candidate.id === entry.itemId);
                return (
                  <div
                    key={entry.itemId}
                    className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold">
                        {item?.descricao}
                      </p>
                      <p className="text-[8px] text-muted-foreground">
                        CA {item?.ca_numero || "—"} · saldo {item?.estoque_atual}
                      </p>
                    </div>
                    <Badge variant="outline">{entry.quantidade} {item?.unidade}</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() =>
                        setCart((current) =>
                          current.filter((candidate) => candidate.itemId !== entry.itemId),
                        )
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={saving || !colaboradorId || cart.length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                await registerEstoqueDelivery({
                  colaboradorId,
                  itens: cart,
                  observacao,
                  dataEntrega,
                });
                toast.success("Retirada registrada e estoque atualizado.");
                await onSaved();
              } catch (error: any) {
                toast.error(error?.message ?? "Falha ao registrar retirada.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar retirada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
