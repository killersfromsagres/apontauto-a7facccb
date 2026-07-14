import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Reminder {
  id: string;
  titulo: string;
  data: string;
  concluido: boolean;
  prioridade: string;
}

function daysUntil(dateStr: string) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round(
    (new Date(dateStr + "T00:00:00").getTime() - t.getTime()) / 86400000,
  );
}

export function SlaBell() {
  const [items, setItems] = useState<Reminder[]>([]);

  useEffect(() => {
    const load = () => {
      try {
        const raw = JSON.parse(localStorage.getItem("outros-servicos:v1") || "[]");
        setItems(raw);
      } catch {
        setItems([]);
      }
    };
    load();
    window.addEventListener("storage", load);
    const i = setInterval(load, 30_000);
    return () => {
      window.removeEventListener("storage", load);
      clearInterval(i);
    };
  }, []);

  const alerts = items
    .filter((r) => !r.concluido)
    .map((r) => ({ ...r, dias: daysUntil(r.data) }))
    .filter((r) => r.dias <= 3)
    .sort((a, b) => a.dias - b.dias);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {alerts.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {alerts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="mb-2 text-sm font-semibold">SLA & Lembretes</p>
        {alerts.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nenhum alerta ativo.
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-auto">
            {alerts.slice(0, 10).map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-border/60 bg-background/60 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{a.titulo}</p>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      a.dias < 0
                        ? "bg-destructive/15 text-destructive"
                        : a.dias === 0
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    {a.dias < 0
                      ? `Vencido ${Math.abs(a.dias)}d`
                      : a.dias === 0
                      ? "Hoje"
                      : `Em ${a.dias}d`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
