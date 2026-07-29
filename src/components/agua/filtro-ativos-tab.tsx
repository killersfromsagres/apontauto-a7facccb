import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2, Plus, Wrench } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
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
import { EmptyState, KpiCard } from "@/components/pcm";
import { cn } from "@/lib/utils";
import { listPontos, pontoLabel, type Ponto } from "@/lib/agua/api";
import {
  TIPOS_FILTRO,
  ativosParaPreventiva,
  diasParaTroca,
  listFiltroAtivos,
  salvarFiltroAtivo,
  type FiltroAtivo,
} from "@/lib/agua/filtros";

interface Props {
  podeEscrever: boolean;
  onGerarPreventivas: (ativos: FiltroAtivo[]) => void;
  gerando: boolean;
}

const VAZIO = {
  ponto_id: "",
  tipo_filtro: TIPOS_FILTRO[0] as string,
  codigo: "",
  marca: "",
  modelo: "",
  numero_serie: "",
  local_instalacao: "",
  instalado_em: "",
  ultima_troca: "",
  periodicidade_dias: 180,
  situacao: "ativo" as FiltroAtivo["situacao"],
  observacao: "",
};

export function FiltroAtivosTab({ podeEscrever, onGerarPreventivas, gerando }: Props) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ ...VAZIO, id: "" });
  const [busca, setBusca] = useState("");

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const ativos = useQuery({ queryKey: ["agua", "filtro-ativos"], queryFn: listFiltroAtivos });

  const porPonto = useMemo(
    () => new Map((pontos.data ?? []).map((p: Ponto) => [p.id, p])),
    [pontos.data],
  );

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = ativos.data ?? [];
    if (!termo) return base;
    return base.filter((a) => {
      const ponto = porPonto.get(a.ponto_id);
      return [a.codigo, a.marca, a.modelo, a.numero_serie, ponto ? pontoLabel(ponto) : ""]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [ativos.data, busca, porPonto]);

  const vencendo = useMemo(() => ativosParaPreventiva(ativos.data ?? [], 30), [ativos.data]);
  const vencidos = vencendo.filter((a) => a.dias <= 0).length;

  const salvar = useMutation({
    mutationFn: () =>
      salvarFiltroAtivo({
        ...form,
        id: form.id || undefined,
        periodicidade_dias: Number(form.periodicidade_dias),
      } as Partial<FiltroAtivo> & { id?: string }),
    onSuccess: () => {
      toast.success("Ativo salvo.");
      setAberto(false);
      setForm({ ...VAZIO, id: "" });
      void qc.invalidateQueries({ queryKey: ["agua", "filtro-ativos"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao salvar."),
  });

  function editar(a: FiltroAtivo) {
    setForm({
      id: a.id,
      ponto_id: a.ponto_id,
      tipo_filtro: a.tipo_filtro,
      codigo: a.codigo ?? "",
      marca: a.marca ?? "",
      modelo: a.modelo ?? "",
      numero_serie: a.numero_serie ?? "",
      local_instalacao: a.local_instalacao ?? "",
      instalado_em: a.instalado_em ?? "",
      ultima_troca: a.ultima_troca ?? "",
      periodicidade_dias: a.periodicidade_dias,
      situacao: a.situacao,
      observacao: a.observacao ?? "",
    });
    setAberto(true);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Ativos cadastrados"
          value={(ativos.data ?? []).length}
          icon={<Wrench className="h-4 w-4" />}
        />
        <KpiCard
          label="Troca em 30 dias"
          value={vencendo.length}
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <KpiCard label="Trocas vencidas" value={vencidos} icon={<CalendarClock className="h-4 w-4" />} />
        <KpiCard
          label="Periodicidade média"
          value={
            (ativos.data ?? []).length
              ? `${Math.round(
                  (ativos.data ?? []).reduce((s, a) => s + a.periodicidade_dias, 0) /
                    (ativos.data ?? []).length,
                )}d`
              : "—"
          }
          icon={<CalendarClock className="h-4 w-4" />}
        />
      </div>

      <GlassCard className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Input
          placeholder="Buscar por ponto, marca, modelo ou série…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="sm:max-w-sm"
        />
        {podeEscrever && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button
              variant="secondary"
              className="min-h-[44px]"
              disabled={gerando || vencendo.length === 0}
              onClick={() => onGerarPreventivas(ativos.data ?? [])}
            >
              {gerando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="mr-2 h-4 w-4" />
              )}
              Gerar preventivas ({vencendo.length})
            </Button>
            <Button
              className="min-h-[44px]"
              onClick={() => {
                setForm({ ...VAZIO, id: "" });
                setAberto(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo ativo
            </Button>
          </div>
        )}
      </GlassCard>

      {ativos.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          title="Nenhum filtro cadastrado"
          description="Cadastre purificadores e bebedouros para acompanhar a troca preventiva."
        />
      ) : (
        <div className="space-y-2">
          {lista.map((a) => {
            const dias = diasParaTroca(a);
            const ponto = porPonto.get(a.ponto_id);
            const tom =
              dias === null
                ? "border-border/60 text-muted-foreground"
                : dias <= 0
                  ? "border-rose-400/40 text-rose-300"
                  : dias <= 30
                    ? "border-amber-400/40 text-amber-300"
                    : "border-emerald-400/40 text-emerald-300";
            return (
              <button
                key={a.id}
                type="button"
                disabled={!podeEscrever}
                onClick={() => editar(a)}
                className="w-full rounded-2xl border border-border/50 bg-card/40 p-3 text-left disabled:cursor-default"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {ponto ? pontoLabel(ponto) : "Ponto removido"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[a.marca, a.modelo, a.tipo_filtro].filter(Boolean).join(" · ")}
                      {a.numero_serie ? ` · série ${a.numero_serie}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ciclo de {a.periodicidade_dias} dias
                      {a.ultima_troca
                        ? ` · última troca ${a.ultima_troca.split("-").reverse().join("/")}`
                        : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px]", tom)}>
                    {dias === null
                      ? "sem data"
                      : dias <= 0
                        ? `vencida há ${Math.abs(dias)}d`
                        : `em ${dias}d`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar ativo" : "Novo ativo de filtro"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Ponto</Label>
              <Select
                value={form.ponto_id}
                onValueChange={(v) => setForm((f) => ({ ...f, ponto_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ponto" />
                </SelectTrigger>
                <SelectContent>
                  {(pontos.data ?? []).map((p: Ponto) => (
                    <SelectItem key={p.id} value={p.id}>
                      {pontoLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Tipo de filtro</Label>
              <Select
                value={form.tipo_filtro}
                onValueChange={(v) => setForm((f) => ({ ...f, tipo_filtro: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_FILTRO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ativo-per">Periodicidade (dias)</Label>
              <Input
                id="ativo-per"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.periodicidade_dias}
                onChange={(e) =>
                  setForm((f) => ({ ...f, periodicidade_dias: Number(e.target.value) }))
                }
              />
            </div>

            {(
              [
                ["codigo", "Código interno"],
                ["marca", "Marca"],
                ["modelo", "Modelo"],
                ["numero_serie", "Número de série"],
                ["local_instalacao", "Local de instalação"],
              ] as const
            ).map(([campo, label]) => (
              <div key={campo} className="space-y-1">
                <Label htmlFor={`ativo-${campo}`}>{label}</Label>
                <Input
                  id={`ativo-${campo}`}
                  value={form[campo]}
                  onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                />
              </div>
            ))}

            <div className="space-y-1">
              <Label>Situação</Label>
              <Select
                value={form.situacao}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, situacao: v as FiltroAtivo["situacao"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="substituido">Substituído</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ativo-inst">Instalado em</Label>
              <Input
                id="ativo-inst"
                type="date"
                value={form.instalado_em}
                onChange={(e) => setForm((f) => ({ ...f, instalado_em: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ativo-troca">Última troca</Label>
              <Input
                id="ativo-troca"
                type="date"
                value={form.ultima_troca}
                onChange={(e) => setForm((f) => ({ ...f, ultima_troca: e.target.value }))}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ativo-obs">Observação</Label>
              <Textarea
                id="ativo-obs"
                rows={2}
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              className="min-h-[44px] w-full"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar ativo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
