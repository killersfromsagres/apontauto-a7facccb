import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const MENSAGERIA_TITLE = "Mensageria e Malotes";

export function PageShell({
  title,
  description,
  eyebrow,
  children,
  actions,
  backButton = false,
  backUrl = "/",
  onBack,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode;
  backButton?: boolean;
  backUrl?: string;
  onBack?: () => void;
}) {
  const handleBack = (e: React.MouseEvent) => {
    if (onBack) {
      e.preventDefault();
      onBack();
    }
  };

  const handleActionsClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (title !== MENSAGERIA_TITLE) return;

    const target = event.target as HTMLElement;
    const button = target.closest("button");
    if (!button?.textContent?.includes("Exportar backup")) return;

    event.preventDefault();
    event.stopPropagation();

    void import("@/lib/mensageria/premium-export")
      .then(({ exportMensageriaPremiumBackup }) => exportMensageriaPremiumBackup())
      .catch((error) => console.error("Falha ao carregar exportador premium da Mensageria:", error));
  };

  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  return (
    <div
      data-page-title={title}
      className="premium-page-shell mx-auto w-full min-w-0 max-w-7xl animate-fade-in space-y-4 p-3 sm:space-y-7 sm:p-4 md:p-8"
    >
      {!online && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive px-4 py-1 text-center text-[10px] font-bold uppercase tracking-wider text-destructive-foreground animate-in slide-in-from-top duration-300">
          Modo Offline Ativo — Sincronização em pausa
        </div>
      )}
      <div className="premium-page-heading relative flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {(backButton || true) && (
            <div className="shrink-0 pt-0.5 md:pt-1">
              <Button
                variant="ghost"
                size="icon"
                className="premium-icon-button h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground sm:h-10 sm:w-10"
                onClick={onBack ? handleBack : undefined}
                asChild={!onBack}
              >
                {onBack ? (
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <a href={backUrl}>
                    <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                  </a>
                )}
              </Button>
            </div>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:mb-2 sm:text-xs">
                {eyebrow}
              </div>
            )}
            <h2 className="break-words font-sans text-xl font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-3xl md:text-4xl">
              {title}
            </h2>
            {description && (
              <p className="mt-1 line-clamp-2 max-w-2xl text-[12px] leading-snug text-muted-foreground sm:mt-3 sm:line-clamp-none sm:text-base">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div
            onClickCapture={handleActionsClickCapture}
            className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap [&>*]:flex-1 sm:[&>*]:flex-none"
          >
            {actions}
          </div>
        )}
      </div>

      {title === MENSAGERIA_TITLE && (
        <style>{`
          [data-page-title="Mensageria e Malotes"] section:has(> div:first-child + div.divide-y) > div.divide-y > div > div:last-child > button:first-child {
            min-width: 6.75rem;
            border: 1px solid color-mix(in oklch, var(--primary) 38%, var(--border));
            background: color-mix(in oklch, var(--primary) 10%, var(--card));
            color: color-mix(in oklch, var(--primary) 88%, white 12%);
            font-weight: 700;
            box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 8px 20px -16px color-mix(in oklch, var(--primary) 65%, transparent);
          }

          [data-page-title="Mensageria e Malotes"] section:has(> div:first-child + div.divide-y) > div.divide-y > div > div:last-child > button:first-child:hover {
            border-color: color-mix(in oklch, var(--primary) 62%, var(--border));
            background: color-mix(in oklch, var(--primary) 18%, var(--card));
            color: var(--foreground);
            transform: translateY(-1px);
            box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.12), 0 12px 26px -18px color-mix(in oklch, var(--primary) 72%, transparent);
          }

          [data-page-title="Mensageria e Malotes"] section:has(> div:first-child + div.divide-y) > div.divide-y > div > div:last-child > button:nth-child(2) {
            min-width: 6.5rem;
            border: 1px solid color-mix(in oklch, #10b981 72%, var(--border));
            background: linear-gradient(135deg, color-mix(in oklch, #10b981 92%, white 8%), color-mix(in oklch, #059669 94%, black 6%));
            color: white;
            font-weight: 800;
            box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25), 0 10px 24px -16px rgb(16 185 129 / 0.78);
          }

          [data-page-title="Mensageria e Malotes"] section:has(> div:first-child + div.divide-y) > div.divide-y > div > div:last-child > button:nth-child(2):hover {
            filter: saturate(1.12) brightness(1.04);
            transform: translateY(-1px);
            box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.3), 0 14px 30px -16px rgb(16 185 129 / 0.92);
          }

          [data-page-title="Mensageria e Malotes"] section:has(> div:first-child + div.divide-y) > div.divide-y > div > div:last-child > button:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 24%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.14);
          }

          [data-page-title="Mensageria e Malotes"] .premium-page-heading button:nth-of-type(2) {
            border-color: color-mix(in oklch, var(--primary) 34%, var(--border));
          }

          @media (max-width: 639px) {
            [data-page-title="Mensageria e Malotes"] section:has(> div:first-child + div.divide-y) > div.divide-y > div > div:last-child {
              justify-content: stretch;
            }

            [data-page-title="Mensageria e Malotes"] section:has(> div:first-child + div.divide-y) > div.divide-y > div > div:last-child > button {
              flex: 1 1 0;
              min-height: 2.5rem;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            [data-page-title="Mensageria e Malotes"] section:has(> div:first-child + div.divide-y) > div.divide-y > div > div:last-child > button {
              transform: none !important;
            }
          }
        `}</style>
      )}

      <div className="min-w-0 pb-16 md:pb-0">{children}</div>
    </div>
  );
}
