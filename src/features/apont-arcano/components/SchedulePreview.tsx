import { memo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft } from "lucide-react";
import type { ScheduleResult } from "../utils/buildPointingSchedule";

function fmtDate(dayKey: string) {
  const [y, m, d] = dayKey.split("-");
  return `${d}/${m}/${y}`;
}

export const SchedulePreview = memo(function SchedulePreview({
  schedule,
  teamName,
  technicians,
  category,
  duplicatesRemoved,
}: {
  schedule: ScheduleResult;
  teamName: string;
  technicians: string[];
  category: string;
  duplicatesRemoved: number;
}) {
  const first = schedule.entries[0];
  const last = schedule.entries[schedule.entries.length - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total de OS", value: String(schedule.entries.length) },
          { label: "Dias úteis", value: String(schedule.businessDays) },
          { label: "Primeiro início", value: first ? `${fmtDate(first.dayKey)} ${first.startTime}` : "—" },
          { label: "Último término", value: last ? `${fmtDate(last.dayKey)} ${last.endTime}` : "—" },
          { label: "Carga total", value: `${(schedule.totalMinutes / 60).toFixed(1)} h` },
          { label: "Duplicadas removidas", value: String(duplicatesRemoved) },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border/50 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</div>
            <div className="mt-1 font-mono text-sm font-semibold">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="max-h-[420px] overflow-auto rounded-2xl border border-border/50">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>OS</TableHead>
              <TableHead className="hidden sm:table-cell">Equipe</TableHead>
              <TableHead className="hidden lg:table-cell">Técnicos</TableHead>
              <TableHead className="hidden lg:table-cell">Categoria</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead className="hidden sm:table-cell">Dia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.entries.map((entry) => (
              <TableRow key={`${entry.sequence}-${entry.osNumber}`} className={entry.dayChanged ? "border-t-2 border-primary/40" : undefined}>
                <TableCell className="font-mono text-xs text-muted-foreground">{entry.sequence}</TableCell>
                <TableCell className="font-mono text-sm font-semibold">{entry.osNumber}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm">{teamName}</TableCell>
                <TableCell className="hidden lg:table-cell font-mono text-xs">{technicians.join(", ")}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{category || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{entry.durationText}</TableCell>
                <TableCell className="font-mono text-xs">
                  {fmtDate(entry.dayKey)} {entry.startTime}
                </TableCell>
                <TableCell className="font-mono text-xs">{entry.endTime}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{entry.weekday}</span>
                    {entry.dayChanged && (
                      <Badge variant="outline" className="gap-1 border-primary/40 text-[10px] text-primary">
                        <ArrowRightLeft className="h-3 w-3" /> novo dia
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
});
