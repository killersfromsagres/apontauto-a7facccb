import { useEffect, useMemo, useState } from "react";
import { useMyAccess } from "@/hooks/use-my-access";
import { createFileRoute } from "@tanstack/react-router";

import { toast } from "sonner";
import {
  Wrench,
  Search,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Filter,
  LayoutGrid,
  List,
  Package,
  ArrowUpDown,
  History,
  Clock,
  ListChecks,
  Loader2,
  RotateCcw,
  CalendarCheck2,
  Unlink,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PreventivaImportDialog } from "@/components/corretiva/preventiva-import-dialog";
import { OsDetailsDialog } from "@/components/corretiva/os-details-dialog";
import { equipeStyles, matchEquipe, type EquipeFiltro } from "@/lib/corretiva/equipe";
import { generateProgramacaoExcel } from "@/lib/corretiva/programacao-excel";
import { generateProgramacaoPDF } from "@/lib/corretiva/programacao-pdf";
import { cn } from "@/lib/utils";
import { designateAllCorrectiveOrders } from "@/lib/corretiva/ai-reclassifier.functions";
import {
  listCorrectiveProgramReservations,
  releaseCorrectiveProgramReservation,
  subscribeCorrectiveProgramReservations,
  type CorrectiveProgramReservation,
} from "@/lib/preventiva/corrective-program-reservations";

export const Route = createFileRoute("/_authenticated/corretiva-novo")({
  component: CorretivaNovoPage,
});

function isCompletedStatus(status: unknown) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "concluida" || normalized === "concluido";
}

function findProgramReservation(
  os: any,
  reservations: CorrectiveProgramReservation[],
): CorrectiveProgramReservation | undefined {
  const keys = new Set(
    [String(os?.id ?? "").trim(), String(os?.numero_os ?? "").trim()].filter(
      Boolean,
    ),
  );
  if (keys.size === 0) return undefined;
  return reservations.find((reservation) =>
    [reservation.id, reservation.numeroOs].some((key) => keys.has(key)),
  );
}

function formatReservationPeriod(reservation: CorrectiveProgramReservation) {
  const formatDate = (value: string) => {
    const [year, month, day] = value.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
  };
  return `${formatDate(reservation.periodStart)} a ${formatDate(reservation.periodEnd)}`;
}

function CorretivaNovoPage() {
  const { isAdmin } = useIsAdmin();
  const { access } = useMyAccess();

  const [osList, setOsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [equipe, setEquipe] = useState<EquipeFiltro>("todas");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedOs, setSelectedOs] = useState<any | null>(null);
  const [sortOrder, setSortOrder] = useState<"recent" | "oldest">("recent");
  const [isDesignating, setIsDesignating] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [programReservations, setProgramReservations] = useState<
    CorrectiveProgramReservation[]
  >([]);
  const [onlyProgrammed, setOnlyProgrammed] = useState(false);

  const loadData = async () => {
    setLoading(true);
    console.log("[CorretivaNovo] Iniciando loadData...");
    try {
      const { data, error } = await supabase
        .from("corretiva_os")
        .select("*")
        .neq("tipo_importacao", "backorder_mensal")
        .order("data_criacao", { ascending: false });

      if (error) {
        console.error("[CorretivaNovo] Erro Supabase:", error);
        console.log("[CorretivaNovo] Tentando carregar do cache local devido a erro...");
        const { getCachedOsList } = await import("@/lib/corretiva/db");
        const cached = await getCachedOsList();
        if (cached && cached.length > 0) {
          console.log(`[CorretivaNovo] Carregadas ${cached.length} OS do cache local.`);
          setOsList(cached);
          toast.info("Visualizando dados em modo offline.");
        } else {
          throw error;
        }
      } else {
        console.log(`[CorretivaNovo] Sucesso: ${data?.length || 0} OS carregadas.`);
        const list = data || [];
        setOsList(list);

        if (list.length > 0) {
          const { cacheOsList } = await import("@/lib/corretiva/db");
          cacheOsList(list).catch((err) =>
            console.error("[CorretivaNovo] Erro ao cachear:", err),
          );
        }
      }
    } catch (error: any) {
      console.error("[CorretivaNovo] Erro fatal no loadData:", error);
      toast.error(
        `Não foi possível carregar as OS: ${error.message || "Erro de conexão"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const syncReservations = () =>
      setProgramReservations(listCorrectiveProgramReservations());
    syncReservations();
    return subscribeCorrectiveProgramReservations(syncReservations);
  }, []);

  const filtered = useMemo(() => {
    return osList
      .filter((o) => {
        const matchesSearch =
          !search ||
          o.numero_os?.toLowerCase().includes(search.toLowerCase()) ||
          o.ativo?.toLowerCase().includes(search.toLowerCase()) ||
          o.local?.toLowerCase().includes(search.toLowerCase()) ||
          o.nome_os?.toLowerCase().includes(search.toLowerCase());

        const matchesEquipe = matchEquipe(o.equipe, equipe);
        const matchesProgram =
          !onlyProgrammed || Boolean(findProgramReservation(o, programReservations));

        return matchesSearch && matchesEquipe && matchesProgram;
      })
      .sort((a, b) => {
        const dateA = new Date(a.data_criacao || 0).getTime();
        const dateB = new Date(b.data_criacao || 0).getTime();
        return sortOrder === "recent" ? dateB - dateA : dateA - dateB;
      });
  }, [osList, search, equipe, sortOrder, onlyProgrammed, programReservations]);

  const programmedVisibleCount = useMemo(
    () =>
      osList.filter((os) => Boolean(findProgramReservation(os, programReservations)))
        .length,
    [osList, programReservations],
  );

  const selectedIndex = selectedOs
    ? filtered.findIndex((item) => item.id === selectedOs.id)
    : -1;
  const hasPreviousOs = selectedIndex > 0;
  const hasNextOs = selectedIndex >= 0 && selectedIndex < filtered.length - 1;

  const navigateSelectedOs = (direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= filtered.length) return;
    setSelectedOs(filtered[nextIndex]);
  };

  const handleReleaseFromProgram = (os: any) => {
    releaseCorrectiveProgramReservation(os.id, os.numero_os);
    setProgramReservations(listCorrectiveProgramReservations());
    toast.success(
      `OS ${os.numero_os || "selecionada"} liberada da Programação. Ela volta a ficar disponível para impressão em Corretiva › Novo.`,
    );
  };

  const handleReopen = async (os: any) => {
    if (reopeningId || !isCompletedStatus(os.status)) return;

    const confirmed = window.confirm(
      `Reabrir a OS ${os.numero_os}? Ela voltará para o status Aberta e ficará elegível para futuras programações.`,
    );
    if (!confirmed) return;

    const online = navigator.onLine;
    const nextStatus = "aberta";
    setReopeningId(String(os.id));

    try {
      if (online) {
        const { error } = await supabase
          .from("corretiva_os")
          .update({
            status: nextStatus,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", os.id);

        if (error) throw error;
      } else {
        const { outboxAdd } = await import("@/lib/corretiva/db");
        await outboxAdd({
          id: crypto.randomUUID(),
          kind: "status",
          osId: os.id,
          numeroOs: os.numero_os,
          payload: { status: nextStatus },
          createdAt: Date.now(),
          attempts: 0,
        });
      }

      try {
        const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
        const cached = await getCachedOsList();
        const updated = cached.map((item) =>
          item.id === os.id ? { ...item, status: nextStatus } : item,
        );
        await cacheOsList(updated);
      } catch (cacheError) {
        console.warn(
          "[CorretivaReopen] Não foi possível atualizar o cache local:",
          cacheError,
        );
      }

      setOsList((current) =>
        current.map((item) =>
          item.id === os.id ? { ...item, status: nextStatus } : item,
        ),
      );
      setSelectedOs((current: any) =>
        current?.id === os.id ? { ...current, status: nextStatus } : current,
      );

      toast.success(
        online
          ? "Chamado reaberto. Ele voltou a ficar elegível para programação e impressão."
          : "Modo offline: chamado reaberto e aguardando sincronização.",
      );
    } catch (error: any) {
      console.error("[CorretivaReopen] Erro ao reabrir OS:", error);
      toast.error(error?.message || "Não foi possível reabrir o chamado.");
    } finally {
      setReopeningId(null);
    }
  };

  const exportExcelByTeam = async () => {
    const candidates = filtered.filter((o) => !isCompletedStatus(o.status));
    const pendentes = candidates.filter(
      (o) => !findProgramReservation(o, programReservations),
    );
    const ignored = candidates.length - pendentes.length;
    if (!pendentes.length) {
      return toast.error(
        ignored > 0
          ? `${ignored} chamado(s) já estão na Programação e foram protegidos contra impressão duplicada.`
          : "Nenhuma OS pendente para exportar.",
      );
    }
    try {
      await generateProgramacaoExcel(
        pendentes,
        "Programacao_por_Equipe",
        "corretiva",
      );
      toast.success(
        `Excel gerado com sucesso!${ignored ? ` ${ignored} chamado(s) já incorporado(s) à Programação foram ignorados.` : ""}`,
      );
    } catch (error) {
      toast.error("Erro ao gerar Excel.");
    }
  };

  const exportPDFByTeam = async () => {
    const candidates = filtered.filter((o) => !isCompletedStatus(o.status));
    const pendentes = candidates.filter(
      (o) => !findProgramReservation(o, programReservations),
    );
    const ignored = candidates.length - pendentes.length;
    if (!pendentes.length) {
      return toast.error(
        ignored > 0
          ? `${ignored} chamado(s) já estão na Programação e não serão impressos novamente.`
          : "Nenhuma OS pendente para imprimir.",
      );
    }
    try {
      await generateProgramacaoPDF(pendentes, "Programacao_Equipes");
      toast.success(
        `PDF preparado para impressão!${ignored ? ` ${ignored} chamado(s) já incorporado(s) à Programação foram excluídos desta impressão.` : ""}`,
      );
    } catch (error) {
      toast.error("Erro ao gerar PDF.");
    }
  };

  const handleDesignate = async () => {
    if (!isAdmin) return;

    setIsDesignating(true);
    const id = toast.loading(
      "Analisando o contexto dos chamados e designando equipes...",
    );

    try {
      const result = await designateAllCorrectiveOrders();
      const reviewMessage =
        result.reviewNeeded > 0
          ? ` ${result.reviewNeeded} caso(s) ambíguo(s) foram preservados.`
          : "";

      if (result.failed > 0) {
        toast.warning(
          `Designação parcial: ${result.count} realocadas, ${result.unchanged} mantidas e ${result.failed} falharam.${reviewMessage}`,
          { id },
        );
      } else {
        toast.success(
          `Designação concluída: ${result.count} realocadas e ${result.unchanged} mantidas.${reviewMessage}`,
          { id },
        );
      }

      await loadData();
    } catch (error: any) {
      console.error("[CorretivaNovo] Erro na designação automática:", error);
      toast.error("Falha ao analisar e designar os chamados.", { id });
    } finally {
      setIsDesignating(false);
    }
  };

  return (
    <PageShell
      title="Programação de Corretivas"
      description="Sistema chamados de Corretivas. Chamados marcados como Na Programação não são impressos novamente aqui."
      actions={
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-border/70 bg-background/60 text-foreground hover:bg-muted"
                onClick={handleDesignate}
                disabled={isDesignating}
                title="Analisar os chamados abertos e designar automaticamente a equipe responsável"
              >
                {isDesignating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ListChecks className="h-4 w-4" />
                )}
                Designar
              </Button>
              <PreventivaImportDialog mode="corretiva" onDone={loadData} />
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="glass" size="sm" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Exportar / Imprimir
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportExcelByTeam} className="gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                Exportar Planilha (Equipes Separadas)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPDFByTeam} className="gap-2">
                <Printer className="h-4 w-4 text-primary" />
                Imprimir Programação (PDF)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-6">
        <GlassCard className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar OS, Ativo, Local..."
                className="pl-9 h-11 bg-white/5 border-white/10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={onlyProgrammed ? "secondary" : "glass"}
                className={cn(
                  "h-11 rounded-full gap-2 border-white/10 px-4",
                  onlyProgrammed &&
                    "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
                )}
                onClick={() => setOnlyProgrammed((current) => !current)}
                aria-pressed={onlyProgrammed}
                title="Mostrar somente os chamados já incorporados à Programação"
              >
                <CalendarCheck2 className="h-4 w-4" />
                Na Programação
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">
                  {programmedVisibleCount}
                </span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="glass"
                    className={cn(
                      "h-11 px-6 rounded-full gap-2 border-white/10 transition-all duration-300",
                      equipe !== "todas" && equipeStyles(equipe as any).badge,
                    )}
                  >
                    <Filter className="h-4 w-4" />
                    <span className="font-medium">
                      {equipe === "todas" ? "Filtrar Equipe" : equipe}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        "group-data-[state=open]:rotate-180",
                      )}
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56 p-2 bg-[#0A0A0A]/95 border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl"
                >
                  <DropdownMenuItem
                    onClick={() => setEquipe("todas")}
                    className={cn(
                      "rounded-xl mb-1 px-4 py-2.5 cursor-pointer transition-colors",
                      equipe === "todas"
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    Todas as Equipes
                  </DropdownMenuItem>
                  {[
                    "Elétrica",
                    "Hidráulica",
                    "Civil",
                    "Chaveiro",
                    "Pintura",
                    "Refrigeração",
                    "Limpeza",
                  ].map((e) => (
                    <DropdownMenuItem
                      key={e}
                      onClick={() => setEquipe(e as any)}
                      className={cn(
                        "rounded-xl mb-1 px-4 py-2.5 cursor-pointer flex items-center justify-between group transition-all",
                        equipe === e
                          ? cn(
                              "text-white",
                              equipeStyles(e as any).badge.replace(
                                "shadow-lg",
                                "",
                              ),
                            )
                          : "text-white/60 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <span>{e}</span>
                      {equipe === e && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="glass"
                    className="h-11 px-6 rounded-full gap-2 border-white/10"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="font-medium">
                      {sortOrder === "recent" ? "Mais Recentes" : "Mais Antigos"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 p-2 bg-[#0A0A0A]/95 border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl"
                >
                  <DropdownMenuItem
                    onClick={() => setSortOrder("recent")}
                    className={cn(
                      "rounded-xl mb-1 px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors",
                      sortOrder === "recent"
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Clock className="h-4 w-4" />
                    Mais Recentes
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortOrder("oldest")}
                    className={cn(
                      "rounded-xl mb-1 px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors",
                      sortOrder === "oldest"
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <History className="h-4 w-4" />
                    Mais Antigos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Wrench className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground animate-pulse">
              Consultando banco de dados...
            </p>
          </div>
        ) : osList.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/2 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-white font-medium">
                Nenhuma Ordem de Serviço encontrada
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Importe uma planilha ou aguarde a sincronização.
              </p>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                className="mt-4"
              >
                Tentar Recarregar
              </Button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/2">
            <p className="text-muted-foreground">
              Nenhuma OS corresponde aos filtros aplicados.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4"
                : "flex flex-col gap-3",
            )}
          >
            {filtered.map((os) => {
              const completed = isCompletedStatus(os.status);
              const isReopening = reopeningId === String(os.id);
              const programReservation = findProgramReservation(
                os,
                programReservations,
              );

              return (
                <GlassCard
                  key={os.id}
                  className={cn(
                    "group cursor-pointer border-white/[0.08] bg-background/45 p-0 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.05]",
                    programReservation &&
                      "border-emerald-400/20 shadow-[0_0_0_1px_rgba(52,211,153,0.06)]",
                  )}
                  onClick={() => setSelectedOs(os)}
                >
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 flex-col",
                      viewMode === "list" &&
                        "md:grid md:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)] md:items-stretch",
                    )}
                  >
                    <div className="flex min-w-0 flex-col p-4 md:p-5">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2.5 py-1 font-mono text-xs font-semibold tracking-wide md:text-sm",
                            equipeStyles(os.equipe).badge,
                          )}
                        >
                          OS {os.numero_os}
                        </Badge>
                        <Badge
                          variant={completed ? "secondary" : "outline"}
                          className={cn(
                            "gap-1.5 whitespace-nowrap text-[9px] font-bold uppercase md:text-[10px]",
                            completed
                              ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                              : "opacity-80",
                          )}
                        >
                          {completed && (
                            <span
                              className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 shadow-[0_0_12px_rgba(52,211,153,0.85)]"
                              aria-hidden="true"
                            >
                              <span className="absolute inset-0 animate-pulse rounded-full border border-emerald-300/40" />
                              <Check className="relative h-3 w-3 stroke-[3] text-emerald-200" />
                            </span>
                          )}
                          {completed ? "Concluída" : os.equipe || "Sem Equipe"}
                        </Badge>
                      </div>

                      {programReservation && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          <Badge className="gap-1.5 border border-emerald-300/30 bg-emerald-500/15 text-[9px] font-bold uppercase text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.12)]">
                            <CalendarCheck2 className="h-3 w-3" />
                            Na Programação
                          </Badge>
                          <span className="text-[9px] text-emerald-100/60">
                            {formatReservationPeriod(programReservation)}
                          </span>
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                          Descrição do chamado
                        </p>
                        <h3
                          className={cn(
                            "text-[15px] font-semibold leading-6 text-white/95 transition-colors group-hover:text-white md:text-base",
                            viewMode === "list"
                              ? "line-clamp-3"
                              : "line-clamp-4 min-h-[6rem]",
                          )}
                        >
                          {os.nome_os || "Sem descrição informada"}
                        </h3>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "border-t border-white/[0.06] bg-black/10 p-4 md:p-5",
                        viewMode === "list" && "md:border-l md:border-t-0",
                      )}
                    >
                      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <div className="min-w-0">
                          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
                            Prédio
                          </p>
                          <p className="break-words text-sm font-semibold leading-5 text-white/90">
                            {os.predio || "Não informado"}
                          </p>
                        </div>

                        <div className="min-w-0">
                          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
                            Andar
                          </p>
                          <p className="break-words text-sm font-semibold leading-5 text-white/90">
                            {os.andar || "Não informado"}
                          </p>
                        </div>

                        <div className="col-span-2 min-w-0 border-t border-white/[0.05] pt-3">
                          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
                            Ambiente
                          </p>
                          <p className="break-words text-sm font-medium leading-5 text-white/85">
                            {os.local || "Não informado"}
                          </p>
                        </div>

                        <div className="col-span-2 min-w-0 border-t border-white/[0.05] pt-3">
                          <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
                            Solicitante
                          </p>
                          <p className="break-words text-sm font-medium leading-5 text-white/85">
                            {os.solicitante || "Não informado"}
                          </p>
                        </div>
                      </div>

                      {(os.data_criacao || os.pecas_solicitadas) && (
                        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.06] pt-3 text-[10px] text-muted-foreground/65">
                          {os.data_criacao && (
                            <span>
                              Abertura:{" "}
                              {new Date(os.data_criacao).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          )}
                          {os.pecas_solicitadas && (
                            <span className="flex items-center gap-1.5 text-amber-400/80">
                              <Package className="h-3 w-3" />
                              Peças solicitadas
                            </span>
                          )}
                        </div>
                      )}

                      {programReservation && isAdmin && (
                        <div className="mt-4 border-t border-white/[0.06] pt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-100 hover:border-emerald-300/35 hover:bg-emerald-400/10"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleReleaseFromProgram(os);
                            }}
                          >
                            <Unlink className="h-4 w-4" />
                            Liberar da programação
                          </Button>
                        </div>
                      )}

                      {completed && (
                        <div className="mt-4 border-t border-white/[0.06] pt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 border-amber-400/25 bg-amber-400/[0.05] text-amber-200 hover:border-amber-300/40 hover:bg-amber-400/10 hover:text-amber-100"
                            disabled={isReopening}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleReopen(os);
                            }}
                            title="Voltar este chamado para o status Aberta"
                          >
                            <RotateCcw className="h-4 w-4" />
                            {isReopening ? "Reabrindo..." : "Reabrir chamado"}
                          </Button>
                          <p className="mt-2 text-center text-[9px] leading-4 text-muted-foreground/65">
                            Volta para Aberta e fica elegível para uma nova
                            programação.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      {selectedOs && selectedIndex >= 0 && filtered.length > 1 && (
        <div
          className="fixed inset-0 z-[10020] pointer-events-none flex items-center justify-center"
          aria-hidden="false"
        >
          <div className="w-[calc(100%-1.5rem)] md:w-full max-w-lg px-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-9 w-9 rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/10 hover:text-white hover:scale-105 disabled:opacity-20"
              onClick={() => navigateSelectedOs(-1)}
              disabled={!hasPreviousOs}
              aria-label="Abrir chamado anterior"
              title="Chamado anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-9 w-9 rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/10 hover:text-white hover:scale-105 disabled:opacity-20"
              onClick={() => navigateSelectedOs(1)}
              disabled={!hasNextOs}
              aria-label="Abrir próximo chamado"
              title="Próximo chamado"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedOs && (
        <OsDetailsDialog
          key={selectedOs.id}
          os={{ ...selectedOs, isAdmin, allowedMenus: access.allowed || [] }}
          isOpen={!!selectedOs}
          onClose={() => setSelectedOs(null)}
          onUpdate={loadData}
        />
      )}
    </PageShell>
  );
}
