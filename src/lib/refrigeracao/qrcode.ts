import QRCode from "qrcode";

export type AtivoQrInput = {
  ativo?: string | null;
  equipamento?: string | null;
  patrimonio?: string | null;
};

/**
 * URL pública (autenticada) para o histórico do ativo escaneado.
 * Aponta para /ativo-historico que filtra refrigeracao_os pelos identificadores.
 */
export function buildAtivoHistoricoUrl(input: AtivoQrInput, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const p = new URLSearchParams();
  if (input.ativo) p.set("ativo", String(input.ativo).trim());
  if (input.equipamento) p.set("equipamento", String(input.equipamento).trim());
  if (input.patrimonio) p.set("patrimonio", String(input.patrimonio).trim());
  return `${base}/ativo-historico?${p.toString()}`;
}

export async function generateAtivoQrPng(input: AtivoQrInput, opts?: { size?: number }): Promise<string> {
  const url = buildAtivoHistoricoUrl(input);
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: opts?.size ?? 512,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

export function printAtivoQr(dataUrl: string, input: AtivoQrInput) {
  const win = window.open("", "_blank", "width=600,height=800");
  if (!win) return;
  const line = (label: string, value?: string | null) =>
    value ? `<div><b>${label}:</b> ${escapeHtml(value)}</div>` : "";
  win.document.write(`
    <html><head><title>QR — ${escapeHtml(input.ativo || input.patrimonio || "Ativo")}</title>
    <style>
      body{font-family:system-ui;text-align:center;padding:24px;color:#0f172a}
      img{max-width:360px}
      .info{margin-top:16px;font-size:14px;line-height:1.4}
      h1{font-size:16px;margin:0 0 12px}
    </style></head><body>
    <h1>Escaneie para ver o histórico de refrigeração</h1>
    <img src="${dataUrl}" />
    <div class="info">
      ${line("Ativo", input.ativo)}
      ${line("Equipamento", input.equipamento)}
      ${line("Patrimônio", input.patrimonio)}
    </div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
    </body></html>
  `);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
