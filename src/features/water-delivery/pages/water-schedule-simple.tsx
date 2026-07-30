// Programação de Água — execução de campo simples (inspirada em Refrigeração Campo).
// Um dia, uma lista de pontos, foto obrigatória como prova do abastecimento.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  ImageOff,
  Loader2,
  Minus,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import bagThumb from "@/assets/bag-agua-12l.png";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { listVehicles, vehicleLabel } from "@/lib/frota/api";
import {
  COLABORADORES,
  DIAS,
  STATUS_LABEL,
  carregarEquipe,
  diaDaSemana,
  formatarData,
  hojeISO,
  listEntregasDoDia,
  listPontos,
  localDoPonto,
  registrarEntrega,
  salvarEquipe,
  type Entrega,
  type EntregaStatus,
  type PontoProg,
} from "@/features/water-delivery/simple/api";

function addDias(dataISO: string, n: number): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function WaterScheduleSimple() {
  const qc = useQueryClient();
  const [data, setData] = useState(hojeISO);
  const [busca, setBusca] = useState("");
  const [pontoAberto, setPontoAberto] = useState<PontoProg | null>(null);
  const [colaboradores, setColaboradores] = useState<string[]>([]);
  const [veiculo, setVeiculo] = useState<string | null>(null);

  useEffect(() => {
    const e = carregarEquipe();
    setColaboradores(e.colaboradores);
    setVeiculo(e.veiculo);
  }, []);

  const atualizarEquipe = (cols: string[], v: string | null) => {
    setColaboradores(cols);
    setVeiculo(v);
    salvarEquipe({ colaboradores: cols, veiculo: v });
  };

  const dia = diaDaSemana(data);

  const pontosQ = useQuery({ queryKey: ["agua-prog", "pontos"], queryFn: listPontos });
  const entregasQ = useQuery({
    queryKey: ["agua-prog", "entregas", data],
    queryFn: () => listEntregasDoDia(data),
  });
  const veiculosQ = useQuery({ queryKey: ["frota", "veiculos"], queryFn: listVehicles });

  const entregaPorPonto = useMemo(() => {
    const map = new Map<string, Entrega>();
    (entregasQ.data ?? []).forEach((e) => map.set(e.ponto_id, e));
    return map;
  }, [entregasQ.data]);

  const pontosDoDia = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (pontosQ.data ?? [])
      .filter((p) => p.dias.includes(dia))
      .filter((p) => !q || localDoPonto(p).toLowerCase().includes(q));
  }, [pontosQ.data, dia, busca]);

  const feitos = pontosDoDia.filter((p) => entregaPorPonto.has(p.id)).length;
  const total = pontosDoDia.length;
  const progresso = total ? Math.round((feitos / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Cabeçalho do dia */}
      <GlassCard variant="block" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-11 w-11 rounded-xl"
              aria-label="Dia anterior"
              onClick={() => setData(addDias(data, -1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-11 w-11 rounded-xl"
              aria-label="Próximo dia"
              onClick={() => setData(addDias(data, 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {DIAS.find((d) => d.n === dia)?.label}
            </p>
            <p className="text-lg font-semibold tabular-nums">{formatarData(data)}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Entregues</p>
              <p className="text-lg font-semibold tabular-nums">
                {feitos}
                <span className="text-muted-foreground">/{total}</span>
              </p>
            </div>
            <Button
              variant={data === hojeISO() ? "secondary" : "outline"}
              className="h-11 rounded-xl"
              onClick={() => setData(hojeISO())}
            >
              Hoje
            </Button>
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 transition-all duration-500"
            style={{ width: `${progresso}%` }}
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {DIAS.map((d) => {
            const alvo = addDias(data, d.n - dia);
            const ativo = d.n === dia;
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => setData(alvo)}
                className={cn(
                  "min-h-[40px] shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                  ativo
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Quem está entregando + carro */}
      <GlassCard className="p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Quem está entregando
            </Label>
            <div className="flex flex-wrap gap-2">
              {COLABORADORES.map((nome) => {
                const ativo = colaboradores.includes(nome);
                return (
                  <button
                    key={nome}
                    type="button"
                    onClick={() =>
                      atualizarEquipe(
                        ativo
                          ? colaboradores.filter((c) => c !== nome)
                          : [...colaboradores, nome],
                        veiculo,
                      )
                    }
                    className={cn(
                      "flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-all active:scale-[0.98]",
                      ativo
                        ? "border-sky-400/60 bg-sky-500/15 text-sky-600 dark:text-sky-300"
                        : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                        ativo ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {iniciais(nome)}
                    </span>
                    {nome}
                    {ativo && <CheckCircle2 className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Car className="h-3.5 w-3.5" /> Carro utilizado
            </Label>
            <Select
              value={veiculo ?? ""}
              onValueChange={(v) => atualizarEquipe(colaboradores, v || null)}
            >
              <SelectTrigger className="h-11 rounded-xl text-base">
                <SelectValue placeholder="Selecione o carro" />
              </SelectTrigger>
              <SelectContent>
                {(veiculosQ.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.prefix || v.plate || v.id}>
                    {[v.prefix, v.plate].filter(Boolean).join(" · ")} — {vehicleLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      {/* Lista de pontos do dia */}
      <GlassCard className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar prédio, andar ou espaço…"
            className="h-11 rounded-xl text-base"
          />
        </div>

        {pontosQ.isLoading || entregasQ.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Carregando programação…
          </div>
        ) : pontosDoDia.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum ponto programado para este dia.
          </div>
        ) : (
          <ul className="space-y-2">
            {pontosDoDia.map((p) => {
              const e = entregaPorPonto.get(p.id);
              const fotos = e?.fotos?.length ?? 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPontoAberto(p)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.995]",
                      e
                        ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15"
                        : "border-border/60 bg-card/40 hover:border-primary/40 hover:bg-accent/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                        e
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                          : "bg-sky-500/15 text-sky-600 dark:text-sky-300",
                      )}
                    >
                      {e ? <CheckCircle2 className="h-5 w-5" /> : <Droplets className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.predio}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {p.andar ?? "—"}
                        </Badge>
                        {e && (
                          <Badge className="border border-emerald-500/40 bg-emerald-500/20 text-[10px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
                            {STATUS_LABEL[e.status]}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {p.espaco ?? "—"}
                      </span>
                      {e && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground/80">
                          {e.colaboradores.join(" e ") || "sem colaborador"}
                          {e.veiculo ? ` · ${e.veiculo}` : ""} · {e.bags} bag(s)
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium",
                        fotos > 0
                          ? "bg-sky-500/15 text-sky-600 dark:text-sky-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {fotos > 0 ? <Camera className="h-3.5 w-3.5" /> : <ImageOff className="h-3.5 w-3.5" />}
                      {fotos}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      {pontoAberto && (
        <EntregaSheet
          ponto={pontoAberto}
          data={data}
          entrega={entregaPorPonto.get(pontoAberto.id) ?? null}
          colaboradores={colaboradores}
          veiculo={veiculo}
          veiculos={(veiculosQ.data ?? []).map((v) =>
            [v.prefix, v.plate].filter(Boolean).join(" · ") || vehicleLabel(v),
          )}
          onEquipeChange={atualizarEquipe}
          onClose={() => setPontoAberto(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["agua-prog"] });
            setPontoAberto(null);
          }}
        />
      )}

    </div>
  );
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ""}${partes[partes.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function EntregaSheet({
  ponto,
  data,
  entrega,
  colaboradores,
  veiculo,
  veiculos,
  onEquipeChange,
  onClose,
  onSaved,
}: {
  ponto: PontoProg;
  data: string;
  entrega: Entrega | null;
  colaboradores: string[];
  veiculo: string | null;
  veiculos: string[];
  onEquipeChange: (cols: string[], veiculo: string | null) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [bags, setBags] = useState<number>(() =>
    Math.max(1, Math.round(entrega?.bags ?? ponto.bags ?? 1)),
  );
  const [status, setStatus] = useState<EntregaStatus>(entrega?.status ?? "concluida");
  const [observacao, setObservacao] = useState(entrega?.observacao ?? "");
  const [novas, setNovas] = useState<{ id: string; blob: Blob; url: string }[]>([]);


  useEffect(() => () => novas.forEach((n) => URL.revokeObjectURL(n.url)), [novas]);

  const jaTemFoto = (entrega?.fotos?.length ?? 0) + novas.length > 0;
  const exigeFoto = status === "concluida";

  const salvar = useMutation({
    mutationFn: () =>
      registrarEntrega({
        pontoId: ponto.id,
        data,
        colaboradores,
        veiculo,
        bags,
        observacao: observacao.trim() || null,
        status,
        fotos: novas.map((n) => n.blob),
      }),
    onSuccess: () => {
      toast.success("Entrega registrada.");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível registrar."),
  });

  const podeSalvar =
    colaboradores.length > 0 && (!exigeFoto || jaTemFoto) && !salvar.isPending;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-sky-500" />
            {ponto.predio} · {ponto.espaco ?? "—"}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {[ponto.andar, ponto.periodo].filter(Boolean).join(" · ")} — {formatarData(data)}
          </p>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
              Situação
            </Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_LABEL) as EntregaStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "min-h-[44px] rounded-xl border px-4 text-sm font-medium transition-all active:scale-[0.98]",
                    status === s
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
              Bags entregues — unidades inteiras
            </Label>
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="outline"
                className="h-12 w-12 rounded-xl"
                aria-label="Diminuir uma bag"
                disabled={bags <= 1}
                onClick={() => setBags((b) => Math.max(1, Math.round(b) - 1))}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <span className="min-w-[64px] text-center text-2xl font-semibold tabular-nums">
                {bags}
              </span>
              <Button
                size="icon"
                variant="outline"
                className="h-12 w-12 rounded-xl"
                aria-label="Aumentar uma bag"
                onClick={() => setBags((b) => Math.round(b) + 1)}
              >
                <Plus className="h-5 w-5" />
              </Button>
              <img
                src={bagThumb}
                alt="Bag de água mineral de 12 litros"
                loading="lazy"
                className="h-12 w-auto drop-shadow-sm"
              />
              <span className="text-sm text-muted-foreground">bag(s) de 12 L</span>
            </div>
          </div>


          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
              Fotos do abastecimento {exigeFoto && <span className="text-destructive">*</span>}
            </Label>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(ev) => {
                const files = Array.from(ev.target.files ?? []);
                setNovas((n) => [
                  ...n,
                  ...files.map((f) => ({
                    id: `${Date.now()}-${f.name}`,
                    blob: f,
                    url: URL.createObjectURL(f),
                  })),
                ]);
                ev.target.value = "";
              }}
            />
            <Button
              variant="outline"
              className="h-12 w-full rounded-xl"
              onClick={() => inputRef.current?.click()}
            >
              <Camera className="mr-2 h-5 w-5" /> Tirar / anexar foto
            </Button>

            {(entrega?.fotos?.length || novas.length) > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {entrega?.fotos?.map((f) => (
                  <a
                    key={f.id}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square overflow-hidden rounded-xl border border-border/60"
                  >
                    <img
                      src={f.url}
                      alt="Evidência da entrega de água"
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
                {novas.map((n) => (
                  <div
                    key={n.id}
                    className="relative aspect-square overflow-hidden rounded-xl border border-primary/40"
                  >
                    <img src={n.url} alt="Nova evidência" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remover foto"
                      onClick={() => setNovas((list) => list.filter((x) => x.id !== n.id))}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {exigeFoto && !jaTemFoto && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                É preciso ao menos uma foto para comprovar o abastecimento.
              </p>
            )}
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
              Observação
            </Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional — algo que o gestor precise saber"
              className="min-h-[80px] rounded-xl text-base"
            />
          </div>

          <div className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-3">
            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Quem entregou
                {colaboradores.length > 0 && (
                  <span className="ml-auto normal-case tracking-normal">
                    {colaboradores.length} colaborador{colaboradores.length > 1 ? "es" : ""}
                  </span>
                )}
              </Label>
              <div className="grid gap-2">
                {COLABORADORES.map((nome) => {
                  const ativo = colaboradores.includes(nome);
                  return (
                    <button
                      key={nome}
                      type="button"
                      onClick={() =>
                        onEquipeChange(
                          ativo
                            ? colaboradores.filter((c) => c !== nome)
                            : [...colaboradores, nome],
                          veiculo,
                        )
                      }
                      className={cn(
                        "flex min-h-[48px] w-full items-center gap-2 rounded-xl border px-3 text-left text-sm font-medium transition-all active:scale-[0.99]",
                        ativo
                          ? "border-sky-400/60 bg-sky-500/15 text-sky-600 dark:text-sky-300"
                          : "border-border/60 bg-card/40 text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                          ativo ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {iniciais(nome)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{nome}</span>
                      {ativo && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Car className="h-3.5 w-3.5" /> Carro utilizado
              </Label>
              <Select
                value={veiculo ?? ""}
                onValueChange={(v) => onEquipeChange(colaboradores, v || null)}
              >
                <SelectTrigger className="h-12 rounded-xl text-base">
                  <SelectValue placeholder="Selecione o carro" />
                </SelectTrigger>
                <SelectContent>
                  {veiculos.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>

        <div className="sticky bottom-0 -mx-6 flex gap-2 border-t border-border/60 bg-background/90 px-6 py-3 backdrop-blur">
          <Button variant="outline" className="h-12 flex-1 rounded-xl" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="h-12 flex-[2] rounded-xl"
            disabled={!podeSalvar}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-5 w-5" />
            )}
            {entrega ? "Atualizar entrega" : "Confirmar entrega"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

