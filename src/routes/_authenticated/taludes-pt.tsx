import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  CloudRain,
  History,
  Filter,
  FileSignature,
  AlertTriangle,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { StatusBadge } from "@/components/pcm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { cn } from "@/lib/utils";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { useWeather } from "@/hooks/use-weather";
import { detectRain, weatherCodeInfo } from "@/lib/weather/open-meteo";
import { getOpenEvent } from "@/lib/weather/history";
import {
  listPTs,
  listPTEvents,
  criarPT,
  transicionarPT,
  PT_STATUS_LABEL,
  PT_STATUS_TONE,
  PT_TRANSITIONS,
  type PTRelease,
  type PTStatus,
} from "@/lib/taludes/pt";
import { listMaps, listMarcacoes } from "@/lib/taludes/api";

export const Route = createFileRoute("/_authenticated/taludes-pt")({
  head: () => ({
    meta: [
      { title: "PT de Taludes — Apont Auto" },
      {
        name: "description",
        content:
          "Solicitação, liberação, suspensão por chuva e encerramento das Permissões de Trabalho em taludes.",
      },
      { property: "og:title", content: "PT de Taludes — Apont Auto" },
      {
        property: "og:description",
        content: "Fluxo completo de Permissão de Trabalho em taludes com histórico imutável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaludesPTPage,
});

const FILTERS: { key: PTStatus | "todas"; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "solicitada", label: "Solicitadas" },
  { key: "em_analise", label: "Em análise" },
  { key: "liberada", label: "Liberadas" },
  { key: "suspensa_chuva", label: "Suspensas" },
  { key: "encerrada", label: "Encerradas" },
  { key: "revogada", label: "Revogadas" },
];

function fmt(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function TaludesPTPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<PTStatus | "todas">("todas");
  const [novoOpen, setNovoOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<PTRelease | null>(null);

  const canCreate = useCanAccessModule("taludes-pt", "create");
  const canRelease = useCanAccessModule("taludes-pt", "update");

  const weather = useWeather();
  const rain = detectRain(weather.data);

  const eventoAberto = useQuery({
    queryKey: ["weather-open-event"],
    queryFn: getOpenEvent,
    refetchInterval: 60_000,
  });

  const mapsQuery = useQuery({ queryKey: ["talude-maps"], queryFn: listMaps, staleTime: 300_000 });
  const ptQuery = useQuery({
    queryKey: ["talude-pts", filter],
    queryFn: () => listPTs({ status: filter }),
  });

  const snapshot = useMemo(
    () => ({
      condicao: weatherCodeInfo(weather.data?.current?.weather_code).label,
      temperatura_c: weather.data?.current?.temperature_2m ?? null,
      chuva_detectada: rain.detected,
      intensidade: rain.intensity,
      mm_hora: rain.mm_atual,
      evento_chuva_aberto: Boolean(eventoAberto.data),
      capturado_em: new Date().toISOString(),
    }),
    [weather.data, rain, eventoAberto.data],
  );

  const bloqueioChuva = rain.detected || Boolean(eventoAberto.data);

  async function handleTransicao(pt: PTRelease, to: PTStatus, motivo?: string, liberador?: string) {
    try {
      if (to === "liberada" && bloqueioChuva) {
        throw new Error("Chuva em curso — a liberação de PT está bloqueada até o fim do evento.");
      }
      await transicionarPT({ pt, to, motivo, liberador_nome: liberador, weather_snapshot: snapshot });
      toast.success(`PT ${pt.numero_pt}: ${PT_STATUS_LABEL[to]}`);
      qc.invalidateQueries({ queryKey: ["talude-pts"] });
      setDetalhe(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <PageShell
      eyebrow="Taludes"
      title="PT — Permissão de Trabalho"
      description="Solicitação, análise, liberação pelos bombeiros, suspensão por chuva e encerramento — com histórico imutável."
      actions={
        canCreate.allowed ? (
          <Button className="min-h-11 rounded-full" onClick={() => setNovoOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Solicitar PT
          </Button>
        ) : null
      }
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Condição meteorológica atual */}
        <GlassCard variant={bloqueioChuva ? "block" : "surface"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CloudRain
                className={cn("h-6 w-6", bloqueioChuva ? "animate-pulse text-amber-400" : "text-primary")}
              />
              <div>
                <p className="text-sm font-semibold">
                  {bloqueioChuva
                    ? `Chuva em curso — ${rain.label}`
                    : `Sem chuva no momento — ${weatherCodeInfo(weather.data?.current?.weather_code).label}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bloqueioChuva
                    ? "Liberação de PT bloqueada. Após o fim da chuva, cumpra o tempo de espera, inspecione e libere novamente."
                    : "Condição favorável — liberação sujeita à análise do responsável."}
                </p>
              </div>
            </div>
            {eventoAberto.data ? (
              <div className="rounded-2xl border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                Evento de chuva aberto desde {fmt(eventoAberto.data.started_at)} ·{" "}
                {Number(eventoAberto.data.accumulated_mm ?? 0).toFixed(1)} mm · espera de{" "}
                {eventoAberto.data.wait_minutes} min após o término
              </div>
            ) : null}
          </div>
        </GlassCard>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              className="min-h-11 rounded-full"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Lista */}
        {ptQuery.isLoading ? (
          <GlassCard>
            <p className="text-sm text-muted-foreground">Carregando PTs…</p>
          </GlassCard>
        ) : (ptQuery.data ?? []).length === 0 ? (
          <GlassCard>
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma PT neste filtro.</p>
            </div>
          </GlassCard>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(ptQuery.data ?? []).map((pt) => (
              <GlassCard key={pt.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">PT {pt.numero_pt}</p>
                    <p className="truncate text-xs text-muted-foreground">{pt.servico}</p>
                  </div>
                  <StatusBadge status={PT_STATUS_LABEL[pt.status]} tone={PT_STATUS_TONE[pt.status]} />
                </div>
                <div className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                  <span>Taludes: {pt.taludes_label || "—"}</span>
                  <span>Data do trabalho: {new Date(`${pt.data_trabalho}T12:00`).toLocaleDateString("pt-BR")}</span>
                  <span>Equipe: {pt.equipe || "—"} · Solicitante: {pt.solicitante}</span>
                  <span>Liberação: {pt.liberador_nome || "—"} em {fmt(pt.liberada_em)}</span>
                  {pt.status === "suspensa_chuva" ? (
                    <span className="flex items-center gap-1 text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Suspensa em {fmt(pt.suspensa_em)} — nova liberação obrigatória
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="min-h-11 rounded-full" onClick={() => setDetalhe(pt)}>
                    <History className="mr-1.5 h-4 w-4" /> Histórico
                  </Button>
                  {canRelease.allowed
                    ? PT_TRANSITIONS[pt.status].map((to) => (
                        <Button
                          key={to}
                          size="sm"
                          variant={to === "liberada" ? "default" : "outline"}
                          className="min-h-11 rounded-full"
                          disabled={to === "liberada" && bloqueioChuva}
                          onClick={() => handleTransicao(pt, to)}
                        >
                          {PT_STATUS_LABEL[to]}
                        </Button>
                      ))
                    : null}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      <NovaPTDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        maps={(mapsQuery.data ?? []).map((m) => ({ id: m.id, nome: m.nome }))}
        snapshot={snapshot}
        onCreated={() => qc.invalidateQueries({ queryKey: ["talude-pts"] })}
      />

      <HistoricoPTDialog pt={detalhe} onClose={() => setDetalhe(null)} />
    </PageShell>
  );
}

function NovaPTDialog({
  open,
  onOpenChange,
  maps,
  snapshot,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  maps: { id: string; nome: string }[];
  snapshot: Record<string, unknown>;
  onCreated: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [mapId, setMapId] = useState<string>("");
  const [marcacoes, setMarcacoes] = useState<string[]>([]);
  const [data, setData] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [servico, setServico] = useState("");
  const [riscos, setRiscos] = useState("");
  const [equipe, setEquipe] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const marcQuery = useQuery({
    queryKey: ["talude-marcacoes", mapId],
    queryFn: () => listMarcacoes(mapId),
    enabled: Boolean(mapId),
  });

  async function submit() {
    if (!numero.trim() || !servico.trim() || !solicitante.trim()) {
      toast.error("Informe número da PT, serviço e solicitante.");
      return;
    }
    setSaving(true);
    try {
      const nomes = (marcQuery.data ?? [])
        .filter((m) => marcacoes.includes(m.id))
        .map((m) => m.rotulo || m.codigo || `Talude ${m.numero}`);
      await criarPT({
        numero_pt: numero.trim(),
        map_id: mapId || null,
        marcacao_ids: marcacoes,
        taludes_label: nomes.join(", "),
        data_trabalho: data,
        servico: servico.trim(),
        riscos: riscos.trim() || undefined,
        equipe: equipe.trim() || undefined,
        solicitante: solicitante.trim(),
        observacoes: obs.trim() || undefined,
        weather_snapshot: snapshot,
      });
      toast.success("PT solicitada.");
      onCreated();
      onOpenChange(false);
      setNumero("");
      setServico("");
      setMarcacoes([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar Permissão de Trabalho</DialogTitle>
          <DialogDescription>
            As condições meteorológicas do momento são registradas automaticamente na solicitação.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Número da PT *</Label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="PT-2026-001" />
          </div>
          <div className="grid gap-1.5">
            <Label>Mapa de taludes</Label>
            <Select value={mapId} onValueChange={setMapId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o mapa" />
              </SelectTrigger>
              <SelectContent>
                {maps.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mapId && (marcQuery.data ?? []).length > 0 ? (
            <div className="grid gap-1.5">
              <Label>Taludes envolvidos</Label>
              <div className="flex flex-wrap gap-2">
                {(marcQuery.data ?? []).map((m) => {
                  const active = marcacoes.includes(m.id);
                  return (
                    <Button
                      key={m.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="min-h-11 rounded-full"
                      onClick={() =>
                        setMarcacoes((prev) =>
                          active ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                        )
                      }
                    >
                      {m.rotulo || m.codigo || `Talude ${m.numero}`}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>Data do trabalho *</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Serviço *</Label>
            <Input value={servico} onChange={(e) => setServico(e.target.value)} placeholder="Ex.: Roçada em talude" />
          </div>
          <div className="grid gap-1.5">
            <Label>Riscos</Label>
            <Textarea value={riscos} onChange={(e) => setRiscos(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-1.5">
              <Label>Equipe</Label>
              <Input value={equipe} onChange={(e) => setEquipe(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Solicitante *</Label>
              <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="min-h-11 rounded-full" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="min-h-11 rounded-full" onClick={submit} disabled={saving}>
            <FileSignature className="mr-1.5 h-4 w-4" /> Solicitar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoricoPTDialog({ pt, onClose }: { pt: PTRelease | null; onClose: () => void }) {
  const eventsQuery = useQuery({
    queryKey: ["talude-pt-events", pt?.id],
    queryFn: () => listPTEvents(pt!.id),
    enabled: Boolean(pt),
  });

  return (
    <Dialog open={Boolean(pt)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico da PT {pt?.numero_pt}</DialogTitle>
          <DialogDescription>Registro imutável — nada é sobrescrito.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {(eventsQuery.data ?? []).map((ev) => (
            <div key={ev.id} className="rounded-2xl border border-border/50 bg-muted/15 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={PT_STATUS_LABEL[ev.to_status as PTStatus] ?? ev.to_status}
                  tone={PT_STATUS_TONE[ev.to_status as PTStatus]}
                />
                <span className="text-muted-foreground">{fmt(ev.created_at)}</span>
                <span className="text-muted-foreground">· {ev.actor_nome ?? "—"} ({ev.origem})</span>
              </div>
              {ev.motivo ? <p className="mt-1">{ev.motivo}</p> : null}
              {ev.weather_snapshot && Object.keys(ev.weather_snapshot).length ? (
                <p className="mt-1 text-muted-foreground">
                  Clima: {JSON.stringify(ev.weather_snapshot).slice(0, 200)}
                </p>
              ) : null}
            </div>
          ))}
          {(eventsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
