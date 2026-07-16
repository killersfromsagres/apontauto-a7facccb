import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cloud,
  CloudRain,
  CloudLightning,
  Sun,
  RefreshCw,
  Trash2,
  Download,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ClipboardCheck,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  loadClima,
  statusClimatico,
  wmoIcone,
  salvarConfig,
  type ClimaBundle,
  type ClimaConfig,
} from "@/lib/taludes-programacao/clima";
import {
  listarEvidencias,
  registrarEvidencia,
  removerEvidencia,
  type ChuvaEvidencia,
} from "@/lib/taludes-programacao/evidencias";

export const Route = createFileRoute("/_authenticated/programacao-taludes")({
  head: () => ({
    meta: [
      { title: "Clima da Programação de Taludes — Apont Auto" },
      {
        name: "description",
        content:
          "Monitoramento climático integrado à programação de taludes de São Bernardo do Campo, com registro de PT liberada.",
      },
    ],
  }),
  component: ProgramacaoTaludesPage,
});

function fmtBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ClimaIcon({ code, className }: { code: "sun" | "cloud" | "rain" | "storm"; className?: string }) {
  const c = cn("h-5 w-5", className);
  if (code === "sun") return <Sun className={cn(c, "text-amber-500")} />;
  if (code === "rain") return <CloudRain className={cn(c, "text-blue-500")} />;
  if (code === "storm") return <CloudLightning className={cn(c, "text-purple-500")} />;
  return <Cloud className={cn(c, "text-slate-400")} />;
}

function ProgramacaoTaludesPage() {
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();

  const climaQ = useQuery({
    queryKey: ["taludes-clima"],
    queryFn: loadClima,
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });

  const clima = climaQ.data;

  const climaPanelRef = useRef<HTMLDivElement>(null);

  // Evidências de chuva
  const evidenciasQ = useQuery({
    queryKey: ["taludes-chuva-evidencias"],
    queryFn: () => listarEvidencias(50),
    staleTime: 60_000,
  });
  const [registrandoEvid, setRegistrandoEvid] = useState(false);
  const handleRegistrarEvidencia = async () => {
    if (!clima || !climaPanelRef.current) return;
    setRegistrandoEvid(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(climaPanelRef.current, {
        pixelRatio: 2,
        backgroundColor: "#0b1220",
      });
      const hoje = todayISO();
      const diaHoje = clima.dias.find((d) => d.data === hoje);
      const mm = diaHoje?.precipitacao_mm_real ?? diaHoje?.precipitacao_mm_prev ?? clima.agora.prob_chuva;
      await registrarEvidencia({
        data: hoje,
        mensagem:
          "Atividades de talude interrompidas devido a chuva — condição climática desfavorável registrada como evidência.",
        imagem_data_url: dataUrl,
        temperatura: clima.agora.temperatura,
        condicao: clima.agora.condicao,
        precipitacao_mm: typeof mm === "number" ? mm : null,
        prob_chuva: clima.agora.prob_chuva,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `evidencia-chuva-taludes-${hoje}.png`;
      a.click();
      toast.success("Evidência de chuva registrada");
      qc.invalidateQueries({ queryKey: ["taludes-chuva-evidencias"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRegistrandoEvid(false);
    }
  };

  const hojeStatus = clima
    ? statusClimatico(todayISO(), clima.dias, clima.config)
    : null;

  return (
    <PageShell
      title="Clima da Programação de Taludes"
      description="Monitoramento climático em tempo real de São Bernardo do Campo — SP, integrado à programação de taludes."
      actions={
        <Button variant="outline" onClick={() => climaQ.refetch()} disabled={climaQ.isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", climaQ.isFetching && "animate-spin")} />
          Atualizar clima
        </Button>
      }
    >
      <div className="space-y-5">
        {clima?.stale && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            Não foi possível obter dados climáticos agora — exibindo último snapshot salvo.
          </div>
        )}

        {hojeStatus?.nivel === "chuva" && (
          <div className="rounded-xl border-2 border-red-500/60 bg-gradient-to-r from-red-500/20 to-red-600/10 px-4 py-3 shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CloudRain className="mt-0.5 h-6 w-6 shrink-0 text-red-500 animate-pulse" />
                <div>
                  <p className="font-display text-base font-bold text-red-700 dark:text-red-300">
                    Atividades de talude interrompidas por chuva
                  </p>
                  <p className="text-xs text-red-800/90 dark:text-red-200/90">
                    {hojeStatus.motivo} — registre a evidência para o histórico do dia.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRegistrarEvidencia}
                disabled={registrandoEvid}
                className="shrink-0"
              >
                {registrandoEvid ? "Registrando…" : "Registrar evidência de chuva"}
              </Button>
            </div>
          </div>
        )}

        {/* PT (Permissão de Trabalho) — discreto, moderno e elegante */}
        <PTCard />

        {/* Painel climático */}
        <div ref={climaPanelRef}>
          <GlassCard className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {clima && <ClimaIcon code={wmoIcone(0)} className="h-10 w-10" />}
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Agora em São Bernardo do Campo — SP
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {clima?.agora.temperatura != null
                      ? `${Math.round(clima.agora.temperatura)}°C`
                      : "—"}
                    <span className="ml-3 text-base font-normal text-muted-foreground">
                      {clima?.agora.condicao ?? "Carregando…"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Prob. de chuva hoje: {clima?.agora.prob_chuva ?? 0}%
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {hojeStatus && (
                  <Badge
                    className={cn(
                      "px-3 py-1.5 text-sm",
                      hojeStatus.nivel === "favoravel" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                      hojeStatus.nivel === "atencao" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                      hojeStatus.nivel === "chuva" && "bg-red-500/15 text-red-700 dark:text-red-300",
                    )}
                  >
                    {hojeStatus.nivel === "favoravel" && <CheckCircle2 className="mr-1 h-4 w-4 inline" />}
                    {hojeStatus.nivel !== "favoravel" && <AlertTriangle className="mr-1 h-4 w-4 inline" />}
                    Hoje seguro para talude?{" "}
                    {hojeStatus.nivel === "favoravel"
                      ? "Sim"
                      : hojeStatus.nivel === "atencao"
                        ? "Atenção"
                        : "Não"}
                  </Badge>
                )}
              </div>
            </div>

            <ScrollArea className="w-full">
              <div className="flex gap-2 pb-2">
                {clima?.dias
                  .filter((d) => d.data >= todayISO())
                  .slice(0, 14)
                  .map((d) => {
                    const st = statusClimatico(d.data, clima.dias, clima.config);
                    return (
                      <div
                        key={d.data}
                        className={cn(
                          "min-w-[92px] rounded-xl border p-2 text-center",
                          st.nivel === "chuva" && "border-red-500/50 bg-red-500/5",
                          st.nivel === "atencao" && "border-amber-500/40 bg-amber-500/5",
                          st.nivel === "favoravel" && "border-emerald-500/30 bg-emerald-500/5",
                        )}
                      >
                        <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {fmtBR(d.data).slice(0, 5)}
                        </div>
                        <div className="my-1 flex justify-center">
                          <ClimaIcon
                            code={
                              (d.precipitacao_mm_prev ?? 0) > 5
                                ? "rain"
                                : (d.prob_chuva_prev ?? 0) > 40
                                  ? "cloud"
                                  : "sun"
                            }
                          />
                        </div>
                        <div className="text-xs font-bold">{Math.round(d.prob_chuva_prev ?? 0)}%</div>
                        <div className="text-[10px] text-muted-foreground">
                          {(d.precipitacao_mm_prev ?? 0).toFixed(1)} mm
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Última atualização:{" "}
                {clima ? new Date(clima.atualizado_em).toLocaleString("pt-BR") : "—"}
              </span>
              <span>Fonte: Open-Meteo</span>
            </div>
          </GlassCard>
        </div>

        {/* Histórico climático simplificado */}
        <HistoricoClima clima={clima} />

        {/* Evidências de chuva registradas */}
        <EvidenciasChuvaCard
          evidencias={evidenciasQ.data ?? []}
          onRemove={async (id) => {
            try {
              await removerEvidencia(id);
              toast.success("Evidência removida");
              qc.invalidateQueries({ queryKey: ["taludes-chuva-evidencias"] });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />

        {isAdmin && clima && <ConfigCard config={clima.config} onSaved={() => climaQ.refetch()} />}
      </div>
    </PageShell>
  );
}

/* ============================================================
 * PT (Permissão de Trabalho) — persistida em app_settings
 * ============================================================ */
const PT_SETTING_ID = "pt_taludes_liberada";

type PTData = {
  liberada_em: string | null; // ISO datetime-local (yyyy-mm-ddTHH:mm)
  observacao?: string | null;
  atualizado_em?: string;
  atualizado_por?: string | null;
};

function PTCard() {
  const qc = useQueryClient();
  const ptQ = useQuery({
    queryKey: ["pt-taludes"],
    queryFn: async (): Promise<PTData> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("data")
        .eq("id", PT_SETTING_ID)
        .maybeSingle();
      if (error) throw error;
      return (data?.data as PTData | undefined) ?? { liberada_em: null };
    },
    staleTime: 60_000,
  });

  const [editing, setEditing] = useState(false);
  const [valor, setValor] = useState<string>("");
  const [obs, setObs] = useState<string>("");

  useEffect(() => {
    if (ptQ.data && !editing) {
      setValor(ptQ.data.liberada_em ?? "");
      setObs(ptQ.data.observacao ?? "");
    }
  }, [ptQ.data, editing]);

  const salvarMut = useMutation({
    mutationFn: async (payload: PTData) => {
      const { data: u } = await supabase.auth.getUser();
      const record = {
        id: PT_SETTING_ID,
        data: {
          ...payload,
          atualizado_em: new Date().toISOString(),
          atualizado_por: u.user?.email ?? u.user?.id ?? null,
        } as unknown as never,
      };
      const { error } = await supabase.from("app_settings").upsert(record);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pt-taludes"] });
      toast.success("PT atualizada");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const liberada = ptQ.data?.liberada_em;
  const liberadaFmt = liberada
    ? new Date(liberada).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent px-4 py-3 backdrop-blur-sm transition-all hover:border-emerald-500/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <ClipboardCheck className="h-3 w-3" />
              Permissão de Trabalho (PT)
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              {liberadaFmt ? (
                <>
                  <span className="font-display text-lg font-semibold text-foreground">
                    {liberadaFmt}
                  </span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">liberada</span>
                </>
              ) : (
                <span className="text-sm italic text-muted-foreground">
                  Ainda não liberada — registre a data e o horário.
                </span>
              )}
            </div>
            {ptQ.data?.observacao && !editing && (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {ptQ.data.observacao}
              </div>
            )}
          </div>
        </div>

        {!editing && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
          >
            {liberada ? "Alterar" : "Registrar"}
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-3 grid gap-3 border-t border-border/40 pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Data e horário
            </Label>
            <Input
              type="datetime-local"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Observação (opcional)
            </Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: PT nº 123 — equipe Alfa"
              className="h-9"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setValor(ptQ.data?.liberada_em ?? "");
                setObs(ptQ.data?.observacao ?? "");
              }}
              disabled={salvarMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() =>
                salvarMut.mutate({
                  liberada_em: valor || null,
                  observacao: obs || null,
                })
              }
              disabled={salvarMut.isPending}
            >
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoricoClima({ clima }: { clima: ClimaBundle | undefined }) {
  const [periodo, setPeriodo] = useState<"30" | "60" | "90">("30");
  const dias = useMemo(() => {
    if (!clima) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(periodo));
    const cutIso = cutoff.toISOString().slice(0, 10);
    return clima.dias.filter((d) => d.data >= cutIso && d.data <= todayISO() && d.choveu);
  }, [clima, periodo]);

  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">Histórico climático (dias com chuva)</h3>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as "30" | "60" | "90")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Volume (mm)</TableHead>
              <TableHead>Condição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dias.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  Nenhum dia com chuva confirmada no período.
                </TableCell>
              </TableRow>
            )}
            {dias.map((d) => (
              <TableRow key={d.data}>
                <TableCell>{fmtBR(d.data)}</TableCell>
                <TableCell>{(d.precipitacao_mm_real ?? 0).toFixed(1)}</TableCell>
                <TableCell>{d.condicao}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

function ConfigCard({ config, onSaved }: { config: ClimaConfig; onSaved: () => void }) {
  const [cfg, setCfg] = useState<ClimaConfig>(config);
  const [saving, setSaving] = useState(false);
  return (
    <GlassCard>
      <details>
        <summary className="flex cursor-pointer items-center gap-2 font-display text-lg font-semibold">
          <Settings2 className="h-5 w-5" />
          Configurações climáticas (admin)
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Latitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={cfg.latitude}
              onChange={(e) => setCfg({ ...cfg, latitude: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Longitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={cfg.longitude}
              onChange={(e) => setCfg({ ...cfg, longitude: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Limite prob. chuva (%)</Label>
            <Input
              type="number"
              value={cfg.limite_prob_chuva}
              onChange={(e) => setCfg({ ...cfg, limite_prob_chuva: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Limite mm chuva</Label>
            <Input
              type="number"
              step="0.1"
              value={cfg.limite_mm_chuva}
              onChange={(e) => setCfg({ ...cfg, limite_mm_chuva: Number(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await salvarConfig(cfg);
                  toast.success("Configurações salvas");
                  onSaved();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      </details>
    </GlassCard>
  );
}

function EvidenciasChuvaCard({
  evidencias,
  onRemove,
}: {
  evidencias: ChuvaEvidencia[];
  onRemove: (id: string) => Promise<void>;
}) {
  const [preview, setPreview] = useState<ChuvaEvidencia | null>(null);
  return (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">
            Evidências de chuva registradas
          </h3>
          <p className="text-xs text-muted-foreground">
            Registros formais de interrupção de atividades por mau tempo — com print, data e mensagem explícita.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {evidencias.length} registro{evidencias.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {evidencias.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
          Nenhuma evidência registrada ainda. Quando o painel indicar chuva hoje, use o botão
          "Registrar evidência de chuva".
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {evidencias.map((ev) => (
            <div
              key={ev.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-border/50 bg-background/30"
            >
              <button
                type="button"
                onClick={() => setPreview(ev)}
                className="relative block h-32 w-full overflow-hidden bg-slate-900"
              >
                <img
                  src={ev.imagem_data_url}
                  alt={`Evidência de chuva em ${fmtBR(ev.data)}`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 text-xs font-semibold text-white">
                  <CloudRain className="h-3.5 w-3.5" />
                  {fmtBR(ev.data)}
                </div>
              </button>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-3 text-xs text-foreground/90">{ev.mensagem}</p>
                <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {ev.temperatura != null ? `${Math.round(ev.temperatura)}°C` : "—"} ·{" "}
                    {ev.condicao ?? "—"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Remover esta evidência?")) void onRemove(ev.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Evidência de chuva — {preview ? fmtBR(preview.data) : ""}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <img
                src={preview.imagem_data_url}
                alt="Evidência"
                className="w-full rounded-lg border border-border/50"
              />
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200">
                {preview.mensagem}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <div>
                  <div className="font-semibold text-foreground">Data</div>
                  {fmtBR(preview.data)}
                </div>
                <div>
                  <div className="font-semibold text-foreground">Temperatura</div>
                  {preview.temperatura != null ? `${Math.round(preview.temperatura)}°C` : "—"}
                </div>
                <div>
                  <div className="font-semibold text-foreground">Condição</div>
                  {preview.condicao ?? "—"}
                </div>
                <div>
                  <div className="font-semibold text-foreground">Prob. chuva</div>
                  {preview.prob_chuva != null ? `${preview.prob_chuva}%` : "—"}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Registrado em {new Date(preview.created_at).toLocaleString("pt-BR")}
              </div>
              <div className="flex justify-end">
                <a
                  href={preview.imagem_data_url}
                  download={`evidencia-chuva-taludes-${preview.data}.png`}
                >
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar imagem
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </GlassCard>
  );
}
