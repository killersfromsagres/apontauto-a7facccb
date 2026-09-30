import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarDays,
  ClipboardCheck,
  Edit3,
  FileSpreadsheet,
  History,
  Loader2,
  PackageCheck,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
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
  syncSraCollaborators,
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
import { parseSraWorkbook } from "@/lib/estoque-epi/sra-import";

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
  const [collabSearch, setCollabSearch] = useState("");
  const [collabStatus, setCollabStatus] = useState("TODOS");
  const [collabTeam, setCollabTeam] = useState("TODOS");
  const [sraImporting, setSraImporting] = useState(false);
  const sraInputRef = useRef<HTMLInputElement>(null);

  const [itemDialog, setItemDialog] = useState<EstoqueItem | "new" | null>(null);
  const [movementItem, setMovementItem] = useState<EstoqueItem | null>(null);
  const [movementKind, setMovementKind] =
    useState<EstoqueMovementType>("entrada");
  const [collabDialog, setCollabDialog] =
    useState<EstoqueColaborador | "new" | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryItemId, setEntryItemId] = useState<string | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryItemId, setDeliveryItemId] = useState<string | null>(null);

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
    };
  }, [activeItems]);

  const movementDatesByItem = useMemo(() => {
    const result = new Map<string, { entrada?: string; saida?: string }>();
    for (const movement of data.movimentos) {
      const current = result.get(movement.item_id) ?? {};
      if (
        movement.tipo === "entrada" &&
        !current.entrada
      ) {
        current.entrada = movement.data_movimento;
      }
      if (
        movement.tipo === "saida" &&
        !current.saida
      ) {
        current.saida = movement.data_movimento;
      }
      result.set(movement.item_id, current);
    }
    return result;
  }, [data.movimentos]);


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

  const sraStats = useMemo(() => {
    const sra = data.colaboradores.filter((item) => item.origem_sra);
    const situations = new Map<string, number>();
    sra.forEach((item) => {
      const key = item.situacao_sra?.trim() || "SEM SITUAÇÃO";
      situations.set(key, (situations.get(key) ?? 0) + 1);
    });
    const trainingDates = sra
      .map((item) => item.data_treinamento)
      .filter((value): value is string => Boolean(value))
      .sort();
    const syncDates = sra
      .map((item) => item.sra_synced_at)
      .filter((value): value is string => Boolean(value))
      .sort();

    return {
      total: sra.length,
      normal: situations.get("NORMAL") ?? 0,
      ferias: situations.get("FÉRIAS") ?? 0,
      afastado: situations.get("AFASTADO") ?? 0,
      trainingDate: trainingDates[trainingDates.length - 1] ?? null,
      lastSync: syncDates[syncDates.length - 1] ?? null,
    };
  }, [data.colaboradores]);

  const collaboratorTeams = useMemo(
    () =>
      [...new Set(
        data.colaboradores
          .map((item) => item.centro_resultado)
          .filter((value): value is string => Boolean(value)),
      )].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [data.colaboradores],
  );

  const filteredCollaborators = useMemo(() => {
    const q = collabSearch.trim().toLocaleLowerCase("pt-BR");
    return data.colaboradores.filter((colab) => {
      const matchesSearch =
        !q ||
        [
          colab.nome,
          colab.matricula,
          colab.funcao,
          colab.cargo,
          colab.centro_resultado,
          colab.setor_negocio,
          colab.local_trabalho,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(q);
      const matchesStatus =
        collabStatus === "TODOS" ||
        (colab.situacao_sra || (colab.ativo ? "ATIVO" : "INATIVO")) ===
          collabStatus;
      const matchesTeam =
        collabTeam === "TODOS" || colab.centro_resultado === collabTeam;
      return matchesSearch && matchesStatus && matchesTeam;
    });
  }, [collabSearch, collabStatus, collabTeam, data.colaboradores]);

  const handleSraImport = async (file: File) => {
    setSraImporting(true);
    try {
      const rows = await parseSraWorkbook(file);
      const result = await syncSraCollaborators(rows);
      await reload();
      toast.success(
        `SRA sincronizado: ${result.total ?? rows.length} colaborador(es) processado(s).`,
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Falha ao sincronizar o arquivo SRA.");
    } finally {
      setSraImporting(false);
      if (sraInputRef.current) sraInputRef.current.value = "";
    }
  };

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
      description="Entrada de materiais, retirada por colaborador e saldo de EPIs/uniformes em um fluxo simples e rastreável."
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
        <GlassCard className="!p-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(180px,auto))] lg:items-center">
            <div className="min-w-0 px-1 py-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">
                Operação rápida
              </p>
              <h2 className="mt-1 text-sm font-semibold">O que você precisa registrar?</h2>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Entrada aumenta o saldo. Saída registra o colaborador e a data da retirada. Ajustes ficam dentro do item.
              </p>
            </div>

            <Button
              variant="outline"
              className="h-auto min-h-14 justify-start rounded-xl border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5 text-left hover:bg-emerald-500/[0.08]"
              onClick={() => {
                setEntryItemId(null);
                setEntryOpen(true);
              }}
            >
              <span className="mr-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <PackagePlus className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold">Registrar entrada</span>
                <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
                  Item, quantidade e data de entrada
                </span>
              </span>
            </Button>

            <Button
              variant="outline"
              className="h-auto min-h-14 justify-start rounded-xl border-sky-500/20 bg-sky-500/[0.04] px-3 py-2.5 text-left hover:bg-sky-500/[0.08]"
              onClick={() => {
                setDeliveryItemId(null);
                setDeliveryOpen(true);
              }}
            >
              <span className="mr-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                <PackageMinus className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold">Registrar saída</span>
                <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
                  Colaborador, data e itens retirados
                </span>
              </span>
            </Button>

            <Button
              variant="outline"
              className="h-auto min-h-14 justify-start rounded-xl px-3 py-2.5 text-left"
              onClick={() => setItemDialog("new")}
            >
              <span className="mr-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.07] text-primary">
                <Plus className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold">Cadastrar item</span>
                <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
                  Novo EPI, uniforme ou material
                </span>
              </span>
            </Button>
          </div>
        </GlassCard>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Boxes}
            label="Itens cadastrados"
            value={String(kpis.totalItems)}
            detail="Tipos de EPI, uniforme e material"
          />
          <MetricCard
            icon={PackageOpen}
            label="Saldo físico"
            value={kpis.totalQty.toLocaleString("pt-BR")}
            detail="Unidades disponíveis no estoque"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Precisam de atenção"
            value={String(kpis.attention)}
            detail={`${kpis.zeroed} item(ns) zerado(s)`}
            tone="warning"
          />
          <MetricCard
            icon={WalletCards}
            label="Valor em estoque"
            value={money(kpis.totalValue)}
            detail="Custo estimado disponível"
          />
        </div>

        <GlassCard className="!p-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-muted/25 p-1">
              <TabsTrigger value="visao" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                Início
              </TabsTrigger>
              <TabsTrigger value="estoque" className="gap-2">
                <PackageOpen className="h-4 w-4" />
                Estoque
              </TabsTrigger>
              <TabsTrigger value="retiradas" className="gap-2">
                <PackageCheck className="h-4 w-4" />
                Saídas
              </TabsTrigger>
              <TabsTrigger value="movimentos" className="gap-2">
                <History className="h-4 w-4" />
                Histórico
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
                          lastEntryDate={movementDatesByItem.get(item.id)?.entrada}
                          lastExitDate={movementDatesByItem.get(item.id)?.saida}
                          onEntry={() => {
                            setEntryItemId(item.id);
                            setEntryOpen(true);
                          }}
                          onWithdraw={() => {
                            setDeliveryItemId(item.id);
                            setDeliveryOpen(true);
                          }}
                          onAdjust={(kind) => {
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
                    icon={ClipboardCheck}
                    title="Como usar"
                    description="Três passos simples para manter o estoque correto."
                  />
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.035] p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                        <span className="text-xs font-bold">1</span>
                      </span>
                      <div>
                        <p className="text-xs font-semibold">Quando receber material</p>
                        <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                          Clique em <strong>Registrar entrada</strong>, selecione o item, informe a quantidade e a data real da entrada.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 rounded-xl border border-sky-500/15 bg-sky-500/[0.035] p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                        <span className="text-xs font-bold">2</span>
                      </span>
                      <div>
                        <p className="text-xs font-semibold">Quando alguém retirar EPI ou uniforme</p>
                        <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                          Clique em <strong>Registrar saída</strong>. O nome do colaborador e a data da retirada são obrigatórios.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 rounded-xl border border-border/50 bg-background/35 p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.07] text-primary">
                        <span className="text-xs font-bold">3</span>
                      </span>
                      <div>
                        <p className="text-xs font-semibold">Acompanhe pelo histórico</p>
                        <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                          Consulte entradas, saídas e saldos ou use <strong>Baixar planilha</strong> para gerar o Excel atualizado.
                        </p>
                      </div>
                    </div>
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
                    title="Estoque atual"
                    description="Consulte o saldo e use Entrada, Saída ou Ajuste diretamente no item."
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
                      lastEntryDate={movementDatesByItem.get(item.id)?.entrada}
                      lastExitDate={movementDatesByItem.get(item.id)?.saida}
                      onEntry={() => {
                        setEntryItemId(item.id);
                        setEntryOpen(true);
                      }}
                      onWithdraw={() => {
                        setDeliveryItemId(item.id);
                        setDeliveryOpen(true);
                      }}
                      onAdjust={(kind) => {
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
                    title="Saída para colaborador"
                    description="Toda saída registra obrigatoriamente quem retirou e a data da retirada."
                  />
                  <Button
                    className="mt-4 w-full"
                    onClick={() => {
                      setDeliveryItemId(null);
                      setDeliveryOpen(true);
                    }}
                  >
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Registrar saída
                  </Button>
                  <div className="mt-4 rounded-xl border border-border/45 bg-background/30 p-3 text-xs text-muted-foreground">
                    Selecione o colaborador, informe a data e inclua um ou mais itens.
                    O saldo é reduzido automaticamente e o histórico fica disponível para auditoria.
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
                  title="Histórico do estoque"
                  description="Veja quando entrou, quando saiu, quem retirou e todas as correções de inventário."
                />
                <MovementList movimentos={data.movimentos} />
              </GlassCard>
            </TabsContent>

            <TabsContent value="colaboradores" className="mt-3">
              <div className="space-y-3">
                <GlassCard className="!p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <SectionTitle
                      icon={Users}
                      title="Colaboradores • SRA"
                      description="Base funcional integrada ao almoxarifado para identificar corretamente cada retirada."
                    />
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={sraInputRef}
                        type="file"
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleSraImport(file);
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sraImporting}
                        onClick={() => sraInputRef.current?.click()}
                      >
                        {sraImporting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
                        )}
                        Atualizar SRA
                      </Button>
                      <Button size="sm" onClick={() => setCollabDialog("new")}>
                        <UserRoundPlus className="mr-2 h-4 w-4" />
                        Novo colaborador
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <SraMetric label="No SRA" value={String(sraStats.total)} detail="Colaboradores sincronizados" />
                    <SraMetric label="Normal" value={String(sraStats.normal)} detail="Situação ativa no SRA" />
                    <SraMetric label="Férias" value={String(sraStats.ferias)} detail="Identificados no arquivo" />
                    <SraMetric label="Afastado" value={String(sraStats.afastado)} detail="Identificados no arquivo" tone="warning" />
                    <SraMetric
                      label="Treinamento NR 23"
                      value={sraStats.trainingDate ? fmtDate(sraStats.trainingDate) : "—"}
                      detail={sraStats.lastSync ? `SRA atualizado em ${fmtDate(sraStats.lastSync)}` : "Sem sincronização"}
                    />
                  </div>

                  <div className="mt-4 rounded-xl border border-border/45 bg-background/25 p-3">
                    <p className="text-[10px] leading-4 text-muted-foreground">
                      O almoxarifado usa os dados operacionais do SRA: matrícula, função, setor, centro/equipe,
                      situação, admissão, escala, horário, supervisão e treinamento. Dados bancários e documentos
                      pessoais que não são necessários para entrega de EPI não são importados.
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="!p-4">
                  <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px_280px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={collabSearch}
                        onChange={(event) => setCollabSearch(event.target.value)}
                        className="pl-9"
                        placeholder="Buscar por nome, matrícula, função ou equipe..."
                      />
                    </div>
                    <Select value={collabStatus} onValueChange={setCollabStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TODOS">Todas as situações</SelectItem>
                        <SelectItem value="NORMAL">Normal</SelectItem>
                        <SelectItem value="FÉRIAS">Férias</SelectItem>
                        <SelectItem value="AFASTADO">Afastado</SelectItem>
                        <SelectItem value="ATIVO">Ativo manual</SelectItem>
                        <SelectItem value="INATIVO">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={collabTeam} onValueChange={setCollabTeam}>
                      <SelectTrigger><SelectValue placeholder="Centro / equipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TODOS">Todos os centros / equipes</SelectItem>
                        {collaboratorTeams.map((team) => (
                          <SelectItem key={team} value={team}>{team}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="mt-3 flex items-center justify-between px-1">
                    <p className="text-[9px] text-muted-foreground">
                      {filteredCollaborators.length} de {data.colaboradores.length} colaborador(es)
                    </p>
                    {sraStats.lastSync && (
                      <Badge variant="outline" className="rounded-full text-[8px]">
                        SRA sincronizado
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {filteredCollaborators.map((colab) => (
                      <button
                        type="button"
                        key={colab.id}
                        onClick={() => setCollabDialog(colab)}
                        className="rounded-xl border border-border/50 bg-background/30 p-3 text-left transition hover:border-primary/25 hover:bg-background/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="truncate text-xs font-semibold">{colab.nome}</p>
                              {colab.origem_sra && (
                                <Badge variant="outline" className="shrink-0 rounded-full border-emerald-500/20 px-1.5 text-[7px] text-emerald-600 dark:text-emerald-300">
                                  SRA
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 truncate text-[9px] text-muted-foreground">
                              Matrícula {colab.matricula || "—"} · {colab.funcao || colab.cargo || "Função não informada"}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 rounded-full text-[8px]",
                              colab.situacao_sra === "AFASTADO"
                                ? "border-amber-500/20 text-amber-600 dark:text-amber-300"
                                : colab.situacao_sra === "FÉRIAS"
                                  ? "border-sky-500/20 text-sky-600 dark:text-sky-300"
                                  : colab.ativo
                                    ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                                    : "text-muted-foreground",
                            )}
                          >
                            {colab.situacao_sra || (colab.ativo ? "ATIVO" : "INATIVO")}
                          </Badge>
                        </div>

                        <div className="mt-2 space-y-1 text-[9px] text-muted-foreground">
                          <p className="truncate">{colab.centro_resultado || colab.setor || "Centro/equipe não informado"}</p>
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {colab.horario_trabalho && <span>{colab.horario_trabalho}</span>}
                            {colab.data_admissao && <span>Admissão {fmtDate(colab.data_admissao)}</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </GlassCard>
              </div>
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

      <EntryDialog
        open={entryOpen}
        initialItemId={entryItemId}
        items={activeItems}
        onClose={() => {
          setEntryOpen(false);
          setEntryItemId(null);
        }}
        onSaved={async () => {
          setEntryOpen(false);
          setEntryItemId(null);
          await reload();
        }}
      />

      <MovementDialog
        item={movementItem}
        initialType={movementKind}
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
        initialItemId={deliveryItemId}
        items={activeItems}
        colaboradores={data.colaboradores.filter((c) => c.ativo)}
        onNewCollaborator={() => {
          setDeliveryOpen(false);
          setDeliveryItemId(null);
          setCollabDialog("new");
          setTab("colaboradores");
        }}
        onClose={() => {
          setDeliveryOpen(false);
          setDeliveryItemId(null);
        }}
        onSaved={async () => {
          setDeliveryOpen(false);
          setDeliveryItemId(null);
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

function SraMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        tone === "warning"
          ? "border-amber-500/20 bg-amber-500/[0.04]"
          : "border-border/45 bg-background/30",
      )}
    >
      <p className="text-[8px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-base font-bold tracking-tight",
          tone === "warning" && "text-amber-600 dark:text-amber-300",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[8px] text-muted-foreground">{detail}</p>
    </div>
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
  lastEntryDate,
  lastExitDate,
  onEntry,
  onWithdraw,
  onAdjust,
  onEdit,
}: {
  item: EstoqueItem;
  compact?: boolean;
  lastEntryDate?: string;
  lastExitDate?: string;
  onEntry: () => void;
  onWithdraw: () => void;
  onAdjust: (type: EstoqueMovementType) => void;
  onEdit: () => void;
}) {
  const status = estoqueStatus(item);
  return (
    <div className="grid gap-2 rounded-xl border border-border/45 bg-background/30 p-2.5 transition-colors hover:border-primary/15 hover:bg-background/50 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
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
        {!compact && (lastEntryDate || lastExitDate) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[8px] text-muted-foreground/80">
            {lastEntryDate && (
              <span className="inline-flex items-center gap-1">
                <ArrowDownToLine className="h-2.5 w-2.5 text-emerald-500" />
                Últ. entrada {fmtDate(lastEntryDate)}
              </span>
            )}
            {lastExitDate && (
              <span className="inline-flex items-center gap-1">
                <ArrowUpFromLine className="h-2.5 w-2.5 text-sky-500" />
                Últ. saída {fmtDate(lastExitDate)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
        <div className="mr-1 text-right">
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
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg border-emerald-500/20 bg-emerald-500/[0.04] px-2.5 text-[9px] text-emerald-700 hover:bg-emerald-500/[0.09] dark:text-emerald-300"
              onClick={onEntry}
            >
              <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />
              Entrada
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg border-sky-500/20 bg-sky-500/[0.04] px-2.5 text-[9px] text-sky-700 hover:bg-sky-500/[0.09] dark:text-sky-300"
              onClick={onWithdraw}
              disabled={item.estoque_atual <= 0}
            >
              <ArrowUpFromLine className="mr-1 h-3.5 w-3.5" />
              Saída
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg px-2 text-[9px] text-muted-foreground"
              title="Ajustar saldo, registrar devolução ou descarte"
              onClick={() => onAdjust("ajuste_positivo")}
            >
              Ajuste
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg"
              title="Editar cadastro do item"
              onClick={onEdit}
            >
              <Edit3 className="h-3.5 w-3.5" />
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
          <div>
            <p className="text-[8px] uppercase tracking-wide text-muted-foreground">
              {mov.tipo === "entrada" ? "Data da entrada" : mov.tipo === "saida" ? "Data da retirada" : "Data"}
            </p>
            <span className="text-[10px] font-medium">
              {fmtDate(mov.data_movimento)}
            </span>
          </div>
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
          <Field label="Status">
            <Select
              value={form.ativo === false ? "INATIVO" : "ATIVO"}
              onValueChange={(value) =>
                setForm({ ...form, ativo: value === "ATIVO" })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
              </SelectContent>
            </Select>
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

function EntryDialog({
  open,
  initialItemId,
  items,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialItemId: string | null;
  items: EstoqueItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [itemId, setItemId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [dataEntrada, setDataEntrada] = useState(todayIso());
  const [valorUnitario, setValorUnitario] = useState("");
  const [documento, setDocumento] = useState("");
  const [origem, setOrigem] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItemId(initialItemId ?? "");
    setQuantidade("1");
    setDataEntrada(todayIso());
    setValorUnitario("");
    setDocumento("");
    setOrigem("");
    setObservacao("");
  }, [initialItemId, open]);

  const selected = items.find((item) => item.id === itemId) ?? null;
  const amount = Number(quantidade.replace(",", "."));
  const valid = Boolean(
    itemId &&
      dataEntrada &&
      Number.isFinite(amount) &&
      amount > 0,
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <PackagePlus className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>Registrar entrada no estoque</DialogTitle>
              <DialogDescription className="mt-1">
                Informe o item, a quantidade e a data real em que o material entrou.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.035] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item *" className="sm:col-span-2">
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o item que entrou..." />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.descricao} · saldo {item.estoque_atual} {item.unidade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Quantidade recebida *">
              <Input
                inputMode="decimal"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </Field>

            <Field label="Data da entrada *">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-9"
                  value={dataEntrada}
                  onChange={(e) => setDataEntrada(e.target.value)}
                />
              </div>
            </Field>

            <Field label="Valor unitário da entrada">
              <Input
                inputMode="decimal"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
                placeholder="0,00"
              />
            </Field>

            <Field label="Documento / Nota fiscal">
              <Input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="NF, pedido ou protocolo"
              />
            </Field>

            <Field label="Fornecedor / origem" className="sm:col-span-2">
              <Input
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="Ex.: compra, devolução do almoxarifado, transferência..."
              />
            </Field>

            <Field label="Observação" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Informação opcional sobre esta entrada"
              />
            </Field>
          </div>
        </div>

        {selected && (
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/35 px-3 py-2.5">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Saldo atual</p>
              <p className="text-sm font-semibold">{selected.estoque_atual} {selected.unidade}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Saldo após entrada</p>
              <p className="text-sm font-semibold text-emerald-600">
                {(selected.estoque_atual + (Number.isFinite(amount) ? amount : 0)).toLocaleString("pt-BR")} {selected.unidade}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={saving || !valid}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={async () => {
              if (!valid) return;
              setSaving(true);
              try {
                await registerEstoqueMovement({
                  itemId,
                  tipo: "entrada",
                  quantidade: amount,
                  motivo: origem || "Entrada de estoque",
                  documento,
                  observacao,
                  valorUnitario: numberValue(valorUnitario),
                  dataMovimento: dataEntrada,
                });
                toast.success(
                  `Entrada registrada em ${fmtDate(dataEntrada)}. Saldo atualizado.`,
                );
                await onSaved();
              } catch (error: any) {
                toast.error(error?.message ?? "Falha ao registrar entrada.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackagePlus className="mr-2 h-4 w-4" />
            )}
            Confirmar entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({
  item,
  initialType,
  onClose,
  onSaved,
}: {
  item: EstoqueItem | null;
  initialType: EstoqueMovementType;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<EstoqueMovementType>(initialType);
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataMovimento, setDataMovimento] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const allowed: EstoqueMovementType[] = [
      "devolucao",
      "ajuste_positivo",
      "ajuste_negativo",
      "descarte",
    ];
    setTipo(allowed.includes(initialType) ? initialType : "ajuste_positivo");
    setQuantidade("1");
    setMotivo("");
    setObservacao("");
    setDataMovimento(todayIso());
  }, [initialType, item?.id]);

  const amount = Number(quantidade.replace(",", "."));
  const negative = ["ajuste_negativo", "descarte"].includes(tipo);
  const projected = item
    ? item.estoque_atual + (negative ? -amount : amount)
    : 0;

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar saldo do estoque</DialogTitle>
          <DialogDescription>
            Use somente para devolução, correção de inventário ou descarte. Entrada e saída possuem fluxos próprios.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/50 bg-background/30 p-3">
          <p className="text-xs font-semibold">{item?.descricao}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Saldo atual: {item?.estoque_atual ?? 0} {item?.unidade}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo de ajuste *">
            <Select value={tipo} onValueChange={(value) => setTipo(value as EstoqueMovementType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="devolucao">Devolução ao estoque</SelectItem>
                <SelectItem value="ajuste_positivo">Ajuste positivo</SelectItem>
                <SelectItem value="ajuste_negativo">Ajuste negativo</SelectItem>
                <SelectItem value="descarte">Descarte / perda</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Quantidade *">
            <Input
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </Field>
          <Field label="Data do ajuste *">
            <Input
              type="date"
              value={dataMovimento}
              onChange={(e) => setDataMovimento(e.target.value)}
            />
          </Field>
          <Field label="Motivo *">
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: inventário, avaria, devolução..."
            />
          </Field>
          <Field label="Observação" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </Field>
        </div>

        {item && Number.isFinite(amount) && amount > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/35 px-3 py-2">
            <span className="text-[10px] text-muted-foreground">Saldo após ajuste</span>
            <span className={cn("text-sm font-semibold", projected < 0 && "text-rose-600")}>
              {projected.toLocaleString("pt-BR")} {item.unidade}
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={
              saving ||
              !item ||
              !dataMovimento ||
              !motivo.trim() ||
              !Number.isFinite(amount) ||
              amount <= 0 ||
              projected < 0
            }
            onClick={async () => {
              if (!item) return;
              setSaving(true);
              try {
                await registerEstoqueMovement({
                  itemId: item.id,
                  tipo,
                  quantidade: amount,
                  motivo,
                  observacao,
                  dataMovimento,
                });
                toast.success("Ajuste registrado no histórico.");
                await onSaved();
              } catch (error: any) {
                toast.error(error?.message ?? "Falha ao ajustar estoque.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar ajuste
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
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
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
          <Field label="Status">
            <Select
              value={form.ativo === false ? "INATIVO" : "ATIVO"}
              onValueChange={(value) =>
                setForm({ ...form, ativo: value === "ATIVO" })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {collaborator?.origem_sra && (
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.035] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Perfil funcional SRA</p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Informações corporativas usadas para identificar a retirada no almoxarifado.
                </p>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-emerald-500/20 text-[8px] text-emerald-600 dark:text-emerald-300"
              >
                Sincronizado
              </Badge>
            </div>

            <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <SraInfo label="Função" value={collaborator.funcao || collaborator.cargo} />
              <SraInfo label="Situação" value={collaborator.situacao_sra} />
              <SraInfo label="Centro / equipe" value={collaborator.centro_resultado} />
              <SraInfo label="Setor do negócio" value={collaborator.setor_negocio || collaborator.setor} />
              <SraInfo label="Admissão" value={collaborator.data_admissao ? fmtDate(collaborator.data_admissao) : null} />
              <SraInfo label="Treinamento NR 23" value={collaborator.data_treinamento ? fmtDate(collaborator.data_treinamento) : null} />
              <SraInfo label="Escala" value={collaborator.escala} />
              <SraInfo label="Horário" value={collaborator.horario_trabalho} />
              <SraInfo label="Intervalo" value={collaborator.intervalo_trabalho} />
              <SraInfo label="Supervisor" value={collaborator.supervisor} />
              <SraInfo label="Gerente" value={collaborator.gerente} />
              <SraInfo label="Local" value={collaborator.local_trabalho || collaborator.unidade} />
            </div>
          </div>
        )}

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
  initialItemId,
  items,
  colaboradores,
  onNewCollaborator,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialItemId: string | null;
  items: EstoqueItem[];
  colaboradores: EstoqueColaborador[];
  onNewCollaborator: () => void;
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
    const initialItem = initialItemId
      ? items.find((item) => item.id === initialItemId)
      : null;
    setCart(
      initialItem && initialItem.estoque_atual > 0
        ? [{ itemId: initialItem.id, quantidade: 1 }]
        : [],
    );
    setDataEntrega(todayIso());
    setObservacao("");
  }, [initialItemId, items, open]);

  const addItem = () => {
    const amount = Number(qty.replace(",", "."));
    if (!selectedItem || !Number.isFinite(amount) || amount <= 0) return;
    const item = items.find((entry) => entry.id === selectedItem);
    if (!item) return;
    const alreadySelected =
      cart.find((entry) => entry.itemId === selectedItem)?.quantidade ?? 0;
    if (alreadySelected + amount > item.estoque_atual) {
      toast.warning(
        `Saldo disponível: ${item.estoque_atual} ${item.unidade}. Já selecionado: ${alreadySelected}.`,
      );
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
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
              <PackageMinus className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle>Registrar saída / retirada</DialogTitle>
              <DialogDescription className="mt-1">
                O nome do colaborador e a data da retirada são obrigatórios.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.035] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do colaborador *" className="sm:col-span-2">
              {colaboradores.length > 0 ? (
                <Select value={colaboradorId} onValueChange={setColaboradorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione quem está retirando..." />
                  </SelectTrigger>
                  <SelectContent>
                    {colaboradores.map((colab) => (
                      <SelectItem key={colab.id} value={colab.id}>
                        {colab.nome}{colab.matricula ? ` · ${colab.matricula}` : ""}{colab.funcao ? ` · ${colab.funcao}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start border-amber-500/25 bg-amber-500/[0.05] text-amber-700 dark:text-amber-300"
                  onClick={onNewCollaborator}
                >
                  <UserRoundPlus className="mr-2 h-4 w-4" />
                  Cadastre um colaborador antes da saída
                </Button>
              )}
            </Field>

            <Field label="Data da retirada *">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-9"
                  value={dataEntrega}
                  onChange={(e) => setDataEntrega(e.target.value)}
                />
              </div>
            </Field>

            <Field label="Motivo / observação">
              <Input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: admissão, troca, reposição..."
              />
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-background/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold">Itens retirados</p>
            <span className="text-[9px] text-muted-foreground">O saldo será baixado ao confirmar</span>
          </div>
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
            disabled={saving || !colaboradorId || !dataEntrega || cart.length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                await registerEstoqueDelivery({
                  colaboradorId,
                  itens: cart,
                  observacao,
                  dataEntrega,
                });
                const colaborador = colaboradores.find((item) => item.id === colaboradorId);
                toast.success(
                  `Saída registrada para ${colaborador?.nome ?? "colaborador"} em ${fmtDate(dataEntrega)}.`,
                );
                await onSaved();
              } catch (error: any) {
                toast.error(error?.message ?? "Falha ao registrar retirada.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar saída
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SraInfo({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-medium" title={value || "—"}>
        {value || "—"}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
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
