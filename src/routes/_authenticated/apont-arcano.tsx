import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { ApontArcanoHeader } from "@/features/apont-arcano/components/ApontArcanoHeader";
import { MetricsGrid } from "@/features/apont-arcano/components/MetricsGrid";
import { NewBatchForm } from "@/features/apont-arcano/components/NewBatchForm";
import { LiveBatchPanel } from "@/features/apont-arcano/components/LiveBatchPanel";
import { TeamsManager } from "@/features/apont-arcano/components/TeamsManager";
import { HistoryPanel } from "@/features/apont-arcano/components/HistoryPanel";
import { AgentDevicesPanel } from "@/features/apont-arcano/components/AgentDevicesPanel";
import { ScheduleSettings } from "@/features/apont-arcano/components/ScheduleSettings";
import { useAgentPresence, AGENTS_KEY } from "@/features/apont-arcano/hooks/useAgentPresence";
import {
  usePointingBatches,
  useBatchJobs,
  useRecentJobs,
  BATCHES_KEY,
  JOBS_KEY,
} from "@/features/apont-arcano/hooks/usePointingBatches";
import { usePointingRealtime } from "@/features/apont-arcano/hooks/usePointingRealtime";
import { computeMetrics } from "@/features/apont-arcano/hooks/usePointingMetrics";
import { useMaintenanceTeams } from "@/features/apont-arcano/hooks/useMaintenanceTeams";
import {
  DEFAULT_SCHEDULE_SETTINGS,
  type ScheduleSettings as Settings,
} from "@/features/apont-arcano/types/pointing";

export const Route = createFileRoute("/_authenticated/apont-arcano")({
  component: ApontArcanoPage,
  head: () => ({
    meta: [
      { title: "Apont Arcano — Painel remoto de apontamentos" },
      {
        name: "description",
        content:
          "Monte a fila de apontamentos do Prisma4, acompanhe a execução do agente Windows em tempo real e gerencie equipes e agenda.",
      },
      { property: "og:title", content: "Apont Arcano — Painel remoto de apontamentos" },
      {
        property: "og:description",
        content: "Fila, execução ao vivo, equipes, histórico e agenda do Apont Arcano Desktop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ApontArcanoPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState("novo");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [preselectedTeamId, setPreselectedTeamId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SCHEDULE_SETTINGS);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  const { connected } = usePointingRealtime(userId);
  const { agents, primary, isFetching: agentsFetching, isLoading: agentsLoading, refetch: refetchAgents } =
    useAgentPresence();
  const teamsQuery = useMaintenanceTeams();
  const batchesQuery = usePointingBatches();
  const recentJobsQuery = useRecentJobs();
  const batchJobsQuery = useBatchJobs(selectedBatchId);

  const batches = useMemo(() => batchesQuery.data ?? [], [batchesQuery.data]);

  useEffect(() => {
    if (!selectedBatchId && batches.length > 0) setSelectedBatchId(batches[0].id);
  }, [batches, selectedBatchId]);

  const since = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const metrics = useMemo(
    () => computeMetrics(recentJobsQuery.data ?? [], since),
    [recentJobsQuery.data, since],
  );

  const agentOffline = !primary || primary.presence === "offline";

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: JOBS_KEY });
    qc.invalidateQueries({ queryKey: BATCHES_KEY });
    qc.invalidateQueries({ queryKey: AGENTS_KEY });
  };

  return (
    <PageShell
      eyebrow="Operação · automação"
      title="Apont Arcano"
      description="Planejamento remoto da fila de apontamentos executada pelo Apont Arcano Desktop no Windows."
    >
      <div className="space-y-5">
        <ApontArcanoHeader
          agent={primary}
          onRefresh={() => refetchAgents()}
          refreshing={agentsFetching}
        />

        <MetricsGrid metrics={metrics} loading={recentJobsQuery.isLoading} periodLabel="hoje" />

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="novo">Novo lote</TabsTrigger>
              <TabsTrigger value="execucao">Execução ao vivo</TabsTrigger>
              <TabsTrigger value="equipes">Equipes</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
              <TabsTrigger value="agente">Agente Windows</TabsTrigger>
              <TabsTrigger value="agenda">Agenda</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="novo" className="mt-4">
            <NewBatchForm
              teams={teamsQuery.data ?? []}
              teamsLoading={teamsQuery.isLoading}
              preselectedTeamId={preselectedTeamId}
              agentOffline={agentOffline}
              onCreated={(batchId) => {
                setSelectedBatchId(batchId);
                refreshAll();
                setTab("execucao");
              }}
            />
          </TabsContent>

          <TabsContent value="execucao" className="mt-4">
            <LiveBatchPanel
              batches={batches}
              jobs={batchJobsQuery.data ?? []}
              loading={batchJobsQuery.isLoading}
              error={batchJobsQuery.error ?? batchesQuery.error}
              selectedBatchId={selectedBatchId}
              onSelectBatch={setSelectedBatchId}
              onRefetch={refreshAll}
              realtimeConnected={connected}
              agentOffline={agentOffline}
            />
          </TabsContent>

          <TabsContent value="equipes" className="mt-4">
            <TeamsManager
              onUseInBatch={(teamId) => {
                setPreselectedTeamId(teamId);
                setTab("novo");
              }}
            />
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <HistoryPanel
              batches={batches}
              jobs={recentJobsQuery.data ?? []}
              loading={batchesQuery.isLoading || recentJobsQuery.isLoading}
            />
          </TabsContent>

          <TabsContent value="agente" className="mt-4">
            <AgentDevicesPanel
              agents={agents}
              loading={agentsLoading}
              onRefresh={() => refetchAgents()}
              refreshing={agentsFetching}
            />
          </TabsContent>

          <TabsContent value="agenda" className="mt-4">
            <ScheduleSettings value={settings} onChange={setSettings} />
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
