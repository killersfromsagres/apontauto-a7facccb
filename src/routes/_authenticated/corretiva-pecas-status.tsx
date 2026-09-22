import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Boxes,
  CalendarClock,
  Eye,
  FileSpreadsheet,
  FileText,
  Landmark,
  ListChecks,
  Loader2,
  MapPin,
  Package,
  PencilLine,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { processarDescricaoPecaIA } from "@/lib/materiais/ia.functions";
import { exportComprasPremiumExcel } from "@/lib/materiais/compras-premium-excel";
import { exportComprasPremiumPdf } from "@/lib/materiais/compras-premium-pdf";
import {
  fetchAssetCostCenterMap,
  importAssetCostCentersFromFile,
  resolveCostCenter,
  type AssetCostCenterRecord,
} from "@/lib/materiais/cost-center-mapping";
import {
  loadMaterialRequestPhotos,
  materialPhotoKey,
  type MaterialPhotosByOs,
} from "@/lib/materiais/material-request-photos";
import {
  MaterialRequestEditDialog,
  type EditableMaterialRequest,
} from "@/components/materiais/material-request-edit-dialog";
import { MaterialRequestPhotoGallery } from "@/components/materiais/material-request-photo-gallery";
import { MaterialRequestDetailsDialog } from "@/components/materiais/material-request-details-dialog";

export const Route = createFileRoute("/_authenticated/corretiva-pecas-status")({
  component: CentralMateriaisUnificadaPage,
  head: () => ({
    meta: [
      { title: "Solicitações de Materiais · Apont Auto" },
      {
        name: "description",
        content:
          "Central corporativa de peças solicitadas em Corretiva e Refrigeração, com evidências, centro de custo e relatórios profissionais.",
      },
      { property: "og:title", content: "Solicitações de Materiais" },
    ],
  }),
});

function display(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Package;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <GlassCard className="relative overflow-hidden border-white/[0.08] bg-white/[0.025] p-4 shadow-none">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-foreground/80">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-0.5 font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{hint}</p>
        </div>
      </div>
    </GlassCard>
  );
}

function MetaPill({
  icon: Icon,
  children,
  className,
}: {
  icon: typeof Package;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function CentralMateriaisUnificadaPage() {
  const [pecas, setPecas] = useState<any[]>([]);
  const [osById, setOsById] = useState<Map<string, any>>(new Map());
  const [photosByOs, setPhotosByOs] = useState<MaterialPhotosByOs>(new Map());
  const [costCenterMap, setCostCenterMap] = useState<Map<string, AssetCostCenterRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importingCc, setImportingCc] = useState(false);
  const [search, setSearch] = useState("");
  const [fOrigem, setFOrigem] = useState<"todas" | "refrigeracao" | "corretiva">("todas");
  const [editingRequest, setEditingRequest] = useState<EditableMaterialRequest | null>(null);
  const [detailRequest, setDetailRequest] = useState<any | null>(null);
  const [structureInput, setStructureInput] = useState("");
  const [structuredItems, setStructuredItems] = useState<Array<{ item: string; qtd: number }>>([]);
  const [structuring, setStructuring] = useState(false);
  const ccFileRef = useRef<HTMLInputElement>(null);

  const processDescription = useServerFn(processarDescricaoPecaIA);

  const loadData = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [rRes, cRes, mappings] = await Promise.all([
        supabase.from("refrigeracao_pecas").select("*").order("created_at", { ascending: false }),
        supabase.from("corretiva_pecas").select("*").order("created_at", { ascending: false }),
        fetchAssetCostCenterMap(),
      ]);

      if (rRes.error) throw rRes.error;
      if (cRes.error) throw cRes.error;

      const rData = (rRes.data || []).map((p) => ({ ...p, origem: "refrigeracao" as const }));
      const cData = (cRes.data || []).map((p) => ({ ...p, origem: "corretiva" as const }));
      const all = [...rData, ...cData].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const rIds = Array.from(new Set(rData.map((p) => p.os_id).filter(Boolean))) as string[];
      const cIds = Array.from(new Set(cData.map((p) => p.os_id).filter(Boolean))) as string[];

      const [rOs, cOs, photoMap] = await Promise.all([
        rIds.length ? supabase.from("refrigeracao_os").select("*").in("id", rIds) : Promise.resolve({ data: [], error: null }),
        cIds.length ? supabase.from("corretiva_os").select("*").in("id", cIds) : Promise.resolve({ data: [], error: null }),
        loadMaterialRequestPhotos(rIds, cIds),
      ]);

      if (rOs.error) throw rOs.error;
      if (cOs.error) throw cOs.error;

      const map = new Map<string, any>();
      (rOs.data || []).forEach((o) => map.set(o.id, { ...o, origem: "refrigeracao" }));
      (cOs.data || []).forEach((o) => map.set(o.id, { ...o, origem: "corretiva" }));

      setPecas(all);
      setOsById(map);
      setPhotosByOs(photoMap);
      setCostCenterMap(mappings);
    } catch (err: any) {
      console.error("[Materiais] Falha ao carregar central:", err);
      toast.error("Erro ao carregar materiais: " + (err?.message || "falha desconhecida"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const withResolvedCostCenter = (item: any) => {
    const os = osById.get(item.os_id);
    return {
      ...item,
      centro_custo: resolveCostCenter(item, os, costCenterMap) || null,
    };
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pecas.filter((p) => {
      if (fOrigem !== "todas" && p.origem !== fOrigem) return false;
      const os = osById.get(p.os_id);
      const cc = resolveCostCenter(p, os, costCenterMap);
      return (
        !query ||
        String(p.descricao || "").toLowerCase().includes(query) ||
        String(os?.numero_os || "").toLowerCase().includes(query) ||
        String(os?.nome_os || "").toLowerCase().includes(query) ||
        String(os?.predio || "").toLowerCase().includes(query) ||
        String(os?.ativo || "").toLowerCase().includes(query) ||
        String(cc || "").toLowerCase().includes(query)
      );
    });
  }, [pecas, search, fOrigem, osById, costCenterMap]);

  const exportItems = useMemo(
    () => filtered.map((item) => withResolvedCostCenter(item)),
    [filtered, osById, costCenterMap],
  );

  const metrics = useMemo(() => {
    const totalQuantity = filtered.reduce((sum, item) => sum + Number(item.quantidade || 1), 0);
    const mapped = filtered.filter((item) => {
      const os = osById.get(item.os_id);
      return Boolean(resolveCostCenter(item, os, costCenterMap));
    }).length;
    const withPhotos = filtered.filter((item) => {
      const origin = item.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
      return (photosByOs.get(materialPhotoKey(origin, item.os_id)) || []).length > 0;
    }).length;
    return { totalQuantity, mapped, withPhotos };
  }, [filtered, osById, costCenterMap, photosByOs]);

  const exportExcel = async () => {
    setExportingExcel(true);
    const toastId = toast.loading("Gerando planilha corporativa...");
    try {
      await exportComprasPremiumExcel(exportItems, osById);
      toast.success("Planilha corporativa gerada com sucesso.", { id: toastId });
    } catch (error) {
      console.error("[Materiais] Erro ao exportar Excel:", error);
      toast.error("Não foi possível gerar a planilha.", { id: toastId });
    } finally {
      setExportingExcel(false);
    }
  };

  const exportPdf = async (onlyItem?: any) => {
    setExportingPdf(true);
    const toastId = toast.loading("Montando relatório PDF com evidências...");
    try {
      const source = onlyItem ? [withResolvedCostCenter(onlyItem)] : exportItems;
      const os = onlyItem ? osById.get(onlyItem.os_id) : null;
      await exportComprasPremiumPdf(source, osById, photosByOs, {
        title: onlyItem ? `Solicitação de Material · OS ${display(os?.numero_os)}` : undefined,
        filename: onlyItem
          ? `Solicitacao_Material_OS_${display(os?.numero_os, "sem-numero")}.pdf`
          : undefined,
      });
      toast.success("PDF corporativo gerado com sucesso.", { id: toastId });
    } catch (error: any) {
      console.error("[Materiais] Erro ao exportar PDF:", error);
      toast.error(error?.message || "Não foi possível gerar o PDF.", { id: toastId });
    } finally {
      setExportingPdf(false);
    }
  };

  const importCostCenters = async (file: File | null) => {
    if (!file) return;
    setImportingCc(true);
    const toastId = toast.loading("Validando vínculos Ativo × Centro de Custo...");
    try {
      const result = await importAssetCostCentersFromFile(file);
      const conflictText = result.conflicts
        ? ` ${result.conflicts} ativo(s) com conflito foram preservados para revisão.`
        : "";
      toast.success(`${result.imported} vínculo(s) atualizado(s).${conflictText}`, { id: toastId });
      await loadData(true);
    } catch (error: any) {
      console.error("[Materiais] Falha ao importar centros de custo:", error);
      toast.error(error?.message || "Não foi possível importar os centros de custo.", { id: toastId });
    } finally {
      setImportingCc(false);
      if (ccFileRef.current) ccFileRef.current.value = "";
    }
  };

  const structureDescription = async () => {
    if (!structureInput.trim()) return toast.error("Digite a descrição dos materiais.");
    setStructuring(true);
    try {
      const { items } = await processDescription({ data: { descricao: structureInput } });
      setStructuredItems(items);
      toast.success(`${items.length} item(ns) estruturado(s).`);
    } catch (error) {
      console.error("[Materiais] Falha na estruturação:", error);
      toast.error("Não foi possível estruturar a descrição.");
    } finally {
      setStructuring(false);
    }
  };

  const handleMaterialSaved = (updated: EditableMaterialRequest) => {
    setPecas((current) =>
      current.map((item) =>
        item.id === updated.id && item.origem === updated.origem
          ? { ...item, descricao: updated.descricao, quantidade: updated.quantidade }
          : item,
      ),
    );
    setEditingRequest(updated);
  };

  const editingOs = editingRequest ? osById.get(editingRequest.os_id ?? "") : null;
  const detailOs = detailRequest ? osById.get(detailRequest.os_id ?? "") : null;
  const detailOrigin: "refrigeracao" | "corretiva" =
    detailRequest?.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
  const detailPhotos = detailRequest
    ? photosByOs.get(materialPhotoKey(detailOrigin, detailRequest.os_id)) || []
    : [];
  const detailCostCenter = detailRequest
    ? resolveCostCenter(detailRequest, detailOs, costCenterMap)
    : "";

  return (
    <PageShell
      title="Solicitações de Materiais"
      description="Gestão corporativa de peças solicitadas em Corretiva e Refrigeração · Grupo GPS / operação Suvinil - Sherwin-Williams."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={ccFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => importCostCenters(event.target.files?.[0] || null)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-white/10 bg-white/[0.025]"
            onClick={() => ccFileRef.current?.click()}
            disabled={importingCc}
          >
            {importingCc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Base de CC
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-white/10 bg-white/[0.025]"
            onClick={() => exportPdf()}
            disabled={loading || exportingPdf || !filtered.length}
          >
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            PDF profissional
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-white/10 bg-white/[0.025]"
            onClick={exportExcel}
            disabled={loading || exportingExcel || !filtered.length}
          >
            {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Excel corporativo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-white/10 bg-white/[0.025]"
            onClick={() => loadData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={Package} label="Solicitações" value={filtered.length} hint="Peças exibidas no filtro atual" />
          <Kpi icon={Boxes} label="Quantidade total" value={metrics.totalQuantity} hint="Soma de unidades solicitadas" />
          <Kpi
            icon={Landmark}
            label="Centro de custo"
            value={`${metrics.mapped}/${filtered.length}`}
            hint="Preenchimento automático por ativo"
          />
          <Kpi icon={ShieldCheck} label="Com evidência" value={metrics.withPhotos} hint="Solicitações com fotos vinculadas" />
        </div>

        <GlassCard className="border-white/[0.08] bg-white/[0.018] p-3.5 shadow-none sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar peça, OS, ativo, centro de custo ou prédio..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 border-white/[0.08] bg-black/10 pl-9 shadow-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-black/10 p-1 lg:w-auto">
              {[
                ["todas", "Todas"],
                ["corretiva", "Corretiva"],
                ["refrigeracao", "Refrigeração"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFOrigem(value as typeof fOrigem)}
                  className={cn(
                    "h-8 rounded-lg px-3 text-xs font-semibold",
                    fOrigem === value
                      ? "border border-white/10 bg-white/[0.08] text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-white/[0.08] bg-white/[0.018] p-4 shadow-none">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="flex min-w-0 items-start gap-3 xl:w-[320px]">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-foreground/80">
                <ListChecks className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Padronização rápida de materiais</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Separe uma descrição livre em itens e quantidades antes de registrar ou encaminhar a solicitação.
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
              <Input
                value={structureInput}
                onChange={(event) => setStructureInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") structureDescription();
                }}
                placeholder="Ex.: 10 lâmpadas LED, 2 reatores, 4 m de cabo 2,5 mm"
                className="h-10 border-white/[0.08] bg-black/10 shadow-none"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 gap-2 border-white/10 bg-white/[0.035]"
                onClick={structureDescription}
                disabled={structuring}
              >
                {structuring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                Estruturar
              </Button>
            </div>
          </div>
          {structuredItems.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
              {structuredItems.map((item, index) => (
                <span
                  key={`${item.item}-${index}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/10 px-2.5 py-1.5 text-xs"
                >
                  <span className="font-semibold text-foreground">{item.item}</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Qtd. {item.qtd}</Badge>
                </span>
              ))}
            </div>
          )}
        </GlassCard>

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Carregando solicitações e evidências...</p>
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="border-white/[0.08] bg-white/[0.018] p-12 text-center shadow-none">
            <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="font-semibold">Nenhuma solicitação encontrada</p>
            <p className="mt-1 text-sm text-muted-foreground">Ajuste a busca ou o filtro de origem.</p>
          </GlassCard>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((p) => {
              const os = osById.get(p.os_id);
              const origem: "refrigeracao" | "corretiva" =
                p.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
              const photos = photosByOs.get(materialPhotoKey(origem, p.os_id)) || [];
              const cc = resolveCostCenter(p, os, costCenterMap);

              return (
                <GlassCard
                  key={`${p.origem}-${p.id}`}
                  className="group overflow-hidden border-white/[0.075] bg-white/[0.018] p-0 shadow-none transition-colors hover:border-white/[0.13] hover:bg-white/[0.028]"
                >
                  <div className="grid gap-0 xl:grid-cols-[1fr_260px]">
                    <div className="min-w-0 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-white/[0.09] bg-white/[0.035] text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                        >
                          {origem === "refrigeracao" ? "Refrigeração" : "Corretiva"}
                        </Badge>
                        <span className="rounded-md bg-foreground px-2 py-1 font-mono text-[10px] font-bold text-background">
                          OS {display(os?.numero_os)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold",
                            cc
                              ? "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-200"
                              : "border-amber-400/20 bg-amber-400/[0.08] text-amber-200",
                          )}
                        >
                          <Landmark className="h-3 w-3" />
                          CC {cc || "não mapeado"}
                        </span>
                        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <CalendarClock className="h-3 w-3" />
                          {formatDate(p.material_request_date || p.created_at)}
                        </span>
                      </div>

                      <div className="mt-4 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Peça / material solicitado</p>
                        <h3 className="mt-1 break-words text-base font-semibold leading-snug text-foreground sm:text-lg">
                          {display(p.descricao)}
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {display(os?.nome_os, "Descrição do chamado não informada")}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <MetaPill icon={Wrench}>{display(os?.ativo, "Ativo não informado")}</MetaPill>
                        <MetaPill icon={MapPin}>{[os?.predio, os?.andar, os?.local].filter(Boolean).join(" · ") || "Local não informado"}</MetaPill>
                        <MetaPill icon={UserRound}>{display(os?.solicitante, "Solicitante não informado")}</MetaPill>
                      </div>

                      <MaterialRequestPhotoGallery
                        photos={photos}
                        osNumber={os?.numero_os}
                        materialDescription={p.descricao}
                        variant="compact"
                      />
                    </div>

                    <div className="border-t border-white/[0.065] bg-black/[0.08] p-4 xl:border-l xl:border-t-0 sm:p-5">
                      <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quantidade</p>
                          <p className="mt-1 font-display text-2xl font-bold text-foreground">{Number(p.quantidade || 1)}</p>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Equipe</p>
                          <p className="mt-1 truncate text-sm font-semibold text-foreground">{display(os?.equipe)}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setDetailRequest(p)}
                          className="h-9 gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 text-[11px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                          title="Visualizar detalhes"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detalhes
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setEditingRequest(p as EditableMaterialRequest)}
                          className="h-9 gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 text-[11px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                          title="Editar solicitação"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => exportPdf(p)}
                          disabled={exportingPdf}
                          className="h-9 gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 text-[11px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                          title="Gerar PDF desta solicitação"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          PDF
                        </Button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      <MaterialRequestDetailsDialog
        request={detailRequest}
        os={detailOs}
        photos={detailPhotos}
        costCenter={detailCostCenter}
        open={Boolean(detailRequest)}
        onOpenChange={(open) => {
          if (!open) setDetailRequest(null);
        }}
        onEdit={() => {
          if (!detailRequest) return;
          setEditingRequest(detailRequest as EditableMaterialRequest);
          setDetailRequest(null);
        }}
      />

      <MaterialRequestEditDialog
        request={editingRequest}
        open={Boolean(editingRequest)}
        osNumber={editingOs?.numero_os}
        onOpenChange={(open) => {
          if (!open) setEditingRequest(null);
        }}
        onSaved={handleMaterialSaved}
      />
    </PageShell>
  );
}
