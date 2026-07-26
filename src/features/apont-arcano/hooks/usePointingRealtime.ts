import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AGENTS_KEY } from "./useAgentPresence";
import { BATCHES_KEY, JOBS_KEY } from "./usePointingBatches";

/**
 * Assina Realtime para jobs, lotes e agentes do usuário autenticado.
 * Um único canal por montagem; limpeza garantida no unmount.
 */
export function usePointingRealtime(userId: string | null) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!userId) return;

    const invalidateJobs = () => {
      qc.invalidateQueries({ queryKey: JOBS_KEY });
      qc.invalidateQueries({ queryKey: BATCHES_KEY });
    };

    const channel = supabase
      .channel(`apont-arcano-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pointing_jobs", filter: `user_id=eq.${userId}` },
        invalidateJobs,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pointing_batches", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_devices", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
      )
      .subscribe((status) => {
        if (mounted.current) setConnected(status === "SUBSCRIBED");
      });

    return () => {
      mounted.current = false;
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return { connected };
}
