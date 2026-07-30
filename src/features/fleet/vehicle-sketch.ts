/**
 * Desenho técnico do veículo em estilo lápis (traço a mão livre, hachuras).
 * Tudo é vetorial em canvas — nenhum arquivo externo, funciona offline
 * e sai nítido no PDF do certificado.
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

type Pt = [number, number];

const rand = (seedRef: { s: number }) => {
  // ruído determinístico para o traço tremido do lápis
  seedRef.s = (seedRef.s * 16807) % 2147483647;
  return seedRef.s / 2147483647 - 0.5;
};

function sketchLine(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  seed: { s: number },
  passes = 2,
  jitter = 1.6,
) {
  for (let p = 0; p < passes; p++) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = x + rand(seed) * jitter * 2;
      const jy = y + rand(seed) * jitter * 2;
      if (i === 0) ctx.moveTo(jx, jy);
      else ctx.lineTo(jx, jy);
    });
    ctx.stroke();
  }
}

function hatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  step = 7,
  alpha = 0.16,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.1;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

function wheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: { s: number }) {
  ctx.lineWidth = 2.4;
  for (let p = 0; p < 2; p++) {
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.18) {
      const rr = r + rand(seed) * 1.6;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.25;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  ctx.restore();
}

/** Perfil lateral do veículo, em coordenadas de um canvas 900x420. */
function bodyPath(kind: SketchKind): { outline: Pt[]; glass: Pt[][]; wheels: [number, number, number][] } {
  const ground = 320;
  if (kind === "van") {
    return {
      outline: [
        [90, ground],
        [90, 180],
        [140, 132],
        [300, 120],
        [320, 108],
        [770, 108],
        [800, 140],
        [810, ground],
        [90, ground],
      ],
      glass: [
        [
          [150, 176],
          [178, 142],
          [280, 136],
          [280, 176],
          [150, 176],
        ],
        [
          [296, 136],
          [420, 132],
          [420, 176],
          [296, 176],
        ],
      ],
      wheels: [
        [210, ground, 46],
        [700, ground, 46],
      ],
    };
  }
  if (kind === "pickup") {
    return {
      outline: [
        [80, ground],
        [80, 214],
        [150, 205],
        [250, 140],
        [470, 136],
        [520, 208],
        [560, 205],
        [560, 160],
        [830, 160],
        [830, ground],
        [80, ground],
      ],
      glass: [
        [
          [262, 152],
          [352, 148],
          [352, 200],
          [232, 200],
        ],
        [
          [368, 148],
          [460, 150],
          [500, 200],
          [368, 200],
        ],
      ],
      wheels: [
        [200, ground, 48],
        [700, ground, 48],
      ],
    };
  }
  if (kind === "truck") {
    return {
      outline: [
        [80, ground],
        [80, 200],
        [130, 130],
        [250, 120],
        [270, 100],
        [280, 100],
        [280, 70],
        [840, 70],
        [840, ground],
        [80, ground],
      ],
      glass: [
        [
          [140, 190],
          [166, 138],
          [252, 132],
          [252, 190],
        ],
      ],
      wheels: [
        [190, ground, 50],
        [660, ground, 50],
        [760, ground, 50],
      ],
    };
  }
  return {
    outline: [
      [90, ground],
      [96, 240],
      [180, 226],
      [280, 158],
      [560, 152],
      [700, 226],
      [808, 238],
      [812, ground],
      [90, ground],
    ],
    glass: [
      [
        [292, 170],
        [400, 165],
        [400, 220],
        [258, 220],
      ],
      [
        [416, 165],
        [548, 168],
        [640, 220],
        [416, 220],
      ],
    ],
    wheels: [
      [220, ground, 46],
      [690, ground, 46],
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
  const scale = opts.scale ?? 2;
  const W = 900;
  const H = 420;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);

  // papel
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const seed = { s: 987654321 };
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const { outline, glass, wheels } = bodyPath(kind);

  // sombra hachurada sob o veículo
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const y = 326 + i * 1.6;
    ctx.beginPath();
    ctx.moveTo(120 + i * 3, y);
    ctx.lineTo(800 - i * 3, y);
    ctx.stroke();
  }
  ctx.restore();

  // corpo
  ctx.lineWidth = 2.6;
  sketchLine(ctx, outline, seed, 2, 1.5);

  // hachura de volume na parte inferior
  ctx.strokeStyle = "#555";
  hatch(ctx, 100, 250, 700, 70, 8, 0.12);

  // vidros
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 1.8;
  glass.forEach((g) => {
    sketchLine(ctx, [...g, g[0]], seed, 1, 1.1);
    const xs = g.map((p) => p[0]);
    const ys = g.map((p) => p[1]);
    hatch(
      ctx,
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      6,
      0.2,
    );
  });

  // rodas
  wheels.forEach(([cx, cy, r]) => wheel(ctx, cx, cy, r, seed));

  // detalhes: faróis e maçanetas
  ctx.lineWidth = 1.6;
  sketchLine(
    ctx,
    [
      [92, 236],
      [126, 232],
      [126, 252],
      [92, 254],
    ],
    seed,
    1,
    1,
  );

  // legenda técnica
  if (opts.label) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "#3a3a3a";
    ctx.font = "italic 20px Georgia, serif";
    ctx.fillText(opts.label, 90, 380);
    ctx.globalAlpha = 1;
  }

  return canvas.toDataURL("image/png");
}
