/**
 * Desenho técnico vetorial do veículo — traço limpo, estilo "line art" de
 * manual de inspeção (referência: Saveiro / Fiorino). Gerado em canvas,
 * sem arquivos externos, e exportado em PNG de alta resolução para o PDF.
 */

export type SketchKind = "van" | "pickup" | "hatch" | "truck";

/** Descobre o tipo pelo texto do modelo (Fiorino, Saveiro, Strada...). */
export function inferSketchKind(text: string): SketchKind {
  const t = (text || "").toLowerCase();
  if (/(fiorino|kangoo|partner|doblo|doblò|express|van|ducato|master|sprinter|transit)/.test(t))
    return "van";
  if (/(saveiro|strada|montana|hilux|s10|ranger|toro|oroch|pickup|picape)/.test(t)) return "pickup";
  if (/(caminh|truck|vuc|3\/4|delivery|accelo|cargo)/.test(t)) return "truck";
  return "hatch";
}

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

const INK = "#1b1f27";

function path(ctx: Ctx, pts: (Pt | ["q", number, number, number, number])[], close = false) {
  ctx.beginPath();
  let started = false;
  for (const p of pts) {
    if (p[0] === "q") {
      const [, cx, cy, x, y] = p as ["q", number, number, number, number];
      ctx.quadraticCurveTo(cx, cy, x, y);
      continue;
    }
    const [x, y] = p as Pt;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
}

function stroke(ctx: Ctx, w = 3) {
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Roda com pneu, aro e raios. */
function wheel(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  stroke(ctx, 3);

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
  stroke(ctx, 2.2);

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
  stroke(ctx, 2);

  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "#5c6371";
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.15;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.24, cy + Math.sin(a) * r * 0.24);
    ctx.lineTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
    ctx.stroke();
  }
}

/** Sombra suave no chão. */
function ground(ctx: Ctx, cx: number, y: number, w: number) {
  ctx.save();
  ctx.fillStyle = "rgba(27,31,39,0.10)";
  ctx.beginPath();
  ctx.ellipse(cx, y + 10, w / 2, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

type Side = {
  body: (Pt | ["q", number, number, number, number])[];
  glass: (Pt | ["q", number, number, number, number])[][];
  details: Pt[][];
  wheels: [number, number, number][];
};

/** Perfil lateral em coordenadas de um canvas 1180x440. */
function sideProfile(kind: SketchKind): Side {
  const g = 344; // linha inferior da carroceria

  if (kind === "van") {
    // Fiorino: cabine curta, furgão alto e reto.
    return {
      body: [
        [64, g],
        [58, 300],
        ["q", 56, 282, 78, 274],
        [150, 258],
        ["q", 168, 254, 180, 240],
        [232, 172],
        ["q", 240, 162, 258, 162],
        [742, 162],
        ["q", 762, 162, 766, 178],
        [772, 236],
        [774, g],
      ],
      glass: [
        [
          [246, 182],
          ["q", 252, 176, 264, 176],
          [318, 176],
          [318, 250],
          [206, 250],
          ["q", 206, 240, 216, 226],
        ],
        [
          [334, 176],
          [430, 176],
          [430, 250],
          [334, 250],
        ],
      ],
      details: [
        [
          [446, 168],
          [446, g],
        ], // divisão cabine / furgão
        [
          [446, 258],
          [762, 258],
        ], // friso lateral
        [
          [64, 300],
          [130, 292],
        ], // capô
        [
          [336, 262],
          [364, 262],
        ], // maçaneta
        [
          [64, 314],
          [64, 336],
        ], // farol
      ],
      wheels: [
        [176, g, 54],
        [664, g, 54],
      ],
    };
  }

  if (kind === "truck") {
    return {
      body: [
        [64, g],
        [58, 292],
        ["q", 56, 268, 84, 258],
        [176, 244],
        [232, 150],
        ["q", 240, 138, 262, 138],
        [300, 138],
        [300, 104],
        [830, 104],
        [830, g],
      ],
      glass: [
        [
          [250, 158],
          ["q", 256, 150, 272, 150],
          [292, 150],
          [292, 234],
          [204, 234],
        ],
      ],
      details: [
        [
          [300, 138],
          [300, g],
        ],
        [
          [312, 130],
          [820, 130],
        ],
        [
          [312, 300],
          [820, 300],
        ],
      ],
      wheels: [
        [178, g, 56],
        [618, g, 56],
        [726, g, 56],
      ],
    };
  }

  if (kind === "pickup") {
    // Saveiro: cabine baixa + caçamba longa.
    return {
      body: [
        [66, g],
        [58, 296],
        ["q", 56, 280, 76, 272],
        [206, 254],
        ["q", 222, 250, 236, 236],
        [300, 186],
        ["q", 312, 178, 330, 178],
        [452, 178],
        ["q", 470, 178, 478, 190],
        [516, 244],
        [536, 244],
        [536, 232],
        [806, 232],
        [812, 252],
        [814, g],
      ],
      glass: [
        [
          [318, 196],
          ["q", 324, 190, 338, 190],
          [392, 190],
          [392, 248],
          [268, 248],
          ["q", 274, 236, 292, 220],
        ],
        [
          [408, 190],
          [448, 190],
          ["q", 458, 190, 464, 200],
          [494, 248],
          [408, 248],
        ],
      ],
      details: [
        [
          [536, 250],
          [806, 250],
        ], // borda da caçamba
        [
          [536, 300],
          [806, 300],
        ], // friso da caçamba
        [
          [400, 258],
          [430, 258],
        ], // maçaneta
        [
          [66, 292],
          [140, 284],
        ], // capô
        [
          [62, 300],
          [62, 324],
        ], // farol
        [
          [58, 330],
          [120, 330],
        ], // parachoque
      ],
      wheels: [
        [186, g, 54],
        [672, g, 54],
      ],
    };
  }

  // hatch
  return {
    body: [
      [72, g],
      [62, 292],
      ["q", 60, 274, 84, 268],
      [214, 250],
      ["q", 232, 246, 244, 232],
      [316, 176],
      ["q", 330, 166, 352, 166],
      [560, 166],
      ["q", 586, 166, 600, 180],
      [700, 254],
      ["q", 726, 260, 762, 266],
      ["q", 794, 272, 796, 296],
      [798, g],
    ],
    glass: [
      [
        [334, 184],
        ["q", 340, 178, 354, 178],
        [430, 178],
        [430, 244],
        [278, 244],
        ["q", 288, 230, 310, 208],
      ],
      [
        [446, 178],
        [552, 178],
        ["q", 572, 178, 584, 190],
        [648, 244],
        [446, 244],
      ],
    ],
    details: [
      [
        [438, 172],
        [438, 300],
      ],
      [
        [438, 258],
        [468, 258],
      ],
      [
        [72, 288],
        [150, 280],
      ],
      [
        [66, 296],
        [66, 320],
      ],
    ],
    wheels: [
      [196, g, 54],
      [672, g, 54],
    ],
  };
}

/**
 * Gera o desenho em PNG (dataURL) pronto para o PDF.
 * `scale` aumenta a resolução mantendo o traço proporcional.
 */
export function renderVehicleSketch(
  kind: SketchKind,
  opts: { label?: string; scale?: number } = {},
): string {
  const scale = opts.scale ?? 3;
  const W = 1180;
  const H = 440;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const { body, glass, details, wheels } = sideProfile(kind);

  ground(ctx, 440, 344, 780);

  // carroceria
  ctx.fillStyle = "#ffffff";
  path(ctx, body, true);
  ctx.fill();
  stroke(ctx, 3.2);

  // vidros
  glass.forEach((gl) => {
    path(ctx, gl, true);
    ctx.fillStyle = "#eef2f7";
    ctx.fill();
    stroke(ctx, 2.2);
  });

  // detalhes
  details.forEach((d) => {
    path(ctx, d);
    stroke(ctx, 1.8);
  });

  // arcos das rodas + rodas
  wheels.forEach(([cx, cy, r]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 9, Math.PI, Math.PI * 2);
    stroke(ctx, 2.4);
    wheel(ctx, cx, cy, r);
  });

  // linha de solo
  ctx.beginPath();
  ctx.moveTo(48, 402);
  ctx.lineTo(W - 48, 402);
  ctx.strokeStyle = "#c3c9d4";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  if (opts.label) {
    ctx.fillStyle = "#5c6371";
    ctx.font = "500 21px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.label, W / 2, 428);
    ctx.textAlign = "left";
  }

  return canvas.toDataURL("image/png");
}
