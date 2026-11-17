import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DEM_QUERY_KEY,
  loadAssets,
  loadPeople,
  loadPlans,
  loadTickets,
  loadWorklogs,
  myPerson,
} from "./api";

export function useDemarchi(admin = false, enabled = true) {
  const qc = useQueryClient();
  const [connection, setConnection] = useState("CONNECTING");
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") qc.removeQueries({ queryKey: DEM_QUERY_KEY });
      setUserId(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);
  // Never reuse an administrator's cached queue when another person signs in.
  const key = [...DEM_QUERY_KEY, userId, admin ? "admin" : "portal"];
  const active = enabled && !!userId;
  const assets = useQuery({
    queryKey: [...key, "assets"],
    queryFn: loadAssets,
    enabled: active,
    staleTime: 600_000,
    retry: false,
  });
  const people = useQuery({
    queryKey: [...key, "people"],
    queryFn: loadPeople,
    enabled: active && admin,
    retry: false,
  });
  const me = useQuery({
    queryKey: [...key, "me"],
    queryFn: myPerson,
    enabled: active,
    retry: false,
  });
  const tickets = useQuery({
    queryKey: [...key, "tickets"],
    queryFn: loadTickets,
    enabled: active,
    refetchInterval: connection === "SUBSCRIBED" ? false : 30_000,
    retry: false,
  });
  const plans = useQuery({
    queryKey: [...key, "plans"],
    queryFn: loadPlans,
    enabled: active && admin,
    retry: false,
  });
  const logs = useQuery({
    queryKey: [...key, "logs"],
    queryFn: loadWorklogs,
    enabled: active && admin,
    retry: false,
  });
  useEffect(() => {
    if (!active) return;
    const channel = supabase.channel(`demarchi-${crypto.randomUUID()}`);
    for (const table of ["dem_tickets", "dem_ticket_events", "dem_worklogs"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        if (admin && table === "dem_tickets" && payload.eventType === "INSERT")
          toast.info("Novo chamado recebido na Central Demarchi.");
        void qc.invalidateQueries({ queryKey: DEM_QUERY_KEY });
      });
    }
    channel.subscribe((status) => setConnection(status));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, active, userId, admin]);
  return {
    assets,
    people,
    me,
    tickets,
    plans,
    logs,
    connection,
    refresh: () => qc.invalidateQueries({ queryKey: DEM_QUERY_KEY }),
    error:
      assets.error ||
      tickets.error ||
      (admin && (people.error || plans.error || logs.error)) ||
      me.error,
  };
}
