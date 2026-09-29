import { useEffect, useState } from "react";
import { CalendarClock, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CORRECTIVE_NOT_PERFORMED_REASONS,
  markCorrectiveNotPerformed,
  type CorrectiveNotPerformedReason,
} from "@/lib/corretiva/programacao-state";
import {
  reservationDayLabel,
  type CorrectiveProgramReservation,
} from "@/lib/preventiva/corrective-program-reservations";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function CorrectiveReprogramDialog({
  os,
  reservation,
  open,
  onOpenChange,
  onReprogrammed,
}: {
  os: any | null;
  reservation: CorrectiveProgramReservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReprogrammed: (updated: Record<string, unknown>) => void;
}) {
  const [reason, setReason] = useState<CorrectiveNotPerformedReason | "">("");
  const [observation, setObservation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setObservation("");
  }, [open, os?.id]);

  async function submit() {
    if (!os?.id || !reason || saving) return;
    if (reason === "outro" && !observation.trim()) {
      toast.warning("Descreva o motivo para continuar.");
      return;
    }

    setSaving(true);
    try {
      const updated = await markCorrectiveNotPerformed({
        osId: String(os.id),
        reason,
        observation,
        reservation,
      });
      onReprogrammed(updated);
      onOpenChange(false);
      toast.success(
        `OS ${os.numero_os || ""} devolvida à fila. Ela terá prioridade na próxima geração de programação.`,
      );
    } catch (error: any) {
      console.error("[CorretivaReprogram] Erro ao devolver OS à fila:", error);
      toast.error(error?.message || "Não foi possível devolver o chamado à fila.");
    } finally {
      setSaving(false);
    }
  }

  const period = reservation
    ? `${formatDate(reservation.periodStart)} a ${formatDate(reservation.periodEnd)}`
    : os?.programacao_periodo_inicio && os?.programacao_periodo_fim
      ? `${formatDate(os.programacao_periodo_inicio)} a ${formatDate(os.programacao_periodo_fim)}`
      : "Programação atual";

  const day =
    reservationDayLabel(reservation?.dayIndex) ||
    reservationDayLabel(os?.programacao_dia_indice) ||
    "Dia não informado";

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Não realizado · devolver para reprogramação</DialogTitle>
          <DialogDescription>
            Registre por que a OS não foi executada. O chamado sai de “Em programação”,
            volta automaticamente para a fila e será priorizado na próxima programação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-amber-400/30 text-amber-200">
                OS {os?.numero_os || "—"}
              </Badge>
              <Badge variant="outline" className="gap-1 border-sky-400/25 text-sky-100">
                <CalendarClock className="h-3 w-3" />
                {day}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {period}
              {(reservation?.equipe || os?.programacao_equipe) &&
                ` · ${reservation?.equipe || os?.programacao_equipe}`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reprogram-reason">Motivo da não realização *</Label>
            <select
              id="reprogram-reason"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as CorrectiveNotPerformedReason | "")
              }
            >
              <option value="">Selecione o motivo</option>
              {CORRECTIVE_NOT_PERFORMED_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reprogram-observation">
              Observação {reason === "outro" ? "*" : "(opcional)"}
            </Label>
            <Textarea
              id="reprogram-observation"
              rows={4}
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              placeholder="Ex.: área não foi liberada no horário previsto; reagendar para a próxima janela operacional."
            />
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-xs leading-5 text-muted-foreground">
            O histórico da tentativa anterior será preservado. Na nova programação o
            sistema incrementa o número da tentativa e grava a nova semana, dia e equipe,
            evitando que o chamado fique parado ou seja perdido.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={!reason || saving} onClick={() => void submit()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {saving ? "Devolvendo..." : "Devolver à fila"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
