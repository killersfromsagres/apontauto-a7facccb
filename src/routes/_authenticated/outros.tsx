import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Calendar as CalendarIcon,
  List as ListIcon,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Paperclip,
  X,
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
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/outros")({ component: Page });

type Priority = "baixa" | "media" | "alta" | "critica";

interface Reminder {
  id: string;
  titulo: string;
  categoria: string;
  data: string; // YYYY-MM-DD
  prioridade: Priority;
  observacoes: string;
  anexos: string[]; // file names only
  concluido: boolean;
  createdAt: number;
}

const STORAGE_KEY = "outros-servicos:v1";

const CATEGORIAS = [
  "Limpeza de Caixa d'Água",
  "Caixa de Gordura",
  "Limpeza Semestral",
  "Inspeção",
  "Auditoria",
  "Serviço Eventual",
];

const PRIORIDADE_META: Record<Priority, { label: string; color: string; ring: string }> = {
  baixa: { label: "Baixa", color: "bg-slate-500", ring: "ring-slate-500/30" },
  media: { label: "Média", color: "bg-blue-500", ring: "ring-blue-500/30" },
  alta: { label: "Alta", color: "bg-orange-500", ring: "ring-orange-500/30" },
  critica: { label: "Crítica", color: "bg-red-500", ring: "ring-red-500/30" },
};

function loadReminders(): Reminder[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReminders(r: Reminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function Page() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(new Date());

  useEffect(() => setReminders(loadReminders()), []);

  const persist = (next: Reminder[]) => {
    setReminders(next);
    saveReminders(next);
  };

  const upsert = (r: Reminder) => {
    const exists = reminders.some((x) => x.id === r.id);
    const next = exists ? reminders.map((x) => (x.id === r.id ? r : x)) : [...reminders, r];
    persist(next);
    toast.success(exists ? "Lembrete atualizado" : "Lembrete criado");
  };

  const remove = (id: string) => {
    persist(reminders.filter((r) => r.id !== id));
    toast.success("Lembrete removido");
  };

  const toggle = (id: string) => {
    persist(reminders.map((r) => (r.id === id ? { ...r, concluido: !r.concluido } : r)));
  };

  const sorted = useMemo(
    () =>
      [...reminders].sort((a, b) => {
        if (a.concluido !== b.concluido) return a.concluido ? 1 : -1;
        return a.data.localeCompare(b.data);
      }),
    [reminders],
  );

  const stats = useMemo(() => {
    const abertos = reminders.filter((r) => !r.concluido);
    return {
      total: reminders.length,
      abertos: abertos.length,
      vencendo: abertos.filter((r) => {
        const d = daysUntil(r.data);
        return d >= 0 && d <= 3;
      }).length,
      vencidos: abertos.filter((r) => daysUntil(r.data) < 0).length,
    };
  }, [reminders]);

  const remindersOnSelectedDay = useMemo(() => {
    if (!calendarDate) return [] as Reminder[];
    const key = calendarDate.toISOString().slice(0, 10);
    return sorted.filter((r) => r.data === key);
  }, [sorted, calendarDate]);

  const highlightedDates = useMemo(
    () => reminders.map((r) => new Date(r.data + "T00:00:00")),
    [reminders],
  );

  return (
    <PageShell
      title="Outros Serviços"
      description="Lembretes de atividades especiais: limpezas periódicas, inspeções, auditorias e serviços eventuais."
      actions={
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo lembrete
            </Button>
          </DialogTrigger>
          <ReminderForm
            initial={editing}
            onSubmit={(r) => {
              upsert(r);
              setOpen(false);
              setEditing(null);
            }}
          />
        </Dialog>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total" value={stats.total} tint="from-slate-500/20 to-slate-500/5" />
        <Kpi label="Abertos" value={stats.abertos} tint="from-blue-500/25 to-blue-500/5" />
        <Kpi
          label="Vencendo em ≤3 dias"
          value={stats.vencendo}
          tint="from-amber-500/25 to-amber-500/5"
        />
        <Kpi label="Vencidos" value={stats.vencidos} tint="from-red-500/30 to-red-500/5" />
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">
            <ListIcon className="mr-2 h-4 w-4" /> Lista
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarIcon className="mr-2 h-4 w-4" /> Calendário
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <GlassCard>
            {sorted.length === 0 ? (
              <EmptyState onCreate={() => setOpen(true)} />
            ) : (
              <ul className="divide-y divide-border/60">
                <AnimatePresence initial={false}>
                  {sorted.map((r) => (
                    <ReminderRow
                      key={r.id}
                      reminder={r}
                      onToggle={() => toggle(r.id)}
                      onEdit={() => {
                        setEditing(r);
                        setOpen(true);
                      }}
                      onRemove={() => remove(r.id)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <GlassCard>
              <Calendar
                mode="single"
                selected={calendarDate}
                onSelect={setCalendarDate}
                modifiers={{ hasReminder: highlightedDates }}
                modifiersClassNames={{
                  hasReminder:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
                }}
                className="rounded-md"
              />
            </GlassCard>
            <GlassCard>
              <h3 className="mb-3 text-sm font-semibold">
                {calendarDate?.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
              </h3>
              {remindersOnSelectedDay.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum lembrete para esta data.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {remindersOnSelectedDay.map((r) => (
                      <ReminderRow
                        key={r.id}
                        reminder={r}
                        onToggle={() => toggle(r.id)}
                        onEdit={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                        onRemove={() => remove(r.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </GlassCard>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Kpi({ label, value, tint }: { label: string; value: number; tint: string }) {
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

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-2xl bg-primary/10 p-4">
        <Plus className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">Sem lembretes ainda</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Crie um lembrete para atividades como limpeza de caixa d'água, inspeções e auditorias.
      </p>
      <Button onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" /> Criar primeiro lembrete
      </Button>
    </div>
  );
}

function ReminderRow({
  reminder: r,
  onToggle,
  onEdit,
  onRemove,
}: {
  reminder: Reminder;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const meta = PRIORIDADE_META[r.prioridade];
  const dias = daysUntil(r.data);
  const vencido = dias < 0 && !r.concluido;
  const proximo = dias >= 0 && dias <= 3 && !r.concluido;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      className={cn(
        "group flex items-start gap-3 py-3",
        r.concluido && "opacity-60",
      )}
    >
      <button
        onClick={onToggle}
        className={cn(
          "mt-1 h-5 w-5 shrink-0 rounded-full border-2 transition-colors",
          r.concluido ? "border-emerald-500 bg-emerald-500" : "border-border hover:border-primary",
        )}
        aria-label="Marcar como concluído"
      >
        {r.concluido && <CheckCircle2 className="h-4 w-4 text-white" />}
      </button>

      <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", meta.color)} />
          <p
            className={cn("font-medium leading-tight", r.concluido && "line-through")}
          >
            {r.titulo}
          </p>
          <Badge variant="outline" className="text-[10px]">
            {r.categoria}
          </Badge>
          {vencido && (
            <Badge className="bg-red-500 text-[10px] text-white">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Vencido há {Math.abs(dias)}d
            </Badge>
          )}
          {proximo && !vencido && (
            <Badge className="bg-amber-500 text-[10px] text-white">
              {dias === 0 ? "Hoje" : `Em ${dias}d`}
            </Badge>
          )}
        </div>
        {r.observacoes && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.observacoes}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
          <span>Prioridade: {meta.label}</span>
          {r.anexos.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {r.anexos.length}
            </span>
          )}
        </div>
      </div>

      <Button
        size="icon"
        variant="ghost"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100"
        aria-label="Remover"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </motion.li>
  );
}

function ReminderForm({
  initial,
  onSubmit,
}: {
  initial: Reminder | null;
  onSubmit: (r: Reminder) => void;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? CATEGORIAS[0]);
  const [data, setData] = useState(initial?.data ?? new Date().toISOString().slice(0, 10));
  const [prioridade, setPrioridade] = useState<Priority>(initial?.prioridade ?? "media");
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? "");
  const [anexos, setAnexos] = useState<string[]>(initial?.anexos ?? []);

  useEffect(() => {
    setTitulo(initial?.titulo ?? "");
    setCategoria(initial?.categoria ?? CATEGORIAS[0]);
    setData(initial?.data ?? new Date().toISOString().slice(0, 10));
    setPrioridade(initial?.prioridade ?? "media");
    setObservacoes(initial?.observacoes ?? "");
    setAnexos(initial?.anexos ?? []);
  }, [initial]);

  const submit = () => {
    if (!titulo.trim()) return toast.error("Informe um título");
    onSubmit({
      id: initial?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      categoria,
      data,
      prioridade,
      observacoes,
      anexos,
      concluido: initial?.concluido ?? false,
      createdAt: initial?.createdAt ?? Date.now(),
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar lembrete" : "Novo lembrete"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Limpeza da caixa d'água A160" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORIDADE_META) as Priority[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRIORIDADE_META[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Data</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Anexos</Label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground hover:border-primary/50">
            <Paperclip className="h-4 w-4" />
            <span>Adicionar arquivos</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).map((f) => f.name);
                setAnexos((a) => [...a, ...files]);
              }}
            />
          </label>
          {anexos.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {anexos.map((name, i) => (
                <li key={i} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs">
                  {name}
                  <button
                    onClick={() => setAnexos((a) => a.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit}>{initial ? "Salvar" : "Criar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
