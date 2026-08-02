import { OSListView } from "@/features/os/components/os-list-view";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useEffect, useState } from "react";
import { getCachedOsList, cacheOsList } from "@/lib/corretiva/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { OSBase } from "@/features/os/schemas/os-base";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { clearOsTable } from "@/lib/os-management.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Calendar } from "lucide-react";

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
  const [mesFiltro, setMesFiltro] = useState<string>("08"); // Agosto como padrão conforme solicitado

  const mapToOSBase = (row: any): OSBase => ({
    id: row.id,
    numero: row.numero_os,
    descricao: row.nome_os || "",
    local: `${row.predio || ""} ${row.andar || ""} ${row.local || ""}`.trim(),
    equipe: row.equipe || "Sem Equipe",
    status: row.status as any,
    prioridade: "media",
    data_criacao: row.data_criacao || row.updated_at,
    sla_horas: 24,
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

  const filteredList = osList.filter((os) => {
    if (mesFiltro === "todos") return true;
    const date = os.data_criacao ? new Date(os.data_criacao) : null;
    if (!date) return false;
    // getMonth() retorna 0-11, então +1
    return String(date.getMonth() + 1).padStart(2, "0") === mesFiltro;
  });

  useEffect(() => {
    loadData();
  }, [online]);

  return (
    <OSListView
      title="Manutenção Corretiva"
      subtitle="Campo e Operação"
      osList={filteredList}
      isLoading={loading}
      isOnline={online}
      onRefresh={loadData}
      onAdd={() => navigate({ to: "/programacao" })}
      onOSAction={(action, os) => {
        // Direcionar para apontamentos conforme solicitado (similar a Refrigeração)
        navigate({ to: `/apontamentos`, search: { os: os.numero } });
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <Select value={mesFiltro} onValueChange={setMesFiltro}>
            <SelectTrigger className="h-9 w-32 bg-white/5 border-white/10 text-xs">
              <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="01">Janeiro</SelectItem>
              <SelectItem value="02">Fevereiro</SelectItem>
              <SelectItem value="03">Março</SelectItem>
              <SelectItem value="04">Abril</SelectItem>
              <SelectItem value="05">Maio</SelectItem>
              <SelectItem value="06">Junho</SelectItem>
              <SelectItem value="07">Julho</SelectItem>
              <SelectItem value="08">Agosto</SelectItem>
              <SelectItem value="09">Setembro</SelectItem>
              <SelectItem value="10">Outubro</SelectItem>
              <SelectItem value="11">Novembro</SelectItem>
              <SelectItem value="12">Dezembro</SelectItem>
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="destructive" className="h-9 w-9 rounded-full shadow-lg bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20" title="Limpar Chamados">
                <Trash2 className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar todos os chamados?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação removerá permanentemente todas as Ordens de Serviço de Corretiva da base de dados (inclusive fotos, peças e assinaturas). Use isso para preparar a nova programação mensal.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={async () => {
                    try {
                      await clearOsTable({ data: { module: "corretiva" } });
                      toast.success("Tabela limpa com sucesso");
                      loadData();
                    } catch (e: any) {
                      toast.error("Erro ao limpar: " + e.message);
                    }
                  }}
                >
                  Confirmar Limpeza
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      }
    />
  );
}
