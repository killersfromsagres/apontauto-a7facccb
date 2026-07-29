import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, ExternalLink } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pcm";
import { hojeISO, listPontos, listVisitas, pontoLabel, VISITA_STATUS_LABEL } from "@/lib/agua/api";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/evidencias")({
  component: Evidencias,
});

function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function Evidencias() {
  const [de, setDe] = useState(diasAtras(13));
  const [ate, setAte] = useState(hojeISO());
  const [busca, setBusca] = useState("");

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", de, ate],
    queryFn: () => listVisitas(de, ate),
  });

  const porId = useMemo(() => new Map((pontos.data ?? []).map((p) => [p.id, p])), [pontos.data]);

  const fotos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (visitas.data ?? [])
      .filter((v) => !!v.foto_url)
      .map((v) => ({
        v,
        nome: porId.get(v.ponto_id) ? pontoLabel(porId.get(v.ponto_id)!) : "Ponto removido",
      }))
      .filter((r) => !termo || r.nome.toLowerCase().includes(termo));
  }, [visitas.data, porId, busca]);

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="ev-de">De</Label>
            <Input id="ev-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-ate">Até</Label>
            <Input id="ev-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-busca">Buscar ponto</Label>
            <Input
              id="ev-busca"
              placeholder="Prédio, andar ou espaço"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </GlassCard>

      {visitas.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : fotos.length === 0 ? (
        <EmptyState
          icon={<Camera className="size-5" />}
          title="Nenhuma evidência no período"
          description="As fotos enviadas na Rota do Dia aparecem aqui automaticamente."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map(({ v, nome }) => (
            <a
              key={v.id}
              href={v.foto_url!}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-2xl border border-border/50 bg-card/40 transition-colors hover:border-primary/50"
            >
              <div className="aspect-square overflow-hidden bg-muted/30">
                <img
                  src={v.foto_url!}
                  alt={`Evidência de entrega — ${nome}`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="space-y-0.5 p-2.5">
                <p className="truncate text-xs font-medium">{nome}</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {v.data.split("-").reverse().join("/")} · {VISITA_STATUS_LABEL[v.status]}
                  <ExternalLink className="h-3 w-3" />
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
