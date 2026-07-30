import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { resumoUploads, type ResumoUpload } from "@/features/water-delivery/offline/metrics";

function kb(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Item 24 — métricas de upload das evidências deste aparelho: compressão
 * obtida, tempo de processamento/envio e taxa de sucesso. Os dados ficam
 * apenas na sessão local e não contêm informação pessoal.
 */
export function MetricasUploadCard() {
  const [resumo, setResumo] = useState<ResumoUpload>(() => resumoUploads());

  useEffect(() => {
    const atualizar = () => setResumo(resumoUploads());
    atualizar();
    window.addEventListener("agua:upload-metrics", atualizar);
    const timer = window.setInterval(atualizar, 15_000);
    return () => {
      window.removeEventListener("agua:upload-metrics", atualizar);
      window.clearInterval(timer);
    };
  }, []);

  if (resumo.total === 0) return null;

  const itens: Array<[string, string]> = [
    ["Envios nesta sessão", `${resumo.sucessos}/${resumo.total}`],
    ["Taxa de sucesso", `${resumo.taxaSucesso}%`],
    ["Compressão média", `${resumo.economiaPercent}%`],
    ["Original → enviado", `${kb(resumo.bytesOriginais)} → ${kb(resumo.bytesFinais)}`],
    ["Processamento", `${resumo.mediaProcessamentoMs} ms`],
    ["Envio", `${resumo.mediaEnvioMs} ms`],
    ["Fora do main thread", `${resumo.offThreadPercent}%`],
  ];

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Desempenho dos envios</h2>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl border border-border/50 bg-card/30 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
            <dd className="text-sm font-semibold tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
      {resumo.ultimoErro ? (
        <p className="text-xs text-amber-400">Última falha: {resumo.ultimoErro}</p>
      ) : null}
    </GlassCard>
  );
}
