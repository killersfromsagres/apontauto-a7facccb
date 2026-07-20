import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { QrCode, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/qr-view")({
  component: QrViewPage,
  head: () => ({
    meta: [
      { title: "QR-Code do Ativo — Apont Auto" },
      { name: "description", content: "Redirecionamento do QR-Code para o histórico do ativo." },
    ],
  }),
});

const LABELS: Record<string, string> = {
  ativo: "Ativo",
  equipamento: "Equipamento",
  patrimonio: "Patrimônio",
  predio: "Prédio",
  andar: "Andar",
  local: "Local",
  notas: "Notas",
};

function QrViewPage() {
  const params =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const ativo = params.get("ativo") ?? "";
  const equipamento = params.get("equipamento") ?? "";
  const patrimonio = params.get("patrimonio") ?? "";

  // QRs novos apontam direto para /ativo-historico. QRs antigos caem aqui
  // e são redirecionados quando têm identificadores suficientes.
  if (ativo || equipamento || patrimonio) {
    return (
      <Navigate
        to="/ativo-historico"
        search={{ ativo, equipamento, patrimonio }}
        replace
      />
    );
  }

  const entries = Array.from(params.entries()).filter(([k]) => LABELS[k]);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-lg">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="rounded-2xl border bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <QrCode className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Ativo escaneado</h1>
              <p className="text-xs text-muted-foreground">Informações registradas neste QR-Code</p>
            </div>
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dado no QR-Code.</p>
          ) : (
            <dl className="divide-y divide-border/60">
              {entries.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {LABELS[k]}
                  </dt>
                  <dd className="text-sm font-medium sm:text-right">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
