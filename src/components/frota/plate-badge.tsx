import { memo } from "react";

import { cn } from "@/lib/utils";
import { formatPlate } from "@/lib/frota/plate";

/**
 * Plaquinha no padrão Mercosul (faixa azul superior + placa em fonte mono).
 * Usada para identificar visualmente o veículo em cards e seletores.
 */
export const PlateBadge = memo(function PlateBadge({
  plate,
  size = "md",
  className,
}: {
  plate?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const text = formatPlate(plate ?? "") || "SEM PLACA";
  const sm = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex flex-col overflow-hidden rounded-[4px] border border-slate-400/70 bg-white shadow-sm",
        sm ? "w-[62px]" : "w-[78px]",
        className,
      )}
      title={text}
    >
      <span
        className={cn(
          "flex items-center justify-between bg-[#0d3b9c] px-1 font-semibold text-white",
          sm ? "text-[5px] leading-[8px]" : "text-[6px] leading-[10px]",
        )}
      >
        <span className="tracking-tight">BR</span>
        <span className="tracking-[0.08em]">MERCOSUL</span>
      </span>
      <span
        className={cn(
          "block text-center font-mono font-bold tracking-[0.12em] text-slate-900",
          sm ? "py-[1px] text-[9px]" : "py-[2px] text-[11px]",
        )}
      >
        {text}
      </span>
    </span>
  );
});
