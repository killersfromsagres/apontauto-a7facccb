import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, KpiCard } from "@/components/pcm";
import {
  VISITA_STATUS_LABEL,
  hojeISO,
  listPontos,
  listVisitas,
  pontoLabel,
  type VisitaStatus,
} from "@/lib/agua/api";
import { DIA_LABEL } from "@/lib/agua/reader";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/indicadores")({
  component: Indicadores,
});

function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const STATUS_COLOR: Record<VisitaStatus, string> = {
  pendente: "var(--muted-foreground)",
  concluida: "oklch(0.72 0.16 158)",
  parcial: "oklch(0.78 0.15 80)",
  nao_realizada: "oklch(0.68 0.19 20)",
  cancelada: "var(--border)",
};

function Indicadores() {
  const [de, setDe] = useState(diasAtras(29));
  const [ate, setAte] = useState(hojeISO());

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", de, ate],
    queryFn: () => listVisitas(de, ate),
  });

  const porId = useMemo(() => new Map((pontos.data ?? []).map((p) => [p.id, p])), [pontos.data]);
  const rows = visitas.data ?? [];

  const kpis = useMemo(() => {
    const total = rows.length;
    const concluidas = rows.filter((v) => v.status === "concluida").length;
    const parciais = rows.filter((v) => v.status === "parcial").length;
    const naoRealizadas = rows.filter((v) => v.status === "nao_realizada").length;
    const bags = rows.reduce((a, v) => a + (v.bags_entregues ?? 0), 0);
    return {
      total,
      aderencia: total ? Math.round(((concluidas + parciais) / total) * 100) : 0,
      naoRealizadas,
      bags,
    };
  }, [rows]);

  const porDia = useMemo(() => {
    const acc = new Map<number, { entregues: number; total: number }>();
    for (const v of rows) {
      const cur = acc.get(v.dia_semana) ?? { entregues: 0, total: 0 };
      cur.total += 1;
      if (v.status === "concluida" || v.status === "parcial") cur.entregues += 1;
      acc.set(v.dia_semana, cur);
    }
    return [1, 2, 3, 4, 5, 6, 7]
      .filter((d) => acc.has(d))
      .map((d) => ({
        dia: DIA_LABEL[d]?.slice(0, 3) ?? String(d),
        aderencia: Math.round((acc.get(d)!.entregues / acc.get(d)!.total) * 100),
      }));
  }, [rows]);

  const porStatus = useMemo(() => {
    const acc = new Map<VisitaStatus, number>();
    for (const v of rows) acc.set(v.status, (acc.get(v.status) ?? 0) + 1);
    return [...acc.entries()].map(([status, valor]) => ({
      status,
      nome: VISITA_STATUS_LABEL[status],
      valor,
    }));
  }, [rows]);

  const serieDiaria = useMemo(() => {
    const acc = new Map<string, number>();
    for (const v of rows) acc.set(v.data, (acc.get(v.data) ?? 0) + (v.bags_entregues ?? 0));
    return [...acc.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, bags]) => ({ data: data.slice(8) + "/" + data.slice(5, 7), bags }));
  }, [rows]);

  const criticos = useMemo(() => {
    const acc = new Map<string, number>();
    for (const v of rows) {
      if (v.status === "nao_realizada") acc.set(v.ponto_id, (acc.get(v.ponto_id) ?? 0) + 1);
    }
    return [...acc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, qtd]) => ({
        id,
        nome: porId.get(id) ? pontoLabel(porId.get(id)!) : "Ponto removido",
        qtd,
      }));
  }, [rows, porId]);

  if (visitas.isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="ind-de">De</Label>
            <Input id="ind-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ind-ate">Até</Label>
            <Input id="ind-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Visitas no período" value={kpis.total} />
        <KpiCard label="Aderência" value={`${kpis.aderencia}%`} />
        <KpiCard label="Não realizadas" value={kpis.naoRealizadas} />
        <KpiCard label="Bags entregues" value={kpis.bags} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sem dados no período"
          description="Ajuste as datas ou registre execuções na Rota do Dia."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <GlassCard className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Aderência por dia da semana</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="aderencia" radius={[6, 6, 0, 0]} fill="var(--primary)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Distribuição por status</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porStatus} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                    {porStatus.map((s) => (
                      <Cell key={s.status} fill={STATUS_COLOR[s.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Bags entregues por dia</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serieDiaria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="bags"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Pontos com mais falhas</h2>
            {criticos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma entrega não realizada no período.
              </p>
            ) : (
              <ul className="space-y-2">
                {criticos.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/40 p-2.5"
                  >
                    <span className="min-w-0 truncate text-sm">{c.nome}</span>
                    <span className="shrink-0 rounded-full border border-rose-400/40 px-2 py-0.5 text-[11px] text-rose-300 tabular-nums">
                      {c.qtd}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
