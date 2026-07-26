import { useMemo, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Rocket, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { OsInput } from "./OsInput";
import { SchedulePreview } from "./SchedulePreview";
import { ScheduleSettings } from "./ScheduleSettings";
import { parseOsNumbers } from "../utils/parseOsNumbers";
import { buildPointingSchedule, type ScheduleResult } from "../utils/buildPointingSchedule";
import { createBatch } from "../services/pointingService";
import {
  DEFAULT_SCHEDULE_SETTINGS,
  type JobPayload,
  type MaintenanceTeam,
  type ScheduleSettings as Settings,
} from "../types/pointing";

function todaySp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function NewBatchForm({
  teams,
  teamsLoading,
  preselectedTeamId,
  agentOffline,
  onCreated,
}: {
  teams: MaintenanceTeam[];
  teamsLoading: boolean;
  preselectedTeamId: string | null;
  agentOffline: boolean;
  onCreated: (batchId: string) => void;
}) {
  const [name, setName] = useState("");
  const [raw, setRaw] = useState("");
  const [teamId, setTeamId] = useState<string | null>(preselectedTeamId);
  const [startDate, setStartDate] = useState(todaySp());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SCHEDULE_SETTINGS);
  const [submitting, setSubmitting] = useState(false);

  const activeTeams = useMemo(() => teams.filter((t) => t.active), [teams]);
  const effectiveTeamId = teamId ?? preselectedTeamId;
  const team = activeTeams.find((t) => t.id === effectiveTeamId) ?? null;
  const parsed = useMemo(() => parseOsNumbers(raw), [raw]);

  const { schedule, scheduleError } = useMemo<{
    schedule: ScheduleResult | null;
    scheduleError: string | null;
  }>(() => {
    if (!team || parsed.valid.length === 0) return { schedule: null, scheduleError: null };
    try {
      return {
        schedule: buildPointingSchedule({
          osNumbers: parsed.valid,
          startDate,
          startTime: settings.startTime,
          dayStart: settings.dayStart,
          dayEnd: settings.dayEnd,
          durationMinutes: team.duration_minutes,
          holidays: {
            nationalHolidays: settings.nationalHolidays,
            spHoliday: settings.spHoliday,
            carnival: settings.carnival,
            customHolidays: settings.customHolidays,
          },
        }),
        scheduleError: null,
      };
    } catch (err) {
      return { schedule: null, scheduleError: err instanceof Error ? err.message : "Agenda inválida." };
    }
  }, [team, parsed.valid, startDate, settings]);

  const submit = async () => {
    if (!team) {
      toast.error("Selecione uma equipe ativa.");
      return;
    }
    if (parsed.valid.length === 0) {
      toast.error("Informe ao menos uma OS numérica.");
      return;
    }
    if (!schedule) {
      toast.error(scheduleError ?? "Não foi possível montar a agenda.");
      return;
    }
    setSubmitting(true);
    try {
      const jobs: JobPayload[] = schedule.entries.map((entry) => ({
        os_number: entry.osNumber,
        category: team.category,
        technicians: team.technicians,
        duration_minutes: entry.durationMinutes,
        duration_text: entry.durationText,
        scheduled_start: entry.startIso,
        scheduled_end: entry.endIso,
        team_name: team.name,
      }));
      const batchId = await createBatch({
        name: name.trim() || null,
        teamId: team.id,
        settings: { ...settings, startDate },
        jobs,
      });
      toast.success(`Lote criado com ${jobs.length} OS na fila.`);
      setRaw("");
      setName("");
      onCreated(batchId);
    } catch {
      toast.error("Não foi possível criar o lote. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Nome do lote (opcional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apontamento da semana" />
          </div>
          <div className="space-y-1.5">
            <Label>Equipe</Label>
            <Select value={effectiveTeamId ?? undefined} onValueChange={setTeamId} disabled={teamsLoading}>
              <SelectTrigger>
                <SelectValue placeholder={teamsLoading ? "Carregando…" : "Selecione a equipe"} />
              </SelectTrigger>
              <SelectContent>
                {activeTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} · {t.duration_text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data de início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>

        {team && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="outline" className="font-mono">{team.duration_text} por OS</Badge>
            <Badge variant="outline">{team.category || "sem categoria"}</Badge>
            <Badge variant="outline" className="font-mono">{team.technicians.join(" · ")}</Badge>
          </div>
        )}

        <OsInput value={raw} onChange={setRaw} parsed={parsed} />

        <Accordion type="single" collapsible>
          <AccordionItem value="settings" className="border-border/50">
            <AccordionTrigger className="text-sm">Regras de agenda e feriados</AccordionTrigger>
            <AccordionContent>
              <ScheduleSettings value={settings} onChange={setSettings} compact />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {scheduleError && (
          <p className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/5 p-3 text-xs text-red-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {scheduleError}
          </p>
        )}

        {agentOffline && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">
            O agente está offline. Você pode criar o lote mesmo assim — a execução começa quando o programa Windows conectar.
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={submitting || !schedule}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-1.5 h-4 w-4" />
            )}
            Enviar {schedule ? `${schedule.entries.length} OS` : "lote"} para a fila
          </Button>
        </div>
      </GlassCard>

      {schedule && team && (
        <GlassCard className="space-y-3">
          <h3 className="font-display text-base font-semibold">Prévia da programação</h3>
          <SchedulePreview
            schedule={schedule}
            teamName={team.name}
            technicians={team.technicians}
            category={team.category}
            duplicatesRemoved={parsed.duplicates.length}
          />
        </GlassCard>
      )}
    </div>
  );
}
