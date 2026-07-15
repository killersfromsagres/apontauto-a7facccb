import { useMemo } from "react";
import { daysUntil, statusOf, type LegalItem } from "@/lib/legal-items";

export type AlertLevel = "info" | "warn" | "danger" | "overdue";

export interface LegalAlert {
  id: string;
  itemId: string;
  titulo: string;
  empresa: string;
  data: string;
  daysLeft: number;
  level: AlertLevel;
  message: string;
}

export function useLegalAlerts(items: LegalItem[]): LegalAlert[] {
  return useMemo(() => {
    const out: LegalAlert[] = [];
    for (const it of items) {
      const st = statusOf(it);
      if (st === "concluido" || st === "sem_agenda") continue;
      const d = daysUntil(it.proximaExecucao);
      if (d < 0) {
        out.push({
          id: `${it.id}-overdue`,
          itemId: it.id,
          titulo: it.titulo,
          empresa: it.empresa,
          data: it.proximaExecucao,
          daysLeft: d,
          level: "overdue",
          message: `Vencido há ${Math.abs(d)} dia(s)`,
        });
      } else if (d === 0) {
        out.push({
          id: `${it.id}-today`,
          itemId: it.id,
          titulo: it.titulo,
          empresa: it.empresa,
          data: it.proximaExecucao,
          daysLeft: d,
          level: "danger",
          message: "Vence hoje",
        });
      } else if (d <= 7) {
        out.push({
          id: `${it.id}-7`,
          itemId: it.id,
          titulo: it.titulo,
          empresa: it.empresa,
          data: it.proximaExecucao,
          daysLeft: d,
          level: "warn",
          message: `Faltam ${d} dia(s)`,
        });
      } else if (d <= 15) {
        out.push({
          id: `${it.id}-15`,
          itemId: it.id,
          titulo: it.titulo,
          empresa: it.empresa,
          data: it.proximaExecucao,
          daysLeft: d,
          level: "info",
          message: `Faltam ${d} dia(s)`,
        });
      }
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [items]);
}
