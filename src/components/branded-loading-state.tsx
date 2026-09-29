import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type BrandedLoadingVariant = "page" | "panel" | "compact";

type BrandedLoadingStateProps = {
  label?: string;
  detail?: string;
  variant?: BrandedLoadingVariant;
  className?: string;
  minHeight?: number | string;
};

export function BrandedLoadingState({
  label = "Carregando Apont Auto",
  variant = "panel",
  className,
  minHeight,
}: BrandedLoadingStateProps) {
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
        page && "min-h-[52vh]",
        variant === "panel" && "min-h-[190px]",
        compact && "min-h-[108px]",
        className,
      )}
      style={minHeight ? ({ minHeight } as CSSProperties) : undefined}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(0,174,239,.06), transparent 18rem)",
        }}
      />

      <div
        className={cn(
          "relative grid place-items-center",
          compact ? "h-[92px] w-[150px]" : page ? "h-[270px] w-[300px]" : "h-[190px] w-[230px]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "aa-brand-loader-halo absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/[0.07] blur-3xl",
            compact ? "h-16 w-28" : page ? "h-48 w-48" : "h-32 w-40",
          )}
        />
        {!compact && (
          <span
            aria-hidden
            className={cn(
              "aa-brand-loader-ring absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
              page ? "h-[238px] w-[238px]" : "h-[168px] w-[168px]",
            )}
          />
        )}
        <img
          src="/apontauto-logo.png"
          alt=""
          width={1000}
          height={1000}
          loading="eager"
          decoding="async"
          className={cn(
            "aa-brand-loader-logo relative z-10 h-auto object-contain",
            compact ? "w-[122px]" : page ? "w-[230px]" : "w-[168px]",
          )}
        />
      </div>
    </div>
  );
}
