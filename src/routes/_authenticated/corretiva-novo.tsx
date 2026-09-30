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
  Archive,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { GlassCard } from "@/components/glass-card";
import { BackorderSpreadsheetBuilder } from "@/components/backorder/spreadsheet-builder";
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
import {
  equipeStyles,
  matchEquipe,
  type EquipeFiltro,
} from "@/lib/corretiva/equipe";
import { getBackorderInfo } from "@/lib/corretiva/backorder-classifier";
import { generateProgramacaoExcel } from "@/lib/corretiva/programacao-excel";
import { generateProgramacaoPDF } from "@/lib/corretiva/programacao-pdf";
import { cn } from "@/lib/utils";
import { designateAllCorrectiveOrders } from "@/lib/corretiva/ai-reclassifier.functions";
import {
  isPendingReprogramming,
  markCorrectiveNotPerformed,
} from "@/lib/corretiva/programacao-state";
import {
  listCorrectiveProgramReservations,
  pruneCorrectiveProgramReservations,
  releaseCorrectiveProgramReservation,
  reservationDayLabel,
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

function exportKey(os: any) {
  return String(os?.id || os?.numero_os || "")
    .trim()
    .toUpperCase();
}

function dedupeCorrectiveRows(rows: any[]) {
  const unique = new Map<string, any>();
  rows.forEach((row, index) => {
    const key = exportKey(row) || `ROW-${index}`;
    if (!unique.has(key)) unique.set(key, row);
  });
  return [...unique.values()];
}

function findProgramReservation(
  os: any,
  reservations: CorrectiveProgramReservation[],
): CorrectiveProgramReservation | undefined {
  const osStatus = String(os?.status ?? "").trim().toLowerCase();
  if (
    isCompletedStatus(osStatus) ||
    osStatus === "cancelada" ||
    osStatus === "cancelado"
  ) {
    return undefined;
  }

  const persistedStatus = String(os?.programacao_status ?? "").trim();

  // O banco prevalece sobre qualquer reserva antiga do navegador. Isso evita
  // que outra estação continue vendo "Em programação" depois de um não realizado.
  if (persistedStatus === "reprogramacao_pendente") return undefined;
  if (
    persistedStatus === "disponivel" &&
    Number(os?.programacao_tentativas ?? 0) > 0
  ) {
    return undefined;
  }

  if (persistedStatus === "em_programacao") {
    const rawDay = Number(os?.programacao_dia_indice);
    return {
      id: String(os?.id ?? os?.numero_os ?? "").trim(),
      numeroOs: String(os?.numero_os ?? os?.id ?? "").trim(),
      equipe: String(os?.programacao_equipe || os?.equipe || "CORRETIVA") as CorrectiveProgramReservation["equipe"],
      periodStart: String(os?.programacao_periodo_inicio ?? ""),
      periodEnd: String(os?.programacao_periodo_fim ?? ""),
      reservedAt: String(os?.programacao_reservada_em ?? os?.updated_at ?? ""),
      source: "programacao",
      dayIndex: Number.isFinite(rawDay) && rawDay >= 0 ? rawDay : undefined,
    };
  }

  const keys = new Set(
    [String(os?.id ?? "").trim(), String(os?.numero_os ?? "").trim()]
      .filter(Boolean)
      .map((value) => value.toUpperCase()),
  );
  if (keys.size === 0) return undefined;
  return reservations.find((reservation) =>
    [reservation.id, reservation.numeroOs]
      .map((value) => String(value ?? "").trim().toUpperCase())
      .some((key) => keys.has(key)),
  );
}

function formatReservationPeriod(reservation: CorrectiveProgramReservation) {
  const formatDate = (value: string) => {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
  };
  const start = formatDate(reservation.periodStart);
  const end = formatDate(reservation.periodEnd);
  if (!start && !end) return "Período não informado";
  if (!start) return end;
  if (!end) return start;
  return `${start} a ${end}`;
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
  const [onlyBackorder, setOnlyBackorder] = useState(false);
  const [onlyReprogramming, setOnlyReprogramming] = useState(false);
  const [reprogrammingId, setReprogrammingId] = useState<string | null>(null);

  const applyLoadedList = async (list: any[], cache = false) => {
    setOsList(list);
    pruneCorrectiveProgramReservations(list);
    setProgramReservations(listCorrectiveProgramReservations());

    if (cache && list.length > 0) {
      const { cacheOsList } = await import("@/lib/corretiva/db");
      cacheOsList(list).catch((err) =>
        console.error("[CorretivaNovo] Erro ao cachear:", err),
      );
    }
  };

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
        const { getCachedOsList } = await import("@/lib/corretiva/db");
        const cached = await getCachedOsList();
        if (cached && cached.length > 0) {
          await applyLoadedList(cached);
          toast.info("Visualizando dados em modo offline.");
        } else {
          throw error;
        }
      } else {
        const list = data || [];
        console.log(`[CorretivaNovo] Sucesso: ${list.length} OS carregadas.`);
        await applyLoadedList(list, true);
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
    void loadData();
  }, []);

  useEffect(() => {
    const syncReservations = () =>
      setProgramReservations(listCorrectiveProgramReservations());
    syncReservations();
    return subscribeCorrectiveProgramReservations(syncReservations);
  }, []);

  const backorderMap = useMemo(() => {
    const reference = new Date();
    return new Map(
      osList.map((os) => [
        String(os.id ?? os.numero_os ?? ""),
        getBackorderInfo(os, reference),
      ]),
    );
  }, [osList]);

  const backorderFor = (os: any) =>
    backorderMap.get(String(os.id ?? os.numero_os ?? "")) ?? getBackorderInfo(os);

  const exportBaseRows = useMemo(
    () => dedupeCorrectiveRows(osList),
    [osList],
  );

  const availableExportRows = useMemo(
    () =>
      exportBaseRows.filter(
        (os) => !findProgramReservation(os, programReservations),
      ),
    [exportBaseRows, programReservations],
  );

  const programmedExportRows = useMemo(
    () =>
      exportBaseRows.flatMap((os) => {
        const reservation = findProgramReservation(os, programReservations);
        if (!reservation) return [];
        return [
          {
            ...os,
            programacao_status: "EM PROGRAMAÇÃO",
            programacao_dia:
              reservationDayLabel(reservation.dayIndex) || "Semana programada",
            programacao_periodo: formatReservationPeriod(reservation),
            programacao_equipe: reservation.equipe,
          },
        ];
      }),
    [exportBaseRows, programReservations],
  );

  const filtered = useMemo(() => {
    return osList
      .filter((o) => {
        const query = search.toLowerCase();
        const matchesSearch =
          !search ||
          o.numero_os?.toLowerCase().includes(query) ||
          o.ativo?.toLowerCase().includes(query) ||
          o.local?.toLowerCase().includes(query) ||
          o.nome_os?.toLowerCase().includes(query);

        const matchesEquipe = matchEquipe(o.equipe, equipe);
        const matchesProgram =
          !onlyProgrammed || Boolean(findProgramReservation(o, programReservations));
        const backorder =
          backorderMap.get(String(o.id ?? o.numero_os ?? "")) ?? getBackorderInfo(o);
        const matchesBackorder =
          !onlyBackorder || (backorder.isBackorder && !isCompletedStatus(o.status));
        const matchesReprogramming =
          !onlyReprogramming || isPendingReprogramming(o);

        return (
          matchesSearch &&
          matchesEquipe &&
          matchesProgram &&
          matchesBackorder &&
          matchesReprogramming
        );
      })
      .sort((a, b) => {
        const reprogramOrder =
          Number(isPendingReprogramming(b)) - Number(isPendingReprogramming(a));
        if (reprogramOrder !== 0) return reprogramOrder;

        const dateA = new Date(a.data_criacao || 0).getTime();
        const dateB = new Date(b.data_criacao || 0).getTime();
        return sortOrder === "recent" ? dateB - dateA : dateA - dateB;
      });
  }, [
    osList,
    search,
    equipe,
    sortOrder,
    onlyProgrammed,
    onlyBackorder,
    onlyReprogramming,
    programReservations,
    backorderMap,
  ]);

  const programmedVisibleCount = programmedExportRows.length;
  const reprogrammingVisibleCount = useMemo(
    () => exportBaseRows.filter((os) => isPendingReprogramming(os)).length,
    [exportBaseRows],
  );

  const backorderExportRows = useMemo(
    () =>
      exportBaseRows.filter((os) => {
        const info =
          backorderMap.get(String(os.id ?? os.numero_os ?? "")) ?? getBackorderInfo(os);
        return info.isBackorder && !isCompletedStatus(os.status);
      }),
    [exportBaseRows, backorderMap],
  );

  const backorderVisibleCount = backorderExportRows.length;

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

  const handleReturnToProgrammingQueue = async (
    os: any,
    reservation: CorrectiveProgramReservation,
  ) => {
    const osId = String(os?.id ?? "");
    if (!osId || reprogrammingId) return;

    setReprogrammingId(osId);
    try {
      const updated = await markCorrectiveNotPerformed({
        osId,
        reservation,
      });
      const next = { ...os, ...updated };

      releaseCorrectiveProgramReservation(os.id, os.numero_os);
      setProgramReservations(listCorrectiveProgramReservations());
      setOsList((current) =>
        current.map((item) => (item.id === os.id ? next : item)),
      );
      setSelectedOs((current: any) =>
        current?.id === os.id ? { ...current, ...next } : current,
      );

      void import("@/lib/corretiva/db")
        .then(async ({ getCachedOsList, cacheOsList }) => {
          const cached = await getCachedOsList();
          await cacheOsList(
            cached.map((item) => (item.id === os.id ? { ...item, ...next } : item)),
          );
        })
        .catch((error) =>
          console.warn("[CorretivaReprogram] Não foi possível atualizar o cache:", error),
        );

      toast.success(
        `OS ${os.numero_os || ""} voltou para a lista de corretivas e já está disponível para uma nova programação.`,
      );
    } catch (error: any) {
      console.error("[CorretivaReprogram] Erro ao devolver OS à fila:", error);
      toast.error(error?.message || "Não foi possível devolver o chamado à fila.");
    } finally {
      setReprogrammingId(null);
    }
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

      releaseCorrectiveProgramReservation(os.id, os.numero_os);
      setProgramReservations(listCorrectiveProgramReservations());

      setOsList((current) =>
        current.map((item) =>
          item.id === os.id
            ? {
                ...item,
                status: nextStatus,
                programacao_status: "disponivel",
                programacao_periodo_inicio: null,
                programacao_periodo_fim: null,
                programacao_dia_indice: null,
                programacao_equipe: null,
              }
            : item,
        ),
      );
      setSelectedOs((current: any) =>
        current?.id === os.id
          ? {
              ...current,
              status: nextStatus,
              programacao_status: "disponivel",
              programacao_periodo_inicio: null,
              programacao_periodo_fim: null,
              programacao_dia_indice: null,
              programacao_equipe: null,
            }
          : current,
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

  const exportAvailableExcel = async () => {
    if (!availableExportRows.length) {
      return toast.error(
        "Não há chamados disponíveis para exportar. Verifique se todos já estão EM PROGRAMAÇÃO.",
      );
    }
    try {
      await generateProgramacaoExcel(
        availableExportRows,
        "Todas as equipes · Disponíveis",
        "corretiva",
      );
      toast.success(
        `Excel gerado com ${availableExportRows.length} chamado(s) de todas as equipes. Os filtros da tela foram ignorados.`,
      );
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar Excel dos chamados disponíveis.");
    }
  };

  const exportBackorderExcel = async () => {
    if (!backorderExportRows.length) {
      return toast.error("Nenhum Backorder aberto foi identificado para exportação.");
    }
    try {
      await generateProgramacaoExcel(
        backorderExportRows,
        "Todas as equipes",
        "backorder",
      );
      toast.success(
        `Planilha de Backorders gerada com ${backorderExportRows.length} chamado(s).`,
      );
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar a planilha de Backorders.");
    }
  };

  const exportProgrammedExcel = async () => {
    if (!programmedExportRows.length) {
      return toast.error("Nenhum chamado está EM PROGRAMAÇÃO no momento.");
    }
    try {
      await generateProgramacaoExcel(
        programmedExportRows,
        "EM PROGRAMAÇÃO · Controle de campo",
        "corretiva",
      );
      toast.success(
        `Planilha de campo gerada com ${programmedExportRows.length} chamado(s) EM PROGRAMAÇÃO.`,
      );
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar planilha dos chamados EM PROGRAMAÇÃO.");
    }
  };

  const exportAvailablePDF = async () => {
    if (!availableExportRows.length) {
      return toast.error("Não há chamados disponíveis para imprimir.");
    }
    try {
      await generateProgramacaoPDF(
        availableExportRows,
        "Todas_as_Equipes_Disponiveis",
      );
      toast.success(
        `PDF preparado com ${availableExportRows.length} chamado(s) de todas as equipes.`,
      );
    } catch (error) {
      console.error(error);
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
      description="Gerencie, programe e exporte os chamados corretivos por equipe, localização e data de abertura."
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
          <Button
            variant="outline"
            size="sm"
            onClick={exportBackorderExcel}
            disabled={!backorderExportRows.length}
            className="gap-2 border-red-500/30 bg-red-500/[0.08] text-red-100 shadow-[0_8px_26px_rgba(127,29,29,0.10)] hover:border-red-400/45 hover:bg-red-500/[0.14] hover:text-white disabled:opacity-45"
            title="Baixar planilha exclusiva dos Backorders abertos"
          >
            <Archive className="h-4 w-4 text-red-400" />
            <span className="font-semibold">Planilha Backorders</span>
            <span className="inline-flex min-w-5 items-center justify-center rounded-md border border-red-300/10 bg-red-950/70 px-1.5 py-0.5 text-[10px] font-extrabold text-red-100">
              {backorderExportRows.length}
            </span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="glass" size="sm" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Exportar / Imprimir
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[290px]">
              <DropdownMenuItem onClick={exportAvailableExcel} className="gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                <span className="flex-1">Baixar todos disponíveis</span>
                <span className="text-[10px] text-muted-foreground">
                  {availableExportRows.length}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={exportProgrammedExcel}
                disabled={!programmedExportRows.length}
                className="gap-2"
              >
                <CalendarCheck2 className="h-4 w-4 text-sky-400" />
                <span className="flex-1">Baixar EM PROGRAMAÇÃO</span>
                <span className="text-[10px] text-muted-foreground">
                  {programmedExportRows.length}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportAvailablePDF} className="gap-2">
                <Printer className="h-4 w-4 text-primary" />
                Imprimir todos disponíveis (PDF)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-6">
        <details className="group overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025] [&::-webkit-details-marker]:hidden sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-foreground">Montador de Backorders</span>
                <Badge variant="outline" className="border-amber-300/30 bg-[linear-gradient(145deg,rgba(251,191,36,0.14),rgba(245,158,11,0.055))] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_-20px_rgba(245,158,11,0.8)]">
                  Área exclusiva
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Importe uma planilha de Backorder, classifique automaticamente os chamados por equipe e gere o Excel pronto para impressão.
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t border-white/[0.07] p-3 sm:p-4">
            <BackorderSpreadsheetBuilder />
          </div>
        </details>

        <GlassCard className="p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative w-full xl:w-[320px] xl:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar OS, Ativo, Local..."
                className="h-11 rounded-xl border-white/10 bg-white/5 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2 xl:justify-end">
              <Button
                type="button"
                variant={onlyProgrammed ? "secondary" : "glass"}
                className={cn(
                  "h-11 gap-2 rounded-xl border-white/10 px-4",
                  onlyProgrammed &&
                    "border-sky-400/40 bg-sky-500/15 text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.08)]",
                )}
                onClick={() => setOnlyProgrammed((current) => !current)}
                aria-pressed={onlyProgrammed}
                title="Mostrar somente chamados já incorporados à Programação"
              >
                <CalendarCheck2 className="h-4 w-4" />
                <span className="font-semibold">Em Programação</span>
                <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">
                  {programmedVisibleCount}
                </span>
              </Button>

              <Button
                type="button"
                variant={onlyReprogramming ? "secondary" : "glass"}
                className={cn(
                  "h-11 gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 text-amber-100 transition-all hover:border-amber-300/35 hover:bg-amber-400/[0.10]",
                  onlyReprogramming &&
                    "border-amber-300/50 bg-amber-400/15 text-white shadow-[0_0_0_1px_rgba(251,191,36,0.10)]",
                )}
                onClick={() => setOnlyReprogramming((current) => !current)}
                aria-pressed={onlyReprogramming}
                title="Mostrar somente chamados que voltaram para a fila por não realização"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="font-semibold">Reprogramar</span>
                <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] font-bold">
                  {reprogrammingVisibleCount}
                </span>
              </Button>

              <Button
                type="button"
                variant={onlyBackorder ? "secondary" : "glass"}
                className={cn(
                  "h-11 gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.055] px-4 text-red-100 shadow-[0_8px_28px_rgba(127,29,29,0.08)] transition-all hover:border-red-400/35 hover:bg-red-500/[0.10] hover:text-white",
                  onlyBackorder &&
                    "border-red-400/50 bg-red-500/20 text-white shadow-[0_0_0_1px_rgba(248,113,113,0.10),0_12px_32px_rgba(127,29,29,0.16)]",
                )}
                onClick={() => setOnlyBackorder((current) => !current)}
                aria-pressed={onlyBackorder}
                title="Mostrar somente chamados identificados como Backorder"
              >
                <Archive className="h-4 w-4" />
                <span className="font-extrabold tracking-[0.04em]">BACKORDER</span>
                <span className="inline-flex min-w-6 items-center justify-center rounded-md border border-red-300/10 bg-red-950/60 px-1.5 py-0.5 text-[10px] font-extrabold text-red-100">
                  {backorderVisibleCount}
                </span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="glass"
                    className={cn(
                      "h-11 gap-2 rounded-xl border-white/10 px-5 transition-all duration-300",
                      equipe !== "todas" && equipeStyles(equipe as any).button,
                    )}
                  >
                    <Filter className="h-4 w-4" />
                    <span className="font-medium">
                      {equipe === "todas" ? "Filtrar Equipe" : equipe}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56 rounded-2xl border-white/10 bg-[#0A0A0A]/95 p-2 shadow-2xl backdrop-blur-xl"
                >
                  <DropdownMenuItem
                    onClick={() => setEquipe("todas")}
                    className={cn(
                      "mb-1 cursor-pointer rounded-xl px-4 py-2.5 transition-colors",
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
                        "group mb-1 flex cursor-pointer items-center justify-between rounded-xl px-4 py-2.5 transition-all",
                        equipe === e
                          ? cn("text-white", equipeStyles(e as any).menu)
                          : "text-white/60 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <span>{e}</span>
                      {equipe === e && (
                        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="glass"
                    className="h-11 gap-2 rounded-xl border-white/10 px-5"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="font-medium">
                      {sortOrder === "recent" ? "Mais recentes" : "Mais antigos"}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 rounded-2xl border-white/10 bg-[#0A0A0A]/95 p-2 shadow-2xl backdrop-blur-xl"
                >
                  <DropdownMenuItem
                    onClick={() => setSortOrder("recent")}
                    className={cn(
                      "mb-1 flex cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 transition-colors",
                      sortOrder === "recent"
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Clock className="h-4 w-4" />
                    Mais recentes
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortOrder("oldest")}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 transition-colors",
                      sortOrder === "oldest"
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <History className="h-4 w-4" />
                    Mais antigos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex h-11 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.045] p-1 shadow-inner shadow-black/10">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  onClick={() => setViewMode("grid")}
                  title="Visualização em cards"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  onClick={() => setViewMode("list")}
                  title="Visualização em lista"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <BrandedLoadingState
            label="Carregando corretivas"
            detail="Sincronizando ordens de serviço, programação e prioridades"
            variant="page"
          />
        ) : osList.length === 0 ? (
          <div className="space-y-4 rounded-3xl border-2 border-dashed border-white/5 bg-white/2 py-20 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-white">
                Nenhuma Ordem de Serviço encontrada
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Importe uma planilha ou aguarde a sincronização.
              </p>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => void loadData()}>
                Tentar Recarregar
              </Button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-white/5 bg-white/2 py-20 text-center">
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
              const backorder = backorderFor(os);
              const pendingReprogramming = isPendingReprogramming(os);

              return (
                <GlassCard
                  key={os.id}
                  className={cn(
                    "group cursor-pointer border-white/[0.08] bg-background/45 p-0 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.05]",
                    programReservation &&
                      "border-sky-400/25 shadow-[0_0_0_1px_rgba(56,189,248,0.07)]",
                    pendingReprogramming &&
                      "border-amber-400/30 shadow-[0_0_0_1px_rgba(251,191,36,0.08),0_16px_42px_rgba(120,53,15,0.08)]",
                    backorder.isBackorder &&
                      "border-red-400/20 shadow-[0_0_0_1px_rgba(248,113,113,0.05),0_18px_44px_rgba(127,29,29,0.06)]",
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
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-8 px-3.5 py-1.5 font-mono text-[12px] font-extrabold tracking-[0.035em] shadow-[0_0_18px_rgba(255,255,255,0.025)] md:h-9 md:px-4 md:text-sm",
                            equipeStyles(os.equipe).badge,
                          )}
                        >
                          OS {os.numero_os}
                        </Badge>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {backorder.isBackorder && (
                            <Badge
                              variant="outline"
                              className="h-8 gap-1.5 border-red-400/35 bg-gradient-to-r from-red-950/85 to-rose-950/60 px-3 text-[9px] font-extrabold uppercase tracking-[0.08em] text-red-100 shadow-[0_8px_24px_rgba(127,29,29,0.18)] md:h-9 md:text-[10px]"
                              title={
                                backorder.source === "automatic"
                                  ? `Backorder automático: ${backorder.ageDays} dias em aberto`
                                  : backorder.ageDays > 0
                                    ? `Backorder registrado · ${backorder.ageDays} dias desde a abertura`
                                    : "Backorder registrado"
                              }
                            >
                              <Archive className="h-3.5 w-3.5" />
                              BACKORDER
                              {backorder.ageDays > 0 && (
                                <span className="rounded-md border border-red-200/10 bg-black/20 px-1.5 py-0.5 text-[8px] tracking-normal text-red-100/80 md:text-[9px]">
                                  {backorder.ageDays}d
                                </span>
                              )}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-8 max-w-full gap-1.5 whitespace-nowrap px-3.5 text-[11px] font-extrabold uppercase tracking-[0.02em] md:h-9 md:px-4 md:text-xs",
                              equipeStyles(os.equipe).badge,
                            )}
                            title={`Equipe responsável: ${os.equipe || "Sem Equipe"}`}
                          >
                            {os.equipe || "Sem Equipe"}
                          </Badge>
                          {completed && (
                            <Badge
                              variant="secondary"
                              className="h-5 gap-1 border-emerald-500/35 bg-emerald-500/20 px-2 text-[8px] font-bold uppercase text-emerald-200 md:text-[9px]"
                            >
                              <Check className="h-2.5 w-2.5 stroke-[3]" /> Concluída
                            </Badge>
                          )}
                        </div>
                      </div>

                      {programReservation && (
                        <div className="mb-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="gap-1.5 border border-sky-300/30 bg-sky-500/15 text-[9px] font-extrabold uppercase text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.12)]">
                              <CalendarCheck2 className="h-3 w-3" />
                              EM PROGRAMAÇÃO
                            </Badge>
                            <span className="text-[9px] text-sky-100/70">
                              {reservationDayLabel(programReservation.dayIndex) ||
                                "Semana programada"} ·{" "}
                              {formatReservationPeriod(programReservation)} ·{" "}
                              {programReservation.equipe}
                            </span>
                          </div>
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

                      {programReservation && !completed && (
                        <div className="mt-4 border-t border-white/[0.06] pt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={reprogrammingId === String(os.id)}
                            className="w-full gap-2 border-amber-400/30 bg-amber-400/[0.06] text-amber-100 hover:border-amber-300/45 hover:bg-amber-400/12"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleReturnToProgrammingQueue(
                                os,
                                programReservation,
                              );
                            }}
                            title="Devolver imediatamente este chamado para a lista de corretivas"
                          >
                            {reprogrammingId === String(os.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            {reprogrammingId === String(os.id)
                              ? "Devolvendo..."
                              : "Voltar para corretivas"}
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
                            Volta para Aberta e fica elegível para uma nova programação.
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
          className="pointer-events-none fixed inset-0 z-[10020] flex items-center justify-center"
          aria-hidden="false"
        >
          <div className="flex w-[calc(100%-1.5rem)] max-w-lg items-center justify-between px-2 md:w-full">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-9 w-9 rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/10 hover:text-white disabled:opacity-20"
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
              className="pointer-events-auto h-9 w-9 rounded-full border border-white/10 bg-black/55 text-white/70 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/10 hover:text-white disabled:opacity-20"
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
