import { useEffect, useMemo } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { listReminders, type Reminder } from "@/lib/reminders";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccess } from "@/hooks/use-my-access";


function daysUntil(dateStr: string) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round(
    (new Date(dateStr + "T00:00:00").getTime() - t.getTime()) / 86400000,
  );
}

export function SlaBell() {
  const qc = useQueryClient();
  const { access, loading: accessLoading } = useMyAccess();
  // Só usuários com acesso a "outros" (lembretes/SLA) precisam do sino.
  // Evita fetch + realtime channel desnecessário para colaboradores restritos
  // (climatizacao, corretivas etc.) — economiza uma conexão ws e uma query.
  const canSeeReminders =
    !accessLoading &&
    (access.isAdmin || access.allowed === null || (access.allowed?.includes("outros") ?? false));

  // Shares cache with /outros page — no duplicated fetch.
  const { data: items = [] } = useQuery<Reminder[]>({
    queryKey: ["reminders"],
    queryFn: listReminders,
    staleTime: 60_000,
    enabled: canSeeReminders,
  });


  // Realtime only; no polling. Só assina quando o usuário pode ver lembretes.
  useEffect(() => {
    if (!canSeeReminders) return;
    const channel = supabase
      .channel("reminders-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders" }, () => {
        qc.invalidateQueries({ queryKey: ["reminders"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, canSeeReminders]);


  const alerts = useMemo(
    () =>
      items
        .filter((r) => !r.concluido)
        .map((r) => ({ ...r, dias: daysUntil(r.data) }))
        .filter((r) => r.dias <= 3)
        .sort((a, b) => a.dias - b.dias),
    [items],
  );

  // Colaborador sem acesso a lembretes: não renderiza o sino (economiza ícone/popover).
  if (!canSeeReminders) return null;

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
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1rem))]">
        <p className="mb-2 text-sm font-semibold">SLA & Lembretes</p>
        {alerts.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nenhum alerta ativo.
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-auto">
            {alerts.slice(0, 10).map((a) => (
              <li key={a.id} className="rounded-md border border-border/60 bg-background/60 p-2">
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
