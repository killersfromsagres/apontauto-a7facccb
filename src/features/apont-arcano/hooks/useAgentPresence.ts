import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAgents } from "../services/pointingService";
import { computeAgentPresence, type AgentPresence } from "../utils/statusLabels";
import type { AgentDevice } from "../types/pointing";

export const AGENTS_KEY = ["apont-arcano", "agents"] as const;

export function useAgentPresence() {
  const query = useQuery({
    queryKey: AGENTS_KEY,
    queryFn: listAgents,
    refetchInterval: 10_000,
    staleTime: 0,
  });

  // Tick para recalcular "visto há X s" sem depender de novo fetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const agents: (AgentDevice & { presence: AgentPresence })[] = (query.data ?? []).map((agent) => ({
    ...agent,
    presence: computeAgentPresence(agent.status, agent.last_seen_at),
  }));

  const primary =
    agents.find((a) => a.presence === "online" || a.presence === "ocupado") ?? agents[0] ?? null;

  return { ...query, agents, primary };
}
