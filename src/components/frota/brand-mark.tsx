import { memo } from "react";

import { cn } from "@/lib/utils";

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
  if (brand === "vw") {
    return (
      <svg viewBox="0 0 32 32" className={cn("h-5 w-5", className)} role="img" aria-label="Volkswagen">
        <circle cx="16" cy="16" r="14.5" fill="#0a1e3c" stroke="#c9d4e4" strokeWidth="1.6" />
        <g fill="none" stroke="#f2f6fb" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
          <path d="M8 9.5l4.4 12.8L16 12.6l3.6 9.7L24 9.5" />
        </g>
      </svg>
    );
  }
  if (brand === "fiat") {
    return (
      <svg viewBox="0 0 46 20" className={cn("h-5 w-auto", className)} role="img" aria-label="Fiat">
        <rect x="0.7" y="0.7" width="44.6" height="18.6" rx="3.2" fill="#8f1421" stroke="#e2c3c7" strokeWidth="1.2" />
        <text
          x="23"
          y="14.4"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="11"
          fontWeight="700"
          letterSpacing="2"
          fill="#ffffff"
        >
          FIAT
        </text>
      </svg>
    );
  }
  return null;
});
