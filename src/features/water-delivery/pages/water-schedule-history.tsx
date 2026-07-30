// Histórico das entregas de água — visão do gestor: quem entregou, com qual carro e as fotos.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Car, Droplets, Loader2, Search, Users } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STATUS_LABEL,
  formatarData,
  hojeISO,
  listEntregasPeriodo,
  listPontos,
  localDoPonto,
  type EntregaStatus,
} from "@/features/water-delivery/simple/api";

function addDias(dataISO: string, n: number): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function WaterScheduleHistory() {
  const [inicio, setInicio] = useState(() => addDias(hojeISO(), -14));
  const [fim, setFim] = useState(hojeISO);
  const [busca, setBusca] = useState("");

  const pontosQ = useQuery({ queryKey: ["agua-prog", "pontos"], queryFn: listPontos });
  const entregasQ = useQuery({
    queryKey: ["agua-prog", "historico", inicio, fim],
    queryFn: () => listEntregasPeriodo(inicio, fim),
  });

  const pontos = useMemo(
    () => new Map((pontosQ.data ?? []).map((p) => [p.id, p])),
    [pontosQ.data],
  );

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (entregasQ.data ?? []).filter((e) => {
      if (!q) return true;
      const p = pontos.get(e.ponto_id);
      const alvo = `${p ? localDoPonto(p) : ""} ${e.colaboradores.join(" ")} ${e.veiculo ?? ""}`;
      return alvo.toLowerCase().includes(q);
    });
  }, [entregasQ.data, pontos, busca]);

  const totalBags = linhas.reduce((s, e) => s + (e.bags ?? 0), 0);
  const totalFotos = linhas.reduce((s, e) => s + (e.fotos?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <GlassCard variant="block" className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              De
            </Label>
            <Input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="h-11 rounded-xl text-base"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              Até
            </Label>
            <Input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="h-11 rounded-xl text-base"
            />
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-3">
            <p className="text-xs text-muted-foreground">Entregas</p>
            <p className="text-2xl font-semibold tabular-nums">{linhas.length}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-3">
            <p className="text-xs text-muted-foreground">Bags · Fotos</p>
            <p className="text-2xl font-semibold tabular-nums">
              {totalBags} · {totalFotos}
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar local, colaborador ou carro…"
            className="h-11 rounded-xl text-base"
          />
        </div>

        {entregasQ.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Carregando histórico…
          </div>
        ) : linhas.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma entrega registrada no período.
          </div>
        ) : (
          <ul className="space-y-2">
            {linhas.map((e) => {
              const p = pontos.get(e.ponto_id);
              return (
                <li
                  key={e.id}
                  className="rounded-2xl border border-border/60 bg-card/40 p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Droplets className="h-4 w-4 text-sky-500" />
                    <span className="font-semibold">{p ? localDoPonto(p) : "Ponto removido"}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {formatarData(e.data)}
                    </Badge>
                    <Badge className="border border-emerald-500/40 bg-emerald-500/15 text-[10px] text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                      {STATUS_LABEL[e.status as EntregaStatus] ?? e.status}
                    </Badge>
                    <span className="ml-auto text-sm font-medium tabular-nums">{e.bags} bag(s)</span>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {e.colaboradores.join(" e ") || "—"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Car className="h-3.5 w-3.5" />
                      {e.veiculo ?? "—"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Camera className="h-3.5 w-3.5" />
                      {e.fotos?.length ?? 0} foto(s)
                    </span>
                  </div>

                  {e.observacao && <p className="mt-1 text-sm">{e.observacao}</p>}

                  {(e.fotos?.length ?? 0) > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {e.fotos!.map((f) => (
                        <a
                          key={f.id}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border/60"
                        >
                          <img
                            src={f.url}
                            alt={`Evidência da entrega em ${p ? localDoPonto(p) : "ponto"}`}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
