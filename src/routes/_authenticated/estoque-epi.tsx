import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarDays,
  Check,
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
import { downloadBlob } from "@/lib/download";
import {
  ESTOQUE_CATEGORIAS,
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
import { cn } from "@/lib/utils";

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

function normalizeSearch(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function searchMatches(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return normalizeSearch(values.filter(Boolean).join(" ")).includes(normalizedQuery);
}

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
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function EstoqueEpiPage() {
  const [data, setData] = useState<EstoqueSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState("visao");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("TODAS");
  const [collabSearch, setCollabSearch] = useState("");
  const [sraImporting, setSraImporting] = useState(false);
  const sraInputRef = useRef<HTMLInputElement>(null);

  const [itemDialog, setItemDialog] = useState<EstoqueItem | "new" | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryItemId, setEntryItemId] = useState<string | null>(null);
  const [movementItem, setMovementItem] = useState<EstoqueItem | null>(null);
  const [movementKind, setMovementKind] = useState<EstoqueMovementType>("ajuste_positivo");
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryItemId, setDeliveryItemId] = useState<string | null>(null);
  const [collabDialog, setCollabDialog] = useState<EstoqueColaborador | "new" | null>(null);

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
    const zeroed = activeItems.filter(
      (item) => Number(item.estoque_atual || 0) <= 0,
    ).length;

    return {
      totalItems: activeItems.length,
      totalQty,
      totalValue,
      zeroed,
    };
  }, [activeItems]);

  const filteredItems = useMemo(
    () =>
      data.items.filter((item) => {
        const matchesSearch = searchMatches(search, [
          item.codigo,
          item.descricao,
          item.categoria,
          item.tamanho,
          item.ca_numero,
        ]);
        const matchesCategory =
          category === "TODAS" || item.categoria === category;
        return matchesSearch && matchesCategory;
      }),
    [category, data.items, search],
  );

  const lowestStockItems = useMemo(
    () =>
      [...activeItems]
        .sort(
          (a, b) =>
            Number(a.estoque_atual || 0) - Number(b.estoque_atual || 0) ||
            a.descricao.localeCompare(b.descricao, "pt-BR"),
        )
        .slice(0, 12),
    [activeItems],
  );

  const filteredCollaborators = useMemo(
    () =>
      data.colaboradores.filter((colab) =>
        searchMatches(collabSearch, [
          colab.nome,
          colab.matricula,
          colab.funcao,
          colab.cargo,
          colab.centro_resultado,
          colab.setor,
          colab.setor_negocio,
        ]),
      ),
    [collabSearch, data.colaboradores],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const snapshot = await fetchEstoqueSnapshot();
      const file = await generateEstoqueWorkbook(snapshot);
      downloadBlob(file.blob, file.filename);
      toast.success("Planilha de estoque atualizada.");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Falha ao gerar a planilha.");
    } finally {
      setExporting(false);
    }
  };

  const handleSraImport = async (file: File) => {
    setSraImporting(true);
    try {
      const rows = await parseSraWorkbook(file);
      const result = await syncSraCollaborators(rows);
      await reload();
      toast.success(
        `SRA sincronizado: ${result.total ?? rows.length} colaborador(es).`,
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message ?? "Falha ao sincronizar o arquivo SRA.");
    } finally {
      setSraImporting(false);
      if (sraInputRef.current) sraInputRef.current.value = "";
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
      description="Controle simples pela quantidade física atual de cada item, com entradas, saídas e histórico rastreável."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="glass"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Baixar planilha
          </Button>
          <Button variant="outline" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <GlassCard className="!p-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(180px,auto))] lg:items-center">
            <div className="px-1 py-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">
                Operação rápida
              </p>
              <h2 className="mt-1 text-sm font-semibold">
                Movimente o saldo real
              </h2>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Pesquise qualquer item por nome, código, categoria, CA ou
                tamanho. A busca ignora acentos e diferenciação entre
                maiúsculas e minúsculas.
              </p>
            </div>

            <QuickAction
              icon={PackagePlus}
              title="Registrar entrada"
              detail="Pesquisar item e somar quantidade"
              onClick={() => {
                setEntryItemId(null);
                setEntryOpen(true);
              }}
            />
            <QuickAction
              icon={PackageMinus}
              title="Registrar saída"
              detail="Buscar colaborador e materiais"
              onClick={() => {
                setDeliveryItemId(null);
                setDeliveryOpen(true);
              }}
            />
            <QuickAction
              icon={Plus}
              title="Cadastrar item"
              detail="Novo EPI, uniforme ou material"
              onClick={() => setItemDialog("new")}
            />
          </div>
        </GlassCard>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Boxes}
            label="Itens cadastrados"
            value={String(kpis.totalItems)}
            detail="Tipos de materiais ativos"
          />
          <MetricCard
            icon={PackageOpen}
            label="Saldo físico"
            value={kpis.totalQty.toLocaleString("pt-BR")}
            detail="Quantidade total disponível"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Itens sem saldo"
            value={String(kpis.zeroed)}
            detail="Quantidade atual igual a zero"
            tone="warning"
          />
          <MetricCard
            icon={WalletCards}
            label="Valor em estoque"
            value={money(kpis.totalValue)}
            detail="Valor da quantidade disponível"
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
                    icon={PackageOpen}
                    title="Menores saldos"
                    description="Itens ordenados somente pela quantidade atual disponível."
                  />
                  <div className="mt-3 max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
                    {lowestStockItems.length ? (
                      lowestStockItems.map((item) => (
                        <StockRow
                          key={item.id}
                          item={item}
                          compact
                          onEntry={() => {
                            setEntryItemId(item.id);
                            setEntryOpen(true);
                          }}
                          onWithdraw={() => {
                            setDeliveryItemId(item.id);
                            setDeliveryOpen(true);
                          }}
                          onAdjust={() => {
                            setMovementKind("ajuste_positivo");
                            setMovementItem(item);
                          }}
                          onEdit={() => setItemDialog(item)}
                        />
                      ))
                    ) : (
                      <EmptyState text="Nenhum item cadastrado no estoque." />
                    )}
                  </div>
                </GlassCard>

                <GlassCard className="!p-4">
                  <SectionTitle
                    icon={ClipboardCheck}
                    title="Busca inteligente"
                    description="Os campos de entrada e saída agora são pesquisáveis."
                  />
                  <div className="mt-3 space-y-2 text-[10px] text-muted-foreground">
                    <InfoBox title="Itens">
                      Digite nome, código, categoria, CA ou tamanho. Ex.:
                      “calca” encontra “calça”.
                    </InfoBox>
                    <InfoBox title="Colaboradores">
                      Procure por nome, matrícula, função, setor ou equipe.
                    </InfoBox>
                    <InfoBox title="Saída">
                      Adicione um ou mais materiais antes de confirmar a
                      retirada.
                    </InfoBox>
                  </div>
                </GlassCard>

                <GlassCard className="!p-4 xl:col-span-2">
                  <SectionTitle
                    icon={History}
                    title="Atividade recente"
                    description="Últimas movimentações registradas."
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
                    title="Quantidade atual"
                    description="Consulte e movimente apenas o saldo físico de cada item."
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setItemDialog("new")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo item
                  </Button>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="pl-9"
                      placeholder="Buscar descrição, código, categoria, CA ou tamanho..."
                    />
                  </div>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="TODAS">
                        Todas as categorias
                      </SelectItem>
                      {[...new Set(data.items.map((item) => item.categoria))]
                        .sort((a, b) => a.localeCompare(b, "pt-BR"))
                        .map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-3 flex items-center justify-between px-1">
                  <p className="text-[9px] text-muted-foreground">
                    {filteredItems.length} item(ns) encontrado(s)
                  </p>
                  <span className="text-[8px] text-muted-foreground/70">
                    Busca sem acentos
                  </span>
                </div>

                <div className="mt-2 max-h-[58vh] space-y-1.5 overflow-y-auto pr-1">
                  {filteredItems.map((item) => (
                    <StockRow
                      key={item.id}
                      item={item}
                      onEntry={() => {
                        setEntryItemId(item.id);
                        setEntryOpen(true);
                      }}
                      onWithdraw={() => {
                        setDeliveryItemId(item.id);
                        setDeliveryOpen(true);
                      }}
                      onAdjust={() => {
                        setMovementKind("ajuste_positivo");
                        setMovementItem(item);
                      }}
                      onEdit={() => setItemDialog(item)}
                    />
                  ))}
                  {!filteredItems.length && (
                    <EmptyState text="Nenhum item encontrado para esta busca." />
                  )}
                </div>
              </GlassCard>
            </TabsContent>

            <TabsContent value="retiradas" className="mt-3">
              <div className="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
                <GlassCard className="!p-4">
                  <SectionTitle
                    icon={PackageCheck}
                    title="Saída para colaborador"
                    description="Pesquise o colaborador e adicione um ou mais materiais."
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
                  <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                    Itens sem saldo continuam aparecendo na busca, identificados
                    como SEM SALDO, para que você saiba que o cadastro existe.
                  </p>
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
                  description="Entradas, saídas, devoluções e ajustes com saldo anterior e saldo após."
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
                      description="Base usada para identificar cada retirada."
                    />
                    <div className="flex gap-2">
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
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                        )}
                        Atualizar SRA
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setCollabDialog("new")}
                      >
                        <UserRoundPlus className="mr-2 h-4 w-4" />
                        Novo colaborador
                      </Button>
                    </div>
                  </div>

                  <div className="relative mt-4">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={collabSearch}
                      onChange={(event) => setCollabSearch(event.target.value)}
                      className="pl-9"
                      placeholder="Buscar nome, matrícula, função, setor ou equipe..."
                    />
                  </div>

                  <div className="mt-3 grid max-h-[58vh] gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
                    {filteredCollaborators.map((colab) => (
                      <button
                        type="button"
                        key={colab.id}
                        onClick={() => setCollabDialog(colab)}
                        className="rounded-xl border border-border/50 bg-background/30 p-3 text-left hover:border-primary/25"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold">
                              {colab.nome}
                            </p>
                            <p className="mt-1 truncate text-[9px] text-muted-foreground">
                              Mat. {colab.matricula || "—"} ·{" "}
                              {colab.funcao ||
                                colab.cargo ||
                                "Função não informada"}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="rounded-full text-[8px]"
                          >
                            {colab.situacao_sra ||
                              (colab.ativo ? "ATIVO" : "INATIVO")}
                          </Badge>
                        </div>
                        <p className="mt-2 truncate text-[9px] text-muted-foreground">
                          {colab.centro_resultado ||
                            colab.setor ||
                            "Centro/equipe não informado"}
                        </p>
                      </button>
                    ))}
                  </div>

                  {!filteredCollaborators.length && (
                    <div className="mt-3">
                      <EmptyState text="Nenhum colaborador encontrado para esta busca." />
                    </div>
                  )}
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

      <DeliveryDialog
        open={deliveryOpen}
        initialItemId={deliveryItemId}
        items={activeItems}
        colaboradores={data.colaboradores.filter((item) => item.ativo)}
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

      <CollaboratorDialog
        target={collabDialog}
        onClose={() => setCollabDialog(null)}
        onSaved={async () => {
          setCollabDialog(null);
          await reload();
        }}
      />
    </PageShell>
  );
}

function QuickAction({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: typeof Plus;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      className="h-auto min-h-14 justify-start rounded-xl px-3 py-2.5 text-left"
      onClick={onClick}
    >
      <span className="mr-2.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.07] text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-xs font-semibold">{title}</span>
        <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
          {detail}
        </span>
      </span>
    </Button>
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
          <p className="mt-1 truncate text-lg font-bold tracking-tight">
            {value}
          </p>
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

function InfoBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/45 bg-background/30 p-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-1 leading-4">{children}</p>
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
  onEntry,
  onWithdraw,
  onAdjust,
  onEdit,
}: {
  item: EstoqueItem;
  compact?: boolean;
  onEntry: () => void;
  onWithdraw: () => void;
  onAdjust: () => void;
  onEdit: () => void;
}) {
  const withoutStock = Number(item.estoque_atual || 0) <= 0;

  return (
    <div className="grid gap-2 rounded-xl border border-border/45 bg-background/30 p-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-semibold">
            {item.descricao}
          </p>
          {withoutStock && (
            <Badge
              variant="outline"
              className="rounded-full border-rose-500/25 bg-rose-500/[0.05] text-[8px] text-rose-600"
            >
              SEM SALDO
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[9px] text-muted-foreground">
          {item.codigo && <span>Cód. {item.codigo}</span>}
          <span>{item.categoria}</span>
          {item.tamanho && <span>Tam. {item.tamanho}</span>}
          {item.ca_numero && <span>CA {item.ca_numero}</span>}
          {!compact && item.valor_unitario !== null && (
            <span>{money(item.valor_unitario)}</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
        <div className="min-w-[105px] text-right">
          <p className="text-[8px] uppercase tracking-wide text-muted-foreground">
            Quantidade
          </p>
          <p className="text-base font-bold">
            {Number(item.estoque_atual || 0).toLocaleString("pt-BR")}{" "}
            <span className="text-[9px] font-medium text-muted-foreground">
              {item.unidade}
            </span>
          </p>
        </div>

        {!compact && (
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[9px]"
              onClick={onEntry}
            >
              <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />
              Entrada
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[9px]"
              disabled={withoutStock}
              onClick={onWithdraw}
            >
              <ArrowUpFromLine className="mr-1 h-3.5 w-3.5" />
              Saída
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[9px]"
              onClick={onAdjust}
            >
              Ajuste
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onEdit}
              title="Editar item"
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
  if (!movimentos.length) {
    return <EmptyState text="Sem movimentações registradas." />;
  }

  return (
    <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-xl border border-border/45">
      {movimentos.map((mov, index) => (
        <div
          key={mov.id}
          className={cn(
            "grid gap-2 bg-background/25 px-3 py-2.5 md:grid-cols-[110px_120px_minmax(0,1fr)_auto] md:items-center",
            index > 0 && "border-t border-border/35",
          )}
        >
          <span className="text-[10px] font-medium">
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
            <p className="text-xs font-bold">
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
  if (!entregas.length) {
    return <EmptyState text="Nenhuma retirada registrada." />;
  }

  return (
    <div className="mt-3 max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
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
                  {fmtDate(entrega.data_entrega)}
                  {entrega.colaborador_matricula
                    ? ` · Mat. ${entrega.colaborador_matricula}`
                    : ""}
                </p>
              </div>
              <Badge variant="outline" className="rounded-full text-[9px]">
                {qty} item(ns)
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(entrega.itens ?? []).map((item) => (
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
            Cadastre a identificação do item. A quantidade é controlada pelas
            entradas, saídas e ajustes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Descrição" className="sm:col-span-2">
            <Input
              value={form.descricao}
              onChange={(event) =>
                setForm({ ...form, descricao: event.target.value })
              }
            />
          </Field>
          <Field label="Código">
            <Input
              value={form.codigo ?? ""}
              onChange={(event) =>
                setForm({ ...form, codigo: event.target.value })
              }
            />
          </Field>
          <Field label="Categoria">
            <Select
              value={form.categoria}
              onValueChange={(value) =>
                setForm({ ...form, categoria: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTOQUE_CATEGORIAS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tamanho">
            <Input
              value={form.tamanho ?? ""}
              onChange={(event) =>
                setForm({ ...form, tamanho: event.target.value })
              }
            />
          </Field>
          <Field label="CA">
            <Input
              value={form.ca_numero ?? ""}
              onChange={(event) =>
                setForm({ ...form, ca_numero: event.target.value })
              }
            />
          </Field>
          <Field label="Valor unitário">
            <Input
              inputMode="decimal"
              value={form.valor_unitario ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  valor_unitario: numberValue(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Unidade">
            <Input
              value={form.unidade ?? "UN"}
              onChange={(event) =>
                setForm({ ...form, unidade: event.target.value })
              }
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.ativo === false ? "INATIVO" : "ATIVO"}
              onValueChange={(value) =>
                setForm({ ...form, ativo: value === "ATIVO" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {item && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 sm:col-span-2">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Quantidade atual
              </p>
              <p className="mt-1 text-lg font-bold">
                {item.estoque_atual.toLocaleString("pt-BR")} {item.unidade}
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground">
                Use Entrada, Saída ou Ajuste para alterar este saldo.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !form.descricao.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await saveEstoqueItem(form, item?.id);
                toast.success(
                  item ? "Item atualizado." : "Item cadastrado.",
                );
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
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItemId(initialItemId ?? "");
    setQuantidade("1");
    setDataEntrada(todayIso());
    setValorUnitario("");
    setObservacao("");
  }, [initialItemId, open]);

  const selected = items.find((item) => item.id === itemId) ?? null;
  const amount = Number(quantidade.replace(",", "."));
  const valid = Boolean(
    itemId && dataEntrada && Number.isFinite(amount) && amount > 0,
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl overflow-visible">
        <DialogHeader>
          <DialogTitle>Registrar entrada</DialogTitle>
          <DialogDescription>
            Digite para localizar qualquer item e informe a quantidade recebida.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Item *" className="sm:col-span-2">
            <SearchableItemPicker
              items={items}
              value={itemId}
              onValueChange={setItemId}
              placeholder="Digite: calça, código, CA, tamanho..."
            />
          </Field>
          <Field label="Quantidade *">
            <Input
              inputMode="decimal"
              value={quantidade}
              onChange={(event) => setQuantidade(event.target.value)}
            />
          </Field>
          <Field label="Data *">
            <Input
              type="date"
              value={dataEntrada}
              onChange={(event) => setDataEntrada(event.target.value)}
            />
          </Field>
          <Field label="Valor unitário">
            <Input
              inputMode="decimal"
              value={valorUnitario}
              onChange={(event) => setValorUnitario(event.target.value)}
            />
          </Field>
          <Field label="Observação">
            <Input
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
            />
          </Field>
        </div>

        {selected && (
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/35 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">
              Saldo atual: {selected.estoque_atual} {selected.unidade}
            </span>
            <span className="text-sm font-semibold text-emerald-600">
              Após:{" "}
              {(
                selected.estoque_atual +
                (Number.isFinite(amount) ? amount : 0)
              ).toLocaleString("pt-BR")}{" "}
              {selected.unidade}
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !valid}
            onClick={async () => {
              if (!valid) return;

              setSaving(true);
              try {
                await registerEstoqueMovement({
                  itemId,
                  tipo: "entrada",
                  quantidade: amount,
                  motivo: "Entrada de estoque",
                  observacao,
                  valorUnitario: numberValue(valorUnitario),
                  dataMovimento: dataEntrada,
                });
                toast.success("Entrada registrada.");
                await onSaved();
              } catch (error: any) {
                toast.error(error?.message ?? "Falha ao registrar entrada.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
  const [dataMovimento, setDataMovimento] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTipo(initialType);
    setQuantidade("1");
    setMotivo("");
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
          <DialogTitle>Ajustar quantidade</DialogTitle>
          <DialogDescription>
            Corrija o saldo físico, registre devolução ou descarte.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/50 bg-background/30 p-3">
          <p className="text-xs font-semibold">{item?.descricao}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Quantidade atual: {item?.estoque_atual ?? 0} {item?.unidade}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <Select
              value={tipo}
              onValueChange={(value) =>
                setTipo(value as EstoqueMovementType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="devolucao">Devolução</SelectItem>
                <SelectItem value="ajuste_positivo">
                  Ajuste positivo
                </SelectItem>
                <SelectItem value="ajuste_negativo">
                  Ajuste negativo
                </SelectItem>
                <SelectItem value="descarte">Descarte</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Quantidade">
            <Input
              inputMode="decimal"
              value={quantidade}
              onChange={(event) => setQuantidade(event.target.value)}
            />
          </Field>
          <Field label="Data">
            <Input
              type="date"
              value={dataMovimento}
              onChange={(event) => setDataMovimento(event.target.value)}
            />
          </Field>
          <Field label="Motivo">
            <Input
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
            />
          </Field>
        </div>

        {item && Number.isFinite(amount) && amount > 0 && (
          <p
            className={cn(
              "rounded-xl border border-border/50 p-3 text-sm font-semibold",
              projected < 0 && "text-rose-600",
            )}
          >
            Quantidade após ajuste: {projected.toLocaleString("pt-BR")}{" "}
            {item.unidade}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={
              saving ||
              !item ||
              !motivo.trim() ||
              !dataMovimento ||
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
                  dataMovimento,
                });
                toast.success("Quantidade ajustada.");
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

type DeliveryCartItem = {
  itemId: string;
  quantidade: number;
};

function DeliveryDialog({
  open,
  initialItemId,
  items,
  colaboradores,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialItemId: string | null;
  items: EstoqueItem[];
  colaboradores: EstoqueColaborador[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [colaboradorId, setColaboradorId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [cart, setCart] = useState<DeliveryCartItem[]>([]);
  const [dataEntrega, setDataEntrega] = useState(todayIso());
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setColaboradorId("");
    setItemId("");
    setQuantidade("1");
    setDataEntrega(todayIso());
    setObservacao("");

    const initial = initialItemId
      ? items.find((item) => item.id === initialItemId)
      : null;

    setCart(
      initial && initial.estoque_atual > 0
        ? [{ itemId: initial.id, quantidade: 1 }]
        : [],
    );
  }, [initialItemId, items, open]);

  const selected = items.find((item) => item.id === itemId) ?? null;
  const amount = Number(quantidade.replace(",", "."));

  const cartValid =
    cart.length > 0 &&
    cart.every((entry) => {
      const item = items.find((candidate) => candidate.id === entry.itemId);
      return Boolean(
        item &&
          entry.quantidade > 0 &&
          entry.quantidade <= Number(item.estoque_atual || 0),
      );
    });

  const valid = Boolean(colaboradorId && dataEntrega && cartValid);

  const addItem = () => {
    if (!selected) {
      toast.warning("Pesquise e selecione um item.");
      return;
    }

    if (selected.estoque_atual <= 0) {
      toast.warning("Este item está sem saldo.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.warning("Informe uma quantidade válida.");
      return;
    }

    const existing =
      cart.find((entry) => entry.itemId === selected.id)?.quantidade ?? 0;
    const nextAmount = existing + amount;

    if (nextAmount > selected.estoque_atual) {
      toast.warning(
        `Saldo disponível: ${selected.estoque_atual} ${selected.unidade}.`,
      );
      return;
    }

    setCart((current) => {
      const found = current.some((entry) => entry.itemId === selected.id);
      if (!found) {
        return [
          ...current,
          { itemId: selected.id, quantidade: amount },
        ];
      }

      return current.map((entry) =>
        entry.itemId === selected.id
          ? { ...entry, quantidade: nextAmount }
          : entry,
      );
    });

    setItemId("");
    setQuantidade("1");
  };

  const submit = async () => {
    if (!colaboradorId) {
      toast.warning("Selecione o colaborador.");
      return;
    }
    if (!dataEntrega) {
      toast.warning("Informe a data da retirada.");
      return;
    }
    if (!cart.length) {
      toast.warning("Adicione pelo menos um item.");
      return;
    }
    if (!cartValid) {
      toast.warning(
        "Há item com quantidade inválida ou saldo insuficiente. Revise a lista.",
      );
      return;
    }

    setSaving(true);
    try {
      await registerEstoqueDelivery({
        colaboradorId,
        itens: cart,
        observacao,
        dataEntrega,
      });
      toast.success("Saída registrada.");
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "Falha ao registrar saída.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto overflow-x-visible">
        <DialogHeader>
          <DialogTitle>Registrar saída</DialogTitle>
          <DialogDescription>
            Pesquise o colaborador, localize os materiais e adicione todos os
            itens da retirada antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Colaborador *">
            <SearchableCollaboratorPicker
              colaboradores={colaboradores}
              value={colaboradorId}
              onValueChange={setColaboradorId}
              placeholder="Digite nome, matrícula, função, setor ou equipe..."
            />
          </Field>

          <div className="rounded-2xl border border-border/50 bg-background/30 p-3">
            <p className="text-xs font-semibold">Materiais da saída</p>
            <p className="mt-1 text-[9px] text-muted-foreground">
              Itens sem saldo aparecem na pesquisa para identificação, mas não
              podem ser adicionados.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_auto] sm:items-end">
              <Field label="Item">
                <SearchableItemPicker
                  items={items}
                  value={itemId}
                  onValueChange={setItemId}
                  disableZeroStock
                  placeholder="Digite: calça, CA, tamanho, código..."
                />
              </Field>

              <Field label="Qtd.">
                <Input
                  inputMode="decimal"
                  value={quantidade}
                  onChange={(event) => setQuantidade(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addItem();
                    }
                  }}
                />
              </Field>

              <Button
                type="button"
                variant="outline"
                onClick={addItem}
                disabled={!selected || selected.estoque_atual <= 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            </div>

            {selected && (
              <div
                className={cn(
                  "mt-2 rounded-xl border px-3 py-2 text-[9px]",
                  selected.estoque_atual > 0
                    ? "border-emerald-500/20 bg-emerald-500/[0.04] text-muted-foreground"
                    : "border-rose-500/20 bg-rose-500/[0.04] text-rose-600",
                )}
              >
                {selected.estoque_atual > 0
                  ? `Disponível: ${selected.estoque_atual} ${selected.unidade}`
                  : "SEM SALDO — o item existe no cadastro, mas não pode ser retirado."}
              </div>
            )}

            <div className="mt-3 space-y-1.5">
              {cart.length ? (
                cart.map((entry) => {
                  const item = items.find(
                    (candidate) => candidate.id === entry.itemId,
                  );
                  if (!item) return null;

                  return (
                    <div
                      key={entry.itemId}
                      className="flex items-center gap-2 rounded-xl border border-border/45 bg-background/50 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-semibold">
                          {item.descricao}
                        </p>
                        <p className="mt-0.5 text-[8px] text-muted-foreground">
                          {item.codigo ? `Cód. ${item.codigo} · ` : ""}
                          saldo {item.estoque_atual} {item.unidade}
                          {item.tamanho ? ` · Tam. ${item.tamanho}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="rounded-full">
                        {entry.quantidade} {item.unidade}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                        title="Remover item"
                        onClick={() =>
                          setCart((current) =>
                            current.filter(
                              (candidate) =>
                                candidate.itemId !== entry.itemId,
                            ),
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 px-3 py-5 text-center text-[10px] text-muted-foreground">
                  Nenhum material adicionado ainda.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data *">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-9"
                  value={dataEntrega}
                  onChange={(event) => setDataEntrega(event.target.value)}
                />
              </div>
            </Field>
            <Field label="Observação">
              <Input
                value={observacao}
                onChange={(event) => setObservacao(event.target.value)}
                placeholder="Ex.: admissão, troca, reposição..."
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !valid}
            onClick={() => void submit()}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Confirmar saída
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {collaborator ? "Editar colaborador" : "Novo colaborador"}
          </DialogTitle>
          <DialogDescription>
            Cadastro utilizado para rastrear as retiradas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" className="sm:col-span-2">
            <Input
              value={form.nome}
              onChange={(event) =>
                setForm({ ...form, nome: event.target.value })
              }
            />
          </Field>
          <Field label="Matrícula">
            <Input
              value={form.matricula ?? ""}
              onChange={(event) =>
                setForm({ ...form, matricula: event.target.value })
              }
            />
          </Field>
          <Field label="Setor / equipe">
            <Input
              value={form.setor ?? ""}
              onChange={(event) =>
                setForm({ ...form, setor: event.target.value })
              }
            />
          </Field>
          <Field label="Cargo">
            <Input
              value={form.cargo ?? ""}
              onChange={(event) =>
                setForm({ ...form, cargo: event.target.value })
              }
            />
          </Field>
          <Field label="Unidade">
            <Input
              value={form.unidade ?? ""}
              onChange={(event) =>
                setForm({ ...form, unidade: event.target.value })
              }
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.ativo === false ? "INATIVO" : "ATIVO"}
              onValueChange={(value) =>
                setForm({ ...form, ativo: value === "ATIVO" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !form.nome.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await saveEstoqueColaborador(form, collaborator?.id);
                toast.success(
                  collaborator
                    ? "Colaborador atualizado."
                    : "Colaborador cadastrado.",
                );
                await onSaved();
              } catch (error: any) {
                toast.error(
                  error?.message ?? "Falha ao salvar colaborador.",
                );
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

function SearchableItemPicker({
  items,
  value,
  onValueChange,
  placeholder = "Digite para buscar...",
  disableZeroStock = false,
}: {
  items: EstoqueItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disableZeroStock?: boolean;
}) {
  const selected = items.find((item) => item.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.descricao ?? "");
    }
  }, [open, selected]);

  const matches = useMemo(() => {
    const filtered = items.filter((item) =>
      searchMatches(query, [
        item.descricao,
        item.codigo,
        item.categoria,
        item.ca_numero,
        item.tamanho,
      ]),
    );

    return filtered.sort((a, b) => {
      const q = normalizeSearch(query);
      const aText = normalizeSearch(a.descricao);
      const bText = normalizeSearch(b.descricao);
      const aStarts = q && aText.startsWith(q) ? 0 : 1;
      const bStarts = q && bText.startsWith(q) ? 0 : 1;
      return (
        aStarts - bStarts ||
        a.descricao.localeCompare(b.descricao, "pt-BR")
      );
    });
  }, [items, query]);

  const firstSelectable = matches.find(
    (item) => !disableZeroStock || Number(item.estoque_atual || 0) > 0,
  );

  const choose = (item: EstoqueItem) => {
    if (disableZeroStock && Number(item.estoque_atual || 0) <= 0) return;
    onValueChange(item.id);
    setQuery(item.descricao);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !rootRef.current?.contains(next)) {
          setOpen(false);
        }
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          className={cn(
            "h-10 rounded-xl pl-9 pr-10",
            selected && "border-emerald-500/25",
          )}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) onValueChange("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
            if (event.key === "Enter" && open && firstSelectable) {
              event.preventDefault();
              choose(firstSelectable);
            }
          }}
        />
        {selected && (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[120] overflow-hidden rounded-xl border border-border/70 bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 text-[8px] text-muted-foreground">
            <span>
              {matches.length} resultado(s)
            </span>
            <span>Enter seleciona o primeiro</span>
          </div>

          <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {matches.length ? (
              matches.map((item) => {
                const zero = Number(item.estoque_atual || 0) <= 0;
                const disabled = disableZeroStock && zero;
                const isSelected = value === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
                      isSelected && "bg-primary/[0.07]",
                      disabled
                        ? "cursor-not-allowed opacity-60"
                        : "hover:bg-accent/70 focus:bg-accent/70 focus:outline-none",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(item)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-semibold">
                        {item.descricao}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] text-muted-foreground">
                        {item.codigo && <span>Cód. {item.codigo}</span>}
                        <span>{item.categoria}</span>
                        {item.ca_numero && <span>CA {item.ca_numero}</span>}
                        {item.tamanho && <span>Tam. {item.tamanho}</span>}
                      </span>
                    </span>

                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-1 text-[8px] font-semibold",
                        zero
                          ? "border-rose-500/20 bg-rose-500/[0.05] text-rose-600"
                          : "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-600",
                      )}
                    >
                      {zero
                        ? "SEM SALDO"
                        : `${item.estoque_atual} ${item.unidade}`}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-6 text-center">
                <Search className="mx-auto h-5 w-5 text-muted-foreground/40" />
                <p className="mt-2 text-[10px] font-semibold">
                  Nenhum item encontrado
                </p>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  Tente nome, código, categoria, CA ou tamanho.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableCollaboratorPicker({
  colaboradores,
  value,
  onValueChange,
  placeholder = "Digite para buscar...",
}: {
  colaboradores: EstoqueColaborador[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  const selected =
    colaboradores.find((colaborador) => colaborador.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.nome ?? "");
    }
  }, [open, selected]);

  const matches = useMemo(
    () =>
      colaboradores
        .filter((colab) =>
          searchMatches(query, [
            colab.nome,
            colab.matricula,
            colab.funcao,
            colab.cargo,
            colab.setor,
            colab.setor_negocio,
            colab.centro_resultado,
          ]),
        )
        .sort((a, b) => {
          const q = normalizeSearch(query);
          const aText = normalizeSearch(a.nome);
          const bText = normalizeSearch(b.nome);
          const aStarts = q && aText.startsWith(q) ? 0 : 1;
          const bStarts = q && bText.startsWith(q) ? 0 : 1;
          return aStarts - bStarts || a.nome.localeCompare(b.nome, "pt-BR");
        }),
    [colaboradores, query],
  );

  const choose = (colab: EstoqueColaborador) => {
    onValueChange(colab.id);
    setQuery(colab.nome);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !rootRef.current?.contains(next)) {
          setOpen(false);
        }
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          className={cn(
            "h-10 rounded-xl pl-9 pr-10",
            selected && "border-emerald-500/25",
          )}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) onValueChange("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
            if (event.key === "Enter" && open && matches[0]) {
              event.preventDefault();
              choose(matches[0]);
            }
          }}
        />
        {selected && (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[120] overflow-hidden rounded-xl border border-border/70 bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 text-[8px] text-muted-foreground">
            <span>{matches.length} resultado(s)</span>
            <span>Enter seleciona o primeiro</span>
          </div>

          <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {matches.length ? (
              matches.map((colab) => (
                <button
                  key={colab.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-accent/70 focus:bg-accent/70 focus:outline-none",
                    value === colab.id && "bg-primary/[0.07]",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(colab)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-semibold">
                      {colab.nome}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] text-muted-foreground">
                      {colab.matricula && (
                        <span>Mat. {colab.matricula}</span>
                      )}
                      {(colab.funcao || colab.cargo) && (
                        <span>{colab.funcao || colab.cargo}</span>
                      )}
                      {(colab.centro_resultado || colab.setor) && (
                        <span>
                          {colab.centro_resultado || colab.setor}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-center">
                <Search className="mx-auto h-5 w-5 text-muted-foreground/40" />
                <p className="mt-2 text-[10px] font-semibold">
                  Nenhum colaborador encontrado
                </p>
                <p className="mt-1 text-[8px] text-muted-foreground">
                  Tente nome, matrícula, função, setor ou equipe.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
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
