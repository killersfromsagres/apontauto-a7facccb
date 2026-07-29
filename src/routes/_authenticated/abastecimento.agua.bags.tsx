import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, PackageMinus, PackageX, Scale } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, KpiCard } from "@/components/pcm";
import { cn } from "@/lib/utils";
import { hojeISO, listPontos, listVisitas, pontoLabel } from "@/lib/agua/api";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/bags")({
  component: ControleBags,
});

function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ControleBags() {
  const [de, setDe] = useState(diasAtras(29));
  const [ate, setAte] = useState(hojeISO());

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", de, ate],
    queryFn: () => listVisitas(de, ate),
  });

  const porId = useMemo(() => new Map((pontos.data ?? []).map((p) => [p.id, p])), [pontos.data]);

  const linhas = useMemo(() => {
    const acc = new Map<string, { previstas: number; entregues: number; visitas: number }>();
    for (const v of visitas.data ?? []) {
      const cur = acc.get(v.ponto_id) ?? { previstas: 0, entregues: 0, visitas: 0 };
      cur.previstas += v.bags_previstas ?? 0;
      cur.entregues += v.bags_entregues ?? 0;
      cur.visitas += 1;
      acc.set(v.ponto_id, cur);
    }
    return [...acc.entries()]
      .map(([id, t]) => ({
        id,
        nome: porId.get(id) ? pontoLabel(porId.get(id)!) : "Ponto removido",
        ...t,
        saldo: t.entregues - t.previstas,
      }))
      .sort((a, b) => a.saldo - b.saldo);
  }, [visitas.data, porId]);

  const totais = useMemo(
    () =>
      linhas.reduce(
        (a, l) => ({
          previstas: a.previstas + l.previstas,
          entregues: a.entregues + l.entregues,
          deficit: a.deficit + Math.max(0, l.previstas - l.entregues),
        }),
        { previstas: 0, entregues: 0, deficit: 0 },
      ),
    [linhas],
  );

  const cobertura = totais.previstas
    ? Math.round((totais.entregues / totais.previstas) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="bags-de">De</Label>
            <Input id="bags-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bags-ate">Até</Label>
            <Input id="bags-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">
            Saldo = bags entregues menos bags previstas no período.
          </p>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Bags previstas"
          value={totais.previstas}
          icon={<Scale className="h-4 w-4" />}
        />
        <KpiCard
          label="Bags entregues"
          value={totais.entregues}
          icon={<PackageCheck className="h-4 w-4" />}
        />
        <KpiCard
          label="Déficit acumulado"
          value={totais.deficit}
          icon={<PackageMinus className="h-4 w-4" />}
        />
        <KpiCard
          label="Cobertura"
          value={`${cobertura}%`}
          icon={<PackageX className="h-4 w-4" />}
        />
      </div>

      {visitas.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <EmptyState
          title="Sem movimentação de bags"
          description="Nenhuma visita registrada no período selecionado."
        />
      ) : (
        <div className="space-y-2">
          {linhas.map((l) => {
            const pct = l.previstas ? Math.min(100, (l.entregues / l.previstas) * 100) : 0;
            return (
              <div key={l.id} className="rounded-2xl border border-border/50 bg-card/40 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <p className="truncate text-sm font-semibold">{l.nome}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
                      l.saldo < 0
                        ? "border-rose-400/40 text-rose-300"
                        : "border-emerald-400/40 text-emerald-300",
                    )}
                  >
                    {l.saldo > 0 ? `+${l.saldo}` : l.saldo}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-primary/80 transition-[width]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {l.entregues}/{l.previstas} bags · {l.visitas} visita(s)
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
