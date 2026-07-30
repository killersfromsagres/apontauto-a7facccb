import { memo } from "react";

import { cn } from "@/lib/utils";
import fiatLogo from "@/assets/fiat-logo.png";
import vwLogo from "@/assets/vw-logo.png";

export type CarBrand = "fiat" | "vw" | "generic";

/** Deduz a marca a partir de marca/modelo do veículo. */
export function inferBrand(text?: string | null): CarBrand {
  const t = (text ?? "").toLowerCase();
  if (/\b(fiat|fiorino|strada|uno|toro|argo|mobi|ducato|doblo)\b/.test(t)) return "fiat";
  if (/\b(vw|volks|volkswagen|saveiro|gol|amarok|kombi|delivery|voyage)\b/.test(t)) return "vw";
  return "generic";
}

/**
 * Miniatura da logo da montadora — apenas para reforçar a identificação
 * visual do veículo nos cards e seletores.
 */
export const BrandMark = memo(function BrandMark({
  brand,
  className,
}: {
  brand: CarBrand;
  className?: string;
}) {
  if (brand === "generic") return null;
  const src = brand === "fiat" ? fiatLogo.url : vwLogo.url;
  const label = brand === "fiat" ? "Fiat" : "Volkswagen";

  return (
    <img
      src={src}
      alt={label}
      title={label}
      loading="lazy"
      className={cn("h-3.5 w-3.5 shrink-0 object-contain", className)}
    />
  );
});
