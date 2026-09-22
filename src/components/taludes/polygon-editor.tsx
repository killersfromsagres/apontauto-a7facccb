import { useState } from "react";
import { CalendarDays, Eye, EyeOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import type { TaludeMarcacao } from "@/lib/taludes/api";
import { Button } from "@/components/ui/button";
import { PolygonEditorPro } from "./polygon-editor-pro";

interface PolygonEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  marcacoes: TaludeMarcacao[];
  onSave: (marcacao: Partial<TaludeMarcacao>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatShortDate(value?: string | null) {
  const raw = value?.split(" - ")[1] ?? "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}` : raw || "Sem data";
}

/**
 * Fachada estável do editor de Taludes.
 *
 * A versão anterior observava toda a árvore DOM com MutationObserver e alterava
 * nós renderizados pelo React para renomear campos e injetar controles. Ao
 * concluir uma demarcação, a atualização do mapa podia provocar uma cascata de
 * mutações/reconciliações e bloquear a interface. Todos os controles agora são
 * renderizados nativamente, sem manipulação externa da árvore do React.
 */
export function PolygonEditor(props: PolygonEditorProps) {
  const [datePanelOpen, setDatePanelOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const toggleDateVisibility = async (marking: TaludeMarcacao) => {
    const showDate = marking.data_visivel === false;
    setSavingId(marking.id);

    try {
      await props.onSave({
        id: marking.id,
        data_visivel: showDate,
        // Ao ocultar a data, o número continua visível para identificar o talude
        // e liberar espaço visual no mapa sem apagar nenhuma informação.
        ...(showDate ? {} : { numero_visivel: true }),
      });

      toast.success(
        showDate
          ? `Data do Talude ${marking.numero ?? "—"} exibida novamente.`
          : `Data do Talude ${marking.numero ?? "—"} ocultada. O número foi mantido no mapa.`,
      );
    } catch (error) {
      console.error("[Taludes] Falha ao alterar visibilidade da data:", error);
      toast.error("Não foi possível alterar a visibilidade da data.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-950">
      <div className="h-full min-h-0 w-full">
        <PolygonEditorPro {...props} />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[70] flex flex-col items-start gap-2">
        {datePanelOpen && (
          <div className="pointer-events-auto w-[min(330px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-cyan-300" />
                  <p className="text-xs font-extrabold text-white">Datas no mapa</p>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-white/40">
                  Oculte somente a data para ganhar espaço. Número, polígono e histórico continuam salvos.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={() => setDatePanelOpen(false)}
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[42vh] space-y-1.5 overflow-y-auto p-2.5">
              {props.marcacoes.map((marking) => {
                const hidden = marking.data_visivel === false;
                const saving = savingId === marking.id;
                return (
                  <div
                    key={marking.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 min-w-7 place-items-center rounded-lg border border-white/10 bg-black/30 px-1.5 text-[10px] font-black text-white">
                          {marking.numero ?? "—"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-bold text-white/85">
                            Talude {marking.numero ?? "—"}
                          </p>
                          <p className="truncate text-[9px] text-white/40">
                            {formatShortDate(marking.rotulo)} · {hidden ? "data oculta" : "data visível"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={hidden ? "outline" : "ghost"}
                      className="h-8 gap-1.5 px-2.5 text-[9px]"
                      disabled={Boolean(savingId)}
                      onClick={() => void toggleDateVisibility(marking)}
                      title={hidden ? "Mostrar data deste talude" : "Ocultar data e manter o número"}
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : hidden ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                      {hidden ? "Mostrar" : "Ocultar"}
                    </Button>
                  </div>
                );
              })}

              {!props.marcacoes.length && (
                <p className="px-3 py-6 text-center text-[10px] text-white/35">
                  Nenhum talude demarcado neste mapa.
                </p>
              )}
            </div>
          </div>
        )}

        <Button
          type="button"
          variant={datePanelOpen ? "premium" : "outline"}
          size="sm"
          className="pointer-events-auto h-9 gap-2 border-white/10 bg-slate-950/90 px-3 text-[10px] shadow-xl backdrop-blur-xl"
          onClick={() => setDatePanelOpen((open) => !open)}
          title="Controlar datas exibidas no mapa"
        >
          <CalendarDays className="h-4 w-4" />
          Datas
          {props.marcacoes.some((marking) => marking.data_visivel === false) && (
            <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-black text-amber-200">
              {props.marcacoes.filter((marking) => marking.data_visivel === false).length} oculta(s)
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
