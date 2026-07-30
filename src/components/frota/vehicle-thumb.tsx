import { memo } from "react";

export type BodyType = "hatch" | "sedan" | "suv" | "pickup" | "van" | "truck" | "moto";

const KEYWORDS: [BodyType, RegExp][] = [
  ["moto", /\b(moto|cg |factor|biz|xre|titan|scooter)\b/i],
  ["truck", /\b(caminh|truck|vuc|3\/4|toco|hr\b|accelo|atego|delivery)\b/i],
  ["van", /\b(van|kombi|ducato|sprinter|master|daily|jumper|boxer|transit|doblo)\b/i],
  [
    "pickup",
    /\b(pick[- ]?up|saveiro|strada|montana|toro|hilux|s10|ranger|amarok|frontier|oroch|courier)\b/i,
  ],
  [
    "suv",
    /\b(suv|duster|ecosport|tracker|kicks|creta|renegade|compass|hr[- ]?v|tcross|t[- ]cross|pulse|territory)\b/i,
  ],
  [
    "sedan",
    /\b(sedan|voyage|siena|prisma|virtus|versa|logan|cronos|grand siena|corolla|civic|onix plus)\b/i,
  ],
  ["hatch", /\b(hatch|gol|uno|palio|onix|hb20|argo|mobi|ka\b|sandero|march|fox|up!?)\b/i],
];

/** Deduz a silhueta do veículo a partir de marca/modelo/versão. */
export function inferBodyType(v: {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
}): BodyType {
  const text = `${v.brand ?? ""} ${v.model ?? ""} ${v.version ?? ""}`;
  for (const [type, re] of KEYWORDS) if (re.test(text)) return type;
  return "hatch";
}

const COLOR_MAP: [RegExp, string][] = [
  [/branc/i, "#e8edf2"],
  [/prata|silver|cinza claro/i, "#c3ccd6"],
  [/cinza|grafite|chumbo/i, "#6b7480"],
  [/pret|black/i, "#232830"],
  [/verm|red/i, "#d93b3b"],
  [/azul|blue/i, "#2f6fd0"],
  [/verde|green/i, "#2f9e6b"],
  [/amarel|yellow/i, "#e3b325"],
  [/laranja|orange/i, "#e0762a"],
  [/marrom|bege|dourad/i, "#a5865c"],
];

export function vehicleColorHex(color?: string | null): string {
  if (color) for (const [re, hex] of COLOR_MAP) if (re.test(color)) return hex;
  return "#8fa3bb";
}

/** Traçados laterais (viewBox 0 0 200 88). */
const BODY: Record<BodyType, { body: string; glass: string; wheels: number[]; r: number }> = {
  hatch: {
    body: "M14 62c-3-1-5-4-5-8l1-9c1-5 5-8 10-9l17-3 16-14c3-3 7-4 11-4h37c5 0 9 2 12 5l14 13 26 5c8 2 13 7 13 14 0 5-3 8-8 9H14z",
    glass: "M58 27h27v16H45zM92 27h20c3 0 5 1 7 3l11 13H92z",
    wheels: [52, 148],
    r: 15,
  },
  sedan: {
    body: "M12 62c-3-1-5-4-5-8l1-9c1-5 4-8 9-9l22-4 16-13c3-3 7-4 11-4h44c5 0 9 2 12 5l14 12 33 6c8 2 13 7 13 13 0 5-3 8-8 8H12z",
    glass: "M60 28h28v16H47zM95 28h22c3 0 5 1 7 3l11 13H95z",
    wheels: [50, 152],
    r: 15,
  },
  suv: {
    body: "M12 60c-3-1-5-4-5-8V38c0-6 4-10 10-11l20-3 16-15c3-3 7-4 11-4h48c5 0 9 2 12 5l16 15 31 5c8 1 13 6 13 13v9c0 4-3 8-8 8H12z",
    glass: "M60 20h28v20H46zM95 20h23c3 0 5 1 7 3l14 17H95z",
    wheels: [52, 150],
    r: 17,
  },
  pickup: {
    body: "M12 60c-3-1-5-4-5-8V40c0-6 4-10 10-11l18-3 15-14c3-3 7-4 11-4h34c5 0 9 2 11 5l13 15h10v-6h50c5 0 8 3 8 8v22c0 4-3 8-8 8H12z",
    glass: "M58 22h26v20H45zM91 22h18c3 0 5 1 7 3l12 17H91z",
    wheels: [52, 156],
    r: 17,
  },
  van: {
    body: "M10 60c-3-1-5-4-5-8V26c0-7 5-12 12-12h120c6 0 11 2 15 7l25 30c3 4 4 6 4 9 0 4-3 8-8 8H10z",
    glass: "M22 24h44v22H22zM74 24h44v22H74zM126 24h14c2 0 4 1 6 3l14 19h-34z",
    wheels: [48, 156],
    r: 16,
  },
  truck: {
    body: "M8 60c-2-1-4-4-4-8V22c0-6 4-10 10-10h44c5 0 9 3 12 7l14 21h100c5 0 9 4 9 9v11c0 4-3 8-8 8H8z",
    glass: "M20 20h34v20H20z",
    wheels: [44, 150, 178],
    r: 15,
  },
  moto: {
    body: "M40 58c-8 0-14-6-14-14s6-14 14-14h18l14-14h26l8 10h22l10 18h14c8 0 14 6 14 14s-6 14-14 14H40z",
    glass: "M96 24h20l6 8H96z",
    wheels: [44, 156],
    r: 18,
  },
};

/**
 * Miniatura vetorial realista do veículo — leve, offline e sem depender de
 * modelo 3D ou foto externa.
 */
export const VehicleThumb = memo(function VehicleThumb({
  brand,
  model,
  version,
  color,
  className,
  title,
}: {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  color?: string | null;
  className?: string;
  title?: string;
}) {
  const type = inferBodyType({ brand, model, version });
  const paint = vehicleColorHex(color);
  const shape = BODY[type];
  const uid = `${type}-${paint.replace("#", "")}`;

  return (
    <svg
      viewBox="0 0 200 88"
      className={className}
      role="img"
      aria-label={title ?? "Miniatura do veículo"}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`paint-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="38%" stopColor={paint} />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dff1ff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#4a6a86" stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id={`shadow-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="80" rx="86" ry="7" fill={`url(#shadow-${uid})`} />

      <g>
        <path
          d={shape.body}
          fill={`url(#paint-${uid})`}
          stroke="rgba(0,0,0,.35)"
          strokeWidth="1.5"
        />
        <path d={shape.glass} fill={`url(#glass-${uid})`} opacity="0.92" />
        {/* brilho superior */}
        <path d={shape.body} fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
        {/* faróis */}
        <rect x="186" y="46" width="9" height="7" rx="3" fill="#ffeeb0" opacity="0.9" />
        <rect x="6" y="46" width="8" height="6" rx="3" fill="#ff8a7a" opacity="0.85" />
      </g>

      {shape.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={66} r={shape.r} fill="#14181f" />
          <circle cx={cx} cy={66} r={shape.r - 5} fill="#9aa6b5" />
          <circle cx={cx} cy={66} r={shape.r - 9} fill="#4d5763" />
        </g>
      ))}
    </svg>
  );
});
