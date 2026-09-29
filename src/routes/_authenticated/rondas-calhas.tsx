import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Search,
  ClipboardCheck,
  Loader2,
  Building2,
  Download,
  CalendarDays,
  Route as RouteIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { readRondasExcel } from "@/lib/rondas/excel";
import { generateRondasProgramacaoExcel } from "@/lib/rondas/programacao-excel";
import { useServerFn } from "@tanstack/react-start";
import { saveRondasFromExcel } from "@/lib/rondas/rondas.functions";
import { RondaDetailsDialog } from "@/components/rondas/ronda-details-dialog";
import { RondaCalha } from "@/lib/rondas/types";

export const Route = createFileRoute("/_authenticated/rondas-calhas")({
  component: RondasCalhasPage,
});

function RondasCalhasPage() {
  const [rondas, setRondas] = useState<RondaCalha[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRonda, setSelectedRonda] = useState<RondaCalha | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const saveRondasFn = useServerFn(saveRondasFromExcel);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("rondas_calhas")
        .select("*")
        .eq("status", "pendente")
        .order("predio", { ascending: true });

      if (error) throw error;
      setRondas((data ?? []) as RondaCalha[]);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar rondas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const id = toast.loading("Processando planilha e identificando calhas...");

    try {
      const data = await readRondasExcel(file);
      if (data.length === 0) {
        toast.error("Nenhuma preventiva de calha encontrada na planilha.", { id });
        return;
      }

      await saveRondasFn({ data });
      toast.success(`${data.length} preventivas de calha importadas com sucesso!`, { id });
      await loadData();
    } catch (err: any) {
      console.error("Erro na importação de rondas:", err);
      const errorMessage = err?.message || "Erro desconhecido ao processar planilha.";
      toast.error(`Falha na importação: ${errorMessage}`, { id });
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rondas
      .filter((r) => {
        if (!term) return true;
        return (
          (r.predio || "").toLocaleLowerCase("pt-BR").includes(term) ||
          (r.preventiva_nome || "").toLocaleLowerCase("pt-BR").includes(term) ||
          (r.mes_referencia || "").toLocaleLowerCase("pt-BR").includes(term)
        );
      })
      .sort((a, b) => {
        const building = (a.predio || "").localeCompare(b.predio || "", "pt-BR", {
          numeric: true,
          sensitivity: "base",
        });
        if (building !== 0) return building;
        return (a.preventiva_nome || "").localeCompare(b.preventiva_nome || "", "pt-BR", {
          numeric: true,
          sensitivity: "base",
        });
      });
  }, [rondas, search]);

  const buildings = useMemo(
    () => new Set(rondas.map((r) => r.predio).filter(Boolean)).size,
    [rondas],
  );
  const referenceMonths = useMemo(
    () => new Set(rondas.map((r) => r.mes_referencia).filter(Boolean)).size,
    [rondas],
  );

  const handleExport = async () => {
    if (!rondas.length) {
      toast.error("Não há rondas pendentes para montar a programação.");
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading("Montando programação premium de rondas...");
    try {
      await generateRondasProgramacaoExcel(rondas);
      toast.success(
        `Excel gerado com ${rondas.length} ronda(s), distribuídas em dias úteis e organizadas por prédio.`,
        { id: toastId },
      );
    } catch (error: any) {
      console.error("Erro ao exportar programação de rondas:", error);
      toast.error(error?.message || "Não foi possível gerar a programação em Excel.", {
        id: toastId,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PageShell
      title="Rondas de Calhas"
      description="Planeje, execute e acompanhe inspeções preventivas de calhas por prédio."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300 hover:bg-emerald-500/[0.12]"
            onClick={handleExport}
            disabled={isExporting || rondas.length === 0}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Baixar Programação Excel
          </Button>
          <Button
            variant="glass"
            size="sm"
            className="relative gap-2 border-primary/40 bg-primary/20 text-primary-glow"
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importar Preventivas
            <Input
              type="file"
              accept=".xlsx,.xls"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={handleImport}
              disabled={isImporting}
              aria-label="Importar planilha de preventivas de calhas"
            />
          </Button>
        </div>
      }
    >
      <div className="space-y-5 sm:space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GlassCard className="border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Pendentes
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {rondas.length}
                </p>
              </div>
              <RouteIcon className="h-5 w-5 text-primary" />
            </div>
          </GlassCard>
          <GlassCard className="border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Prédios
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {buildings}
                </p>
              </div>
              <Building2 className="h-5 w-5 text-cyan-400" />
            </div>
          </GlassCard>
          <GlassCard className="border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Referências
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {referenceMonths}
                </p>
              </div>
              <CalendarDays className="h-5 w-5 text-amber-400" />
            </div>
          </GlassCard>
        </div>

        <GlassCard className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por prédio, atividade ou mês de referência..."
              className="h-11 border-white/10 bg-white/5 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="animate-pulse text-muted-foreground">
              Carregando inspeções pendentes...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="space-y-4 rounded-3xl border-2 border-dashed border-white/5 bg-white/[0.02] py-20 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
              <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-white">
                {search ? "Nenhuma ronda corresponde à busca" : "Nenhuma ronda pendente"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {search
                  ? "Limpe o filtro para visualizar as demais inspeções."
                  : "Importe a planilha de preventivas para começar."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((ronda) => (
              <GlassCard
                key={ronda.id}
                className="group flex cursor-pointer flex-col border-white/10 p-5 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white/[0.07]"
                onClick={() => setSelectedRonda(ronda)}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="rounded-xl border border-primary/15 bg-primary/10 p-2 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="text-[10px] opacity-80">
                    {ronda.mes_referencia}
                  </Badge>
                </div>

                <h3 className="mb-1 line-clamp-1 text-lg font-bold text-white transition-colors group-hover:text-primary">
                  {ronda.predio}
                </h3>
                <p className="mb-4 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {ronda.preventiva_nome}
                </p>

                <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                      Pendente
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-bold text-primary hover:bg-primary/20"
                  >
                    Realizar Ronda
                  </Button>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {selectedRonda && (
        <RondaDetailsDialog
          ronda={selectedRonda}
          isOpen={!!selectedRonda}
          onClose={() => setSelectedRonda(null)}
          onUpdate={loadData}
        />
      )}
    </PageShell>
  );
}
