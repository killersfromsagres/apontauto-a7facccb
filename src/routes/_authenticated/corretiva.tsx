import { OSListView } from "@/features/os/components/os-list-view";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useEffect, useState } from "react";
import { getCachedOsList, cacheOsList, type OsCacheRow } from "@/lib/corretiva/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { OSBase } from "@/features/os/schemas/os-base";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/corretiva")({
  component: CorretivaPageV2,
});

const OS_COLUMNS =
  "id, numero_os, nome_os, predio, andar, local, tipo, equipe, data_sla, data_programada, inicio, fim, ativo, equipamento, patrimonio, status, updated_at, solicitante, data_criacao";

function CorretivaPageV2() {
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const [osList, setOsList] = useState<OSBase[]>([]);
  const [loading, setLoading] = useState(true);

  const mapToOSBase = (row: any): OSBase => ({
    id: row.id,
    numero: row.numero_os,
    descricao: row.nome_os,
    local: `${row.predio || ""} ${row.andar || ""} ${row.local || ""}`.trim(),
    equipe: row.equipe || "Sem Equipe",
    status: row.status as any,
    prioridade: "media", // Default as it's not in the original schema directly
    data_criacao: row.data_criacao || row.updated_at,
    sla_horas: 24, // Default mock
    fotos: [],
    pecas: [],
    problemas: [],
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const cached = await getCachedOsList();
      if (cached.length) setOsList(cached.map(mapToOSBase));

      if (online) {
        const { data, error } = await supabase
          .from("corretiva_os")
          .select(OS_COLUMNS)
          .order("numero_os", { ascending: true });

        if (error) throw error;
        const rows = data as any[];
        await cacheOsList(rows);
        setOsList(rows.map(mapToOSBase));
      }
    } catch (error: any) {
      toast.error("Erro ao carregar OS: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [online]);

  return (
    <OSListView
      title="Manutenção Corretiva"
      subtitle="Campo e Operação"
      osList={osList}
      isLoading={loading}
      isOnline={online}
      onRefresh={loadData}
      onAdd={() => navigate({ to: "/programacao" })}
      onOSAction={(action, os) => {
        toast.info(`Ação: ${action} na OS ${os.numero}`);
      }}
    />
  );
}
