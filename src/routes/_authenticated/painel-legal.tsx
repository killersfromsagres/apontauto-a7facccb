import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Filter as FilterIcon,
  List as ListIcon,
  CalendarDays,
  CheckCircle2,
  Paperclip,
  Pencil,
  Trash2,
  Download,
  Bell,
  ShieldCheck,
  X,
  Check,
  Minus,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Wind,
  ChefHat,
  Waves,
  FileText,
  Building2,
  FileDown,
  Star,
  Eye,
  EyeOff,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  listLegalItems,
  listExecutions,
  countAttachments,
  createLegalItem,
  updateLegalItem,
  deleteLegalItem,
  completeLegalItem,
  addMonths,
  monthsFor,
  statusOf,
  statusMeta,
  buildMonthMap,
  todayISO,
  daysUntil,
  type LegalItem,
  type Periodicidade,
  type LegalStatus,
} from "@/lib/legal-items";
import { LegalAttachmentsModal } from "@/components/legal/legal-attachments-modal";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useLegalAlerts, type LegalAlert } from "@/hooks/use-legal-alerts";
// legal-export é dinamicamente importado só quando o usuário clica em exportar
// (retira xlsx + jspdf + autotable do chunk inicial da rota).

export const Route = createFileRoute("/_authenticated/painel-legal")({
  component: PainelLegalPage,
});

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const PERIODICIDADES: Periodicidade[] = ["bimestral", "trimestral", "semestral", "anual"];
const PERIODICIDADE_LABEL: Record<Periodicidade, string> = {
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const STATUS_LABEL: Record<LegalStatus | "todos", string> = {
  todos: "Todos os status",
  em_dia: "Em dia",
  proximo: "Próximo do vencimento",
  vencido: "Vencido",
  concluido: "Concluído",
  sem_agenda: "Sem agenda",
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Detecta ícone visual do tipo de tarefa a partir do título. */
function TaskTypeIcon({ titulo, className }: { titulo: string; className?: string }) {
  const t = titulo.toLowerCase();
  const cls = cn("h-4 w-4", className);
  if (/(caixa\s*d['’]?\s*[áa]gua|reservat[óo]rio|potabilidade)/.test(t))
    return <Droplets className={cn(cls, "text-sky-400")} strokeWidth={1.8} />;
  if (/(caixa\s*de\s*gordura|gordura|esgoto|efluente)/.test(t))
    return <Waves className={cn(cls, "text-amber-500")} strokeWidth={1.8} />;
  if (/(coifa|exaust[ãa]o|chamin[ée])/.test(t))
    return <ChefHat className={cn(cls, "text-orange-400")} strokeWidth={1.8} />;
  if (/(an[áa]lise\s*de\s*ar|qualidade\s*do\s*ar|ar\s*condicionado|climatiza[çc][ãa]o|pmoc)/.test(t))
    return <Wind className={cn(cls, "text-cyan-400")} strokeWidth={1.8} />;
  return <FileText className={cn(cls, "text-slate-400")} strokeWidth={1.8} />;
}

/** Nome da empresa em branco negrito com luz passando pelas letras. */
function CompanyName({ name, className }: { name: string; className?: string }) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-block bg-clip-text font-bold text-transparent",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(110deg, #ffffff 0%, #ffffff 40%, rgba(191,219,254,0.95) 50%, #ffffff 60%, #ffffff 100%)",
        backgroundSize: "220% 100%",
        animation: "shine 3.6s linear infinite",
      }}
    >
      {name}
    </span>
  );
}

/** Botão com nome completo da tarefa (sem truncar). */
function TaskNameButton({
  titulo,
  onClick,
  className,
}: {
  titulo: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/50 bg-card/50 px-2 py-1 text-left text-sm font-medium",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset] transition",
        "hover:border-primary/60 hover:bg-primary/10 hover:text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        className,
      )}
    >
      <TaskTypeIcon titulo={titulo} className="shrink-0" />
      <span className="whitespace-normal break-words leading-snug">{titulo}</span>
    </button>
  );
}

/** Marcações persistentes de itens (compartilhado por Lista e Calendário). */
function useMarkedLegal() {
  const [marked, setMarked] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("legal-calendar-marked");
      return raw ? new Set<string>(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const persist = (s: Set<string>) => {
    try { window.localStorage.setItem("legal-calendar-marked", JSON.stringify(Array.from(s))); } catch {}
  };
  const toggleMark = (id: string) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persist(next);
      return next;
    });
  const clearMarks = () => { setMarked(new Set()); persist(new Set()); };
  return { marked, toggleMark, clearMarks };
}


/* -------------------------------------------------------------------------- */
/*  Página                                                                    */
/* -------------------------------------------------------------------------- */

function PainelLegalPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [empresaFilter, setEmpresaFilter] = useState<string>("todas");
  const [periodicidadeFilter, setPeriodicidadeFilter] = useState<Periodicidade | "todas">("todas");
  const [statusFilter, setStatusFilter] = useState<LegalStatus | "todos">("todos");
  const [group, setGroup] = useState<"nenhum" | "empresa" | "periodicidade">("nenhum");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LegalItem | null>(null);
  const [attachItem, setAttachItem] = useState<LegalItem | null>(null);
  const { isAdmin } = useIsAdmin();
  const { marked, toggleMark, clearMarks } = useMarkedLegal();
  const [onlyMarked, setOnlyMarked] = useState(false);


  const { data: items = [], isLoading } = useQuery({
    queryKey: ["legal-items"],
    queryFn: listLegalItems,
  });
  const { data: execs = [] } = useQuery({
    queryKey: ["legal-executions"],
    queryFn: listExecutions,
  });
  const { data: attCounts = {} } = useQuery({
    queryKey: ["legal-attachments-counts"],
    queryFn: countAttachments,
  });

  const empresas = useMemo(() => {
    const s = new Set<string>();
    items.forEach((it) => it.empresa && s.add(it.empresa));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (onlyMarked && !marked.has(it.id)) return false;
      if (empresaFilter !== "todas" && it.empresa !== empresaFilter) return false;
      if (periodicidadeFilter !== "todas" && it.periodicidade !== periodicidadeFilter) return false;
      if (statusFilter !== "todos" && statusOf(it) !== statusFilter) return false;
      if (q && !it.titulo.toLowerCase().includes(q) && !it.empresa.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [items, search, empresaFilter, periodicidadeFilter, statusFilter, onlyMarked, marked]);

  const alerts = useLegalAlerts(items);

  // "Design agent": sugere agrupar quando cresce muito
  const suggestGroup = filtered.length > 25 && group === "nenhum";

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["legal-items"] });
    qc.invalidateQueries({ queryKey: ["legal-executions"] });
  };

  const handleComplete = async (it: LegalItem) => {
    try {
      await completeLegalItem(it);
      toast.success("Marcado como concluído. Próxima execução recalculada.");
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao concluir");
    }
  };

  const handleDelete = async (it: LegalItem) => {
    if (!confirm(`Excluir "${it.titulo}"?`)) return;
    try {
      await deleteLegalItem(it.id);
      toast.success("Item excluído.");
      invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (it: LegalItem) => {
    setEditing(it);
    setFormOpen(true);
  };

  const handleExport = async () => {
    const { exportLegalXLSX } = await import("@/lib/legal-export");
    exportLegalXLSX(filtered, execs, year);
    toast.success("Planilha exportada.");
  };

  const handleExportPDF = async () => {
    const { exportLegalPDF } = await import("@/lib/legal-export");
    exportLegalPDF(filtered, execs, year);
    toast.success("PDF gerado.");
  };

  return (
    <PageShell
      title="Painel de Itens Legais"
      description="Controle de tarefas legais e recorrentes, execução mensal e certificados."
    >
      {/* Cabeçalho de ações — mais compacto */}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 text-primary ring-1 ring-primary/30 shadow-[0_0_18px_-4px_rgba(59,130,246,0.55)]">
            <ShieldCheck className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Painel
            </p>
            <h2 className="truncate font-display text-sm font-bold tracking-wide sm:text-base lg:text-lg">
              PAINEL DE ITENS LEGAIS
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <AlertsBell alerts={alerts} onFocus={(id) => document.getElementById(`legal-row-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} />
          <Button
            variant={onlyMarked ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyMarked((v) => !v)}
            className="h-8 px-2 sm:px-3"
            title={onlyMarked ? "Mostrar todas" : "Retrair — só marcadas"}
          >
            <Star className={cn("h-3.5 w-3.5 sm:mr-1.5", onlyMarked && "fill-amber-400 text-amber-400")} />
            <span className="hidden sm:inline">{onlyMarked ? "Só marcadas" : "Todas"}</span>
            {marked.size > 0 && (
              <span className="ml-1 rounded-md bg-amber-400/20 px-1 text-[10px] font-bold text-amber-400">
                {marked.size}
              </span>
            )}
          </Button>
          <div className="flex overflow-hidden rounded-lg border border-border/60 bg-card/40">
            <button
              onClick={() => setView("lista")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs transition",
                view === "lista" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40",
              )}
              aria-label="Lista"
            >
              <ListIcon className="h-3.5 w-3.5" /> <span className="hidden xs:inline sm:inline">Lista</span>
            </button>
            <button
              onClick={() => setView("calendario")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs transition",
                view === "calendario" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40",
              )}
              aria-label="Calendário"
            >
              <CalendarDays className="h-3.5 w-3.5" /> <span className="hidden xs:inline sm:inline">Calendário</span>
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8 px-2 sm:px-3" aria-label="Exportar Excel">
            <Download className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Excel</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="h-8 px-2 sm:px-3" aria-label="Exportar PDF">
            <FileDown className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button size="sm" onClick={openCreate} className="h-8 px-2 sm:px-3">
            <Plus className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Novo item</span><span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </div>



      {/* Filtros */}
      <GlassCard className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por tarefa ou empresa…"
              className="pl-9"
            />
          </div>
          <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as empresas</SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={periodicidadeFilter}
            onValueChange={(v) => setPeriodicidadeFilter(v as Periodicidade | "todas")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Periodicidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {PERIODICIDADES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIODICIDADE_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LegalStatus | "todos")}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {(["todos", "em_dia", "proximo", "vencido", "concluido", "sem_agenda"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AnimatePresence>
          {suggestGroup && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
            >
              <FilterIcon className="h-4 w-4" />
              <span>
                A lista está grande ({filtered.length} itens). Que tal agrupar?
              </span>
              <Button size="sm" variant="secondary" onClick={() => setGroup("empresa")}>
                Por empresa
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setGroup("periodicidade")}>
                Por periodicidade
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {group !== "nenhum" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Agrupado por {group === "empresa" ? "empresa" : "periodicidade"}</span>
            <Button size="sm" variant="ghost" onClick={() => setGroup("nenhum")}>
              <X className="mr-1 h-3 w-3" /> desagrupar
            </Button>
          </div>
        )}
      </GlassCard>

      {/* Corpo */}
      {isLoading ? (
        <GlassCard><p className="text-sm text-muted-foreground">Carregando…</p></GlassCard>
      ) : view === "lista" ? (
        <ListView
          items={filtered}
          execs={execs}
          attCounts={attCounts}
          year={year}
          setYear={setYear}
          group={group}
          isAdmin={isAdmin}
          marked={marked}
          onToggleMark={toggleMark}
          onComplete={handleComplete}
          onEdit={openEdit}
          onDelete={handleDelete}
          onAttach={setAttachItem}
        />
      ) : (
        <CalendarView
          items={filtered}
          onOpenItem={setAttachItem}
          onComplete={handleComplete}
          marked={marked}
          onToggleMark={toggleMark}
          onClearMarks={clearMarks}
          onlyMarked={onlyMarked}
          onToggleOnlyMarked={() => setOnlyMarked((v) => !v)}
        />
      )}

      <LegalAttachmentsModal
        item={attachItem}
        open={!!attachItem}
        onOpenChange={(o) => !o && setAttachItem(null)}
      />

      <LegalItemForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() => {
          invalidateAll();
        }}
      />
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sino de alertas                                                           */
/* -------------------------------------------------------------------------- */

function AlertsBell({ alerts, onFocus }: { alerts: LegalAlert[]; onFocus: (id: string) => void }) {
  const count = alerts.length;
  const overdue = alerts.filter((a) => a.level === "overdue").length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span
              className={cn(
                "absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white",
                overdue > 0 ? "bg-red-500" : "bg-amber-500",
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-sm font-semibold">Alertas</p>
          <p className="text-xs text-muted-foreground">
            {count === 0 ? "Nada pendente 🎉" : `${count} pendência(s)`}
          </p>
        </div>
        <div className="max-h-80 overflow-auto">
          {alerts.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Sem alertas nos próximos 15 dias.
            </p>
          ) : (
            alerts.map((a) => (
              <button
                key={a.id}
                onClick={() => onFocus(a.itemId)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-border/40 px-3 py-2 text-left transition hover:bg-muted/40"
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      a.level === "overdue" ? "bg-red-500" :
                      a.level === "danger" ? "bg-red-400" :
                      a.level === "warn" ? "bg-amber-500" : "bg-sky-400",
                    )}
                  />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{a.titulo}</p>
                </div>
                <p className="pl-4 text-xs text-muted-foreground">
                  {a.empresa || "—"} · {a.message}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  Visão em lista (tabela desktop + cards mobile)                             */
/* -------------------------------------------------------------------------- */

function ListView({
  items,
  execs,
  attCounts,
  year,
  setYear,
  group,
  isAdmin,
  marked,
  onToggleMark,
  onComplete,
  onEdit,
  onDelete,
  onAttach,
}: {
  items: LegalItem[];
  execs: ReturnType<typeof useQuery<Awaited<ReturnType<typeof listExecutions>>>>["data"] extends infer T ? NonNullable<T> : never;
  attCounts: Record<string, number>;
  year: number;
  setYear: (y: number) => void;
  group: "nenhum" | "empresa" | "periodicidade";
  isAdmin: boolean;
  marked: Set<string>;
  onToggleMark: (id: string) => void;
  onComplete: (it: LegalItem) => void;
  onEdit: (it: LegalItem) => void;
  onDelete: (it: LegalItem) => void;
  onAttach: (it: LegalItem) => void;
}) {
  const groups = useMemo(() => {
    if (group === "nenhum") return [{ key: "", items }];
    const map = new Map<string, LegalItem[]>();
    for (const it of items) {
      const key = group === "empresa" ? it.empresa || "Sem empresa" : PERIODICIDADE_LABEL[it.periodicidade];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
  }, [items, group]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-14 text-center font-mono text-sm font-semibold">{year}</span>
          <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {items.length} tarefa(s)
        </p>
      </div>

      {groups.map((g) => (
        <div key={g.key || "all"} className="space-y-3">
          {g.key && (
            <h3 className="pl-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {g.key}
            </h3>
          )}

          {/* Tabela — desktop */}
          <GlassCard className="hidden overflow-x-auto p-2 lg:block">
            <table className="w-full min-w-[1320px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Th className="min-w-[260px]">Tarefa</Th>
                  <Th>Empresa</Th>
                  <Th>Prédio</Th>
                  <Th>Última</Th>
                  <Th>Próxima</Th>
                  <Th>Agendamento</Th>
                  <Th>Period.</Th>
                  {MONTHS_SHORT.map((m) => (
                    <Th key={m} className="text-center">{m}</Th>
                  ))}
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => {
                  const st = statusOf(it);
                  const cells = buildMonthMap(it, execs as never, year);
                  const rowHl =
                    st === "vencido" ? "bg-red-500/5" :
                    st === "proximo" ? "bg-amber-500/5" :
                    st === "sem_agenda" ? "bg-yellow-500/5" : "";
                  return (
                    <tr
                      key={it.id}
                      id={`legal-row-${it.id}`}
                      className={cn(
                        "group border-t border-border/40 transition hover:bg-muted/30",
                        rowHl,
                      )}
                    >
                      <Td>
                        <div className="flex items-start gap-2">
                          <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", statusMeta[st].dot)} />
                          <TaskNameButton titulo={it.titulo} onClick={() => onAttach(it)} />
                        </div>
                      </Td>
                      <Td><CompanyName name={it.empresa} /></Td>
                      <Td className="text-muted-foreground">
                        {it.predio ? (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 opacity-70" /> {it.predio}
                          </span>
                        ) : "—"}
                      </Td>
                      <Td>{fmt(it.ultimaExecucao)}</Td>
                      <Td>{fmt(it.proximaExecucao)}</Td>
                      <Td>{fmt(it.agendamento)}</Td>
                      <Td className="capitalize">{PERIODICIDADE_LABEL[it.periodicidade]}</Td>
                      {cells.map((c, i) => (
                        <Td key={i} className="text-center">
                          <MonthCellIcon cell={c} />
                        </Td>
                      ))}
                      <Td className="whitespace-nowrap text-right">
                        <RowActions
                          item={it}
                          attachCount={attCounts[it.id] ?? 0}
                          isAdmin={isAdmin}
                          onComplete={onComplete}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onAttach={onAttach}
                        />
                      </Td>
                    </tr>
                  );
                })}
                {g.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={8 + MONTHS_SHORT.length}
                      className="px-4 py-6 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma tarefa cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </GlassCard>

          {/* Cards — mobile/tablet */}
          <div className="grid gap-3 lg:hidden">
            {g.items.map((it) => {
              const st = statusOf(it);
              const cells = buildMonthMap(it, execs as never, year);
              return (
                <div key={it.id} id={`legal-row-${it.id}`}>
                <GlassCard
                  className={cn(
                    "relative overflow-hidden",
                    st === "vencido" && "ring-1 ring-red-500/30",
                    st === "proximo" && "ring-1 ring-amber-500/30",
                    st === "sem_agenda" && "ring-1 ring-yellow-500/30",
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      statusMeta[st].dot,
                    )}
                  />
                  <div className="pl-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <TaskNameButton titulo={it.titulo} onClick={() => onAttach(it)} className="w-full" />
                        <p className="mt-0.5 truncate text-xs">
                          <CompanyName name={it.empresa} className="text-xs" />
                          <span className="text-muted-foreground"> · {PERIODICIDADE_LABEL[it.periodicidade]}</span>
                          {it.predio && (
                            <span className="text-muted-foreground"> · {it.predio}</span>
                          )}
                        </p>
                      </div>
                      <StatusBadge status={st} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <MiniInfo label="Última" value={fmt(it.ultimaExecucao)} />
                      <MiniInfo label="Próxima" value={fmt(it.proximaExecucao)} />
                      <MiniInfo label="Agenda" value={fmt(it.agendamento)} />
                    </div>
                    {it.observacoes && (
                      <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-border/40 bg-muted/20 p-2 text-xs leading-relaxed text-muted-foreground">
                        {it.observacoes}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-12 gap-1">
                      {cells.map((c, i) => (
                        <div key={i} className="flex flex-col items-center gap-0.5">
                          <span className="text-[9px] text-muted-foreground">{MONTHS_SHORT[i][0]}</span>
                          <MonthCellIcon cell={c} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-1">
                      <RowActions
                        item={it}
                        attachCount={attCounts[it.id] ?? 0}
                        isAdmin={isAdmin}
                        onComplete={onComplete}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onAttach={onAttach}
                      />
                    </div>
                  </div>
                </GlassCard>
                </div>
              );
            })}
            {g.items.length === 0 && (
              <GlassCard>
                <p className="text-center text-sm text-muted-foreground">Nenhuma tarefa.</p>
              </GlassCard>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("sticky top-0 z-10 bg-card/60 px-3 py-2 font-semibold backdrop-blur", className)}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}

function MonthCellIcon({ cell }: { cell: "done" | "scheduled" | "overdue" | "none" }) {
  if (cell === "done")
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  if (cell === "overdue")
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-red-500/15 text-red-400">
        <X className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  if (cell === "scheduled")
    return (
      <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-amber-500/15 text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      </span>
    );
  return (
    <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-slate-500/10 text-slate-400">
      <Minus className="h-3 w-3" />
    </span>
  );
}

function StatusBadge({ status }: { status: LegalStatus }) {
  const m = statusMeta[status];
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 gap-1 border-transparent", m.bg, m.text, "ring-1", m.ring)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </Badge>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}

function RowActions({
  item,
  attachCount,
  isAdmin,
  onComplete,
  onEdit,
  onDelete,
  onAttach,
}: {
  item: LegalItem;
  attachCount: number;
  isAdmin: boolean;
  onComplete: (it: LegalItem) => void;
  onEdit: (it: LegalItem) => void;
  onDelete: (it: LegalItem) => void;
  onAttach: (it: LegalItem) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => onComplete(item)} title="Marcar como concluído">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAttach(item)} title="Certificados">
        <Paperclip className="h-4 w-4" />
        {attachCount > 0 && (
          <span className="ml-1 text-[10px] font-semibold text-primary">{attachCount}</span>
        )}
      </Button>
      {isAdmin && (
        <>
          <Button size="sm" variant="ghost" onClick={() => onEdit(item)} title="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(item)}
            title="Excluir"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Visão calendário                                                          */
/* -------------------------------------------------------------------------- */

function CalendarView({
  items,
  onOpenItem,
  onComplete,
}: {
  items: LegalItem[];
  onOpenItem: (it: LegalItem) => void;
  onComplete: (it: LegalItem) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("legal-calendar-marked");
      return raw ? new Set<string>(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  const persist = (s: Set<string>) => {
    try { window.localStorage.setItem("legal-calendar-marked", JSON.stringify(Array.from(s))); } catch {}
  };
  const toggleMark = (id: string) => {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persist(next);
      return next;
    });
  };
  const clearMarks = () => { setMarked(new Set()); persist(new Set()); };

  const visibleItems = useMemo(
    () => (onlyMarked ? items.filter((it) => marked.has(it.id)) : items),
    [items, onlyMarked, marked],
  );

  const eventsByDay = useMemo(() => {
    const m = new Map<string, LegalItem[]>();
    for (const it of visibleItems) {
      const push = (key: string | null) => {
        if (!key) return;
        const d = new Date(key + "T00:00:00");
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        const arr = m.get(key) ?? [];
        if (!arr.find((x) => x.id === it.id)) arr.push(it);
        m.set(key, arr);
      };
      push(it.proximaExecucao);
      push(it.agendamento);
    }
    return m;
  }, [visibleItems, year, month]);

  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: iso, day: d });
  }

  const change = (delta: number) => {
    const m = month + delta;
    if (m < 0) { setMonth(11); setYear(year - 1); }
    else if (m > 11) { setMonth(0); setYear(year + 1); }
    else setMonth(m);
  };

  const daySelected = selected ? eventsByDay.get(selected) ?? [] : [];
  const markedCount = marked.size;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,480px)_1fr]">
      <GlassCard className="p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={() => change(-1)} className="h-7 w-7">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <p className="min-w-32 text-center text-sm font-semibold">
              {MONTHS_FULL[month]} <span className="text-muted-foreground">{year}</span>
            </p>
            <Button variant="outline" size="icon" onClick={() => change(1)} className="h-7 w-7">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>
            Hoje
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="py-0.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((c, i) => {
            if (!c.date) return <div key={i} className="aspect-square rounded-md" />;
            const evs = eventsByDay.get(c.date) ?? [];
            const isToday = c.date === todayISO();
            const isSel = c.date === selected;
            const hasMarked = evs.some((e) => marked.has(e.id));
            const worstStatus: LegalStatus | null = evs.length
              ? (evs.map((e) => statusOf(e)).sort((a, b) =>
                  order(b) - order(a),
                )[0])
              : null;
            return (
              <button
                key={i}
                onClick={() => setSelected(c.date)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-start gap-0.5 rounded-md border border-transparent p-1 text-[11px] transition",
                  "hover:border-border/60 hover:bg-muted/30",
                  isToday && "ring-1 ring-primary/60",
                  isSel && "border-primary/70 bg-primary/10",
                )}
              >
                <span className={cn("font-medium leading-none", isToday && "text-primary")}>{c.day}</span>
                {hasMarked && (
                  <Star className="absolute right-0.5 top-0.5 h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                )}
                {evs.length > 0 && worstStatus && (
                  <div className="flex flex-wrap items-center justify-center gap-0.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta[worstStatus].dot)} />
                    {evs.length > 1 && (
                      <span className="text-[8px] leading-none text-muted-foreground">{evs.length}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </GlassCard>


      <GlassCard>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {selected ? fmt(selected) : "Selecione um dia"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              <Star className="mr-1 inline h-3 w-3 fill-amber-400 text-amber-400" />
              {markedCount} marcada(s)
              {onlyMarked && " · exibindo só marcadas"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={onlyMarked ? "default" : "outline"}
              onClick={() => setOnlyMarked((v) => !v)}
              className="h-8"
              title={onlyMarked ? "Mostrar todas" : "Retrair — só marcadas"}
            >
              {onlyMarked ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              {onlyMarked ? "Só marcadas" : "Todas"}
            </Button>
            {markedCount > 0 && (
              <Button size="sm" variant="ghost" onClick={clearMarks} className="h-8" title="Limpar marcações">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {!selected ? (
          <p className="text-sm text-muted-foreground">Clique num dia para ver as tarefas.</p>
        ) : daySelected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {onlyMarked ? "Nenhuma tarefa marcada neste dia." : "Nenhuma tarefa neste dia."}
          </p>
        ) : (
          <ul className="space-y-2">
            {daySelected.map((it) => {
              const isMarked = marked.has(it.id);
              return (
                <li
                  key={it.id}
                  className={cn(
                    "rounded-lg border p-3 transition",
                    isMarked
                      ? "border-amber-400/50 bg-amber-400/5 shadow-[0_0_0_1px_rgba(251,191,36,0.15)_inset]"
                      : "border-border/50 bg-card/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{it.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {it.empresa || "—"} · {PERIODICIDADE_LABEL[it.periodicidade]}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleMark(it.id)}
                        title={isMarked ? "Desmarcar" : "Marcar"}
                        className={cn(
                          "grid h-7 w-7 place-items-center rounded-md border transition",
                          isMarked
                            ? "border-amber-400/60 bg-amber-400/15 text-amber-400"
                            : "border-border/60 text-muted-foreground hover:border-amber-400/50 hover:text-amber-400",
                        )}
                      >
                        <Star className={cn("h-3.5 w-3.5", isMarked && "fill-amber-400")} />
                      </button>
                      <StatusBadge status={statusOf(it)} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="secondary" onClick={() => onComplete(it)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Concluir
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onOpenItem(it)}>
                      <Paperclip className="mr-1 h-3.5 w-3.5" /> Certificados
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function order(s: LegalStatus): number {
  return s === "vencido" ? 4 : s === "proximo" ? 3 : s === "sem_agenda" ? 2 : s === "em_dia" ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/*  Formulário criar/editar                                                   */
/* -------------------------------------------------------------------------- */

function LegalItemForm({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: LegalItem | null;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [predio, setPredio] = useState("");
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("anual");
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [ultimaExecucao, setUltimaExecucao] = useState<string>("");
  const [agendamento, setAgendamento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (editing) {
      setTitulo(editing.titulo);
      setEmpresa(editing.empresa);
      setPredio(editing.predio);
      setPeriodicidade(editing.periodicidade);
      setDataInicio(editing.proximaExecucao || todayISO());
      setUltimaExecucao(editing.ultimaExecucao ?? "");
      setAgendamento(editing.agendamento ?? "");
      setObservacoes(editing.observacoes);
    } else {
      setTitulo("");
      setEmpresa("");
      setPredio("");
      setPeriodicidade("anual");
      setDataInicio(todayISO());
      setUltimaExecucao("");
      setAgendamento("");
      setObservacoes("");
    }
  }, [editing, open]);

  // Se última execução mudar e não houver próxima definida manualmente, sugerir próxima automática.
  const autoNext = useMemo(() => {
    if (!ultimaExecucao) return "";
    return addMonths(ultimaExecucao, monthsFor(periodicidade));
  }, [ultimaExecucao, periodicidade]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error("Informe o nome da tarefa.");
      return;
    }
    setSaving(true);
    try {
      const proxima = dataInicio || autoNext || addMonths(todayISO(), monthsFor(periodicidade));
      if (editing) {
        await updateLegalItem(editing.id, {
          titulo: titulo.trim(),
          empresa: empresa.trim(),
          predio: predio.trim(),
          periodicidade,
          ultimaExecucao: ultimaExecucao || null,
          proximaExecucao: proxima,
          agendamento: agendamento || null,
          observacoes,
        });
        toast.success("Item atualizado. Próxima execução agendada.");
      } else {
        await createLegalItem({
          titulo: titulo.trim(),
          empresa: empresa.trim(),
          predio: predio.trim(),
          descricao: "",
          observacoes,
          periodicidade,
          ultimaExecucao: ultimaExecucao || null,
          proximaExecucao: proxima,
          agendamento: agendamento || null,
          responsavel: "",
          concluido: false,
        });
        toast.success("Item criado e agendado.");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar item legal" : "Novo item legal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Tarefa</Label>
            <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Caixa d'água A160" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="empresa">Empresa</Label>
              <Input id="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ex.: Real Hidrojato" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="predio">Prédio</Label>
              <Input id="predio" value={predio} onChange={(e) => setPredio(e.target.value)} placeholder="Ex.: Torre A / Bloco 2" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Periodicidade</Label>
              <Select value={periodicidade} onValueChange={(v) => setPeriodicidade(v as Periodicidade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODICIDADES.map((p) => (
                    <SelectItem key={p} value={p}>{PERIODICIDADE_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ult">Última execução</Label>
              <Input id="ult" type="date" value={ultimaExecucao} onChange={(e) => setUltimaExecucao(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ini">Próxima execução</Label>
              <Input id="ini" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required />
              {autoNext && autoNext !== dataInicio && (
                <button
                  type="button"
                  className="text-[11px] text-primary underline underline-offset-2"
                  onClick={() => setDataInicio(autoNext)}
                >
                  Sugerir {new Date(autoNext + "T00:00:00").toLocaleDateString("pt-BR")} (base última + {PERIODICIDADE_LABEL[periodicidade].toLowerCase()})
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agenda">Agendamento (opcional)</Label>
              <Input id="agenda" type="date" value={agendamento} onChange={(e) => setAgendamento(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={5}
              className="min-h-28 whitespace-pre-wrap break-words leading-relaxed"
              placeholder="Descreva livremente — pode usar várias linhas."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
