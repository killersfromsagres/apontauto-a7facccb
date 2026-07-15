import * as XLSX from "xlsx";
import type { LegalItem, LegalExecution } from "@/lib/legal-items";
import { buildMonthMap, statusOf } from "@/lib/legal-items";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function exportLegalXLSX(items: LegalItem[], execs: LegalExecution[], year: number) {
  const rows = items.map((it) => {
    const cells = buildMonthMap(it, execs, year);
    const monthCols: Record<string, string> = {};
    MONTHS.forEach((m, i) => {
      monthCols[m] =
        cells[i] === "done" ? "✓" : cells[i] === "scheduled" ? "•" : cells[i] === "overdue" ? "X" : "";
    });
    return {
      Tarefa: it.titulo,
      Empresa: it.empresa,
      "Última Execução": it.ultimaExecucao ?? "",
      "Próxima Execução": it.proximaExecucao ?? "",
      Agendamento: it.agendamento ?? "",
      Periodicidade: it.periodicidade,
      Status: statusOf(it),
      ...monthCols,
      Observações: it.observacoes,
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Painel ${year}`);
  XLSX.writeFile(wb, `painel-itens-legais-${year}.xlsx`);
}
