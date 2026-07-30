// Painel de gestão (somente admin) — visão consolidada das entregas de água do dia.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Droplets,
  Loader2,
  ShieldAlert,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  DIAS,
  STATUS_LABEL,
  diaDaSemana,
  formatarData,
  hojeISO,
  listEntregasDoDia,
  listPontos,
  type Entrega,
} from "@/features/water-delivery/simple/api";

function addDias(dataISO: string, n: number): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function hora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(d);
}

export function WaterAdminPanel() {
  const { isAdmin, loading } = useIsAdmin();
  const [data, setData] = useState(hojeISO);

  const dia = diaDaSemana(data);
  const pontosQ = useQuery({
    queryKey: ["agua-prog", "pontos"],
    queryFn: listPontos,
    enabled: isAdmin,
  });
  const entregasQ = useQuery({
    queryKey: ["agua-prog", "entregas", data],
    queryFn: () => listEntregasDoDia(data),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const entregaPorPonto = useMemo(() => {
    const map = new Map<string, Entrega>();
    (entregasQ.data ?? []).forEach((e) => map.set(e.ponto_id, e));
    return map;
  }, [entregasQ.data]);

  const pontosDoDia = useMemo(
    () => (pontosQ.data ?? []).filter((p) => p.dias.includes(dia)),
    [pontosQ.data, dia],
  );

  const entregues = pontosDoDia.filter((p) => entregaPorPonto.has(p.id));
  const pendentes = pontosDoDia.filter((p) => !entregaPorPonto.has(p.id));
  const bags = entregues.reduce((a, p) => a + (entregaPorPonto.get(p.id)?.bags ?? 0), 0);
  const problemas = entregues.filter(
    (p) => entregaPorPonto.get(p.id)?.bebedouro_ok === false,
  ).length;
  const progresso = pontosDoDia.length
    ? Math.round((entregues.length / pontosDoDia.length) * 100)
    : 0;

  if (loading) {
    return (
      <GlassCard className="p-10 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
        Verificando permissões…
      </GlassCard>
    );
  }

  if (!isAdmin) {
    return (
      <GlassCard className="p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <p className="font-semibold">Área restrita</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Este painel de gestão é visível apenas para administradores.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
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
          <Input
            type="date"
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            className="h-11 w-[150px] rounded-xl text-base"
          />
          <Button
            variant={data === hojeISO() ? "secondary" : "outline"}
            className="ml-auto h-11 rounded-xl"
            onClick={() => setData(hojeISO())}
          >
            Hoje
          </Button>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300 transition-all duration-500"
            style={{ width: `${progresso}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Entregues" value={`${entregues.length}/${pontosDoDia.length}`} tone="ok" />
          <Kpi label="Pendentes" value={String(pendentes.length)} tone="warn" />
          <Kpi label="Bags entregues" value={String(bags)} tone="info" />
          <Kpi label="Bebedouro c/ problema" value={String(problemas)} tone="bad" />
        </div>
      </GlassCard>

      <GlassCard className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">Prédios com entrega realizada</h2>
          <Badge className="ml-auto border border-emerald-500/40 bg-emerald-500/20 text-[10px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
            {entregues.length}
          </Badge>
        </div>

        {entregasQ.isLoading || pontosQ.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Carregando entregas…
          </div>
        ) : entregues.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma entrega registrada neste dia.
          </div>
        ) : (
          <ul className="space-y-2">
            {entregues.map((p) => {
              const e = entregaPorPonto.get(p.id)!;
              return (
                <li
                  key={p.id}
                  className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          {p.predio}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {p.andar ?? "—"}
                        </Badge>
                        <Badge className="border border-emerald-500/40 bg-emerald-500/20 text-[10px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
                          {STATUS_LABEL[e.status]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {p.espaco ?? "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.colaboradores.join(" e ") || "sem colaborador"}
                        {e.veiculo ? ` · ${e.veiculo}` : ""} · {e.bags} bag(s)
                      </p>
                      {e.bebedouro_ok === false && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-500">
                          <AlertTriangle className="h-3 w-3" />
                          Bebedouro com problema{e.bebedouro_obs ? `: ${e.bebedouro_obs}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {hora(e.criado_em)}
                      </p>
                      <p className="mt-1 flex items-center justify-end gap-1 text-xs text-sky-600 dark:text-sky-300">
                        <Camera className="h-3 w-3" />
                        {e.fotos?.length ?? 0}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Droplets className="h-4 w-4 text-sky-500" />
          <h2 className="text-sm font-semibold">Ainda pendentes</h2>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {pendentes.length}
          </Badge>
        </div>
        {pendentes.length === 0 ? (
          <p className="p-6 text-center text-sm text-emerald-600 dark:text-emerald-300">
            Todos os prédios do dia já receberam a entrega.
          </p>
        ) : (
          <ul className="space-y-2">
            {pendentes.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-3",
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300">
                  <Droplets className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.predio}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.andar, p.espaco].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {p.bags} bag(s)
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "info" | "bad";
}) {
  const tones: Record<string, string> = {
    ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    bad: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
  return (
    <div className={cn("rounded-2xl border p-3", tones[tone])}>
      <p className="text-[11px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
