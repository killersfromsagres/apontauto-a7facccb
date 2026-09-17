import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PolygonEditorPro } from "./polygon-editor-pro";
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
 * Fachada compatível com a tela de Taludes.
 * Mantém o mapa em largura total e adiciona o ajuste de escala diretamente
 * dentro da seção "Status e datas" do editor profissional.
 */
export function PolygonEditor(props: PolygonEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [statusDatesMount, setStatusDatesMount] = useState<HTMLElement | null>(null);
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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const synchronizeEditorUi = () => {
      // Mantém os rótulos operacionais curtos no cartão de datas do mapa.
      root.querySelectorAll<SVGTextElement>("svg text").forEach((node) => {
        const text = node.textContent?.trim();
        if (text === "STATUS") node.textContent = "DE";
        if (text === "PRAZO") node.textContent = "ATÉ";
      });

      // Ajusta os nomes dos campos dentro da própria seção Status e datas.
      root.querySelectorAll<HTMLElement>("span").forEach((node) => {
        const text = node.textContent?.trim();
        if (text === "Data do status") node.textContent = "De";
        if (text === "Prazo") node.textContent = "Até";
      });

      // Sincroniza automaticamente o alvo do controle com o Talude aberto no editor.
      const editorTitle = Array.from(root.querySelectorAll<HTMLElement>("p")).find((node) =>
        /^Talude\s+/.test(node.textContent?.trim() ?? ""),
      );
      const selectedNumber = editorTitle?.textContent?.trim().replace(/^Talude\s+/, "");
      if (selectedNumber) {
        const matched = props.marcacoes.find((item) => String(item.numero ?? "—") === selectedNumber);
        if (matched && matched.id !== dateTargetId) setDateTargetId(matched.id);
      }

      // Injeta o controle no conteúdo do accordion, sem criar barra que empurre o mapa.
      const statusButton = Array.from(root.querySelectorAll<HTMLButtonElement>("section > button")).find(
        (button) => button.textContent?.toLowerCase().includes("status e datas"),
      );
      const section = statusButton?.parentElement;
      const content = section
        ? Array.from(section.children).find(
            (child) => child !== statusButton && child instanceof HTMLElement,
          ) as HTMLElement | undefined
        : undefined;

      if (content) {
        let mount = content.querySelector<HTMLElement>("[data-taludes-date-scale]");
        if (!mount) {
          mount = document.createElement("div");
          mount.dataset.taludesDateScale = "true";
          content.appendChild(mount);
        }
        if (mount !== statusDatesMount) setStatusDatesMount(mount);
      } else if (statusDatesMount) {
        setStatusDatesMount(null);
      }
    };

    synchronizeEditorUi();
    const observer = new MutationObserver(synchronizeEditorUi);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [dateTargetId, props.marcacoes, statusDatesMount]);

  useEffect(() => {
    if (typeof CanvasRenderingContext2D === "undefined") return;
    const prototype = CanvasRenderingContext2D.prototype;
    const originalFillText = prototype.fillText;

    prototype.fillText = function (
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ) {
      const translated = text === "STATUS" ? "DE" : text === "PRAZO" ? "ATÉ" : text;
      if (typeof maxWidth === "number") {
        return originalFillText.call(this, translated, x, y, maxWidth);
      }
      return originalFillText.call(this, translated, x, y);
    } as CanvasRenderingContext2D["fillText"];

    return () => {
      prototype.fillText = originalFillText;
    };
  }, []);

  return (
    <div ref={rootRef} className="relative h-full min-h-0 w-full overflow-hidden bg-slate-950">
      <style>{`
        .taludes-pro-number-font svg text[x="0"][y="1"][text-anchor="middle"] {
          font-family: "Arial Black", "Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif;
          font-weight: 900;
          font-variant-numeric: tabular-nums lining-nums;
          letter-spacing: -0.035em;
          text-rendering: geometricPrecision;
        }
      `}</style>

      <div className="taludes-pro-number-font h-full min-h-0 w-full">
        <PolygonEditorPro {...props} />
      </div>

      {statusDatesMount &&
        createPortal(
          <div className="mt-1 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.045] p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.07] text-cyan-300">
                  <CalendarDays className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-white/60">
                    Tamanho de DE / ATÉ
                  </p>
                  <p className="truncate text-[8px] text-white/35">
                    Aumenta o cartão e o texto das datas
                  </p>
                </div>
              </div>
              <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 font-mono text-[9px] font-bold tabular-nums text-cyan-300">
                {dateScaleDraft.toFixed(1)}x
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!activeDateTarget}
                title="Diminuir datas"
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
                onChange={(event) => {
                  const next = clampScale(Number(event.target.value));
                  setDateScaleDraft(next);
                }}
                onPointerUp={() => void persistDateScale(dateScaleDraft)}
                onKeyUp={() => void persistDateScale(dateScaleDraft)}
                className="min-w-0 flex-1 accent-cyan-400"
                aria-label="Tamanho do campo De e Até"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!activeDateTarget}
                title="Aumentar datas"
                onClick={() => void persistDateScale(dateScaleDraft + 0.1)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={!activeDateTarget}
                title="Restaurar tamanho padrão"
                onClick={() => void persistDateScale(1)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>,
          statusDatesMount,
        )}
    </div>
  );
}
