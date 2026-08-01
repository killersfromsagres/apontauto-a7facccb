import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
  Droplets,
  History,
  Info,
  MapPin,
  Navigation,
  PackageCheck,
  PenSquare,
  QrCode,
  RefreshCw,
  Truck,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, KpiCard } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { cn } from "@/lib/utils";
import {
  VISITA_STATUS_LABEL,
  diaSemanaISO,
  garantirVisitasDoDia,
  hojeISO,
  listPontos,
  pontoLabel,
  type Ponto,
  type Visita,
  type VisitaStatus,
} from "@/features/water-delivery/queries/api";
import { DIA_LABEL } from "@/features/water-delivery/importer/constants";
import {
  lerCacheRota,
  salvarCacheRota,
  useAguaSync,
} from "@/features/water-delivery/offline/offline";
import {
  STATUS_FINALIZADO,
  listRetificacoes,
  marcarAndamento,
  rotaDoDia,
} from "@/features/water-delivery/mutations/execucao";
import { EntregaDialog } from "@/features/water-delivery/components/entrega-dialog";
import { WaterScanner } from "@/features/water-delivery/components/water-scanner";
import {
  FimRotaCard,
  InicioRotaCard,
} from "@/features/water-delivery/components/rota-execucao-cards";

const STATUS_TONE: Record<VisitaStatus, string> = {
  pendente: "border-border/60 bg-card/40",
  em_deslocamento: "border-sky-400/40 bg-sky-500/10",
  em_atendimento: "border-cyan-400/40 bg-cyan-500/10",
  concluida: "border-emerald-400/40 bg-emerald-500/10",
  parcial: "border-amber-400/40 bg-amber-500/10",
  nao_realizada: "border-rose-400/40 bg-rose-500/10",
  sem_necessidade: "border-border/60 bg-muted/20",
  acesso_bloqueado: "border-rose-400/40 bg-rose-500/10",
  local_fechado: "border-rose-400/40 bg-rose-500/10",
  falta_bags: "border-amber-400/40 bg-amber-500/10",
  endereco_divergente: "border-fuchsia-400/40 bg-fuchsia-500/10",
  reprogramada: "border-lime-400/40 bg-lime-500/10",
  cancelada: "border-border/60 bg-muted/20",
};

export function RouteDayView() {
  const qc = useQueryClient();
  const podeEscrever = useCanAccessModule("abastecimento", "update").allowed;
  const [data, setData] = useState(hojeISO());
  const [aberto, setAberto] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<{ visita: Visita; retificando: boolean } | null>(null);
  const { pendentes, online, sincronizando, sincronizar } = useAguaSync();

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const rota = useQuery({ queryKey: ["agua", "rota-exec", data], queryFn: () => rotaDoDia(data) });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", data],
    queryFn: async () => {
      try {
        const rows = await garantirVisitasDoDia(data);
        salvarCacheRota(data, rows);
        return rows;
      } catch (err) {
        const cache = lerCacheRota(data);
        if (cache) return cache;
        throw err;
      }
    },
    retry: 1,
  });

  useEffect(() => {
    if (online && pendentes === 0) {
      void qc.invalidateQueries({ queryKey: ["agua", "visitas", data] });
    }
  }, [online, pendentes, data, qc]);

  const porId = useMemo(
    () => new Map<string, Ponto>((pontos.data ?? []).map((p) => [p.id, p])),
    [pontos.data],
  );

  const lista = useMemo(() => {
    const rows = (visitas.data ?? []).map((v) => ({ v, p: porId.get(v.ponto_id) }));
    return rows
      .filter((r) => r.p)
      .sort(
        (a, b) =>
          a.p!.predio.localeCompare(b.p!.predio) ||
          a.p!.ordem - b.p!.ordem ||
          a.p!.andar.localeCompare(b.p!.andar),
      ) as { v: Visita; p: Ponto }[];
  }, [visitas.data, porId]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { v: Visita; p: Ponto }[]>();
    lista.forEach((item) => {
      const chave = item.p.predio || "Sem prédio";
      mapa.set(chave, [...(mapa.get(chave) ?? []), item]);
    });
    return [...mapa.entries()];
  }, [lista]);

  const kpis = useMemo(() => {
    const total = lista.length;
    const concluidas = lista.filter((r) => r.v.status === "concluida").length;
    const pendentesRota = lista.filter((r) => !STATUS_FINALIZADO.includes(r.v.status)).length;
    const bags = lista.reduce((a, r) => a + (r.v.bags_entregues ?? 0), 0);
    return { total, concluidas, pendentes: pendentesRota, bags };
  }, [lista]);

  const saldoDisponivel =
    rota.data?.bags_carregadas != null ? rota.data.bags_carregadas - kpis.bags : null;

  const dia = diaSemanaISO(data);
  const diaUtil = dia <= 5;
  const proxima = lista.find((r) => !STATUS_FINALIZADO.includes(r.v.status));
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["agua", "visitas", data] });
    void qc.invalidateQueries({ queryKey: ["agua", "rota-exec", data] });
  };

  function avancar(atualId: string) {
    const idx = lista.findIndex((r) => r.v.id === atualId);
    const seguinte = lista.slice(idx + 1).find((r) => !STATUS_FINALIZADO.includes(r.v.status));
    if (seguinte) {
      setAberto(seguinte.v.id);
      document
        .getElementById(`visita-${seguinte.v.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setAberto(null);
      toast.success("Todas as paradas foram tratadas. Finalize a rota.");
    }
  }

  const emAndamento = rota.data?.status === "em_andamento";
  const rotaConcluida = rota.data?.status === "concluida";

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <GlassCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="data-rota">Data da rota</Label>
            <Input
              id="data-rota"
              type="date"
              className="min-h-[44px]"
              value={data}
              onChange={(e) => setData(e.target.value || hojeISO())}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {DIA_LABEL[dia]} ·{" "}
            {diaUtil
              ? `${kpis.total} parada(s) programada(s)`
              : "Fora dos dias úteis programados na planilha."}
            {rota.data && (
              <span className="ml-1">
                · Rota{" "}
                {rota.data.status === "concluida"
                  ? "finalizada"
                  : rota.data.status.replace("_", " ")}
              </span>
            )}
          </p>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Paradas do dia"
          value={kpis.total}
          icon={<Droplets className="h-4 w-4" />}
        />
        <KpiCard
          label="Concluídas"
          value={kpis.concluidas}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiCard
          label="Em aberto"
          value={kpis.pendentes}
          icon={<CircleSlash className="h-4 w-4" />}
        />
        <KpiCard
          label="Bags entregues"
          value={kpis.bags}
          icon={<PackageCheck className="h-4 w-4" />}
        />
      </div>

      {/* 8.1 — Início da rota */}
      {podeEscrever && rota.data && !rota.data.iniciada_em && rota.data.status !== "cancelada" && (
        <InicioRotaCard
          rota={rota.data}
          checklistValido={rota.data.checklist_confirmado}
          onIniciada={recarregar}
        />
      )}

      {!rota.data && !rota.isLoading && (
        <GlassCard className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <Truck className="h-4 w-4 shrink-0" />
          Nenhuma rota criada para esta data — gere a rota na aba <strong>Rotas</strong> para
          registrar início, hodômetro e carga.
        </GlassCard>
      )}

      {visitas.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          title="Nenhuma parada programada"
          description={
            diaUtil
              ? "Importe a planilha na aba Programação para gerar a rota semanal."
              : `Não há programação cadastrada para ${DIA_LABEL[dia]}.`
          }
        />
      ) : (
        <div className="space-y-4">
          {grupos.map(([predio, itens]) => (
            <div key={predio} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{predio}</h3>
                <span className="text-xs text-muted-foreground">
                  {itens.filter((i) => STATUS_FINALIZADO.includes(i.v.status)).length}/
                  {itens.length} tratadas
                </span>
              </div>
              {itens.map(({ v, p }, idx) => (
                <ParadaCard
                  key={v.id}
                  numero={lista.findIndex((r) => r.v.id === v.id) + 1}
                  visita={v}
                  ponto={p}
                  aberto={aberto === v.id}
                  onToggle={() => setAberto(aberto === v.id ? null : v.id)}
                  podeEscrever={podeEscrever && !rotaConcluida}
                  onRegistrar={(retificando) => setDialogo({ visita: v, retificando })}
                  onAndamento={async (status) => {
                    try {
                      const r = await marcarAndamento(v.id, status, {
                        data,
                        atualizadoEm:
                          (v as { atualizado_em?: string | null }).atualizado_em ?? null,
                      });
                      if (r.pendente) toast.info("Salvo no aparelho — aguardando sincronização.");
                      recarregar();
                    } catch (e) {
                      toast.error((e as Error)?.message ?? "Falha ao atualizar o status.");
                    }
                  }}
                  primeiroDoPredio={idx === 0}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 8.5 — Finalização */}
      {podeEscrever && emAndamento && (
        <FimRotaCard rota={rota.data!} totalEntregue={kpis.bags} onFinalizada={recarregar} />
      )}

      {dialogo && porId.get(dialogo.visita.ponto_id) && (
        <EntregaDialog
          aberto
          onOpenChange={(v) => !v && setDialogo(null)}
          visita={dialogo.visita}
          ponto={porId.get(dialogo.visita.ponto_id)!}
          saldoDisponivel={saldoDisponivel}
          retificando={dialogo.retificando}
          onSalvo={() => {
            recarregar();
            avancar(dialogo.visita.id);
          }}
        />
      )}

      {lista.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(var(--mobile-tabbar-h,0px)+env(safe-area-inset-bottom))] z-30 border-t border-border/60 bg-background/85 p-3 backdrop-blur-xl sm:hidden">
          <div className="flex items-center gap-2">
            <Button
              className="min-h-[48px] flex-1"
              disabled={!proxima}
              onClick={() => {
                if (!proxima) return;
                setAberto(proxima.v.id);
                document
                  .getElementById(`visita-${proxima.v.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              <ChevronDown className="mr-2 h-4 w-4" />
              {proxima ? "Próxima parada" : "Rota concluída"}
            </Button>
            <Button
              variant="secondary"
              className="min-h-[48px]"
              disabled={sincronizando || pendentes === 0}
              onClick={() => void sincronizar()}
            >
              <RefreshCw className={cn("h-4 w-4", sincronizando && "animate-spin")} />
              <span className="ml-2 tabular-nums">{pendentes}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ParadaCard({
  numero,
  visita,
  ponto,
  aberto,
  onToggle,
  podeEscrever,
  onRegistrar,
  onAndamento,
  primeiroDoPredio,
}: {
  numero: number;
  visita: Visita;
  ponto: Ponto;
  aberto: boolean;
  onToggle: () => void;
  podeEscrever: boolean;
  onRegistrar: (retificando: boolean) => void;
  onAndamento: (status: "em_deslocamento" | "em_atendimento") => void;
  primeiroDoPredio: boolean;
}) {
  const [historico, setHistorico] = useState<
    { id: string; campo: string; motivo: string; criado_em: string }[] | null
  >(null);
  const finalizada = STATUS_FINALIZADO.includes(visita.status);
  const janela =
    ponto.janela_inicio && ponto.janela_fim
      ? `${ponto.janela_inicio.slice(0, 5)}–${ponto.janela_fim.slice(0, 5)}`
      : null;

  const [scannerAberto, setScannerAberto] = useState(false);

  function onQrSuccess() {
    setScannerAberto(false);
    toast.success("Check-in realizado via QR Code.");
    if (!finalizada) {
      onAndamento("em_atendimento");
    }
  }

  return (
    <div
      id={`visita-${visita.id}`}
      className={cn(
        "rounded-2xl border transition-colors",
        STATUS_TONE[visita.status],
        !primeiroDoPredio && "sm:ml-3",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[56px] w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-xs font-semibold tabular-nums">
            {numero}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{pontoLabel(ponto)}</p>
            <p className="text-xs text-muted-foreground">
              {visita.bags_previstas} bag(s) previstas
              {visita.bags_entregues != null ? ` · ${visita.bags_entregues} entregue(s)` : ""}
              {janela ? ` · ${janela}` : ""}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium">
          {VISITA_STATUS_LABEL[visita.status]}
        </span>
      </button>

      {aberto && (
        <div className="space-y-3 border-t border-border/50 p-3">
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>Andar/setor: {ponto.andar || "—"}</p>
            <p>Espaço: {ponto.espaco || "—"}</p>
            <p>Janela: {janela ?? "Livre"}</p>
            <p>Acesso: {ponto.acesso_observacoes || "Sem observações"}</p>
          </div>

          {ponto.imagem_url && (
            <img
              src={ponto.imagem_url}
              alt={`Referência de ${pontoLabel(ponto)}`}
              className="h-28 w-full rounded-xl border border-border/60 object-cover"
            />
          )}

          <div className="flex flex-wrap gap-2">
            {ponto.latitude != null && ponto.longitude != null && (
              <Button asChild size="sm" variant="secondary" className="min-h-[44px]">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${ponto.latitude},${ponto.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="mr-2 h-4 w-4" />
                  Navegar
                </a>
              </Button>
            )}
            <WaterScanner
              expectedCode={ponto.qr_code ?? `AGUA:${ponto.codigo}`}
              onSuccess={onQrSuccess}
              onOpenChange={setScannerAberto}
            />
            {podeEscrever && !finalizada && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={() => onAndamento("em_deslocamento")}
                >
                  <Truck className="mr-2 h-4 w-4" />
                  Em deslocamento
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={() => onAndamento("em_atendimento")}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Em atendimento
                </Button>
              </>
            )}
          </div>

          {podeEscrever ? (
            <Button
              className="min-h-[48px] w-full"
              variant={finalizada ? "secondary" : "default"}
              onClick={() => onRegistrar(finalizada)}
            >
              {finalizada ? (
                <>
                  <PenSquare className="mr-2 h-4 w-4" />
                  Retificar registro
                </>
              ) : (
                <>
                  <PackageCheck className="mr-2 h-4 w-4" />
                  Registrar entrega
                </>
              )}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Você tem acesso somente de leitura a este módulo.
            </p>
          )}

          {finalizada && (
            <div className="space-y-2 text-xs">
              {visita.fotos?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {visita.fotos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt="Evidência"
                        className="h-16 w-16 rounded-lg border border-border/60 object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="min-h-[40px] px-2"
                onClick={async () => {
                  try {
                    setHistorico(await listRetificacoes(visita.id));
                  } catch {
                    toast.error("Não foi possível carregar o histórico.");
                  }
                }}
              >
                <History className="mr-2 h-4 w-4" />
                Histórico de retificações
              </Button>
              {historico?.length === 0 && (
                <p className="text-muted-foreground">Sem retificações.</p>
              )}
              {historico?.map((h) => (
                <p key={h.id} className="text-muted-foreground">
                  {new Date(h.criado_em).toLocaleString("pt-BR")} · {h.campo} — {h.motivo}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
