import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type BrandedLoadingVariant = "page" | "panel" | "compact";

export function BrandedLoadingState({
  label = "Carregando",
  detail = "Sincronizando dados com segurança",
  variant = "panel",
  className,
  minHeight,
}: {
  label?: string;
  detail?: string;
  variant?: BrandedLoadingVariant;
  className?: string;
  minHeight?: number | string;
}) {
  const compact = variant === "compact";
  const page = variant === "page";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn(
        "aa-brand-loading relative isolate flex w-full items-center justify-center overflow-hidden",
        page && "min-h-[58vh]",
        variant === "panel" && "min-h-[220px] rounded-[24px] border border-white/[0.07] bg-white/[0.018]",
        compact && "min-h-[112px] rounded-2xl border border-white/[0.06] bg-white/[0.015]",
        className,
      )}
      style={minHeight ? ({ minHeight } as CSSProperties) : undefined}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(14,165,233,.10), transparent 24rem), radial-gradient(circle at 50% 52%, rgba(255,255,255,.028), transparent 17rem)",
        }}
      />

      <div className={cn("relative flex flex-col items-center text-center", compact ? "gap-2.5 px-5 py-5" : "gap-4 px-6 py-8")}>
        <div className={cn("relative grid place-items-center", compact ? "h-[58px] w-[132px]" : "h-[92px] w-[210px]")}>
          <span
            aria-hidden
            className="aa-brand-loader-halo absolute left-1/2 top-1/2 h-16 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/[0.09] blur-2xl"
          />
          <img
            src="/apontauto-logo.png"
            alt=""
            width={420}
            height={250}
            loading="eager"
            decoding="async"
            className={cn(
              "aa-brand-loader-logo relative z-10 h-auto object-contain drop-shadow-[0_8px_28px_rgba(0,174,239,.12)]",
              compact ? "w-[124px]" : "w-[196px]",
            )}
          />
        </div>

        <div className={cn("space-y-1", compact ? "max-w-[270px]" : "max-w-sm")}>
          <p className={cn("font-semibold tracking-[-0.01em] text-foreground", compact ? "text-xs" : "text-sm")}>
            {label}
          </p>
          {detail && (
            <p className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
              {detail}
            </p>
          )}
        </div>

        <div className={cn("w-full", compact ? "max-w-[150px]" : "max-w-[220px]")}>
          <div className="relative h-[2px] overflow-hidden rounded-full bg-white/[0.07]">
            <span className="aa-brand-loader-scan absolute inset-y-0 left-0 w-[38%] rounded-full bg-gradient-to-r from-transparent via-sky-300/80 to-transparent shadow-[0_0_10px_rgba(56,189,248,.28)]" />
          </div>
          {!compact && (
            <div className="mt-2.5 flex items-center justify-center gap-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
              <span className="aa-brand-loader-dot h-1 w-1 rounded-full bg-sky-300/80" />
              <span>APONT AUTO</span>
              <span className="h-0.5 w-0.5 rounded-full bg-white/20" />
              <span>PCM</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
