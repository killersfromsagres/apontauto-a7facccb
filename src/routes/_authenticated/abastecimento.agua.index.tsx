import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, CheckCircle2, CircleSlash, Droplets, Loader2, PackageCheck } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, KpiCard } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { uploadFrotaPhoto } from "@/lib/frota/photo";
import { cn } from "@/lib/utils";
import {
  MOTIVOS_NAO_REALIZADA,
  VISITA_STATUS_LABEL,
  garantirVisitasDoDia,
  hojeISO,
  listPontos,
  pontoLabel,
  registrarVisita,
  type Ponto,
  type Visita,
  type VisitaStatus,
} from "@/lib/agua/api";
import { DIA_LABEL, DIAS } from "@/lib/agua/reader";
import { diaSemanaISO } from "@/lib/agua/api";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/")({
  component: RotaDoDia,
});

const STATUS_TONE: Record<VisitaStatus, string> = {
  pendente: "border-border/60 bg-card/40",
  concluida: "border-emerald-400/40 bg-emerald-500/10",
  parcial: "border-amber-400/40 bg-amber-500/10",
  nao_realizada: "border-rose-400/40 bg-rose-500/10",
  cancelada: "border-border/60 bg-muted/20",
};

function RotaDoDia() {
  const qc = useQueryClient();
  const podeEscrever = useCanAccessModule("abastecimento", "update").allowed;
  const [data, setData] = useState(hojeISO());
  const [aberto, setAberto] = useState<string | null>(null);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", data],
    queryFn: () => garantirVisitasDoDia(data),
  });

  const porId = useMemo(
    () => new Map<string, Ponto>((pontos.data ?? []).map((p) => [p.id, p])),
    [pontos.data],
  );

  const lista = useMemo(() => {
    const rows = (visitas.data ?? []).map((v) => ({ v, p: porId.get(v.ponto_id) }));
    return rows
      .filter((r) => r.p)
      .sort((a, b) => (a.p!.ordem - b.p!.ordem) || a.p!.predio.localeCompare(b.p!.predio));
  }, [visitas.data, porId]);

  const kpis = useMemo(() => {
    const total = lista.length;
    const concluidas = lista.filter((r) => r.v.status === "concluida").length;
    const pendentes = lista.filter((r) => r.v.status === "pendente").length;
    const bags = lista.reduce((a, r) => a + (r.v.bags_entregues ?? 0), 0);
    return { total, concluidas, pendentes, bags };
  }, [lista]);

  const mut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Visita> }) =>
      registrarVisita(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agua", "visitas", data] });
      toast.success("Execução registrada.");
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao registrar."),
  });

  const dia = diaSemanaISO(data);
  const diaUtil = dia <= 5;

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="data-rota">Data da rota</Label>
            <Input
              id="data-rota"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value || hojeISO())}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {DIA_LABEL[dia]} ·{" "}
            {diaUtil
              ? `${kpis.total} ponto(s) programado(s)`
              : "Fora dos dias úteis programados na planilha."}
          </p>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard title="Pontos do dia" value={kpis.total} icon={<Droplets className="h-4 w-4" />} />
        <KpiCard title="Concluídos" value={kpis.concluidas} icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard title="Pendentes" value={kpis.pendentes} icon={<CircleSlash className="h-4 w-4" />} />
        <KpiCard title="Bags entregues" value={kpis.bags} icon={<PackageCheck className="h-4 w-4" />} />
      </div>

      {visitas.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando rota…
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          title="Nenhum ponto programado"
          description={
            diaUtil
              ? "Importe a planilha em Pontos e filtros para gerar a programação semanal."
              : `Não há programação cadastrada para ${DIA_LABEL[dia]}.`
          }
        />
      ) : (
        <div className="space-y-2">
          {lista.map(({ v, p }) => (
            <VisitaCard
              key={v.id}
              visita={v}
              ponto={p!}
              aberto={aberto === v.id}
              onToggle={() => setAberto(aberto === v.id ? null : v.id)}
              podeEscrever={podeEscrever}
              salvando={mut.isPending}
              onSalvar={(patch) => mut.mutate({ id: v.id, patch })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VisitaCard({
  visita,
  ponto,
  aberto,
  onToggle,
  podeEscrever,
  salvando,
  onSalvar,
}: {
  visita: Visita;
  ponto: Ponto;
  aberto: boolean;
  onToggle: () => void;
  podeEscrever: boolean;
  salvando: boolean;
  onSalvar: (patch: Partial<Visita>) => void;
}) {
  const [bags, setBags] = useState(String(visita.bags_entregues ?? visita.bags_previstas));
  const [motivo, setMotivo] = useState(visita.motivo ?? MOTIVOS_NAO_REALIZADA[0]);
  const [obs, setObs] = useState(visita.observacao ?? "");
  const [enviando, setEnviando] = useState(false);

  async function enviarFoto(file: File) {
    setEnviando(true);
    try {
      const { url } = await uploadFrotaPhoto(file, `agua-${visita.id}.jpg`, {
        module: "abastecimento-agua",
        entityType: "agua_visita",
        entityId: visita.id,
      });
      onSalvar({ foto_url: url });
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao enviar a foto.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={cn("rounded-2xl border transition-colors", STATUS_TONE[visita.status])}>
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{pontoLabel(ponto)}</p>
          <p className="text-xs text-muted-foreground">
            {visita.bags_previstas} bag(s) previstas
            {visita.bags_entregues != null ? ` · ${visita.bags_entregues} entregue(s)` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium">
          {VISITA_STATUS_LABEL[visita.status]}
        </span>
      </button>

      {aberto && (
        <div className="space-y-3 border-t border-border/50 p-3">
          {!podeEscrever ? (
            <p className="text-xs text-muted-foreground">
              Você tem acesso somente de leitura a este módulo.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Bags entregues</Label>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={bags}
                    onChange={(e) => setBags(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Motivo (quando não realizada)</Label>
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOTIVOS_NAO_REALIZADA.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Observação</Label>
                <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={salvando}
                  onClick={() =>
                    onSalvar({
                      status: "concluida",
                      bags_entregues: Number(bags) || 0,
                      observacao: obs || null,
                      motivo: null,
                    })
                  }
                >
                  Concluir
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={salvando}
                  onClick={() =>
                    onSalvar({
                      status: "parcial",
                      bags_entregues: Number(bags) || 0,
                      observacao: obs || null,
                    })
                  }
                >
                  Entrega parcial
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={salvando}
                  onClick={() =>
                    onSalvar({
                      status: "nao_realizada",
                      bags_entregues: 0,
                      motivo,
                      observacao: obs || null,
                    })
                  }
                >
                  Não realizada
                </Button>
                <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 text-sm">
                  {enviando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  Evidência
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void enviarFoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {visita.foto_url && (
                <a
                  href={visita.foto_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs text-primary underline"
                >
                  Ver evidência enviada
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { DIAS };
