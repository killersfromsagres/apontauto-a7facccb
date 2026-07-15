import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Bell,
  Clock,
  CalendarDays,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  List as ListIcon,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  listLegalItems,
  createLegalItem,
  updateLegalItem,
  deleteLegalItem,
  addMonths,
  monthsFor,
  daysUntil,
  statusOf,
  type LegalItem,
  type Periodicidade,
  type LegalStatus,
} from "@/lib/legal-items";

const PERIOD_META: Record<
  Periodicidade,
  { label: string; icon: typeof Clock; short: string }
> = {
  bimestral: { label: "Bimestral", icon: Clock, short: "2 meses" },
  semestral: { label: "Semestral", icon: CalendarDays, short: "6 meses" },
  anual: { label: "Anual", icon: ShieldCheck, short: "12 meses" },
};

const STATUS_META: Record<
  LegalStatus,
  { label: string; dot: string; bar: string; ring: string; text: string }
> = {
  em_dia: {
    label: "Em dia",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  proximo: {
    label: "Próximo",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    ring: "ring-amber-500/40",
    text: "text-amber-600 dark:text-amber-400",
  },
  vencido: {
    label: "Vencido",
    dot: "bg-red-500",
    bar: "bg-red-500",
    ring: "ring-red-500/40",
    text: "text-red-600 dark:text-red-400",
  },
  concluido: {
    label: "Concluído",
    dot: "bg-slate-400",
    bar: "bg-slate-400",
    ring: "ring-slate-400/30",
    text: "text-muted-foreground",
  },
};

function fmtBR(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR");
}

function urgencyIntensity(item: LegalItem): "none" | "d15" | "d7" | "d1" | "late" {
  if (item.concluido) return "none";
  const d = daysUntil(item.proximaExecucao);
  if (d < 0) return "late";
  if (d <= 1) return "d1";
  if (d <= 7) return "d7";
  if (d <= 15) return "d15";
  return "none";
}

export function LegalItemsPanel() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["legal_items"],
    queryFn: listLegalItems,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LegalItem | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [statusFilter, setStatusFilter] = useState<"all" | LegalStatus>("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | Periodicidade>("all");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [dayModal, setDayModal] = useState<LegalItem | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["legal_items"] });

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (periodFilter !== "all" && i.periodicidade !== periodFilter) return false;
      if (statusFilter !== "all" && statusOf(i) !== statusFilter) return false;
      if (query && !i.titulo.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [items, statusFilter, periodFilter, query]);

  const stats = useMemo(() => {
    const active = items.filter((i) => !i.concluido);
    return {
      total: items.length,
      vencidos: active.filter((i) => statusOf(i) === "vencido").length,
      proximos: active.filter((i) => statusOf(i) === "proximo").length,
    };
  }, [items]);

  const urgentes = useMemo(
    () =>
      items
        .filter((i) => !i.concluido)
        .filter((i) => ["vencido", "proximo"].includes(statusOf(i)))
        .sort((a, b) => a.proximaExecucao.localeCompare(b.proximaExecucao)),
    [items],
  );

  const upsert = async (r: LegalItem) => {
    try {
      const exists = items.some((x) => x.id === r.id);
      if (exists) await updateLegalItem(r.id, r);
      else await createLegalItem(r);
      invalidate();
      toast.success(exists ? "Item atualizado" : "Item criado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  };

  const markDone = async (i: LegalItem) => {
    const today = new Date().toISOString().slice(0, 10);
    const next = addMonths(today, monthsFor(i.periodicidade));
    try {
      await updateLegalItem(i.id, {
        ultimaExecucao: today,
        proximaExecucao: next,
        concluido: false,
      });
      invalidate();
      toast.success("Marcado como concluído. Próxima: " + fmtBR(next));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteLegalItem(id);
      invalidate();
      toast.success("Item removido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  const grouped = useMemo(() => {
    const g: Record<Periodicidade, LegalItem[]> = {
      bimestral: [],
      semestral: [],
      anual: [],
    };
    filtered.forEach((i) => g[i.periodicidade].push(i));
    return g;
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Header: KPIs + notifications */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} tone="neutral" />
        <StatCard label="Vencidos" value={stats.vencidos} tone="danger" />
        <StatCard label="Próximos (≤15d)" value={stats.proximos} tone="warn" />
        <NotificationsBell items={urgentes} onOpen={(i) => setDayModal(i)} />
      </div>

      {/* Toolbar */}
      <GlassCard>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar item..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="em_dia">Em dia</SelectItem>
              <SelectItem value="proximo">Próximos</SelectItem>
              <SelectItem value="vencido">Vencidos</SelectItem>
              <SelectItem value="concluido">Concluídos</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={periodFilter}
            onValueChange={(v) => setPeriodFilter(v as typeof periodFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas periodicidades</SelectItem>
              <SelectItem value="bimestral">Bimestral</SelectItem>
              <SelectItem value="semestral">Semestral</SelectItem>
              <SelectItem value="anual">Anual</SelectItem>
            </SelectContent>
          </Select>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Novo item legal
              </Button>
            </DialogTrigger>
            <LegalItemForm
              initial={editing}
              onSubmit={(r) => {
                upsert(r);
                setOpen(false);
                setEditing(null);
              }}
            />
          </Dialog>
        </div>
      </GlassCard>

      {/* View toggle */}
      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="list">
            <ListIcon className="mr-2 h-4 w-4" /> Lista
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarIcon className="mr-2 h-4 w-4" /> Calendário
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <Tabs defaultValue="bimestral">
            <TabsList>
              {(["bimestral", "semestral", "anual"] as Periodicidade[]).map((p) => {
                const Meta = PERIOD_META[p];
                const Icon = Meta.icon;
                return (
                  <TabsTrigger key={p} value={p}>
                    <Icon className="mr-2 h-4 w-4" strokeWidth={1.75} />
                    {Meta.label}
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {grouped[p].length}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {(["bimestral", "semestral", "anual"] as Periodicidade[]).map((p) => (
              <TabsContent key={p} value={p} className="mt-4">
                {grouped[p].length === 0 ? (
                  <EmptyState onCreate={() => setOpen(true)} />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <AnimatePresence initial={false}>
                      {grouped[p].map((it) => (
                        <LegalCard
                          key={it.id}
                          item={it}
                          onDone={() => markDone(it)}
                          onEdit={() => {
                            setEditing(it);
                            setOpen(true);
                          }}
                          onRemove={() => remove(it.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarView
            items={filtered}
            cursor={cursor}
            setCursor={setCursor}
            onPickItem={(i) => setDayModal(i)}
          />
        </TabsContent>
      </Tabs>

      {/* Day / item details modal */}
      <Dialog open={!!dayModal} onOpenChange={(v) => !v && setDayModal(null)}>
        {dayModal && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dayModal.titulo}</DialogTitle>
            </DialogHeader>
            <ItemDetails item={dayModal} />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(dayModal);
                  setDayModal(null);
                  setOpen(true);
                }}
              >
                Editar
              </Button>
              <Button
                onClick={() => {
                  markDone(dayModal);
                  setDayModal(null);
                }}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como concluído
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
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
  tone: "neutral" | "warn" | "danger";
}) {
  const tint =
    tone === "danger"
      ? "from-red-500/25 to-red-500/5"
      : tone === "warn"
        ? "from-amber-500/25 to-amber-500/5"
        : "from-slate-500/20 to-slate-500/5";
  return (
    <GlassCard>
      <div className={`absolute inset-0 bg-gradient-to-br ${tint} opacity-70`} />
      <div className="relative">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      </div>
    </GlassCard>
  );
}

function NotificationsBell({
  items,
  onOpen,
}: {
  items: LegalItem[];
  onOpen: (i: LegalItem) => void;
}) {
  return (
    <GlassCard>
      <Popover>
        <PopoverTrigger asChild>
          <button className="relative flex w-full items-center gap-3 text-left">
            <div className="glass-tile grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              {items.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {items.length}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Notificações</p>
              <p className="mt-1 text-sm font-medium">
                {items.length === 0 ? "Sem pendências" : `${items.length} urgente(s)`}
              </p>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border/60 px-3 py-2 text-sm font-semibold">
            Itens urgentes
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Tudo em dia.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border/60 overflow-auto">
              {items.slice(0, 10).map((i) => {
                const s = statusOf(i);
                const d = daysUntil(i.proximaExecucao);
                return (
                  <li key={i.id}>
                    <button
                      onClick={() => onOpen(i)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent/50"
                    >
                      <span className={cn("mt-1.5 h-2 w-2 rounded-full", STATUS_META[s].dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{i.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {s === "vencido"
                            ? `Vencido há ${Math.abs(d)}d`
                            : d === 0
                              ? "Vence hoje"
                              : `Vence em ${d}d`}{" "}
                          · {fmtBR(i.proximaExecucao)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </GlassCard>
  );
}

function LegalCard({
  item,
  onDone,
  onEdit,
  onRemove,
}: {
  item: LegalItem;
  onDone: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const s = statusOf(item);
  const meta = STATUS_META[s];
  const period = PERIOD_META[item.periodicidade];
  const Icon = period.icon;
  const d = daysUntil(item.proximaExecucao);
  const urgency = urgencyIntensity(item);

  const urgencyRing =
    urgency === "d1" || urgency === "late"
      ? "ring-2 ring-red-500/50"
      : urgency === "d7"
        ? "ring-2 ring-amber-500/50"
        : urgency === "d15"
          ? "ring-1 ring-amber-500/30"
          : "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={cn(
        "group glass-surface relative overflow-hidden rounded-3xl transition-shadow duration-300 hover:shadow-elegant",
        urgencyRing,
      )}
    >
      {/* Status color bar */}
      <div className={cn("absolute left-0 top-0 h-full w-1.5", meta.bar)} />
      <div className="relative flex flex-col gap-3 p-5 pl-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="glass-tile grid h-9 w-9 shrink-0 place-items-center rounded-xl">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium leading-tight">{item.titulo}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {period.label}
              </p>
            </div>
          </div>
          <Badge className={cn("shrink-0 border-none text-white", meta.bar)}>{meta.label}</Badge>
        </div>

        {item.descricao && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{item.descricao}</p>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Última</p>
            <p className="font-medium">{item.ultimaExecucao ? fmtBR(item.ultimaExecucao) : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Próxima</p>
            <p className={cn("font-medium", meta.text)}>{fmtBR(item.proximaExecucao)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {item.responsavel && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {item.responsavel}
            </span>
          )}
          {s === "vencido" && (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" />
              Vencido há {Math.abs(d)}d
            </span>
          )}
          {s === "proximo" && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              {d === 0 ? "Vence hoje" : `Em ${d}d`}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <Button size="sm" onClick={onDone}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Concluir
          </Button>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Editar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onRemove}
              aria-label="Remover"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ItemDetails({ item }: { item: LegalItem }) {
  const s = statusOf(item);
  const meta = STATUS_META[s];
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <span className={meta.text}>{meta.label}</span>
        <Badge variant="outline" className="ml-2 text-[10px]">
          {PERIOD_META[item.periodicidade].label}
        </Badge>
      </div>
      {item.descricao && <p className="text-muted-foreground">{item.descricao}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Última execução</p>
          <p className="font-medium">{item.ultimaExecucao ? fmtBR(item.ultimaExecucao) : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Próxima execução</p>
          <p className="font-medium">{fmtBR(item.proximaExecucao)}</p>
        </div>
      </div>
      {item.responsavel && (
        <div>
          <p className="text-xs text-muted-foreground">Responsável</p>
          <p className="font-medium">{item.responsavel}</p>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <GlassCard>
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="rounded-2xl bg-primary/10 p-4">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Sem itens legais nesta periodicidade</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cadastre obrigações recorrentes como AVCB, laudos, licenças e alvarás.
        </p>
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar item legal
        </Button>
      </div>
    </GlassCard>
  );
}

function CalendarView({
  items,
  cursor,
  setCursor,
  onPickItem,
}: {
  items: LegalItem[];
  cursor: Date;
  setCursor: (d: Date) => void;
  onPickItem: (i: LegalItem) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = useMemo(() => {
    const map = new Map<string, LegalItem[]>();
    items.forEach((i) => {
      const arr = map.get(i.proximaExecucao) ?? [];
      arr.push(i);
      map.set(i.proximaExecucao, arr);
    });
    return map;
  }, [items]);

  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, key: `pad-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    cells.push({ date: dt, key: dt.toISOString() });
  }

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <GlassCard>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {
            const d = new Date();
            d.setDate(1);
            setCursor(d);
          }}>
            Hoje
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <motion.div
        key={`${year}-${month}`}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mt-1 grid grid-cols-7 gap-1"
      >
        {cells.map((c) => {
          if (!c.date) return <div key={c.key} className="aspect-square" />;
          const key = c.date.toISOString().slice(0, 10);
          const dayItems = byDay.get(key) ?? [];
          const isToday = key === new Date().toISOString().slice(0, 10);
          return (
            <Popover key={c.key}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "glass-tile group relative flex aspect-square flex-col items-start rounded-xl p-1.5 text-left transition-transform hover:-translate-y-0.5",
                    isToday && "ring-2 ring-primary/50",
                    dayItems.length === 0 && "opacity-70",
                  )}
                >
                  <span className="text-xs font-medium">{c.date.getDate()}</span>
                  <div className="mt-auto flex flex-wrap gap-0.5">
                    {dayItems.slice(0, 3).map((i) => (
                      <span
                        key={i.id}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          STATUS_META[statusOf(i)].dot,
                        )}
                      />
                    ))}
                    {dayItems.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{dayItems.length - 3}</span>
                    )}
                  </div>
                </button>
              </PopoverTrigger>
              {dayItems.length > 0 && (
                <PopoverContent align="start" className="w-72 p-0">
                  <div className="border-b border-border/60 px-3 py-2 text-sm font-semibold">
                    {c.date.toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })}
                  </div>
                  <ul className="max-h-64 divide-y divide-border/60 overflow-auto">
                    {dayItems.map((i) => {
                      const s = statusOf(i);
                      return (
                        <li key={i.id}>
                          <button
                            onClick={() => onPickItem(i)}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent/50"
                          >
                            <span
                              className={cn(
                                "mt-1.5 h-2 w-2 rounded-full",
                                STATUS_META[s].dot,
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{i.titulo}</p>
                              <p className="text-xs text-muted-foreground">
                                {PERIOD_META[i.periodicidade].label} · {STATUS_META[s].label}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </PopoverContent>
              )}
            </Popover>
          );
        })}
      </motion.div>
    </GlassCard>
  );
}

function LegalItemForm({
  initial,
  onSubmit,
}: {
  initial: LegalItem | null;
  onSubmit: (r: LegalItem) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(
    initial?.periodicidade ?? "anual",
  );
  const [inicio, setInicio] = useState(initial?.ultimaExecucao ?? today);
  const [proxima, setProxima] = useState(
    initial?.proximaExecucao ?? addMonths(today, monthsFor(initial?.periodicidade ?? "anual")),
  );
  const [responsavel, setResponsavel] = useState(initial?.responsavel ?? "");

  useEffect(() => {
    setTitulo(initial?.titulo ?? "");
    setDescricao(initial?.descricao ?? "");
    setPeriodicidade(initial?.periodicidade ?? "anual");
    setInicio(initial?.ultimaExecucao ?? today);
    setProxima(
      initial?.proximaExecucao ??
        addMonths(today, monthsFor(initial?.periodicidade ?? "anual")),
    );
    setResponsavel(initial?.responsavel ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // Auto-recalculate next date when start / periodicity changes (only for new items or if user didn't change proxima manually)
  useEffect(() => {
    if (initial) return;
    setProxima(addMonths(inicio, monthsFor(periodicidade)));
  }, [inicio, periodicidade, initial]);

  const submit = () => {
    if (!titulo.trim()) return toast.error("Informe um título");
    onSubmit({
      id: initial?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      periodicidade,
      ultimaExecucao: inicio || null,
      proximaExecucao: proxima,
      responsavel: responsavel.trim(),
      concluido: initial?.concluido ?? false,
      createdAt: initial?.createdAt ?? Date.now(),
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar item legal" : "Novo item legal"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Título</Label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex: Renovação de AVCB"
          />
        </div>
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Detalhes da obrigação (opcional)"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Periodicidade</Label>
            <Select
              value={periodicidade}
              onValueChange={(v) => setPeriodicidade(v as Periodicidade)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bimestral">Bimestral (2 meses)</SelectItem>
                <SelectItem value="semestral">Semestral (6 meses)</SelectItem>
                <SelectItem value="anual">Anual (12 meses)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Responsável</Label>
            <Input
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Última execução / início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Próxima execução</Label>
            <Input type="date" value={proxima} onChange={(e) => setProxima(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit}>{initial ? "Salvar" : "Criar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
