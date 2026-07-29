import { memo } from "react";

import { cn } from "@/lib/utils";
import { inferBodyType, type BodyType } from "@/components/frota/vehicle-thumb";

import hatch from "@/assets/frota/hatch.png";
import sedan from "@/assets/frota/sedan.png";
import suv from "@/assets/frota/suv.png";
import pickup from "@/assets/frota/pickup.png";
import van from "@/assets/frota/van.png";
import truck from "@/assets/frota/truck.png";
import moto from "@/assets/frota/moto.png";

const PHOTO: Record<BodyType, string> = { hatch, sedan, suv, pickup, van, truck, moto };

import saveiroAsset from "@/assets/frota/saveiro.png.asset.json";
import fiorinoAsset from "@/assets/frota/fiorino.png.asset.json";

/** Fotos reais da frota — têm prioridade sobre a silhueta genérica. */
const MODEL_PHOTO: [RegExp, string][] = [
  [/saveiro/i, saveiroAsset.url],
  [/fiorino/i, fiorinoAsset.url],
];

function realPhotoFor(text: string): string | undefined {
  for (const [re, url] of MODEL_PHOTO) if (re.test(text)) return url;
  return undefined;
}

/** Ajuste sutil de matiz para aproximar a miniatura da cor cadastrada. */
const TINT: [RegExp, string][] = [
  [/pret|black/i, "brightness(.45) saturate(.4)"],
  [/cinza|grafite|chumbo/i, "brightness(.72) saturate(.5)"],
  [/prata|silver/i, "brightness(.92) saturate(.6)"],
  [/verm|red/i, "sepia(.8) saturate(6) hue-rotate(-32deg) brightness(.95)"],
  [/azul|blue/i, "sepia(.7) saturate(5) hue-rotate(175deg) brightness(.95)"],
  [/verde|green/i, "sepia(.7) saturate(4) hue-rotate(75deg) brightness(.95)"],
  [/amarel|yellow/i, "sepia(.8) saturate(5) hue-rotate(5deg) brightness(1.05)"],
  [/laranja|orange/i, "sepia(.8) saturate(6) hue-rotate(-15deg)"],
  [/marrom|bege|dourad/i, "sepia(.6) saturate(2) hue-rotate(-10deg) brightness(.85)"],
];

function tintFor(color?: string | null): string | undefined {
  if (!color) return undefined;
  for (const [re, filter] of TINT) if (re.test(color)) return filter;
  return undefined;
}

/** Miniatura fotorrealista do veículo, escolhida pela silhueta (tipo de carroceria). */
export const VehiclePhoto = memo(function VehiclePhoto({
  brand,
  model,
  version,
  color,
  title,
  className,
}: {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  color?: string | null;
  title?: string;
  className?: string;
}) {
  const type = inferBodyType({ brand, model, version });
  const real = realPhotoFor(`${brand ?? ""} ${model ?? ""} ${version ?? ""}`);

  return (
    <img
      src={real ?? PHOTO[type]}
      alt={title ?? "Miniatura do veículo"}
      loading="lazy"
      decoding="async"
      width={512}
      height={344}
      style={real ? undefined : { filter: tintFor(color) }}
      className={cn("h-full w-full object-contain", className)}
    />
  );
});
