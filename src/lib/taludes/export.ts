export type TaludeStatus = "programado" | "em_execucao" | "finalizado";

export const STATUS_META: Record<
  TaludeStatus,
  { label: string; fill: string; stroke: string; text: string }
> = {
  programado: { label: "Programado", fill: "#2563eb", stroke: "#1d4ed8", text: "#ffffff" },
  em_execucao: { label: "Em Execução", fill: "#f59e0b", stroke: "#b45309", text: "#111827" },
  finalizado: { label: "Finalizado", fill: "#16a34a", stroke: "#15803d", text: "#ffffff" },
};

interface ExportTalude {
  numero: number;
  nome: string | null;
  status: TaludeStatus;
  polygon: Array<{ x: number; y: number }>;
  data_programada: string | null;
  data_execucao: string | null;
  data_conclusao: string | null;
  proxima_data: string | null;
}

function fmtBr(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function centroid(pts: Array<{ x: number; y: number }>) {
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

export async function exportMapPNG(opts: {
  imageUrl: string;
  mapName: string;
  taludes: ExportTalude[];
}): Promise<Blob> {
  const img = await loadImage(opts.imageUrl);
  const HEADER_H = 90;
  const FOOTER_H = 130;
  const scale = Math.min(1, 2000 / Math.max(img.width, 1));
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H + HEADER_H + FOOTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");

  // background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // header
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, HEADER_H);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`Programação de Taludes — ${opts.mapName}`, 24, HEADER_H / 2 - 10);
  ctx.font = "14px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    24,
    HEADER_H / 2 + 18,
  );

  // map
  ctx.drawImage(img, 0, HEADER_H, W, H);

  // polygons
  for (const t of opts.taludes) {
    if (t.polygon.length < 3) continue;
    const meta = STATUS_META[t.status];
    ctx.beginPath();
    for (let i = 0; i < t.polygon.length; i++) {
      const p = t.polygon[i];
      const px = (p.x / 100) * W;
      const py = HEADER_H + (p.y / 100) * H;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = meta.fill + "66"; // ~40% alpha
    ctx.fill();
    ctx.strokeStyle = meta.stroke;
    ctx.lineWidth = 3;
    ctx.stroke();

    const c = centroid(t.polygon);
    const cx = (c.x / 100) * W;
    const cy = HEADER_H + (c.y / 100) * H;
    const label = `T${String(t.numero).padStart(2, "0")}`;
    const dateStr =
      t.status === "finalizado"
        ? `Próx: ${fmtBr(t.proxima_data)}`
        : t.status === "em_execucao"
          ? `Exec: ${fmtBr(t.data_execucao)}`
          : `Prog: ${fmtBr(t.data_programada)}`;

    ctx.font = "bold 20px system-ui, sans-serif";
    const m1 = ctx.measureText(label);
    ctx.font = "12px system-ui, sans-serif";
    const m2 = ctx.measureText(dateStr);
    const boxW = Math.max(m1.width, m2.width) + 16;
    const boxH = 46;
    ctx.fillStyle = meta.fill;
    roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = meta.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = meta.text;
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, cx, cy - 6);
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(dateStr, cx, cy + 12);
    ctx.textAlign = "start";
  }

  // footer / legend
  const fy = HEADER_H + H;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, fy, canvas.width, FOOTER_H);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("Legenda de status", 24, fy + 18);

  const entries: TaludeStatus[] = ["programado", "em_execucao", "finalizado"];
  let lx = 24;
  const ly = fy + 50;
  ctx.font = "14px system-ui, sans-serif";
  for (const st of entries) {
    const meta = STATUS_META[st];
    ctx.fillStyle = meta.fill;
    roundRect(ctx, lx, ly, 22, 22, 4);
    ctx.fill();
    ctx.strokeStyle = meta.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.fillText(meta.label, lx + 32, ly + 4);
    lx += 220;
  }

  // summary counts
  const counts = { programado: 0, em_execucao: 0, finalizado: 0 };
  for (const t of opts.taludes) counts[t.status]++;
  ctx.fillStyle = "#475569";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(
    `Total: ${opts.taludes.length}  ·  Programados: ${counts.programado}  ·  Em execução: ${counts.em_execucao}  ·  Finalizados: ${counts.finalizado}`,
    24,
    fy + 92,
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG"))),
      "image/png",
      0.95,
    );
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem do mapa"));
    img.src = src;
  });
}
