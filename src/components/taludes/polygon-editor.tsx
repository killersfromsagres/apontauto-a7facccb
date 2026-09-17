import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PolygonEditorPro } from "./polygon-editor-pro";
import { TaludesClimatePanel } from "./taludes-climate-panel";
import type { TaludeMarcacao } from "@/lib/taludes/api";

interface PolygonEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  marcacoes: TaludeMarcacao[];
  onSave: (marcacao: Partial<TaludeMarcacao>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const clampScale = (value: number) => Math.min(3.5, Math.max(0.6, Number(value.toFixed(1))));

/**
 * Fachada compatível com a tela legada de Taludes.
 * Mantém a assinatura original, ativa o editor profissional e posiciona
 * o clima ao lado do mapa sem sobrepor as ferramentas de demarcação.
 */
export function PolygonEditor(props: PolygonEditorProps) {
  const [dateTargetId, setDateTargetId] = useState<string>(props.marcacoes[0]?.id ?? "");
  const activeDateTarget = useMemo(
    () => props.marcacoes.find((item) => item.id === dateTargetId) ?? props.marcacoes[0] ?? null,
    [dateTargetId, props.marcacoes],
  );
  const [dateScaleDraft, setDateScaleDraft] = useState(activeDateTarget?.data_scale || 1);

  useEffect(() => {
    if (!activeDateTarget) {
      setDateTargetId("");
      setDateScaleDraft(1);
      return;
    }
    if (activeDateTarget.id !== dateTargetId) setDateTargetId(activeDateTarget.id);
    setDateScaleDraft(activeDateTarget.data_scale || 1);
  }, [activeDateTarget?.id, activeDateTarget?.data_scale, dateTargetId]);

  const persistDateScale = async (value: number) => {
    if (!activeDateTarget) return;
    const next = clampScale(value);
    setDateScaleDraft(next);
    await props.onSave({ ...activeDateTarget, data_scale: next });
  };

  return (
    <div className="taludes-workspace grid h-full min-h-[520px] w-full grid-cols-1 gap-3 overflow-hidden bg-[#07101d] p-2 xl:grid-cols-[minmax(0,1fr)_330px]">
      <style>{`
        .taludes-workspace svg text[x="0"][y="1"][text-anchor="middle"] {
          font-family: "Arial Black", "Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif;
          font-weight: 900;
          font-variant-numeric: tabular-nums lining-nums;
          letter-spacing: -0.035em;
          text-rendering: geometricPrecision;
        }
      `}</style>

      <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-950 shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] bg-[#0a111c]/95 px-3 py-2.5">
          <div className="flex min-w-[170px] items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.07] text-cyan-300">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-white/45">Campo de data</p>
              <p className="text-[10px] font-semibold text-white/80">Tamanho do texto e do cartão</p>
            </div>
          </div>

          <select
            value={activeDateTarget?.id ?? ""}
            onChange={(event) => setDateTargetId(event.target.value)}
            disabled={!props.marcacoes.length}
            className="h-8 min-w-[125px] rounded-lg border border-white/10 bg-white/[0.045] px-2 text-[10px] font-semibold text-white outline-none focus:border-cyan-400/35"
            title="Escolha o talude para ajustar o campo de data"
          >
            {!props.marcacoes.length && <option value="">Sem taludes</option>}
            {props.marcacoes.map((item) => (
              <option key={item.id} value={item.id} className="bg-slate-950">
                Talude {item.numero ?? "—"}
              </option>
            ))}
          </select>

          <div className="flex min-w-[210px] flex-1 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!activeDateTarget}
              title="Diminuir data"
              onClick={() => void persistDateScale(dateScaleDraft - 0.1)}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <input
              type="range"
              min="0.6"
              max="3.5"
              step="0.1"
              disabled={!activeDateTarget}
              value={dateScaleDraft}
              onChange={(event) => setDateScaleDraft(clampScale(Number(event.target.value)))}
              onPointerUp={() => void persistDateScale(dateScaleDraft)}
              onKeyUp={() => void persistDateScale(dateScaleDraft)}
              className="min-w-[100px] flex-1 accent-cyan-400"
              aria-label="Tamanho do campo de data"
            />
            <span className="w-11 text-center font-mono text-[10px] font-bold tabular-nums text-cyan-300">
              {dateScaleDraft.toFixed(1)}x
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!activeDateTarget}
              title="Aumentar data"
              onClick={() => void persistDateScale(dateScaleDraft + 0.1)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!activeDateTarget}
              className="h-8 gap-1.5 px-2 text-[9px]"
              title="Restaurar tamanho padrão"
              onClick={() => void persistDateScale(1)}
            >
              <RotateCcw className="h-3 w-3" />
              1.0x
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <PolygonEditorPro {...props} />
        </div>
      </section>

      <aside className="min-h-[320px] overflow-y-auto rounded-2xl border border-white/[0.07] bg-[#080d15] shadow-xl xl:min-h-0">
        <div className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#080d15]/95 px-4 py-3 backdrop-blur-xl">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-sky-300/75">Monitoramento operacional</p>
          <h2 className="mt-0.5 text-sm font-black tracking-tight text-white">Clima · Taludes</h2>
          <p className="mt-1 text-[9px] leading-relaxed text-white/35">Painel lateral independente. O mapa permanece livre para edição e demarcação.</p>
        </div>
        <div className="p-3">
          <TaludesClimatePanel />
        </div>
      </aside>
    </div>
  );
}
