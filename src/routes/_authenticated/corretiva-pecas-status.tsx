import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Boxes,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Landmark,
  ListChecks,
  Loader2,
  MailCheck,
  MailOpen,
  MapPin,
  Package,
  PencilLine,
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
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
import { MaterialRequestDetailsDialog } from "@/components/materiais/material-request-details-dialog";

export const Route = createFileRoute("/_authenticated/corretiva-pecas-status")({
  component: CentralMateriaisUnificadaPage,
  head: () => ({
    meta: [
      { title: "Solicitações de Materiais · Apont Auto" },
      {
        name: "description",
        content:
          "Central de peças com evidências, controle de encaminhamento por e-mail e exportação de pendências.",
      },
    ],
  }),
});

type Origin = "refrigeracao" | "corretiva";
type EmailFilter = "pendentes" | "enviados" | "todos";

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

function Kpi({ icon: Icon, label, value, hint }: any) {
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

function MetaPill({ icon: Icon, children }: any) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[11px] text-muted-foreground">
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
  const [updatingEmailKey, setUpdatingEmailKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fOrigem, setFOrigem] = useState<"todas" | Origin>("todas");
  const [fEnvio, setFEnvio] = useState<EmailFilter>("pendentes");
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

      const rData = (rRes.data || []).map((p: any) => ({ ...p, origem: "refrigeracao" as const }));
      const cData = (cRes.data || []).map((p: any) => ({ ...p, origem: "corretiva" as const }));
      const all = [...rData, ...cData].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const rIds = Array.from(new Set(rData.map((p) => p.os_id).filter(Boolean))) as string[];
      const cIds = Array.from(new Set(cData.map((p) => p.os_id).filter(Boolean))) as string[];

      const [rOs, cOs, photoMap] = await Promise.all([
        rIds.length
          ? supabase.from("refrigeracao_os").select("*").in("id", rIds)
          : Promise.resolve({ data: [], error: null }),
        cIds.length
          ? supabase.from("corretiva_os").select("*").in("id", cIds)
          : Promise.resolve({ data: [], error: null }),
        loadMaterialRequestPhotos(rIds, cIds),
      ]);

      if (rOs.error) throw rOs.error;
      if (cOs.error) throw cOs.error;

      const map = new Map<string, any>();
      (rOs.data || []).forEach((o: any) => map.set(o.id, { ...o, origem: "refrigeracao" }));
      (cOs.data || []).forEach((o: any) => map.set(o.id, { ...o, origem: "corretiva" }));

      setPecas(all);
      setOsById(map);
      setPhotosByOs(photoMap);
      setCostCenterMap(mappings);
    } catch (error: any) {
      console.error("[Materiais] Falha ao carregar central:", error);
      toast.error("Erro ao carregar materiais: " + (error?.message || "falha desconhecida"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const withResolvedCostCenter = (item: any) => {
    const os = osById.get(item.os_id);
    return { ...item, centro_custo: resolveCostCenter(item, os, costCenterMap) || null };
  };

  const baseFiltered = useMemo(() => {
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

  const filtered = useMemo(
    () =>
      baseFiltered.filter((item) => {
        const sent = Boolean(item.email_enviado_em);
        if (fEnvio === "pendentes") return !sent;
        if (fEnvio === "enviados") return sent;
        return true;
      }),
    [baseFiltered, fEnvio],
  );

  const pendingExportItems = useMemo(
    () =>
      baseFiltered
        .filter((item) => !item.email_enviado_em)
        .map((item) => withResolvedCostCenter(item)),
    [baseFiltered, osById, costCenterMap],
  );

  const metrics = useMemo(() => {
    const pending = baseFiltered.filter((item) => !item.email_enviado_em);
    const sent = baseFiltered.filter((item) => Boolean(item.email_enviado_em));
    const pendingQuantity = pending.reduce((sum, item) => sum + Number(item.quantidade || 1), 0);
    const withPhotos = baseFiltered.filter((item) => {
      const origin: Origin = item.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
      return (photosByOs.get(materialPhotoKey(origin, item.os_id)) || []).length > 0;
    }).length;
    return { pending: pending.length, sent: sent.length, pendingQuantity, withPhotos };
  }, [baseFiltered, photosByOs]);

  const setEmailForwarded = async (item: any, forwarded: boolean) => {
    const origin: Origin = item.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
    const table = origin === "refrigeracao" ? "refrigeracao_pecas" : "corretiva_pecas";
    const key = `${origin}-${item.id}`;
    const emailEnviadoEm = forwarded ? new Date().toISOString() : null;
    setUpdatingEmailKey(key);

    try {
      const { error } = await (supabase.from(table) as any)
        .update({ email_enviado_em: emailEnviadoEm, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (error) throw error;

      setPecas((current) =>
        current.map((row) =>
          row.id === item.id && row.origem === origin
            ? { ...row, email_enviado_em: emailEnviadoEm }
            : row,
        ),
      );

      toast.success(
        forwarded
          ? "Peça marcada como encaminhada por e-mail. Ela não entrará nas próximas planilhas."
          : "Marcação removida. A peça voltou para as próximas planilhas de pendências.",
      );
    } catch (error: any) {
      console.error("[Materiais] Falha ao atualizar encaminhamento:", error);
      toast.error(error?.message || "Não foi possível atualizar o encaminhamento por e-mail.");
    } finally {
      setUpdatingEmailKey(null);
    }
  };

  const exportExcel = async () => {
    if (!pendingExportItems.length) {
      toast.info("Não há peças pendentes de encaminhamento para exportar.");
      return;
    }

    setExportingExcel(true);
    const toastId = toast.loading("Gerando planilha somente com peças pendentes...");
    try {
      await exportComprasPremiumExcel(pendingExportItems, osById);
      toast.success(
        `Planilha gerada com ${pendingExportItems.length} peça(s) ainda não encaminhada(s) por e-mail.`,
        { id: toastId },
      );
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
      const source = onlyItem
        ? [withResolvedCostCenter(onlyItem)]
        : filtered.map((item) => withResolvedCostCenter(item));
      const os = onlyItem ? osById.get(onlyItem.os_id) : null;
      await exportComprasPremiumPdf(source, osById, photosByOs, {
        title: onlyItem ? `Solicitação de Material · OS ${display(os?.numero_os)}` : undefined,
        filename: onlyItem
          ? `Solicitacao_Material_OS_${display(os?.numero_os, "sem-numero")}.pdf`
          : undefined,
      });
      toast.success("PDF gerado com sucesso.", { id: toastId });
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
      toast.success(`${result.imported} vínculo(s) atualizado(s).`, { id: toastId });
      await loadData(true);
    } catch (error: any) {
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
  const detailOrigin: Origin =
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
      description="Controle de peças solicitadas, evidências e encaminhamento para compras por e-mail."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={ccFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => void importCostCenters(event.target.files?.[0] || null)}
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
            onClick={() => void exportPdf()}
            disabled={loading || exportingPdf || !filtered.length}
          >
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            PDF
          </Button>
          <Button
            size="sm"
            className="h-9 gap-2"
            onClick={() => void exportExcel()}
            disabled={loading || exportingExcel || !pendingExportItems.length}
          >
            {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Baixar pendentes ({pendingExportItems.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-white/10 bg-white/[0.025]"
            onClick={() => void loadData(true)}
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
          <Kpi icon={MailOpen} label="Pendentes de e-mail" value={metrics.pending} hint="Entram na próxima planilha" />
          <Kpi icon={MailCheck} label="Já encaminhadas" value={metrics.sent} hint="Ficam fora das próximas planilhas" />
          <Kpi icon={Boxes} label="Qtd. pendente" value={metrics.pendingQuantity} hint="Unidades ainda a encaminhar" />
          <Kpi icon={ShieldCheck} label="Com evidência" value={metrics.withPhotos} hint="Solicitações com fotos disponíveis" />
        </div>

        <GlassCard className="border-white/[0.08] bg-white/[0.018] p-3.5 shadow-none sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar peça, OS, ativo, centro de custo ou prédio..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 border-white/[0.08] bg-black/10 pl-9 shadow-none"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-black/10 p-1">
                {[
                  ["pendentes", "Pendentes"],
                  ["enviados", "Enviados"],
                  ["todos", "Todos"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setFEnvio(value as EmailFilter)}
                    className={cn(
                      "h-8 rounded-lg px-3 text-xs font-semibold",
                      fEnvio === value
                        ? "border border-white/10 bg-white/[0.08] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.04]",
                    )}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-black/10 p-1">
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
                        ? "border border-white/10 bg-white/[0.08] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.04]",
                    )}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-white/[0.08] bg-white/[0.018] p-4 shadow-none">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-3 lg:w-[300px]">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035]">
                <ListChecks className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Padronização rápida</p>
                <p className="text-xs text-muted-foreground">Organize descrições antes de solicitar.</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 gap-2">
              <Input
                value={structureInput}
                onChange={(event) => setStructureInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void structureDescription();
                }}
                placeholder="Ex.: 10 lâmpadas LED, 2 reatores..."
                className="h-10 border-white/[0.08] bg-black/10"
              />
              <Button variant="outline" onClick={() => void structureDescription()} disabled={structuring}>
                {structuring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                Estruturar
              </Button>
            </div>
          </div>
          {structuredItems.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
              {structuredItems.map((item, index) => (
                <span key={`${item.item}-${index}`} className="rounded-lg border border-white/[0.07] bg-black/10 px-2.5 py-1.5 text-xs">
                  <strong>{item.item}</strong> · Qtd. {item.qtd}
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
            <p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou a busca.</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const os = osById.get(p.os_id);
              const origin: Origin = p.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
              const photos = photosByOs.get(materialPhotoKey(origin, p.os_id)) || [];
              const firstPhoto = photos[0]?.image_url;
              const cc = resolveCostCenter(p, os, costCenterMap);
              const sent = Boolean(p.email_enviado_em);
              const emailKey = `${origin}-${p.id}`;
              const updating = updatingEmailKey === emailKey;

              return (
                <GlassCard
                  key={emailKey}
                  className="group overflow-hidden border-white/[0.075] bg-white/[0.018] p-0 shadow-none transition-all hover:border-white/[0.14] hover:bg-white/[0.028]"
                >
                  <div className="grid min-h-[190px] md:grid-cols-[170px_minmax(0,1fr)] xl:grid-cols-[190px_minmax(0,1fr)_250px]">
                    <button
                      type="button"
                      onClick={() => setDetailRequest(p)}
                      className="relative min-h-[170px] overflow-hidden border-b border-white/[0.07] bg-black/20 text-left md:min-h-full md:border-b-0 md:border-r"
                    >
                      {firstPhoto ? (
                        <img
                          src={firstPhoto}
                          alt={`Evidência da OS ${display(os?.numero_os)}`}
                          className="h-full min-h-[170px] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full min-h-[170px] flex-col items-center justify-center gap-2 text-muted-foreground/50">
                          <ImageIcon className="h-8 w-8" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Sem foto</span>
                        </div>
                      )}
                      {photos.length > 0 && (
                        <span className="absolute bottom-2 left-2 rounded-lg border border-white/15 bg-black/65 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                          {photos.length} foto{photos.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>

                    <div className="min-w-0 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-white/[0.09] bg-white/[0.035] text-[9px] uppercase tracking-[0.1em]">
                          {origin === "refrigeracao" ? "Refrigeração" : "Corretiva"}
                        </Badge>
                        <span className="rounded-md bg-foreground px-2 py-1 font-mono text-[10px] font-bold text-background">
                          OS {display(os?.numero_os)}
                        </span>
                        <span className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold",
                          sent
                            ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200"
                            : "border-amber-400/20 bg-amber-400/[0.08] text-amber-200",
                        )}>
                          {sent ? <MailCheck className="h-3 w-3" /> : <MailOpen className="h-3 w-3" />}
                          {sent ? "Encaminhado por e-mail" : "Pendente de e-mail"}
                        </span>
                      </div>

                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Peça / material</p>
                        <h3 className="mt-1 break-words text-lg font-semibold leading-snug text-foreground">
                          {display(p.descricao)}
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {display(os?.nome_os, "Descrição do chamado não informada")}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <MetaPill icon={Wrench}>{display(os?.ativo, "Ativo não informado")}</MetaPill>
                        <MetaPill icon={MapPin}>{[os?.predio, os?.andar, os?.local].filter(Boolean).join(" · ") || "Local não informado"}</MetaPill>
                        <MetaPill icon={Landmark}>CC {cc || "não mapeado"}</MetaPill>
                        <MetaPill icon={UserRound}>{display(os?.solicitante, "Solicitante não informado")}</MetaPill>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock className="h-3 w-3" /> Solicitado: {formatDate(p.material_request_date || p.created_at)}
                        </span>
                        {sent && (
                          <span className="inline-flex items-center gap-1.5 text-emerald-300/80">
                            <CheckCircle2 className="h-3 w-3" /> E-mail: {formatDate(p.email_enviado_em)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-white/[0.065] bg-black/[0.08] p-4 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0 sm:p-5">
                      <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quantidade</p>
                          <p className="mt-1 font-display text-2xl font-bold">{Number(p.quantidade || 1)}</p>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Equipe</p>
                          <p className="mt-1 truncate text-sm font-semibold">{display(os?.equipe)}</p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant={sent ? "outline" : "default"}
                        className={cn(
                          "mt-3 h-10 w-full gap-2 text-xs font-semibold",
                          sent && "border-white/10 bg-white/[0.025]",
                        )}
                        disabled={updating}
                        onClick={() => void setEmailForwarded(p, !sent)}
                      >
                        {updating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : sent ? (
                          <Undo2 className="h-4 w-4" />
                        ) : (
                          <MailCheck className="h-4 w-4" />
                        )}
                        {sent ? "Desfazer encaminhamento" : "Marcar como enviado por e-mail"}
                      </Button>

                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        <Button type="button" variant="ghost" onClick={() => setDetailRequest(p)} className="h-9 gap-1 rounded-lg border border-white/[0.07] bg-white/[0.025] px-1 text-[10px]">
                          <Eye className="h-3.5 w-3.5" /> Detalhes
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setEditingRequest(p as EditableMaterialRequest)} className="h-9 gap-1 rounded-lg border border-white/[0.07] bg-white/[0.025] px-1 text-[10px]">
                          <PencilLine className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => void exportPdf(p)} disabled={exportingPdf} className="h-9 gap-1 rounded-lg border border-white/[0.07] bg-white/[0.025] px-1 text-[10px]">
                          <FileText className="h-3.5 w-3.5" /> PDF
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
