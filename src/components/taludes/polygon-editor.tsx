import { useState } from "react";
import { CloudRain, X } from "lucide-react";

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

/**
 * Fachada compatível com a tela legada de Taludes.
 * Mantém a assinatura original, ativa o editor profissional e acrescenta o
 * painel climático operacional sem exigir alteração na rota principal.
 */
export function PolygonEditor(props: PolygonEditorProps) {
  const [climateOpen, setClimateOpen] = useState(false);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-950">
      <PolygonEditorPro {...props} />

      <div className="pointer-events-none absolute right-4 top-4 z-[70] flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-events-auto gap-2 border-sky-400/25 bg-slate-950/85 text-sky-100 shadow-xl backdrop-blur-xl hover:border-sky-300/45 hover:bg-sky-400/10"
          onClick={() => setClimateOpen(true)}
          title="Abrir painel operacional de clima"
        >
          <CloudRain className="h-4 w-4" />
          Clima
        </Button>
      </div>

      {climateOpen && (
        <div className="absolute inset-0 z-[90] bg-slate-950/55 backdrop-blur-[2px]">
          <aside className="absolute bottom-0 right-0 top-0 w-full max-w-[780px] overflow-y-auto border-l border-white/10 bg-[#080c13]/96 shadow-[-24px_0_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-[#080c13]/94 px-4 py-3 backdrop-blur-xl sm:px-5">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-300/80">
                  Monitoramento operacional
                </p>
                <h2 className="mt-0.5 text-base font-black tracking-tight text-white sm:text-lg">
                  Clima · Taludes
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full border border-white/10 bg-white/[0.03]"
                onClick={() => setClimateOpen(false)}
                aria-label="Fechar painel climático"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 sm:p-5">
              <TaludesClimatePanel />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
