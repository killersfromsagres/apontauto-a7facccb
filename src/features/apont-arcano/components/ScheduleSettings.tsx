import { memo, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { ScheduleSettings as Settings } from "../types/pointing";

export const ScheduleSettings = memo(function ScheduleSettings({
  value,
  onChange,
  compact = false,
}: {
  value: Settings;
  onChange: (next: Settings) => void;
  compact?: boolean;
}) {
  const [custom, setCustom] = useState("");

  const addCustom = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(custom)) {
      toast.error("Informe a data no formato AAAA-MM-DD.");
      return;
    }
    if (value.customHolidays.includes(custom)) {
      toast.error("Essa data já está na lista.");
      return;
    }
    onChange({ ...value, customHolidays: [...value.customHolidays, custom].sort() });
    setCustom("");
  };

  const body = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Início da jornada</Label>
          <Input
            type="time"
            value={value.dayStart}
            onChange={(e) => onChange({ ...value, dayStart: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Fim da jornada</Label>
          <Input
            type="time"
            value={value.dayEnd}
            onChange={(e) => onChange({ ...value, dayEnd: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Hora do primeiro apontamento</Label>
          <Input
            type="time"
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { key: "nationalHolidays" as const, label: "Pular feriados nacionais" },
          { key: "spHoliday" as const, label: "Pular feriado estadual de SP (9 de julho)" },
          { key: "carnival" as const, label: "Pular Carnaval (segunda e terça)" },
          { key: "stopOnFirstError" as const, label: "Parar o lote na primeira falha" },
        ].map((opt) => (
          <label
            key={opt.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 p-3 text-sm"
          >
            <span className="min-w-0">{opt.label}</span>
            <Switch
              checked={value[opt.key]}
              onCheckedChange={(v) => onChange({ ...value, [opt.key]: v })}
            />
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Feriados personalizados</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            type="date"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="w-auto min-w-[10rem] flex-1"
          />
          <Button size="sm" variant="outline" onClick={addCustom}>
            <CalendarPlus className="mr-1.5 h-4 w-4" /> Adicionar
          </Button>
        </div>
        {value.customHolidays.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.customHolidays.map((d) => (
              <Badge key={d} variant="outline" className="gap-1 font-mono text-[11px]">
                {d}
                <button
                  type="button"
                  aria-label={`Remover ${d}`}
                  onClick={() =>
                    onChange({ ...value, customHolidays: value.customHolidays.filter((x) => x !== d) })
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Fins de semana são sempre ignorados. Horários no fuso de São Paulo.
        </p>
      </div>
    </div>
  );

  if (compact) return body;
  return <GlassCard className="space-y-4">{body}</GlassCard>;
});
