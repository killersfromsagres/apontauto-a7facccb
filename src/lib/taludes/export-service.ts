import type { Point } from "./api";

interface ExportOptions {
  imageUrl: string;
  imageSize: { width: number; height: number };
  polygons: Array<{
    points: Point[];
    color: string;
    opacity: number;
    label: string;
  }>;
  format?: "png" | "jpeg";
}

export async function exportPixelPerfectMap(options: ExportOptions): Promise<Blob> {
  const { imageUrl, imageSize, polygons, format = "png" } = options;

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = imageSize.width;
  canvas.height = imageSize.height;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Could not get canvas context");

  // 1. Load and draw the original image
  const img = await loadImage(imageUrl);
  ctx.drawImage(img, 0, 0, imageSize.width, imageSize.height);

  // 2. Draw all polygons
  polygons.forEach((poly) => {
    if (poly.points.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);
    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(poly.points[i].x, poly.points[i].y);
    }
    ctx.closePath();

    // Fill
    ctx.fillStyle = hexToRgba(poly.color, poly.opacity);
    ctx.fill();

    // Stroke
    ctx.strokeStyle = poly.color;
    ctx.lineWidth = Math.max(2, imageSize.width / 1000); // Scale stroke based on resolution
    ctx.stroke();

    // Optional: Label
    if (poly.label) {
      drawLabel(ctx, poly.points, poly.label, imageSize.width);
    }
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      },
      `image/${format}`,
      0.95
    );
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function drawLabel(ctx: CanvasRenderingContext2D, points: Point[], label: string, imgWidth: number) {
  // Find centroid
  let cx = 0, cy = 0;
  points.forEach(p => { cx += p.x; cy += p.y; });
  cx /= points.length;
  cy /= points.length;

  const fontSize = Math.max(12, imgWidth / 100);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = fontSize / 4;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  ctx.strokeText(label, cx, cy);
  ctx.fillText(label, cx, cy);
}
