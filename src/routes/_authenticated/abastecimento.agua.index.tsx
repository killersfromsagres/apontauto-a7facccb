import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Droplets,
  Filter,
  PackageCheck,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, KpiCard } from "@/components/pcm";
import { cn } from "@/lib/utils";
import {
  diaSemanaISO,
  hojeISO,
  listFiltros,
  listPontos,
  listProgramacao,
  listVisitas,
  pontoLabel,
  VISITA_STATUS_LABEL,
} from "@/lib/agua/api";
import { DIA_LABEL } from "@/lib/agua/reader";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/")({
  component: VisaoGeral,
});

function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function VisaoGeral() {
  const hoje = hojeISO();
  const dia = diaSemanaISO(hoje);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const prog = useQuery({ queryKey: ["agua", "programacao"], queryFn: listProgramacao });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", "semana", hoje],
    queryFn: () => listVisitas(diasAtras(6), hoje),
  });
  const filtros = useQuery({ queryKey: ["agua", "filtros"], queryFn: listFiltros });

  const carregando = pontos.isLoading || prog.isLoading || visitas.isLoading;

  const porId = useMemo(
    () => new Map((pontos.data ?? []).map((p) => [p.id, p])),
    [pontos.data],
  );

  const doDia = useMemo(
    () => (visitas.data ?? []).filter((v) => v.data === hoje),
    [visitas.data, hoje],
  );

  const kpis = useMemo(() => {
    const programadosHoje = (prog.data ?? []).filter((p) => p.dia_semana === dia).length;
    const concluidasHoje = doDia.filter((v) => v.status === "concluida").length;
    const semana = visitas.data ?? [];
    const feitas = semana.filter((v) => v.status === "concluida" || v.status === "parcial").length;
    const aderencia = semana.length ? Math.round((feitas / semana.length) * 100) : 0;
    const bagsSemana = semana.reduce((a, v) => a + (v.bags_entregues ?? 0), 0);
    const filtrosAbertos = (filtros.data ?? []).filter(
      (f) => f.situacao === "aberta" || f.situacao === "em_atendimento",
    ).length;
    return { programadosHoje, concluidasHoje, aderencia, bagsSemana, filtrosAbertos };
  }, [prog.data, doDia, visitas.data, filtros.data, dia]);

  const ocorrencias = useMemo(
    () =>
      (visitas.data ?? [])
        .filter((v) => v.status === "nao_realizada" || v.status === "parcial")
        .slice(0, 6),
    [visitas.data],
  );

  if (carregando) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={`Programados hoje (${DIA_LABEL[dia]})`}
          value={kpis.programadosHoje}
          icon={<Droplets className="h-4 w-4" />}
        />
        <KpiCard
          label="Concluídos hoje"
          value={kpis.concluidasHoje}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiCard
          label="Aderência 7 dias"
          value={`${kpis.aderencia}%`}
          hint="Visitas concluídas ou parciais"
          icon={<PackageCheck className="h-4 w-4" />}
        />
        <KpiCard
          label="Filtros em aberto"
          value={kpis.filtrosAbertos}
          icon={<Filter className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <GlassCard className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Rota de hoje</h2>
            <Link
              to="/abastecimento/agua/rota"
              className="inline-flex items-center gap-1 text-xs text-primary"
            >
              Executar <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {doDia.length === 0 ? (
            <EmptyState
              title="Rota ainda não iniciada"
              description="Abra a aba Rota do Dia para gerar as paradas a partir da programação."
            />
          ) : (
            <ul className="space-y-2">
              {doDia.slice(0, 6).map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/40 p-2.5"
                >
                  <span className="min-w-0 truncate text-sm">
                    {porId.get(v.ponto_id) ? pontoLabel(porId.get(v.ponto_id)!) : "Ponto removido"}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[11px]",
                      v.status === "concluida"
                        ? "border-emerald-400/40 text-emerald-300"
                        : v.status === "pendente"
                          ? "border-border/60 text-muted-foreground"
                          : "border-amber-400/40 text-amber-300",
                    )}
                  >
                    {VISITA_STATUS_LABEL[v.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold">Ocorrências dos últimos 7 dias</h2>
          </div>
          {ocorrencias.length === 0 ? (
            <EmptyState
              title="Semana sem ocorrências"
              description="Nenhuma entrega parcial ou não realizada no período."
            />
          ) : (
            <ul className="space-y-2">
              {ocorrencias.map((v) => (
                <li key={v.id} className="rounded-xl border border-border/50 bg-card/40 p-2.5">
                  <p className="truncate text-sm">
                    {porId.get(v.ponto_id) ? pontoLabel(porId.get(v.ponto_id)!) : "Ponto removido"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.data.split("-").reverse().join("/")} · {VISITA_STATUS_LABEL[v.status]}
                    {v.motivo ? ` — ${v.motivo}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
