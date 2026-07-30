import { useEffect, useState } from "react";
import { Download, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Gera e exibe o QR Code que abre a ficha mobile do ativo. */
export function AssetQrDialog({
  code,
  name,
  trigger,
}: {
  code: string;
  name?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/ativo/${encodeURIComponent(code)}`
      : `/ativo/${code}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Carregamento sob demanda: a lib de QR só é baixada ao abrir o diálogo.
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, { width: 512, margin: 1, errorCorrectionLevel: "M" }),
      )
      .then((data) => {
        if (!cancelled) setPng(data);
      })
      .catch(() => {
        if (!cancelled) setPng(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <QrCode className="mr-1.5 h-3.5 w-3.5" /> QR Code
          </Button>
        )}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR do ativo {code}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {png ? (
              <img
                src={png}
                alt={`QR Code do ativo ${code}`}
                className="h-56 w-56 rounded-xl bg-white p-2"
              />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded-xl bg-muted" />
            )}
            <p className="text-center text-xs text-muted-foreground">
              {name ? `${name} — ` : ""}
              aponte a câmera para abrir a ficha mobile do ativo.
            </p>
            {png && (
              <Button
                variant="outline"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = png;
                  a.download = `qr-${code}.png`;
                  a.click();
                }}
              >
                <Download className="mr-1.5 h-4 w-4" /> Baixar PNG
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
