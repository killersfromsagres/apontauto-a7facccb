import { useConfirm } from "@/components/ui/use-confirm";
import { lazy, Suspense, useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Copy,
  FileSpreadsheet,
  Info,
  LayoutGrid,
  Loader2,
  Plus,
  Table2,
  Trash2,
  Upload,
  MoreVertical,
  Check,
  CheckCircle2,
  GripVertical,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { listPontos, pontoLabel, type Ponto } from "@/features/water-delivery/queries/api";
import {
  atualizarProgramacao,
  atualizarProgramacaoEmLote,
  criarExcecao,
  criarFeriado,
  dataDoDia,
  duplicarDia,
  formatarData,
  hojeSP,
  inicioSemana,
  listExcecoes,
  listFeriados,
  listProgramacaoCompleta,
  removerExcecao,
  removerFeriado,
  removerProgramacao,
  salvarOrdem,
  TURNOS,
  TURNO_LABEL,
  upsertProgramacao,
  addDias,
  type ProgramacaoLinha,
} from "@/features/water-delivery/queries/programacao";
import { DIAS } from "@/features/water-delivery/importer/constants";
// Item 24 — o assistente carrega a biblioteca de planilhas; só é baixado
// quando um gestor realmente abre a tela de programação.
const ImportadorWizard = lazy(() =>
  import("@/features/water-delivery/importer/importador-wizard").then((m) => ({
    default: m.ImportadorWizard,
  })),
);

type Visao = "calendario" | "tabela" | "cards";

export function WeeklyWaterPlanner() {
  const { confirmar, dialogo } = useConfirm();
  const qc = useQueryClient();
  const gestor = useCanAccessModule("abastecimento", "update").allowed;
  const isMobile = useIsMobile();

  const [visao, setVisao] = useState<Visao>(isMobile ? "cards" : "calendario");
  const [predio, setPredio] = useState("todos");
  const [dia, setDia] = useState("todos");
  const [semana, setSemana] = useState(() => inicioSemana(hojeSP()));
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [arraste, setArraste] = useState<string | null>(null);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const prog = useQuery({
    queryKey: ["agua", "programacao", "completa"],
    queryFn: listProgramacaoCompleta,
  });
  const feriados = useQuery({ queryKey: ["agua", "feriados"], queryFn: listFeriados });
  const excecoes = useQuery({
    queryKey: ["agua", "excecoes", semana],
    queryFn: () => listExcecoes(semana, addDias(semana, 6)),
  });

  const pontoPorId = useMemo(
    () => new Map((pontos.data ?? []).map((p) => [p.id, p])),
    [pontos.data],
  );
  const predios = useMemo(
    () => [...new Set((pontos.data ?? []).map((p) => p.predio))].sort(),
    [pontos.data],
  );

  const linhas = useMemo(() => {
    return (prog.data ?? [])
      .filter((l) => {
        const p = pontoPorId.get(l.ponto_id);
        if (!p) return false;
        if (predio !== "todos" && p.predio !== predio) return false;
        if (dia !== "todos" && l.dia_semana !== Number(dia)) return false;
        return true;
      })
      .sort((a, b) => a.dia_semana - b.dia_semana || a.ordem - b.ordem);
  }, [prog.data, pontoPorId, predio, dia]);

  const porDia = useMemo(() => {
    const m = new Map<number, ProgramacaoLinha[]>();
    for (const l of linhas) m.set(l.dia_semana, [...(m.get(l.dia_semana) ?? []), l]);
    return m;
  }, [linhas]);

  const invalidar = () => qc.invalidateQueries({ queryKey: ["agua"] });

  const editar = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ProgramacaoLinha> }) =>
      atualizarProgramacao(id, patch),
    onSuccess: invalidar,
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao salvar."),
  });

  const lote = useMutation({
    mutationFn: (patch: Partial<ProgramacaoLinha>) =>
      atualizarProgramacaoEmLote(selecionados, patch),
    onSuccess: () => {
      toast.success(`${selecionados.length} parada(s) atualizada(s).`);
      setSelecionados([]);
      invalidar();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha na edição em lote."),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => removerProgramacao(id),
    onSuccess: invalidar,
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao remover."),
  });

  const reordenar = useMutation({
    mutationFn: (itens: Array<{ id: string; ordem: number }>) => salvarOrdem(itens),
    onSuccess: invalidar,
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao reordenar."),
  });

  function mover(diaSemana: number, id: string, delta: number) {
    const lista = [...(porDia.get(diaSemana) ?? [])];
    const i = lista.findIndex((l) => l.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    reordenar.mutate(lista.map((l, idx) => ({ id: l.id, ordem: idx + 1 })));
  }

  function soltarSobre(diaSemana: number, alvoId: string) {
    if (!arraste || arraste === alvoId) return;
    const lista = [...(porDia.get(diaSemana) ?? [])];
    const from = lista.findIndex((l) => l.id === arraste);
    const to = lista.findIndex((l) => l.id === alvoId);
    if (from < 0 || to < 0) return;
    const [item] = lista.splice(from, 1);
    lista.splice(to, 0, item);
    setArraste(null);
    reordenar.mutate(lista.map((l, idx) => ({ id: l.id, ordem: idx + 1 })));
  }

  const feriadosDaSemana = useMemo(() => {
    const set = new Map<string, string>();
    for (const f of feriados.data ?? []) set.set(f.data, f.descricao);
    return set;
  }, [feriados.data]);

  return (
    <div className="space-y-4">
      {dialogo}
      {/* Filtros e visões */}
      <GlassCard className="space-y-3 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label>Prédio</Label>
            <Select value={predio} onValueChange={setPredio}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os prédios</SelectItem>
                {predios.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Dia da semana</Label>
            <Select value={dia} onValueChange={setDia}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os dias</SelectItem>
                {DIAS.map((d) => (
                  <SelectItem key={d.dia} value={String(d.dia)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Visão</Label>
            <div className="flex gap-1 rounded-xl border border-border/60 bg-card/40 p-1">
              {(
                [
                  ["calendario", CalendarDays],
                  ["tabela", Table2],
                  ["cards", LayoutGrid],
                ] as const
              ).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVisao(key)}
                  aria-label={key}
                  className={cn(
                    "flex h-9 min-w-[44px] flex-1 items-center justify-center rounded-lg text-xs capitalize transition-colors",
                    visao === key
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSemana(addDias(semana, -7))}>
            ← Semana anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {formatarData(semana)} — {formatarData(addDias(semana, 6))}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSemana(addDias(semana, 7))}>
            Próxima semana →
          </Button>
          {gestor && <DuplicarSemanaDialog onDone={invalidar} />}
          {gestor && <NovaParadaDialog pontos={pontos.data ?? []} onDone={invalidar} />}
        </div>
      </GlassCard>

      {/* Edição em lote */}
      {gestor && selecionados.length > 0 && (
        <GlassCard className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-medium">{selecionados.length} selecionada(s)</span>
          <Select onValueChange={(v) => lote.mutate({ turno: v })}>
            <SelectTrigger className="h-10 w-[150px]">
              <SelectValue placeholder="Definir turno" />
            </SelectTrigger>
            <SelectContent>
              {TURNOS.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => lote.mutate({ dia_semana: Number(v) })}>
            <SelectTrigger className="h-10 w-[150px]">
              <SelectValue placeholder="Mover para dia" />
            </SelectTrigger>
            <SelectContent>
              {DIAS.map((d) => (
                <SelectItem key={d.dia} value={String(d.dia)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            placeholder="Bags"
            className="h-10 w-24"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(v)) lote.mutate({ bags: v });
              }
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => setSelecionados([])}>
            Limpar seleção
          </Button>
        </GlassCard>
      )}

      {/* Conteúdo */}
      {linhas.length === 0 ? (
        <EmptyState
          title="Nenhuma parada programada"
          description="Importe a planilha, ajuste os filtros ou adicione paradas manualmente."
        />
      ) : visao === "tabela" ? (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border/50">
                <th className="w-10 p-3" />
                <th className="p-3">Ponto</th>
                <th className="p-3">Dia</th>
                <th className="p-3">Turno</th>
                <th className="p-3">Bags</th>
                <th className="p-3">Ordem</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const p = pontoPorId.get(l.ponto_id);
                return (
                  <tr key={l.id} className="border-b border-border/30">
                    <td className="p-3">
                      <Checkbox
                        checked={selecionados.includes(l.id)}
                        onCheckedChange={(c) =>
                          setSelecionados((s) => (c ? [...s, l.id] : s.filter((x) => x !== l.id)))
                        }
                        disabled={!gestor}
                      />
                    </td>
                    <td className="p-3">{p ? pontoLabel(p) : "—"}</td>
                    <td className="p-3">{DIAS.find((d) => d.dia === l.dia_semana)?.label}</td>
                    <td className="p-3">{TURNO_LABEL[l.turno] ?? l.turno}</td>
                    <td className="p-3">
                      <Input
                        type="number"
                        min={0}
                        defaultValue={l.bags}
                        disabled={!gestor}
                        className="h-9 w-20"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== l.bags)
                            editar.mutate({ id: l.id, patch: { bags: v } });
                        }}
                      />
                    </td>
                    <td className="p-3 text-muted-foreground">{l.ordem}</td>
                    <td className="p-3 text-right">
                      {gestor && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => excluir.mutate(l.id)}
                          aria-label="Remover parada"
                        >
                          <Trash2 className="h-4 w-4 text-rose-300" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GlassCard>
      ) : (
        <div
          className={cn(
            "grid gap-3",
            visao === "calendario" ? "lg:grid-cols-7 sm:grid-cols-2" : "sm:grid-cols-2",
          )}
        >
          {DIAS.filter((d) => dia === "todos" || Number(dia) === d.dia).map((d) => {
            const lista = porDia.get(d.dia) ?? [];
            const dataDia = dataDoDia(semana, d.dia);
            const feriado = feriadosDaSemana.get(dataDia);
            return (
              <GlassCard key={d.dia} className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{d.label}</p>
                    <p className="text-[11px] text-muted-foreground">{formatarData(dataDia)}</p>
                  </div>
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px]">
                    {lista.length}
                  </span>
                </div>
                {feriado && (
                  <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
                    {feriado} — sem geração
                  </p>
                )}
                {lista.map((l, idx) => {
                  const p = pontoPorId.get(l.ponto_id);
                  const excecao = (excecoes.data ?? []).find(
                    (e) => e.ponto_id === l.ponto_id && e.data === dataDia,
                  );
                  return (
                    <div
                      key={l.id}
                      draggable={gestor && !isMobile}
                      onDragStart={() => setArraste(l.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => soltarSobre(d.dia, l.id)}
                      className={cn(
                        "rounded-xl border border-border/50 bg-card/40 p-2 text-xs",
                        excecao?.tipo === "remover" && "opacity-50 line-through",
                        arraste === l.id && "ring-1 ring-primary/60",
                      )}
                    >
                      <p className="truncate font-medium">{p ? pontoLabel(p) : "Ponto removido"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {l.bags} bag(s) · {TURNO_LABEL[l.turno] ?? l.turno}
                      </p>
                      {gestor && (
                        <div className="mt-1 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Subir"
                              disabled={idx === 0}
                              onClick={() => mover(d.dia, l.id, -1)}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Descer"
                              disabled={idx === lista.length - 1}
                              onClick={() => mover(d.dia, l.id, 1)}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-1">
                            <ExcecaoDialog
                              pontoId={l.ponto_id}
                              data={dataDia}
                              rotulo={p ? pontoLabel(p) : ""}
                              onDone={invalidar}
                            />

                            <Drawer>
                              <DrawerTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Mais opções"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DrawerTrigger>
                              <DrawerContent>
                                <DrawerHeader>
                                  <DrawerTitle>Opções da Parada</DrawerTitle>
                                </DrawerHeader>
                                <div className="p-4 space-y-3 pb-8">
                                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                      <Info className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold truncate">
                                        {p ? pontoLabel(p) : "—"}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {l.bags} bag(s) · {TURNO_LABEL[l.turno]}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      variant="outline"
                                      className="h-12 flex flex-col gap-0.5"
                                      onClick={() => mover(d.dia, l.id, -1)}
                                      disabled={idx === 0}
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                      <span className="text-[10px] uppercase font-bold">Subir</span>
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="h-12 flex flex-col gap-0.5"
                                      onClick={() => mover(d.dia, l.id, 1)}
                                      disabled={idx === lista.length - 1}
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                      <span className="text-[10px] uppercase font-bold">
                                        Descer
                                      </span>
                                    </Button>
                                  </div>

                                  <div className="space-y-2 pt-2">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">
                                      Mover para outro dia
                                    </p>
                                    <div className="grid grid-cols-4 gap-2">
                                      {DIAS.map((diaOption) => (
                                        <Button
                                          key={diaOption.dia}
                                          variant={
                                            l.dia_semana === diaOption.dia ? "default" : "secondary"
                                          }
                                          className="h-10 text-xs"
                                          onClick={() => {
                                            editar.mutate({
                                              id: l.id,
                                              patch: { dia_semana: diaOption.dia },
                                            });
                                          }}
                                        >
                                          {diaOption.label.slice(0, 3)}
                                        </Button>
                                      ))}
                                    </div>
                                  </div>

                                  <Button
                                    variant="destructive"
                                    className="w-full h-12 mt-4"
                                    onClick={async () => {
                                      const ok = await confirmar({
                                        titulo: "Remover parada",
                                        descricao: "Remover esta parada da programação?",
                                        confirmar: "Remover",
                                        destrutivo: true,
                                      });
                                      if (ok) excluir.mutate(l.id);
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Remover Parada
                                  </Button>
                                </div>
                              </DrawerContent>
                            </Drawer>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Exceções da semana */}
      {gestor && (excecoes.data ?? []).length > 0 && (
        <GlassCard className="space-y-2 p-3">
          <h2 className="text-sm font-semibold">Exceções desta semana</h2>
          {(excecoes.data ?? []).map((e) => {
            const p = pontoPorId.get(e.ponto_id);
            return (
              <div
                key={e.id}
                className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/40 p-2 text-xs"
              >
                <span className="flex-1 truncate">
                  {formatarData(e.data)} · {p ? pontoLabel(p) : "—"} ·{" "}
                  {e.tipo === "remover" ? "parada retirada" : `parada extra (${e.bags} bag)`}
                  {e.motivo ? ` — ${e.motivo}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Excluir exceção"
                  onClick={async () => {
                    await removerExcecao(e.id);
                    invalidar();
                  }}
                >
                  <Trash2 className="h-4 w-4 text-rose-300" />
                </Button>
              </div>
            );
          })}
        </GlassCard>
      )}

      {/* Feriados e bloqueios */}
      {gestor && <FeriadosCard onDone={invalidar} feriados={feriados.data ?? []} />}

      {/* Importação (item 19 — assistente em etapas) */}
      {gestor && (
        <Suspense fallback={<Skeleton className="h-24 w-full rounded-2xl" />}>
          <ImportadorWizard onDone={invalidar} />
        </Suspense>
      )}
    </div>
  );
}

function DuplicarSemanaDialog({ onDone }: { onDone: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [origem, setOrigem] = useState("1");
  const [destino, setDestino] = useState("2");
  const [salvando, setSalvando] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Copy className="mr-2 h-4 w-4" />
          Duplicar dia/template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar programação</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>De</Label>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIAS.map((d) => (
                  <SelectItem key={d.dia} value={String(d.dia)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Para</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIAS.map((d) => (
                  <SelectItem key={d.dia} value={String(d.dia)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Paradas já existentes no dia de destino são preservadas — nada é sobrescrito.
        </p>
        <DialogFooter>
          <Button
            loading={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                const n = await duplicarDia(Number(origem), Number(destino));
                toast.success(`${n} parada(s) duplicada(s).`);
                setAberto(false);
                onDone();
              } catch (e) {
                toast.error((e as Error)?.message ?? "Falha ao duplicar.");
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovaParadaDialog({ pontos, onDone }: { pontos: Ponto[]; onDone: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [pontoId, setPontoId] = useState("");
  const [dia, setDia] = useState("1");
  const [turno, setTurno] = useState("manha");
  const [bags, setBags] = useState("1");
  const [salvando, setSalvando] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Nova parada
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar parada à programação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Ponto</Label>
            <Select value={pontoId} onValueChange={setPontoId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecione o ponto" />
              </SelectTrigger>
              <SelectContent>
                {pontos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {pontoLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Dia</Label>
              <Select value={dia} onValueChange={setDia}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIAS.map((d) => (
                    <SelectItem key={d.dia} value={String(d.dia)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Turno</Label>
              <Select value={turno} onValueChange={setTurno}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TURNOS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Bags</Label>
              <Input
                type="number"
                min={0}
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!pontoId || salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                await upsertProgramacao([
                  {
                    ponto_id: pontoId,
                    dia_semana: Number(dia),
                    turno,
                    bags: Number(bags) || 0,
                    ordem: 999,
                    ativo: true,
                  },
                ]);
                toast.success("Parada adicionada.");
                setAberto(false);
                onDone();
              } catch (e) {
                toast.error((e as Error)?.message ?? "Falha ao adicionar.");
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcecaoDialog({
  pontoId,
  data,
  rotulo,
  onDone,
}: {
  pontoId: string;
  data: string;
  rotulo: string;
  onDone: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"remover" | "extra">("remover");
  const [motivo, setMotivo] = useState("");
  const [bags, setBags] = useState("1");

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Exceção nesta data">
          <CalendarDays className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exceção em {formatarData(data)}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <div className="space-y-3">
          <Select value={tipo} onValueChange={(v) => setTipo(v as "remover" | "extra")}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remover">Retirar a parada só nesta data</SelectItem>
              <SelectItem value="extra">Inserir parada excepcional</SelectItem>
            </SelectContent>
          </Select>
          {tipo === "extra" && (
            <div className="space-y-1">
              <Label>Bags</Label>
              <Input
                type="number"
                min={0}
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                className="h-11"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              try {
                await criarExcecao({
                  ponto_id: pontoId,
                  data,
                  tipo,
                  bags: Number(bags) || 0,
                  turno: "manha",
                  motivo,
                });
                toast.success("Exceção registrada.");
                setAberto(false);
                onDone();
              } catch (e) {
                toast.error((e as Error)?.message ?? "Falha ao registrar exceção.");
              }
            }}
          >
            Salvar exceção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeriadosCard({
  feriados,
  onDone,
}: {
  feriados: Array<{ id: string; data: string; descricao: string; tipo: string }>;
  onDone: () => void;
}) {
  const [data, setData] = useState(hojeSP());
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<"feriado" | "bloqueio">("feriado");

  return (
    <GlassCard className="space-y-3 p-3 sm:p-4">
      <h2 className="text-sm font-semibold">Feriados e bloqueios temporários</h2>
      <div className="grid gap-2 sm:grid-cols-[150px_1fr_150px_auto]">
        <Input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="h-11"
        />
        <Input
          placeholder="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="h-11"
        />
        <Select value={tipo} onValueChange={(v) => setTipo(v as "feriado" | "bloqueio")}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="feriado">Feriado</SelectItem>
            <SelectItem value="bloqueio">Bloqueio temporário</SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="h-11"
          disabled={!descricao.trim()}
          onClick={async () => {
            try {
              await criarFeriado({ data, descricao, tipo, bloqueia_geracao: true });
              setDescricao("");
              toast.success("Data registrada.");
              onDone();
            } catch (e) {
              toast.error((e as Error)?.message ?? "Falha ao registrar.");
            }
          }}
        >
          Adicionar
        </Button>
      </div>
      <div className="space-y-1">
        {feriados.slice(0, 12).map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/40 p-2 text-xs"
          >
            <span className="flex-1 truncate">
              {formatarData(f.data)} · {f.descricao} · {f.tipo}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Remover data"
              onClick={async () => {
                await removerFeriado(f.id);
                onDone();
              }}
            >
              <Trash2 className="h-4 w-4 text-rose-300" />
            </Button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
