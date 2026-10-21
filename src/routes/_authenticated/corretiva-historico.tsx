import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Camera,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Layers3,
  Loader2,
  MapPin,
  Package,
  PenLine,
  RotateCcw,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { toast } from "sonner";
import {
  loadEquipe,
  saveEquipe,
  matchEquipe,
  equipeStyles,
  type EquipeFiltro,
} from "@/lib/corretiva/equipe";
import { OsPhotosButton } from "@/components/refrigeracao/os-photos-button";
import { isPreventiva } from "@/lib/corretiva/preventiva-import";
import { normalizeOs } from "@/features/relatorio-diario/lib/daily-maintenance";
import { cn } from "@/lib/utils";
import { exportCorretivaHistoricoToExcel } from "@/lib/corretiva/excel-export";
import {
  desmarcarVerificada,
  fetchVerificacoes,
  marcarVerificada,
  migrarVerificacoesLegadas,
  verificacaoAutorLabel,
  withVerificacao,
  type VerificacaoMap,
} from "@/lib/corretiva/historico-verificacao";

export const Route = createFileRoute("/_authenticated/corretiva-historico")({
  component: HistoricoPage,
});

type OsRow = {
  id: string;
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  ativo: string;
  equipamento: string;
  equipe: string | null;
  patrimonio: string | null;
  assinatura_url: string | null;
  assinatura_nome: string | null;
  assinatura_em: string | null;
  status: string;
  tipo: string | null;
  fim: string | null;
  updated_at: string;
  solicitante: string | null;
};

type DailyReportExecution = {
  item_key: string;
  atividade_data: string;
  os: string;
  equipe: string | null;
  descricao: string | null;
  concluida_em: string;
};

type Foto = {
  id: string;
  storage_path: string | null;
  image_url: string | null;
  created_at: string;
  legenda: string | null;
};

type Peca = {
  id: string;
  descricao: string;
  quantidade: number;
  urgencia: string;
  observacao: string | null;
  modelo: string | null;
  created_at: string;
};

type Problema = {
  id: string;
  descricao: string;
  gravidade: string;
  created_at: string;
};

type VerificationFilter = "pending" | "verified" | "all";

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const historyOsKey = (value: unknown) => normalizeOs(value).trim().toUpperCase();
const isCanonicalHistoryStatus = (status: unknown) => status === "concluida" || status === "cancelada";

function sourceStatusLabel(status: unknown) {
  const raw = String(status ?? "").trim();
  if (!raw) return "Sem status";
  const spaced = raw.replace(/_/g, " ");
  return spaced.charAt(0).toLocaleUpperCase("pt-BR") + spaced.slice(1);
}

function SectionCard({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/35 shadow-[0_16px_40px_-34px_rgba(0,0,0,0.75)]">
      <div className="flex min-h-12 items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-3">
        <span className="text-primary">{icon}</span>
        <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground/80">{title}</h4>
        {typeof count === "number" && (
          <span className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function HistoricoPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<OsRow | null>(null);
  const [equipe, setEquipe] = useState<EquipeFiltro>("todas");
  const [equipes, setEquipes] = useState<string[]>([]);
  const [aba, setAba] = useState<"corretiva" | "backorder">("corretiva");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("pending");
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [pendingOsId, setPendingOsId] = useState<string | null>(null);
  const [reopeningOsId, setReopeningOsId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin } = useIsAdmin();

  useEffect(() => {
    setEquipe(loadEquipe());
    supabase
      .from("corretiva_equipes")
      .select("nome")
      .order("nome")
      .then(({ data }) => setEquipes((data ?? []).map((row: any) => row.nome as string)));
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setUserId(data.user?.id ?? null);
      })
      .catch(() => {
        if (active) setUserId(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const {
    data: dailyExecutions = [],
    isLoading: isLoadingDailyExecutions,
  } = useQuery({
    queryKey: ["corretiva-historico-relatorio-diario"],
    queryFn: async () => {
      const pageSize = 1000;
      const all: DailyReportExecution[] = [];

      for (let page = 0; ; page += 1) {
        const from = page * pageSize;
        const { data, error } = await (supabase as any)
          .from("relatorio_diario_execucoes")
          .select("item_key,atividade_data,os,equipe,descricao,concluida_em")
          .eq("atividade", "Corretiva")
          .order("concluida_em", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as DailyReportExecution[];
        all.push(...batch);
        if (batch.length < pageSize) break;
      }
      return all;
    },
  });

  const dailyByOs = useMemo(() => {
    const map = new Map<string, DailyReportExecution>();
    dailyExecutions.forEach((record) => {
      const key = historyOsKey(record.os);
      if (key && !map.has(key)) map.set(key, record);
    });
    return map;
  }, [dailyExecutions]);

  const {
    data: rows = [],
    isLoading,
  } = useQuery({
    queryKey: ["corretiva-historico", dailyExecutions.length, dailyExecutions[0]?.concluida_em ?? ""],
    enabled: !isLoadingDailyExecutions,
    queryFn: async () => {
      // Busca paginada do catálogo para conseguir exibir também OS ainda abertas,
      // desde que tenham sido concluídas no Relatório Diário.
      const pageSize = 1000;
      const all: OsRow[] = [];

      for (let page = 0; ; page += 1) {
        const from = page * pageSize;
        const { data, error } = await supabase
          .from("corretiva_os")
          .select(
            "id, numero_os, nome_os, predio, andar, local, ativo, equipamento, equipe, patrimonio, assinatura_url, assinatura_nome, assinatura_em, status, tipo, fim, updated_at, solicitante",
          )
          .order("updated_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as OsRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
      }

      return all
        .filter((os) => isCanonicalHistoryStatus(os.status) || dailyByOs.has(historyOsKey(os.numero_os)))
        .sort((a, b) => {
          const aDaily = dailyByOs.get(historyOsKey(a.numero_os));
          const bDaily = dailyByOs.get(historyOsKey(b.numero_os));
          const aCanonical = new Date(a.fim || a.updated_at).getTime() || 0;
          const bCanonical = new Date(b.fim || b.updated_at).getTime() || 0;
          const aDailyTime = new Date(aDaily?.concluida_em || "").getTime() || 0;
          const bDailyTime = new Date(bDaily?.concluida_em || "").getTime() || 0;
          return Math.max(bCanonical, bDailyTime) - Math.max(aCanonical, aDailyTime);
        });
    },
  });

  const {
    data: verificacoes = new Map() as VerificacaoMap,
    isLoading: isLoadingVerificacoes,
    isError: verificacoesFailed,
  } = useQuery({
    queryKey: ["corretiva-historico-verificacoes"],
    queryFn: fetchVerificacoes,
  });

  useEffect(() => {
    const channel = supabase
      .channel("corretiva-historico-relatorio-diario-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "relatorio_diario_execucoes" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["corretiva-historico-relatorio-diario"] });
          void queryClient.invalidateQueries({ queryKey: ["corretiva-historico"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corretiva_os" },
        () => void queryClient.invalidateQueries({ queryKey: ["corretiva-historico"] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const numeroPorOsId = useMemo(
    () => new Map(rows.map((os) => [os.id, os.numero_os] as const)),
    [rows],
  );

  useEffect(() => {
    if (!userId || isLoadingVerificacoes || verificacoesFailed) return;
    if (rows.length === 0) return;

    let active = true;
    migrarVerificacoesLegadas(userId, verificacoes, numeroPorOsId, userId)
      .then((migrados) => {
        if (!active || migrados === 0) return;
        toast.success(
          migrados +
            (migrados === 1
              ? " conferência local foi migrada para o histórico."
              : " conferências locais foram migradas para o histórico."),
        );
        queryClient.invalidateQueries({ queryKey: ["corretiva-historico-verificacoes"] });
      })
      .catch((error) => {
        console.error("[CorretivaHistorico] Falha ao migrar conferências locais:", error);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoadingVerificacoes, verificacoesFailed, rows.length]);

  const setEquipeAndPersist = (value: EquipeFiltro) => {
    setEquipe(value);
    saveEquipe(value);
  };

  const handleVerification = useCallback(
    async (os: OsRow) => {
      if (!isCanonicalHistoryStatus(os.status)) {
        toast.info("Este chamado foi concluído somente no Relatório Diário e ainda aguarda o status oficial do Corretiva Novo.");
        return;
      }
      if (userId === undefined) {
        toast.error("Aguarde o carregamento do controle de conferência.");
        return;
      }
      if (pendingOsId) return;

      const jaVerificada = verificacoes.has(os.id);
      setPendingOsId(os.id);

      try {
        if (jaVerificada) {
          await desmarcarVerificada(os.id);
          queryClient.setQueryData<VerificacaoMap>(
            ["corretiva-historico-verificacoes"],
            (current: VerificacaoMap | undefined) => withVerificacao(current ?? new Map(), os.id, null),
          );
          toast.success("OS " + os.numero_os + " voltou para as próximas exportações.");
        } else {
          const registro = await marcarVerificada(os.id, os.numero_os, userId);
          queryClient.setQueryData<VerificacaoMap>(
            ["corretiva-historico-verificacoes"],
            (current: VerificacaoMap | undefined) => withVerificacao(current ?? new Map(), os.id, registro),
          );
          toast.success("OS " + os.numero_os + " verificada e guardada no histórico de verificados.");
        }
      } catch (error) {
        console.error("[CorretivaHistorico] Falha ao salvar conferência:", error);
        toast.error("Não foi possível salvar a conferência no servidor. A marcação não foi aplicada.");
      } finally {
        setPendingOsId(null);
      }
    },
    [userId, verificacoes, pendingOsId, queryClient],
  );

  const handleReopen = useCallback(
    async (os: OsRow) => {
      if (!isAdmin || reopeningOsId || os.status !== "concluida") return;
      const confirmed = window.confirm(
        `Voltar a OS ${os.numero_os} para pendente? A conclusão oficial será desfeita e o chamado voltará para a lista de corretivas abertas.`,
      );
      if (!confirmed) return;

      setReopeningOsId(os.id);
      try {
        const { data, error } = await supabase
          .from("corretiva_os")
          .update({ status: "aberta", updated_at: new Date().toISOString() } as any)
          .eq("id", os.id)
          .eq("status", "concluida")
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Este chamado não está mais concluído. Atualize o histórico e tente novamente.");
        if (open?.id === os.id) setOpen(null);
        await queryClient.invalidateQueries({ queryKey: ["corretiva-historico"] });
        toast.success(`OS ${os.numero_os} voltou para pendente no Corretiva Novo.`);
      } catch (error: any) {
        console.error("[CorretivaHistorico] Erro ao voltar OS para pendente:", error);
        toast.error(error?.message || "Não foi possível voltar o chamado para pendente.");
      } finally {
        setReopeningOsId(null);
      }
    },
    [isAdmin, open?.id, queryClient, reopeningOsId],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((os) => {
      const preventiva = isPreventiva(os.tipo);
      if (aba === "backorder" ? !preventiva : preventiva) return false;
      if (!matchEquipe(os.equipe, equipe)) return false;
      if (!query) return true;
      return [os.numero_os, os.nome_os, os.ativo, os.equipamento, os.predio, os.local, os.solicitante]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [rows, search, equipe, aba]);

  const exportableRows = useMemo(
    () => filtered.filter((os) => isCanonicalHistoryStatus(os.status) && !verificacoes.has(os.id)),
    [filtered, verificacoes],
  );

  const displayedRows = useMemo(() => {
    if (verificationFilter === "all") return filtered;
    if (verificationFilter === "verified") {
      return filtered.filter((os) => isCanonicalHistoryStatus(os.status) && verificacoes.has(os.id));
    }
    return filtered.filter((os) => !verificacoes.has(os.id));
  }, [filtered, verificationFilter, verificacoes]);

  const metrics = useMemo(() => {
    const canonicalRows = filtered.filter((os) => isCanonicalHistoryStatus(os.status));
    const verified = canonicalRows.filter((os) => verificacoes.has(os.id)).length;
    return {
      total: filtered.length,
      exportable: exportableRows.length,
      verified,
      concluidas: filtered.filter((os) => os.status === "concluida").length,
      canceladas: filtered.filter((os) => os.status === "cancelada").length,
      relatorioDiario: filtered.filter((os) => dailyByOs.has(historyOsKey(os.numero_os))).length,
    };
  }, [dailyByOs, exportableRows.length, filtered, verificacoes]);

  const handleExport = useCallback(async () => {
    if (exportableRows.length === 0 || isExporting) return;
    if (verificacoesFailed) {
      toast.error("O histórico de verificados não pôde ser carregado. Recarregue antes de exportar.");
      return;
    }
    setIsExporting(true);
    try {
      await exportCorretivaHistoricoToExcel(exportableRows);
      toast.success(`${exportableRows.length} ${exportableRows.length === 1 ? "chamado exportado" : "chamados exportados"}.`);
    } catch (error) {
      console.error("[CorretivaHistorico] Falha ao exportar histórico:", error);
      toast.error("Não foi possível gerar a planilha. Tente novamente.");
    } finally {
      setIsExporting(false);
    }
  }, [exportableRows, isExporting, verificacoesFailed]);

  const openDailyInfo = useCallback((os: OsRow, record: DailyReportExecution) => {
    const when = formatDateTime(record.concluida_em) || record.atividade_data;
    toast.info(
      `OS ${os.numero_os} concluída no Relatório Diário em ${when}${record.descricao ? ` • ${record.descricao}` : ""}`,
      { duration: 7000 },
    );
  }, []);

  return (
    <PageShell
      title="Histórico de execução"
      description="Diferencie conclusões oficiais do Corretiva Novo das execuções registradas somente no Relatório Diário."
    >
      <GlassCard className="overflow-hidden p-0 active:scale-100">
        <div className="border-b border-border/50 bg-gradient-to-b from-muted/25 to-transparent px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="inline-flex rounded-xl border border-border/60 bg-background/55 p-1 shadow-inner">
                {([
                  { key: "corretiva", label: "Corretivas" },
                  { key: "backorder", label: "Backorders" },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setAba(tab.key)}
                    aria-pressed={aba === tab.key}
                    className={cn(
                      "min-h-10 rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                      aba === tab.key
                        ? "border-primary/20 bg-primary/12 text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                O selo azul identifica a origem “Relatório Diário”. Uma OS somente registrada ali pode aparecer aqui mesmo ainda aberta no Corretiva Novo, mas não entra no Excel de finalizados até o status oficial ser concluído ou cancelado.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={handleExport}
              disabled={userId === undefined || isLoadingVerificacoes || exportableRows.length === 0 || isExporting}
              className="h-11 gap-2 rounded-xl border-emerald-500/25 bg-emerald-500/10 px-4 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {exportableRows.length === 0 ? "Nada novo para exportar" : `Exportar Excel (${exportableRows.length})`}
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "No histórico", value: metrics.total, className: "text-foreground" },
              { label: "A exportar", value: metrics.exportable, className: "text-amber-500" },
              { label: "Verificados", value: metrics.verified, className: "text-primary" },
              { label: "Finalizados", value: metrics.concluidas, className: "text-emerald-500" },
              { label: "Cancelados", value: metrics.canceladas, className: "text-destructive" },
              { label: "Relatório diário", value: metrics.relatorioDiario, className: "text-sky-500" },
            ].map((metric) => (
              <div key={metric.label} className="rounded-xl border border-border/50 bg-background/45 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
                <p className={cn("mt-1 text-xl font-black tabular-nums", metric.className)}>{metric.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 border-b border-border/50 bg-background/25 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(200px,0.32fr)_minmax(230px,0.36fr)] sm:p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar OS, solicitante, ativo, equipamento, prédio ou local…"
              className="premium-input h-11 rounded-xl pl-10 text-sm"
            />
          </div>
          <Select value={equipe} onValueChange={(value) => setEquipeAndPersist(value as EquipeFiltro)}>
            <SelectTrigger className="premium-input h-11 rounded-xl text-sm">
              <SelectValue placeholder="Todas as equipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as equipes</SelectItem>
              {equipes.map((team) => <SelectItem key={team} value={team}>{team}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={verificationFilter} onValueChange={(value) => setVerificationFilter(value as VerificationFilter)}>
            <SelectTrigger className="premium-input h-11 rounded-xl text-sm" aria-label="Filtrar por conferência">
              <SelectValue placeholder="Pendentes de verificação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes / Relatório Diário</SelectItem>
              <SelectItem value="verified">Histórico de verificados</SelectItem>
              <SelectItem value="all">Todos os chamados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {equipe !== "todas" && (
          <div className="flex items-center gap-2 border-b border-border/40 bg-primary/[0.035] px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
            <span>Filtro ativo:</span>
            <Badge variant="secondary" className="rounded-lg text-[10px]">{equipe}</Badge>
            <button type="button" onClick={() => setEquipeAndPersist("todas")} className="ml-auto min-h-9 rounded-lg px-2 font-semibold text-primary hover:bg-primary/10">Limpar filtro</button>
          </div>
        )}

        <div className="p-3 sm:p-5">
          {isLoading || isLoadingDailyExecutions ? (
            <BrandedLoadingState label="Carregando histórico de execução" detail="Sincronizando Corretiva Novo e Relatório Diário" variant="panel" />
          ) : displayedRows.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
              <Search className="mb-3 h-6 w-6 text-muted-foreground/60" />
              <p className="font-semibold text-foreground">Nenhum chamado encontrado</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">Ajuste a busca ou os filtros para visualizar outros registros.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {displayedRows.map((os) => {
                const cancelada = os.status === "cancelada";
                const canonicalHistory = isCanonicalHistoryStatus(os.status);
                const dailyRecord = dailyByOs.get(historyOsKey(os.numero_os)) ?? null;
                const dailyOnly = Boolean(dailyRecord) && !canonicalHistory;
                const registro = verificacoes.get(os.id) ?? null;
                const verified = Boolean(registro) && canonicalHistory;
                const verifiedAt = registro ? formatDateTime(registro.verificadoEm) : null;
                const verifiedBy = registro ? verificacaoAutorLabel(registro) : null;
                const saving = pendingOsId === os.id;
                const reopening = reopeningOsId === os.id;
                const StatusIcon = cancelada ? XCircle : CheckCircle2;
                const teamStyle = equipeStyles(os.equipe);
                const selected = open?.id === os.id;
                const completedAt = dailyOnly
                  ? formatDateTime(dailyRecord?.concluida_em)
                  : formatDateTime(os.fim || os.updated_at);

                return (
                  <li key={os.id}>
                    <div
                      className={cn(
                        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card/35 p-3 transition-colors sm:flex-row sm:items-stretch sm:p-3.5",
                        dailyOnly
                          ? "border-sky-500/20 hover:border-sky-500/35 hover:bg-sky-500/[0.04]"
                          : cancelada
                            ? "border-destructive/18 hover:border-destructive/30 hover:bg-destructive/[0.035]"
                            : "border-emerald-500/15 hover:border-emerald-500/30 hover:bg-emerald-500/[0.035]",
                        verified && "border-primary/25 bg-primary/[0.04]",
                        selected && "ring-1 ring-primary/20",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-y-3 left-0 w-0.5 rounded-r-full",
                          verified ? "bg-primary/80" : dailyOnly ? "bg-sky-500/80" : cancelada ? "bg-destructive/70" : "bg-emerald-500/80",
                        )}
                      />

                      <button
                        type="button"
                        onClick={() => setOpen(os)}
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1.5 text-left outline-none hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-primary/45"
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                            dailyOnly
                              ? "border-sky-500/20 bg-sky-500/10 text-sky-500"
                              : cancelada
                                ? "border-destructive/20 bg-destructive/10 text-destructive"
                                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
                          )}
                        >
                          <StatusIcon className="h-5 w-5" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-sm font-black tracking-tight">OS {os.numero_os}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-lg text-[9px] font-bold uppercase tracking-wider",
                                dailyOnly
                                  ? "border-sky-500/25 bg-sky-500/8 text-sky-700 dark:text-sky-300"
                                  : cancelada
                                    ? "border-destructive/25 bg-destructive/8 text-destructive"
                                    : "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300",
                              )}
                            >
                              {dailyOnly ? `${sourceStatusLabel(os.status)} no Corretiva Novo` : cancelada ? "Cancelada" : "Finalizada"}
                            </Badge>
                            {os.equipe && (
                              <Badge variant="outline" className={cn("rounded-lg text-[9px]", teamStyle.badge)}>
                                <span className={cn("mr-1 h-1.5 w-1.5 rounded-full", teamStyle.dot)} />{os.equipe}
                              </Badge>
                            )}
                            {os.assinatura_url && (
                              <Badge variant="outline" className="rounded-lg border-primary/20 bg-primary/5 text-[9px] text-primary">
                                <PenLine className="mr-1 h-3 w-3" /> Rubricada
                              </Badge>
                            )}
                            {verified && (
                              <Badge variant="outline" className="rounded-lg border-primary/25 bg-primary/10 text-[9px] font-bold text-primary">
                                <CheckCheck className="mr-1 h-3 w-3" /> Verificado{verifiedAt ? ` · ${verifiedAt}` : ""}
                              </Badge>
                            )}
                          </span>

                          {verifiedBy && canonicalHistory && <span className="mt-1 block text-[10px] text-muted-foreground/80">{verifiedBy}</span>}
                          <span className="mt-2 block text-sm font-semibold leading-snug text-foreground/90 sm:text-[15px]">{os.nome_os || "Sem descrição da atividade"}</span>
                          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{[os.predio, os.andar, os.local].filter(Boolean).join(" · ") || "Local não informado"}</span>
                            </span>
                            {completedAt && <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarClock className="h-3.5 w-3.5" />{completedAt}</span>}
                          </span>
                        </span>
                        <ChevronRight className="mt-3 hidden h-4 w-4 shrink-0 text-muted-foreground/55 group-hover:text-primary sm:block" />
                      </button>

                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-2 sm:max-w-64 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                        {dailyRecord && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title={dailyRecord.descricao || "Conclusão registrada no Relatório Diário"}
                            onClick={() => openDailyInfo(os, dailyRecord)}
                            className="h-9 gap-1.5 rounded-lg border-sky-500/30 bg-sky-500/10 px-2.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-500/15 dark:text-sky-300"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Concluído no Relatório Diário
                          </Button>
                        )}
                        {os.status === "concluida" && isAdmin && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="Voltar este chamado para o status Aberta no Corretiva Novo"
                            onClick={() => handleReopen(os)}
                            disabled={Boolean(reopeningOsId)}
                            className="h-9 gap-1.5 rounded-lg border-amber-500/30 bg-amber-500/10 px-2.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
                          >
                            {reopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Voltar para pendente
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerification(os)}
                          disabled={!canonicalHistory || userId === undefined || saving}
                          aria-pressed={verified}
                          className={cn(
                            "h-9 gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold",
                            verified
                              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                              : dailyOnly
                                ? "border-border/40 bg-muted/20 text-muted-foreground"
                                : "border-border/60 bg-background/55 text-muted-foreground hover:border-primary/25 hover:text-foreground",
                          )}
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                          {dailyOnly ? "Aguardando Corretiva Novo" : verified ? "Desfazer verificação" : "Marcar verificado"}
                        </Button>
                        <OsPhotosButton osId={os.id} numeroOs={os.numero_os} modulo="corretiva" />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </GlassCard>

      <OsDetail
        os={open}
        dailyExecution={open ? dailyByOs.get(historyOsKey(open.numero_os)) ?? null : null}
        onClose={() => setOpen(null)}
      />
    </PageShell>
  );
}

function OsDetail({
  os,
  dailyExecution,
  onClose,
}: {
  os: OsRow | null;
  dailyExecution: DailyReportExecution | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["corretiva-historico-detail", os?.id],
    enabled: !!os,
    queryFn: async () => {
      if (!os) return { fotos: [] as Foto[], pecas: [] as Peca[], problemas: [] as Problema[] };
      const [photosResult, partsResult, issuesResult] = await Promise.all([
        supabase
          .from("corretiva_fotos")
          .select("id, storage_path, image_url, created_at, legenda")
          .eq("os_id", os.id)
          .order("created_at"),
        supabase
          .from("corretiva_pecas")
          .select("id, descricao, modelo, quantidade, urgencia, observacao, created_at")
          .eq("os_id", os.id)
          .order("created_at"),
        supabase
          .from("corretiva_problemas")
          .select("id, descricao, gravidade, created_at")
          .eq("os_id", os.id)
          .order("created_at"),
      ]);
      return {
        fotos: (photosResult.data ?? []) as Foto[],
        pecas: (partsResult.data ?? []) as Peca[],
        problemas: (issuesResult.data ?? []) as Problema[],
      };
    },
  });

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState(false);

  useEffect(() => {
    (async () => {
      if (!data?.fotos?.length) {
        setUrls({});
        return;
      }
      setLoadingUrls(true);
      const next: Record<string, string> = {};
      const legacy: Foto[] = [];
      for (const photo of data.fotos) {
        if (photo.image_url) next[photo.id] = photo.image_url;
        else if (photo.storage_path) legacy.push(photo);
      }
      if (legacy.length > 0) {
        try {
          const paths = legacy.map((photo) => photo.storage_path as string);
          const { data: signedUrls, error } = await supabase.storage
            .from("corretiva-fotos")
            .createSignedUrls(paths, 86400);
          if (error) throw error;
          legacy.forEach((photo, index) => {
            const url = signedUrls?.[index]?.signedUrl;
            if (url) next[photo.id] = url;
          });
        } catch (error) {
          console.error("[CorretivaHistorico] Erro ao resolver URLs legadas:", error);
        }
      }
      setUrls(next);
      setLoadingUrls(false);
    })();
  }, [data?.fotos]);

  const openPhoto = useCallback((photo: Foto) => {
    const url = urls[photo.id];
    if (!url) return toast.error("URL da foto não disponível.");
    window.open(url, "_blank", "noopener,noreferrer");
  }, [urls]);

  const statusIsCancelled = os?.status === "cancelada";
  const canonicalCompleted = os?.status === "concluida";
  const dailyOnly = Boolean(dailyExecution) && !statusIsCancelled && !canonicalCompleted;
  const completedAt = dailyOnly
    ? formatDateTime(dailyExecution?.concluida_em)
    : formatDateTime(os?.fim || os?.updated_at);
  const metadata = [
    { label: "Prédio", value: os?.predio || "—", icon: Building2 },
    { label: "Andar", value: os?.andar || "—", icon: Layers3 },
    { label: "Local", value: os?.local || "—", icon: MapPin },
    { label: "Ativo", value: os?.ativo || "—", icon: Cpu },
    { label: "Equipamento", value: os?.equipamento || "—", icon: Package },
    { label: "Solicitante", value: os?.solicitante || "—", icon: UserRound },
  ];

  return (
    <Dialog open={!!os} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl gap-0 overflow-hidden rounded-[26px] border-border/60 bg-background/95 p-0 sm:w-[calc(100vw-2rem)] sm:rounded-[30px]">
        <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[90vh]">
          <div className="sticky top-0 z-20 border-b border-border/55 bg-background/95 px-4 py-4 pr-14 sm:px-6 sm:py-5 sm:pr-16">
            <DialogHeader className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-lg border border-primary/20 bg-primary/10 font-mono text-[10px] font-bold text-primary">OS {os?.numero_os}</Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-lg text-[9px] font-bold uppercase tracking-wider",
                    dailyOnly
                      ? "border-sky-500/25 bg-sky-500/8 text-sky-700 dark:text-sky-300"
                      : statusIsCancelled
                        ? "border-destructive/25 bg-destructive/8 text-destructive"
                        : "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300",
                  )}
                >
                  {statusIsCancelled ? <XCircle className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                  {dailyOnly ? "Concluído no Relatório Diário" : statusIsCancelled ? "Cancelada" : "Finalizada"}
                </Badge>
                {os?.equipe && <Badge variant="outline" className={cn("rounded-lg text-[9px]", equipeStyles(os.equipe).badge)}>{os.equipe}</Badge>}
                {completedAt && <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{completedAt}</span>}
              </div>
              <DialogTitle className="pr-3 text-lg font-black leading-snug tracking-tight sm:text-2xl">{os?.nome_os || "Detalhes da execução"}</DialogTitle>
              <DialogDescription className="text-xs leading-relaxed text-muted-foreground sm:text-sm">Registro consolidado do chamado, com fonte da conclusão, localização, evidências, materiais e ocorrências.</DialogDescription>
            </DialogHeader>
          </div>

          {dailyExecution && (
            <div className="mx-4 mt-4 rounded-2xl border border-sky-500/25 bg-sky-500/[0.07] p-3 sm:mx-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-sky-700 dark:text-sky-300">
                <FileSpreadsheet className="h-4 w-4" /> Concluído no Relatório Diário
                <span className="font-medium text-muted-foreground">{formatDateTime(dailyExecution.concluida_em) || dailyExecution.atividade_data}</span>
              </div>
              {dailyExecution.descricao && <p className="mt-1.5 text-xs leading-relaxed"><span className="font-semibold">O que foi feito:</span> {dailyExecution.descricao}</p>}
              {dailyOnly && <p className="mt-1 text-[10px] text-muted-foreground">O chamado original continua com status “{sourceStatusLabel(os?.status)}” no Corretiva Novo.</p>}
            </div>
          )}

          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {metadata.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="min-w-0 rounded-2xl border border-border/55 bg-card/35 p-3">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0 text-primary/75" />{item.label}</div>
                    <p className="mt-2 truncate text-sm font-bold" title={item.value}>{item.value}</p>
                  </div>
                );
              })}
            </div>

            {os?.nome_os && (
              <div className="rounded-2xl border border-border/55 bg-muted/15 p-4">
                <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Descrição da atividade</p>
                <p className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">{os.nome_os}</p>
              </div>
            )}

            {isLoading || loadingUrls ? (
              <BrandedLoadingState label="Carregando evidências do chamado" detail="Organizando fotos, materiais e ocorrências" variant="panel" />
            ) : (
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
                <SectionCard title="Evidências fotográficas" icon={<Camera className="h-4 w-4" />} count={data?.fotos.length ?? 0}>
                  {data?.fotos.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {data.fotos.map((photo, index) => {
                        const photoUrl = urls[photo.id];
                        return (
                          <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
                            {photoUrl ? (
                              <a href={photoUrl} target="_blank" rel="noreferrer" className="block h-full w-full" aria-label={`Abrir foto ${index + 1}`}>
                                <img src={photoUrl} className="h-full w-full object-cover" alt={photo.legenda || `Foto ${index + 1}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8 text-[10px] font-semibold text-white"><span className="truncate">{photo.legenda || `Foto ${index + 1}`}</span><ExternalLink className="h-3.5 w-3.5" /></span>
                              </a>
                            ) : <div className="grid h-full place-items-center text-xs text-muted-foreground">Carregando…</div>}
                            <button type="button" onClick={() => openPhoto(photo)} disabled={!photoUrl} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-white disabled:opacity-30" title="Abrir imagem"><Download className="h-3.5 w-3.5" /></button>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="rounded-xl border border-dashed border-border/55 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma evidência fotográfica registrada.</div>}
                </SectionCard>

                <div className="space-y-4">
                  <SectionCard title="Peças solicitadas" icon={<Package className="h-4 w-4" />} count={data?.pecas.length ?? 0}>
                    {data?.pecas.length ? (
                      <ul className="space-y-2">
                        {data.pecas.map((part) => (
                          <li key={part.id} className="rounded-xl border border-border/50 bg-background/40 p-3">
                            <div className="flex gap-1.5"><span className="min-w-0 flex-1 text-sm font-semibold">{part.descricao}</span><Badge variant="outline" className="rounded-md text-[9px]">Qtd {part.quantidade}</Badge></div>
                            <div className="mt-2 flex flex-wrap gap-1.5">{part.modelo && <Badge variant="outline" className="rounded-md text-[9px]">{part.modelo}</Badge>}<Badge variant="secondary" className="rounded-md text-[9px]">{part.urgencia}</Badge></div>
                            {part.observacao && <p className="mt-2 text-xs text-muted-foreground">{part.observacao}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-xs text-muted-foreground">Nenhum pedido de material registrado.</p>}
                  </SectionCard>

                  <SectionCard title="Ocorrências" icon={<AlertTriangle className="h-4 w-4" />} count={data?.problemas.length ?? 0}>
                    {data?.problemas.length ? (
                      <ul className="space-y-2">
                        {data.problemas.map((issue) => (
                          <li key={issue.id} className="rounded-xl border border-destructive/15 bg-destructive/[0.035] p-3">
                            <Badge variant="outline" className="rounded-md border-destructive/20 bg-destructive/5 text-[9px] text-destructive">{issue.gravidade}</Badge>
                            <p className="mt-2 text-sm leading-relaxed text-foreground/85">{issue.descricao}</p>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-xs text-muted-foreground">Nenhuma ocorrência registrada.</p>}
                  </SectionCard>

                  {os?.assinatura_url && (
                    <SectionCard title="Rubrica do solicitante" icon={<PenLine className="h-4 w-4" />}>
                      <div className="overflow-hidden rounded-xl border border-border/55 bg-white p-3"><img loading="lazy" decoding="async" src={os.assinatura_url} alt="Rubrica do solicitante" className="mx-auto max-h-28 max-w-full object-contain" /></div>
                      <p className="mt-2 text-[10px] text-muted-foreground">{os.assinatura_nome ? `${os.assinatura_nome} · ` : ""}{os.assinatura_em ? formatDateTime(os.assinatura_em) : ""}</p>
                    </SectionCard>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
