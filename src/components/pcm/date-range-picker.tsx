import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DateRange = { from: string; to: string };

export type DateRangePickerProps = {
  value: DateRange;
  onChange: (value: DateRange) => void;
  /** Atalhos rápidos exibidos ao lado dos campos. */
  presets?: boolean;
  className?: string;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Seletor de período com atalhos (item 6.2). */
export function DateRangePicker({
  value,
  onChange,
  presets = true,
  className,
}: DateRangePickerProps) {
  const apply = (days: number) => onChange({ from: isoDaysAgo(days), to: today() });

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="grid size-9 place-items-center rounded-xl border border-border/60 text-muted-foreground">
        <CalendarRange className="size-4" aria-hidden />
      </span>
      <Input
        type="date"
        aria-label="Data inicial"
        value={value.from}
        max={value.to || undefined}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        className="h-9 w-[9.5rem]"
      />
      <span className="text-xs text-muted-foreground">até</span>
      <Input
        type="date"
        aria-label="Data final"
        value={value.to}
        min={value.from || undefined}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        className="h-9 w-[9.5rem]"
      />
      {presets ? (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => apply(6)}>
            7d
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => apply(29)}>
            30d
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => apply(89)}>
            90d
          </Button>
        </div>
      ) : null}
    </div>
  );
}
