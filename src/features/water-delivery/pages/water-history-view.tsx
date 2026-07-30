import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/pcm";
import {
  VISITA_STATUS_LABEL,
  hojeISO,
  listVisitas,
  pontoLabel,
} from "@/features/water-delivery/queries/api";
import { usePontos, useVisitasPagina } from "@/features/water-delivery/hooks/use-agua";

const TAMANHO_PAGINA = 50;

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}


export function WaterHistoryView() {
  const [de, setDe] = useState(addDaysISO(hojeISO(), -30));
  const [ate, setAte] = useState(hojeISO());
  const [exportando, setExportando] = useState(false);
  const [pagina, setPagina] = useState(0);

  const pontos = usePontos();
  // Item 24 — paginação no servidor: só a página atual vem do banco.
  const visitas = useVisitasPagina(de, ate, pagina, TAMANHO_PAGINA);
  const total = visitas.data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));

  useEffect(() => {
    setPagina(0);
  }, [de, ate]);

  const porId = useMemo(
    () => new Map((pontos.data ?? []).map((p) => [p.id, p])),
    [pontos.data],
  );

  const rows = useMemo(
    () =>
      (visitas.data?.itens ?? []).map((v) => ({
        data: v.data,
        ponto: porId.get(v.ponto_id) ? pontoLabel(porId.get(v.ponto_id)!) : v.ponto_id,
        status: VISITA_STATUS_LABEL[v.status],
        previstas: v.bags_previstas,
        entregues: v.bags_entregues ?? 0,
        motivo: v.motivo ?? "",
        observacao: v.observacao ?? "",
        foto: v.foto_url ?? "",
      })),
    [visitas.data?.itens, porId],
  );

  async function exportar() {
    setExportando(true);
    try {
      // A exportação busca o período inteiro (a tela mostra só a página).
      const todas = await listVisitas(de, ate);
      const linhas = todas.map((v) => ({
        data: v.data,
        ponto: porId.get(v.ponto_id) ? pontoLabel(porId.get(v.ponto_id)!) : v.ponto_id,
        status: VISITA_STATUS_LABEL[v.status],
        previstas: v.bags_previstas,
        entregues: v.bags_entregues ?? 0,
        motivo: v.motivo ?? "",
        observacao: v.observacao ?? "",
        foto: v.foto_url ?? "",
      }));
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Entregas de Água");
      ws.columns = [
        { header: "Data", key: "data", width: 12 },
        { header: "Ponto", key: "ponto", width: 46 },
        { header: "Status", key: "status", width: 16 },
        { header: "Bags previstas", key: "previstas", width: 15 },
        { header: "Bags entregues", key: "entregues", width: 15 },
        { header: "Motivo", key: "motivo", width: 26 },
        { header: "Observação", key: "observacao", width: 40 },
        { header: "Evidência", key: "foto", width: 40 },
      ];
      ws.getRow(1).font = { bold: true };
      linhas.forEach((r) => ws.addRow(r));
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `entrega-agua-${de}-a-${ate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="de">De</Label>
            <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ate">Até</Label>
            <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="sm:justify-self-end">
            <Button variant="secondary" disabled={exportando || total === 0} onClick={exportar}>
              {exportando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar .xlsx
            </Button>
          </div>
        </div>
      </GlassCard>

      {visitas.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sem registros no período"
          description="Ajuste as datas ou registre execuções na rota do dia."
        />
      ) : (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Ponto</th>
                <th className="p-3">Status</th>
                <th className="p-3">Bags</th>
                <th className="p-3">Motivo / observação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  <td className="whitespace-nowrap p-3">{r.data.split("-").reverse().join("/")}</td>
                  <td className="p-3">{r.ponto}</td>
                  <td className="whitespace-nowrap p-3">{r.status}</td>
                  <td className="whitespace-nowrap p-3">
                    {r.entregues}/{r.previstas}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {[r.motivo, r.observacao].filter(Boolean).join(" — ") || "—"}
                    {r.foto && (
                      <a
                        href={r.foto}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-primary underline"
                      >
                        evidência
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}

      {total > TAMANHO_PAGINA ? (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label="Paginação do histórico"
        >
          <p className="text-xs text-muted-foreground">
            Página {pagina + 1} de {totalPaginas} · {total} registros
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="min-h-[44px]"
              disabled={pagina === 0 || visitas.isFetching}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              className="min-h-[44px]"
              disabled={pagina + 1 >= totalPaginas || visitas.isFetching}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
