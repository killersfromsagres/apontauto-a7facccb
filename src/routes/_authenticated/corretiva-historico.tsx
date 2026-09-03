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
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
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
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();

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
    data: rows = [],
    isLoading,
  } = useQuery({
    queryKey: ["corretiva-historico"],
    queryFn: async () => {
      // Paginação explícita: o limite fixo anterior escondia OS antigas.
      const pageSize = 1000;
      const all: OsRow[] = [];

      for (let page = 0; ; page += 1) {
        const from = page * pageSize;
        const { data, error } = await supabase
          .from("corretiva_os")
          .select(
            "id, numero_os, nome_os, predio, andar, local, ativo, equipamento, equipe, patrimonio, assinatura_url, assinatura_nome, assinatura_em, status, tipo, fim, updated_at, solicitante",
          )
          .in("status", ["concluida", "cancelada"])
          .order("updated_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;

        const batch = (data ?? []) as OsRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
      }

      return all;
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

  const numeroPorOsId = useMemo(
    () => new Map(rows.map((os) => [os.id, os.numero_os] as const)),
    [rows],
  );

  // Migração única do resíduo em localStorage para o banco.
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
          toast.success(
            "OS " + os.numero_os + " verificada e guardada no histórico de verificados.",
          );
        }
      } catch (error) {
        console.error("[CorretivaHistorico] Falha ao salvar conferência:", error);
        toast.error(
          "Não foi possível salvar a conferência no servidor. A marcação não foi aplicada.",
        );
      } finally {
        setPendingOsId(null);
      }
    },
    [userId, verificacoes, pendingOsId, queryClient],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((os) => {
      const preventiva = isPreventiva(os.tipo);
      if (aba === "backorder" ? !preventiva : preventiva) return false;
      if (!matchEquipe(os.equipe, equipe)) return false;
      if (!query) return true;

      return [os.numero_os, os.nome_os, os.ativo, os.equipamento, os.predio, os.local]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(query));
    });
  }, [rows, search, equipe, aba]);

  const exportableRows = useMemo(
    () => filtered.filter((os) => !verificacoes.has(os.id)),
    [filtered, verificacoes],
  );

  const displayedRows = useMemo(() => {
    if (verificationFilter === "all") return filtered;
    const shouldBeVerified = verificationFilter === "verified";
    return filtered.filter((os) => verificacoes.has(os.id) === shouldBeVerified);
  }, [filtered, verificationFilter, verificacoes]);

  const metrics = useMemo(() => {
    const concluidas = filtered.filter((os) => os.status === "concluida").length;
    const canceladas = filtered.filter((os) => os.status === "cancelada").length;
    const rubricadas = filtered.filter((os) => Boolean(os.assinatura_url)).length;
    const verified = filtered.filter((os) => verificacoes.has(os.id)).length;
    return {
      total: filtered.length,
      exportable: filtered.length - verified,
      verified,
      concluidas,
      canceladas,
      rubricadas,
    };
  }, [filtered, verificacoes]);

  const handleExport = useCallback(async () => {
    if (exportableRows.length === 0 || isExporting) return;
    if (verificacoesFailed) {
      toast.error(
        "O histórico de verificados não pôde ser carregado. Recarregue antes de exportar para não repetir chamados já conferidos.",
      );
      return;
    }

    setIsExporting(true);
    try {
      await exportCorretivaHistoricoToExcel(exportableRows);
      const noun = exportableRows.length === 1 ? "chamado exportado" : "chamados exportados";
      toast.success(exportableRows.length + " " + noun + ".");
    } catch (error) {
      console.error("[CorretivaHistorico] Falha ao exportar histórico:", error);
      toast.error("Não foi possível gerar a planilha. Tente novamente.");
    } finally {
      setIsExporting(false);
    }
  }, [exportableRows, isExporting, verificacoesFailed]);


  return (
    <PageShell
      title="Histórico de execução"
      description="Confira os chamados concluídos e mantenha as próximas exportações livres de itens já revisados."
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
                      "min-h-10 rounded-lg border px-4 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-100 motion-reduce:transition-none",
                      aba === tab.key
                        ? "border-primary/20 bg-primary/12 text-foreground shadow-[0_8px_22px_-18px_hsl(var(--primary))]"
                        : "border-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Marque uma OS como verificada para retirá-la das próximas planilhas. Você pode desfazer a marcação a qualquer momento.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!verificationScope || exportableRows.length === 0 || isExporting}
              className="h-11 gap-2 rounded-xl border-emerald-500/25 bg-emerald-500/10 px-4 text-emerald-700 shadow-none transition-[background-color,border-color,color] hover:border-emerald-500/40 hover:bg-emerald-500/15 dark:text-emerald-300 active:scale-100 motion-reduce:transition-none"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {exportableRows.length === 0
                ? "Nada novo para exportar"
                : "Exportar Excel (" + exportableRows.length + ")"}
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "No histórico", value: metrics.total, className: "text-foreground" },
              { label: "A exportar", value: metrics.exportable, className: "text-amber-500" },
              { label: "Verificados", value: metrics.verified, className: "text-primary" },
              { label: "Finalizados", value: metrics.concluidas, className: "text-emerald-500" },
              { label: "Cancelados", value: metrics.canceladas, className: "text-destructive" },
              { label: "Rubricados", value: metrics.rubricadas, className: "text-primary" },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-border/50 bg-background/45 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {metric.label}
                </p>
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
              placeholder="Buscar OS, ativo, equipamento, prédio ou local…"
              className="premium-input h-11 rounded-xl pl-10 text-sm sm:text-base"
            />
          </div>
          <Select value={equipe} onValueChange={(value) => setEquipeAndPersist(value as EquipeFiltro)}>
            <SelectTrigger className="premium-input h-11 rounded-xl text-sm">
              <SelectValue placeholder="Todas as equipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as equipes</SelectItem>
              {equipes.map((team) => (
                <SelectItem key={team} value={team}>
                  {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={verificationFilter}
            onValueChange={(value) => setVerificationFilter(value as VerificationFilter)}
          >
            <SelectTrigger className="premium-input h-11 rounded-xl text-sm" aria-label="Filtrar por conferência">
              <SelectValue placeholder="Pendentes de verificação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes de verificação</SelectItem>
              <SelectItem value="verified">Já verificados</SelectItem>
              <SelectItem value="all">Todos os chamados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {equipe !== "todas" && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-primary/[0.035] px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
            <span>Filtro ativo:</span>
            <Badge variant="secondary" className="rounded-lg text-[10px]">
              {equipe}
            </Badge>
            <button
              type="button"
              onClick={() => setEquipeAndPersist("todas")}
              className="ml-auto min-h-9 rounded-lg px-2 font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-100"
            >
              Limpar filtro
            </button>
          </div>
        )}

        <div className="p-3 sm:p-5">
          {isLoading ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" />
              <span className="font-medium">Carregando histórico de execução…</span>
            </div>
          ) : displayedRows.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
              <Search className="mb-3 h-6 w-6 text-muted-foreground/60" />
              <p className="font-semibold text-foreground">
                {verificationFilter === "pending" && filtered.length > 0
                  ? "Todos os chamados foram verificados"
                  : "Nenhum chamado encontrado"}
              </p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {verificationFilter === "pending" && filtered.length > 0
                  ? "Os próximos chamados concluídos aparecerão aqui e entrarão na próxima exportação."
                  : "Ajuste a busca ou os filtros para visualizar outros registros."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {displayedRows.map((os) => {
                const cancelada = os.status === "cancelada";
                const verified = verifiedOsIds.has(os.id);
                const StatusIcon = cancelada ? XCircle : CheckCircle2;
                const teamStyle = equipeStyles(os.equipe);
                const selected = open?.id === os.id;
                const completedAt = formatDateTime(os.fim || os.updated_at);

                return (
                  <li key={os.id}>
                    <div
                      className={cn(
                        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card/35 p-3 shadow-[0_14px_38px_-34px_rgba(0,0,0,0.8)] transition-[background-color,border-color,box-shadow] duration-200 sm:flex-row sm:items-stretch sm:p-3.5 motion-reduce:transition-none",
                        cancelada
                          ? "border-destructive/18 hover:border-destructive/30 hover:bg-destructive/[0.035]"
                          : "border-emerald-500/15 hover:border-emerald-500/30 hover:bg-emerald-500/[0.035]",
                        verified && "border-primary/25 bg-primary/[0.04] hover:border-primary/35 hover:bg-primary/[0.055]",
                        selected && "border-primary/40 bg-primary/[0.045] ring-1 ring-primary/15",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-y-3 left-0 w-0.5 rounded-r-full",
                          verified ? "bg-primary/80" : cancelada ? "bg-destructive/70" : "bg-emerald-500/80",
                        )}
                      />

                      <button
                        type="button"
                        onClick={() => setOpen(os)}
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1.5 text-left outline-none transition-[background-color,box-shadow] duration-200 hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-100 active:translate-y-0 motion-reduce:transition-none"
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                            cancelada
                              ? "border-destructive/20 bg-destructive/10 text-destructive"
                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
                          )}
                        >
                          <StatusIcon className="h-5 w-5" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-sm font-black tracking-tight text-foreground">
                              OS {os.numero_os}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-lg text-[9px] font-bold uppercase tracking-wider",
                                cancelada
                                  ? "border-destructive/25 bg-destructive/8 text-destructive"
                                  : "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300",
                              )}
                            >
                              {cancelada ? "Cancelada" : "Finalizada"}
                            </Badge>
                            {os.equipe && (
                              <Badge variant="outline" className={cn("rounded-lg text-[9px]", teamStyle.badge)}>
                                <span className={cn("mr-1 h-1.5 w-1.5 rounded-full", teamStyle.dot)} />
                                {os.equipe}
                              </Badge>
                            )}
                            {os.assinatura_url && (
                              <Badge variant="outline" className="rounded-lg border-primary/20 bg-primary/5 text-[9px] text-primary">
                                <PenLine className="mr-1 h-3 w-3" /> Rubricada
                              </Badge>
                            )}
                            {verified && (
                              <Badge
                                variant="outline"
                                className="rounded-lg border-primary/25 bg-primary/10 text-[9px] font-bold uppercase tracking-wider text-primary"
                              >
                                <CheckCheck className="mr-1 h-3 w-3" /> Verificado
                              </Badge>
                            )}
                          </span>

                          <span className="mt-2 block text-sm font-semibold leading-snug text-foreground/90 sm:text-[15px]">
                            {os.nome_os || "Sem descrição da atividade"}
                          </span>

                          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">
                                {[os.predio, os.andar, os.local].filter(Boolean).join(" · ") || "Local não informado"}
                              </span>
                            </span>
                            {completedAt && (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <CalendarClock className="h-3.5 w-3.5" />
                                {completedAt}
                              </span>
                            )}
                          </span>
                        </span>

                        <ChevronRight className="mt-3 hidden h-4 w-4 shrink-0 text-muted-foreground/55 transition-colors group-hover:text-primary sm:block" />
                      </button>

                      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 sm:max-w-56 sm:justify-end sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 sm:hidden">
                          Conferência
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerification(os)}
                          disabled={!verificationScope}
                          aria-pressed={verified}
                          className={cn(
                            "h-9 gap-1.5 rounded-lg px-2.5 text-xs font-semibold shadow-none active:scale-100",
                            verified
                              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                              : "border-border/60 bg-background/55 text-muted-foreground hover:border-primary/25 hover:bg-primary/5 hover:text-foreground",
                          )}
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          {verified ? "Verificado" : "Marcar verificado"}
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

      <OsDetail os={open} onClose={() => setOpen(null)} />
    </PageShell>
  );
}

function OsDetail({ os, onClose }: { os: OsRow | null; onClose: () => void }) {
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
        if (photo.image_url) {
          next[photo.id] = photo.image_url;
        } else if (photo.storage_path) {
          legacy.push(photo);
        }
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

  const openPhoto = useCallback(
    (photo: Foto) => {
      const url = urls[photo.id];
      if (!url) {
        toast.error("URL da foto não disponível.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [urls],
  );

  const statusIsCancelled = os?.status === "cancelada";
  const completedAt = formatDateTime(os?.fim || os?.updated_at);
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
      <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl gap-0 overflow-hidden rounded-[26px] border-border/60 bg-background/95 p-0 shadow-[0_32px_100px_-35px_rgba(0,0,0,0.78)] data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 sm:w-[calc(100vw-2rem)] sm:rounded-[30px] motion-reduce:animate-none">
        <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain sm:max-h-[90vh]">
          <div className="sticky top-0 z-20 border-b border-border/55 bg-background/95 px-4 py-4 pr-14 sm:px-6 sm:py-5 sm:pr-16">
            <DialogHeader className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-lg border border-primary/20 bg-primary/10 font-mono text-[10px] font-bold text-primary hover:bg-primary/10">
                  OS {os?.numero_os}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-lg text-[9px] font-bold uppercase tracking-wider",
                    statusIsCancelled
                      ? "border-destructive/25 bg-destructive/8 text-destructive"
                      : "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-300",
                  )}
                >
                  {statusIsCancelled ? <XCircle className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                  {statusIsCancelled ? "Cancelada" : "Finalizada"}
                </Badge>
                {os?.equipe && (
                  <Badge variant="outline" className={cn("rounded-lg text-[9px]", equipeStyles(os.equipe).badge)}>
                    {os.equipe}
                  </Badge>
                )}
                {completedAt && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {completedAt}
                  </span>
                )}
              </div>
              <DialogTitle className="pr-3 text-lg font-black leading-snug tracking-tight text-foreground sm:text-2xl">
                {os?.nome_os || "Detalhes da execução"}
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Registro consolidado do chamado, com localização, evidências, materiais e ocorrências associadas.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {metadata.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="min-w-0 rounded-2xl border border-border/55 bg-card/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary/75" />
                      <span>{item.label}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-bold text-foreground" title={item.value}>
                      {item.value}
                    </p>
                  </div>
                );
              })}
            </div>

            {os?.nome_os && (
              <div className="rounded-2xl border border-border/55 bg-muted/15 p-4">
                <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Descrição da atividade
                </p>
                <p className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
                  {os.nome_os}
                </p>
              </div>
            )}

            {isLoading || loadingUrls ? (
              <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
                <Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" />
                <p className="text-sm font-semibold text-foreground">Carregando evidências do chamado</p>
                <p className="mt-1 text-xs text-muted-foreground">Organizando fotos, materiais e ocorrências…</p>
              </div>
            ) : (
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
                <SectionCard title="Evidências fotográficas" icon={<Camera className="h-4 w-4" />} count={data?.fotos.length ?? 0}>
                  {data?.fotos.length ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {data.fotos.map((photo, index) => {
                          const photoUrl = urls[photo.id];
                          return (
                            <div
                              key={photo.id}
                              className="group relative aspect-square overflow-hidden rounded-2xl border border-border/60 bg-muted/20 shadow-[0_12px_30px_-26px_rgba(0,0,0,0.8)]"
                            >
                              {photoUrl ? (
                                <a
                                  href={photoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
                                  aria-label={`Abrir foto ${index + 1}`}
                                >
                                  <img
                                    src={photoUrl}
                                    className="h-full w-full object-cover"
                                    alt={photo.legenda || `Foto ${index + 1}`}
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                  />
                                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/20 to-transparent px-3 pb-2.5 pt-8 text-[10px] font-semibold text-white">
                                    <span className="truncate">{photo.legenda || `Foto ${index + 1}`}</span>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                  </span>
                                </a>
                              ) : (
                                <div className="grid h-full place-items-center text-xs text-muted-foreground">
                                  Carregando…
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => openPhoto(photo)}
                                disabled={!photoUrl}
                                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-white opacity-90 shadow-lg transition-[background-color,opacity] hover:bg-black/80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-30 active:scale-100 motion-reduce:transition-none"
                                aria-label={`Abrir foto ${index + 1} em nova guia`}
                                title="Abrir imagem"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {data.fotos.some((photo) => photo.image_url) && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {data.fotos
                            .filter((photo) => photo.image_url)
                            .map((photo, index) => (
                              <a
                                key={`link-${photo.id}`}
                                href={photo.image_url as string}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-h-10 items-center gap-2 rounded-xl border border-border/55 bg-background/45 px-3 text-xs font-medium text-muted-foreground transition-[background-color,border-color,color] hover:border-primary/30 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-100 motion-reduce:transition-none"
                              >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary" />
                                <span className="truncate">Abrir foto {index + 1}</span>
                                <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" />
                              </a>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/55 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
                      Nenhuma evidência fotográfica registrada.
                    </div>
                  )}
                </SectionCard>

                <div className="space-y-4">
                  <SectionCard title="Peças solicitadas" icon={<Package className="h-4 w-4" />} count={data?.pecas.length ?? 0}>
                    {data?.pecas.length ? (
                      <ul className="space-y-2">
                        {data.pecas.map((part) => (
                          <li key={part.id} className="rounded-xl border border-border/50 bg-background/40 p-3">
                            <div className="flex flex-wrap items-start gap-1.5">
                              <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
                                {part.descricao}
                              </span>
                              <Badge variant="outline" className="rounded-md text-[9px]">
                                Qtd {part.quantidade}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {part.modelo && (
                                <Badge variant="outline" className="rounded-md text-[9px]">
                                  {part.modelo}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="rounded-md text-[9px]">
                                {part.urgencia}
                              </Badge>
                            </div>
                            {part.observacao && (
                              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{part.observacao}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum pedido de material registrado.</p>
                    )}
                  </SectionCard>

                  <SectionCard title="Ocorrências" icon={<AlertTriangle className="h-4 w-4" />} count={data?.problemas.length ?? 0}>
                    {data?.problemas.length ? (
                      <ul className="space-y-2">
                        {data.problemas.map((issue) => (
                          <li key={issue.id} className="rounded-xl border border-destructive/15 bg-destructive/[0.035] p-3">
                            <Badge variant="outline" className="rounded-md border-destructive/20 bg-destructive/5 text-[9px] text-destructive">
                              {issue.gravidade}
                            </Badge>
                            <p className="mt-2 text-sm leading-relaxed text-foreground/85">{issue.descricao}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhuma ocorrência registrada.</p>
                    )}
                  </SectionCard>

                  {os?.assinatura_url && (
                    <SectionCard title="Rubrica do solicitante" icon={<PenLine className="h-4 w-4" />}>
                      <div className="overflow-hidden rounded-xl border border-border/55 bg-white p-3">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={os.assinatura_url}
                          alt="Rubrica do solicitante"
                          className="mx-auto max-h-28 max-w-full object-contain"
                        />
                      </div>
                      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                        {os.assinatura_nome ? `${os.assinatura_nome} · ` : ""}
                        {os.assinatura_em ? formatDateTime(os.assinatura_em) : ""}
                      </p>
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
