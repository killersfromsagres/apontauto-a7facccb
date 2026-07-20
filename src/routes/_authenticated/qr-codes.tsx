import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import QRCode from "qrcode";
import { toast } from "sonner";
import { QrCode, Download, Printer, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/qr-codes")({
  component: QrCodesPage,
});

type Form = {
  ativo: string;
  equipamento: string;
  patrimonio: string;
  predio: string;
  andar: string;
  local: string;
  notas: string;
};

const EMPTY: Form = {
  ativo: "",
  equipamento: "",
  patrimonio: "",
  predio: "",
  andar: "",
  local: "",
  notas: "",
};

function QrCodesPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const update = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    if (!form.ativo.trim() && !form.equipamento.trim() && !form.patrimonio.trim()) {
      toast.error("Informe pelo menos Ativo, Equipamento ou Patrimônio.");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams();
    if (form.ativo.trim()) params.set("ativo", form.ativo.trim());
    if (form.equipamento.trim()) params.set("equipamento", form.equipamento.trim());
    if (form.patrimonio.trim()) params.set("patrimonio", form.patrimonio.trim());
    // QR sempre aponta para o histórico do ativo (foco em refrigeração).
    const url = `${origin}/ativo-historico?${params.toString()}`;
    try {
      const png = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 512,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      setDataUrl(png);
      setPayload(url);
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, url, { width: 512, margin: 2 });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar QR-Code");
    }
  };

  useEffect(() => {
    // gera automaticamente quando qualquer campo relevante muda
    const t = setTimeout(() => {
      if (form.ativo || form.equipamento || form.patrimonio) generate().catch(() => {});
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qrcode-${form.ativo || form.patrimonio || "ativo"}.png`;
    a.click();
  };

  const print = () => {
    if (!dataUrl) return;
    const win = window.open("", "_blank", "width=600,height=800");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR-Code — ${form.ativo || form.patrimonio}</title>
      <style>body{font-family:system-ui;text-align:center;padding:24px}
      img{max-width:360px}
      .info{margin-top:16px;font-size:14px}
      .info div{margin:2px 0}
      </style></head><body>
      <img src="${dataUrl}" />
      <div class="info">
        ${form.ativo ? `<div><b>Ativo:</b> ${form.ativo}</div>` : ""}
        ${form.equipamento ? `<div><b>Equipamento:</b> ${form.equipamento}</div>` : ""}
        ${form.patrimonio ? `<div><b>Patrimônio:</b> ${form.patrimonio}</div>` : ""}
        ${form.predio ? `<div><b>Prédio:</b> ${form.predio}</div>` : ""}
        ${form.andar ? `<div><b>Andar:</b> ${form.andar}</div>` : ""}
        ${form.local ? `<div><b>Local:</b> ${form.local}</div>` : ""}
      </div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <PageShell
      title="QR-Codes de Ativos"
      description="Gere QR-Codes com informações do ativo. Ao escanear, uma página exibe todos os dados."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <QrCode className="h-4 w-4" /> Informações do ativo
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ativo *" value={form.ativo} onChange={(v) => update("ativo", v)} />
            <Field label="Patrimônio" value={form.patrimonio} onChange={(v) => update("patrimonio", v)} />
            <div className="sm:col-span-2">
              <Field label="Equipamento" value={form.equipamento} onChange={(v) => update("equipamento", v)} />
            </div>
            <Field label="Prédio" value={form.predio} onChange={(v) => update("predio", v)} />
            <Field label="Andar" value={form.andar} onChange={(v) => update("andar", v)} />
            <div className="sm:col-span-2">
              <Field label="Local" value={form.local} onChange={(v) => update("local", v)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notas</Label>
              <Textarea
                rows={3}
                value={form.notas}
                onChange={(e) => update("notas", e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={generate}>
              <RefreshCw className="mr-2 h-4 w-4" /> Gerar QR-Code
            </Button>
            <Button variant="outline" onClick={() => { setForm(EMPTY); setDataUrl(null); setPayload(null); }}>
              Limpar
            </Button>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <QrCode className="h-4 w-4" /> Pré-visualização
          </h3>
          {dataUrl ? (
            <div className="flex flex-col items-center gap-4">
              <img
                src={dataUrl}
                alt="QR-Code"
                className="h-64 w-64 rounded-md border bg-white p-2"
              />
              <canvas ref={canvasRef} className="hidden" />
              <p className="max-w-full break-all text-center text-xs text-muted-foreground">
                {payload}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={download}>
                  <Download className="mr-2 h-4 w-4" /> Baixar PNG
                </Button>
                <Button variant="outline" onClick={print}>
                  <Printer className="mr-2 h-4 w-4" /> Imprimir
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Preencha as informações do ativo para gerar o QR-Code.
            </div>
          )}
        </GlassCard>
      </div>
    </PageShell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-11" />
    </div>
  );
}
