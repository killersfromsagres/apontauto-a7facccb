import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  RadioTower,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  Wrench,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  STATUS_COMPRA_LABEL,
  STATUS_COMPRA_ORDER,
  type StatusCompra,
} from "@/lib/controle/data";
import {
  MaterialRequestEditDialog,
  type EditableMaterialRequest,
} from "@/components/materiais/material-request-edit-dialog";
import { MaterialRequestDetailsDialog } from "@/components/materiais/material-request-details-dialog";

export const Route = createFileRoute("/_authenticated/corretiva-pecas-status")({
  component: CentralMateriaisUnificadaPage,
  head: () => ({
    meta: [
      { title: "Central de Materiais · Apont Auto" },
      {
        name: "description",
        content:
          "Central de peças com acompanhamento de compra, evidências, centro de custo, encaminhamento por e-mail e exportação.",
      },
    ],
  }),
});

type Origin = "refrigeracao" | "corretiva";
type EmailFilter = "pendentes" | "enviados" | "todos";
type PurchaseFilter = "todos" | StatusCompra;
type PurchaseMeta = {
  origem: Origin;
  tipo: "peca";
  item_id: string;
  status_compra: StatusCompra | null;
  numero_requisicao?: string | null;
  fornecedor?: string | null;
  valor_estimado?: number | null;
  data_solicitacao_facilities?: string | null;
};

const purchaseTone: Record<StatusCompra, string> = {
  aguardando: "border-amber-400/20 bg-amber-400/[0.07] text-amber-200",
  solicitado: "border-sky-400/20 bg-sky-400/[0.07] text-sky-200",
  em_cotacao: "border-indigo-400/20 bg-indigo-400/[0.07] text-indigo-200",
  comprado: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200",
  recebido: "border-teal-400/20 bg-teal-400/[0.07] text-teal-200",
  cancelado: "border-rose-400/20 bg-rose-400/[0.07] text-rose-200",
};

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

function purchaseKey(origin: Origin, id: string) {
  return `${origin}:peca:${id}`;
}

function Kpi({ icon: Icon, label, value, hint }: any) {
  return (
    <GlassCard className="relative overflow-hidden border-white/[0.08] bg-white/[0.022] p-3 shadow-none">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-foreground/80">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <p className="font-display text-xl font-bold leading-none tracking-tight text-foreground">{value}</p>
            <p className="truncate text-[9px] text-muted-foreground">{hint}</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function MetaPill({ icon: Icon, children, emphasis = false }: any) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]",
        emphasis
          ? "border-teal-400/20 bg-teal-400/[0.07] font-semibold text-teal-200"
          : "border-white/[0.07] bg-white/[0.025] text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function CentralMateriaisUnificadaPage() {
  const [pecas, setPecas] = useState<any[]>([]);
  const [osById, setOsById] = useState<Map<string, any>>(new Map());
  const [photosByOs, setPhotosByOs] = useState<MaterialPhotosByOs>(new Map());
  const [costCenterMap, setCostCenterMap] = useState<Map<string, AssetCostCenterRecord>>(new Map());
  const [purchaseMeta, setPurchaseMeta] = useState<Map<string, PurchaseMeta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importingCc, setImportingCc] = useState(false);
  const [updatingEmailKey, setUpdatingEmailKey] = useState<string | null>(null);
  const [updatingPurchaseKey, setUpdatingPurchaseKey] = useState<string | null>(null);
  const [deletingRequestKey, setDeletingRequestKey] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [fOrigem, setFOrigem] = useState<"todas" | Origin>("todas");
  const [fEnvio, setFEnvio] = useState<EmailFilter>("pendentes");
  const [fCompra, setFCompra] = useState<PurchaseFilter>("todos");
  const [editingRequest, setEditingRequest] = useState<EditableMaterialRequest | null>(null);
  const [detailRequest, setDetailRequest] = useState<any | null>(null);
  const [structureInput, setStructureInput] = useState("");
  const [structuredItems, setStructuredItems] = useState<Array<{ item: string; qtd: number }>>([]);
  const [structuring, setStructuring] = useState(false);
  const ccFileRef = useRef<HTMLInputElement>(null);

  const processDescription = useServerFn(processarDescricaoPecaIA);

  const loadData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [rRes, cRes, metaRes, mappings] = await Promise.all([
        supabase.from("refrigeracao_pecas").select("*").order("created_at", { ascending: false }),
        supabase.from("corretiva_pecas").select("*").order("created_at", { ascending: false }),
        supabase
          .from("controle_materiais_meta")
          .select("origem,tipo,item_id,status_compra,numero_requisicao,fornecedor,valor_estimado,data_solicitacao_facilities"),
        fetchAssetCostCenterMap(),
      ]);

      if (rRes.error) throw rRes.error;
      if (cRes.error) throw cRes.error;
      if (metaRes.error) throw metaRes.error;

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

      const metaMap = new Map<string, PurchaseMeta>();
      for (const meta of (metaRes.data || []) as unknown as PurchaseMeta[]) {
        if (meta.tipo !== "peca") continue;
        metaMap.set(purchaseKey(meta.origem, meta.item_id), meta);
      }

      setPecas(all);
      setOsById(map);
      setPhotosByOs(photoMap);
      setCostCenterMap(mappings);
      setPurchaseMeta(metaMap);
      setLastSync(new Date());
    } catch (error: any) {
      console.error("[Materiais] Falha ao carregar central:", error);
      toast.error("Erro ao carregar materiais: " + (error?.message || "falha desconhecida"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let timer: number | undefined;
    const refreshSoon = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadData(true), 500);
    };

    const channel = supabase
      .channel("central-materiais-unificada-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "corretiva_pecas" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "refrigeracao_pecas" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "corretiva_fotos" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "refrigeracao_fotos" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "controle_materiais_meta" }, refreshSoon)
      .subscribe();

    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const withResolvedCostCenter = (item: any) => {
    const os = osById.get(item.os_id);
    return { ...item, centro_custo: resolveCostCenter(item, os, costCenterMap) || null };
  };

  const baseFiltered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pecas.filter((p) => {
      if (fOrigem !== "todas" && p.origem !== fOrigem) return false;
      const origin: Origin = p.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
      const status = purchaseMeta.get(purchaseKey(origin, p.id))?.status_compra || "aguardando";
      if (fCompra !== "todos" && status !== fCompra) return false;
      const os = osById.get(p.os_id);
      const cc = resolveCostCenter(p, os, costCenterMap);
      return (
        !query ||
        String(p.descricao || "").toLowerCase().includes(query) ||
        String(os?.numero_os || "").toLowerCase().includes(query) ||
        String(os?.nome_os || "").toLowerCase().includes(query) ||
        String(os?.predio || "").toLowerCase().includes(query) ||
        String(os?.ativo || "").toLowerCase().includes(query) ||
        String(os?.equipe || "").toLowerCase().includes(query) ||
        String(cc || "").toLowerCase().includes(query)
      );
    });
  }, [pecas, search, fOrigem, fCompra, osById, costCenterMap, purchaseMeta]);

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
    const inPurchase = baseFiltered.filter((item) => {
      const origin: Origin = item.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
      const status = purchaseMeta.get(purchaseKey(origin, item.id))?.status_compra || "aguardando";
      return ["solicitado", "em_cotacao", "comprado"].includes(status);
    }).length;
    return { pending: pending.length, sent: sent.length, pendingQuantity, inPurchase };
  }, [baseFiltered, purchaseMeta]);

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

  const setPurchaseStatus = async (item: any, status: StatusCompra) => {
    const origin: Origin = item.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
    const key = purchaseKey(origin, item.id);
    setUpdatingPurchaseKey(key);
    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("controle_materiais_meta")
        .upsert(
          {
            origem: origin,
            tipo: "peca",
            item_id: item.id,
            status_compra: status,
            atualizado_por: sessionResult.session?.user?.id ?? null,
          } as any,
          { onConflict: "origem,tipo,item_id" },
        )
        .select("origem,tipo,item_id,status_compra,numero_requisicao,fornecedor,valor_estimado,data_solicitacao_facilities")
        .single();
      if (error) throw error;

      setPurchaseMeta((current) => {
        const next = new Map(current);
        next.set(key, data as unknown as PurchaseMeta);
        return next;
      });
      toast.success(`Situação da compra alterada para “${STATUS_COMPRA_LABEL[status]}”.`);
    } catch (error: any) {
      console.error("[Materiais] Falha ao atualizar situação da compra:", error);
      toast.error(error?.message || "Não foi possível atualizar a situação da compra.");
    } finally {
      setUpdatingPurchaseKey(null);
    }
  };

  const deleteRequest = async (item: any) => {
    const origin: Origin = item.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
    const table = origin === "refrigeracao" ? "refrigeracao_pecas" : "corretiva_pecas";
    const os = osById.get(item.os_id);
    const key = `${origin}-${item.id}`;
    const confirmed = window.confirm(
      `Excluir a solicitação de peça da OS ${display(os?.numero_os)}?\n\nPeça: ${display(item.descricao)}\n\nEsta ação é definitiva e removerá a solicitação da Central de Materiais e das próximas exportações. A OS e suas fotos não serão excluídas.`,
    );

    if (!confirmed) return;
    setDeletingRequestKey(key);

    try {
      const { data, error } = await (supabase.from(table) as any)
        .delete()
        .eq("id", item.id)
        .select("id");

      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("A solicitação não foi excluída. Verifique sua permissão ou atualize a lista e tente novamente.");
      }

      setPecas((current) =>
        current.filter((row) => !(row.id === item.id && row.origem === origin)),
      );
      setPurchaseMeta((current) => {
        const next = new Map(current);
        next.delete(purchaseKey(origin, item.id));
        return next;
      });

      if (detailRequest?.id === item.id && detailRequest?.origem === origin) setDetailRequest(null);
      if (editingRequest?.id === item.id && editingRequest?.origem === origin) setEditingRequest(null);

      toast.success("Solicitação excluída. A peça não aparecerá mais na central nem nas exportações.");
    } catch (error: any) {
      console.error("[Materiais] Falha ao excluir solicitação:", error);
      toast.error(error?.message || "Não foi possível excluir a solicitação de peça.");
    } finally {
      setDeletingRequestKey(null);
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
    const toastId = toast.loading("Montando relatório PDF Sherwin-Williams · Grupo GPS...");
    try {
      const source = onlyItem
        ? [withResolvedCostCenter(onlyItem)]
        : filtered.map((item) => withResolvedCostCenter(item));
      const os = onlyItem ? osById.get(onlyItem.os_id) : null;
      await exportComprasPremiumPdf(source, osById, photosByOs, {
        title: onlyItem ? `Solicitação de Material - OS ${display(os?.numero_os)}` : undefined,
        filename: onlyItem
          ? `Sherwin_Williams_Grupo_GPS_OS_${display(os?.numero_os, "sem-numero")}.pdf`
          : undefined,
      });
      toast.success("PDF Sherwin-Williams · Grupo GPS gerado com sucesso.", { id: toastId });
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
      eyebrow="Sherwin-Williams · Grupo GPS"
      title="Central de Materiais"
      description="Solicitações de peças, compras, evidências, centro de custo e encaminhamento em uma única fila operacional."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
            className="h-8 gap-1.5 border-white/10 bg-white/[0.025] px-2.5 text-xs"
            onClick={() => ccFileRef.current?.click()}
            disabled={importingCc}
          >
            {importingCc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Base CC
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-white/10 bg-white/[0.025] px-2.5 text-xs"
            onClick={() => void exportPdf()}
            disabled={loading || exportingPdf || !filtered.length}
          >
            {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            PDF ({filtered.length})
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => void exportExcel()}
            disabled={loading || exportingExcel || !pendingExportItems.length}
          >
            {exportingExcel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Pendentes ({pendingExportItems.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-white/10 bg-white/[0.025] px-2.5 text-xs"
            onClick={() => void loadData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/10 bg-emerald-400/[0.035] px-3 py-2 text-[10px] text-muted-foreground">
          <RadioTower className="h-3.5 w-3.5 text-emerald-300" />
          <span className="font-semibold text-emerald-200">Sincronização em tempo real</span>
          <span>·</span>
          <span>{lastSync ? `Atualizado às ${lastSync.toLocaleTimeString("pt-BR")}` : "Carregando dados..."}</span>
          {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={MailOpen} label="Pendentes de e-mail" value={metrics.pending} hint="próxima planilha" />
          <Kpi icon={MailCheck} label="Encaminhadas" value={metrics.sent} hint="já enviadas" />
          <Kpi icon={Boxes} label="Qtd. pendente" value={metrics.pendingQuantity} hint="unidades" />
          <Kpi icon={ShoppingCart} label="Em compras" value={metrics.inPurchase} hint="solicitado / cotação / comprado" />
        </div>

        <GlassCard className="border-white/[0.08] bg-white/[0.018] p-3 shadow-none">
          <div className="grid gap-2 xl:grid-cols-[minmax(280px,1fr)_auto_auto_auto] xl:items-center">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar peça, OS, ativo, CC, equipe ou prédio..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 border-white/[0.08] bg-black/10 pl-8 text-xs shadow-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-white/[0.07] bg-black/10 p-0.5">
              {[["pendentes", "Pendentes"], ["enviados", "Enviados"], ["todos", "Todos"]].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFEnvio(value as EmailFilter)}
                  className={cn(
                    "h-7 rounded-md px-2 text-[10px] font-semibold",
                    fEnvio === value ? "border border-white/10 bg-white/[0.08] text-foreground" : "text-muted-foreground hover:bg-white/[0.04]",
                  )}
                >{label}</Button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-white/[0.07] bg-black/10 p-0.5">
              {[["todas", "Todas"], ["corretiva", "Corretiva"], ["refrigeracao", "Refrig."]].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFOrigem(value as typeof fOrigem)}
                  className={cn(
                    "h-7 rounded-md px-2 text-[10px] font-semibold",
                    fOrigem === value ? "border border-white/10 bg-white/[0.08] text-foreground" : "text-muted-foreground hover:bg-white/[0.04]",
                  )}
                >{label}</Button>
              ))}
            </div>

            <Select value={fCompra} onValueChange={(value) => setFCompra(value as PurchaseFilter)}>
              <SelectTrigger className="h-8 min-w-[160px] border-white/[0.08] bg-black/10 text-[10px]">
                <SelectValue placeholder="Situação da compra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as compras</SelectItem>
                {STATUS_COMPRA_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>{STATUS_COMPRA_LABEL[status]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </GlassCard>

        <GlassCard className="border-white/[0.08] bg-white/[0.018] p-2.5 shadow-none">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex shrink-0 items-center gap-2 md:w-[210px]">
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.035]">
                <ListChecks className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-xs font-semibold">Padronizar descrição</p>
                <p className="text-[9px] text-muted-foreground">Organize itens rapidamente</p>
              </div>
            </div>
            <Input
              value={structureInput}
              onChange={(event) => setStructureInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void structureDescription(); }}
              placeholder="Ex.: 10 lâmpadas LED, 2 reatores..."
              className="h-8 min-w-0 flex-1 border-white/[0.08] bg-black/10 text-xs"
            />
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void structureDescription()} disabled={structuring}>
              {structuring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
              Estruturar
            </Button>
          </div>
          {structuredItems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-2">
              {structuredItems.map((item, index) => (
                <span key={`${item.item}-${index}`} className="rounded-md border border-white/[0.07] bg-black/10 px-2 py-1 text-[10px]">
                  <strong>{item.item}</strong> · {item.qtd} un.
                </span>
              ))}
            </div>
          )}
        </GlassCard>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">Carregando solicitações e evidências...</p>
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="border-white/[0.08] bg-white/[0.018] p-10 text-center shadow-none">
            <Package className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
            <p className="text-sm font-semibold">Nenhuma solicitação encontrada</p>
            <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou a busca.</p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const os = osById.get(p.os_id);
              const origin: Origin = p.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
              const photos = photosByOs.get(materialPhotoKey(origin, p.os_id)) || [];
              const firstPhoto = photos[0]?.image_url;
              const cc = resolveCostCenter(p, os, costCenterMap);
              const sent = Boolean(p.email_enviado_em);
              const emailKey = `${origin}-${p.id}`;
              const pKey = purchaseKey(origin, p.id);
              const purchaseStatus = purchaseMeta.get(pKey)?.status_compra || "aguardando";
              const updating = updatingEmailKey === emailKey;
              const updatingPurchase = updatingPurchaseKey === pKey;
              const deleting = deletingRequestKey === emailKey;

              return (
                <GlassCard
                  key={emailKey}
                  className="group overflow-hidden border-white/[0.07] bg-white/[0.016] p-0 shadow-none transition-colors hover:border-white/[0.13] hover:bg-white/[0.025]"
                >
                  <div className="grid min-h-[156px] md:grid-cols-[128px_minmax(0,1fr)] xl:grid-cols-[140px_minmax(0,1fr)_235px]">
                    <button
                      type="button"
                      onClick={() => setDetailRequest(p)}
                      className="relative min-h-[126px] overflow-hidden border-b border-white/[0.07] bg-black/20 text-left md:min-h-full md:border-b-0 md:border-r"
                    >
                      {firstPhoto ? (
                        <img
                          src={firstPhoto}
                          alt={`Evidência da OS ${display(os?.numero_os)}`}
                          className="h-full min-h-[126px] w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                        />
                      ) : (
                        <div className="flex h-full min-h-[126px] flex-col items-center justify-center gap-1.5 text-muted-foreground/45">
                          <ImageIcon className="h-6 w-6" />
                          <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">Sem foto</span>
                        </div>
                      )}
                      {photos.length > 0 && (
                        <span className="absolute bottom-1.5 left-1.5 rounded-md border border-white/15 bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-md">
                          {photos.length} foto{photos.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>

                    <div className="min-w-0 p-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="h-5 border-white/[0.09] bg-white/[0.035] px-1.5 text-[8px] uppercase tracking-[0.09em]">
                          {origin === "refrigeracao" ? "Refrigeração" : "Corretiva"}
                        </Badge>
                        <span className="rounded bg-foreground px-1.5 py-0.5 font-mono text-[9px] font-bold text-background">OS {display(os?.numero_os)}</span>
                        <span className={cn("inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[8px] font-bold", purchaseTone[purchaseStatus])}>
                          <ShoppingCart className="h-2.5 w-2.5" /> {STATUS_COMPRA_LABEL[purchaseStatus]}
                        </span>
                        <span className={cn(
                          "inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[8px] font-bold",
                          sent ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200" : "border-amber-400/20 bg-amber-400/[0.07] text-amber-200",
                        )}>
                          {sent ? <MailCheck className="h-2.5 w-2.5" /> : <MailOpen className="h-2.5 w-2.5" />}
                          {sent ? "E-mail enviado" : "E-mail pendente"}
                        </span>
                      </div>

                      <div className="mt-2.5">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">Peça / material</p>
                        <h3 className="mt-0.5 line-clamp-2 break-words text-[15px] font-semibold leading-snug text-foreground">{display(p.descricao)}</h3>
                        <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">{display(os?.nome_os, "Descrição do chamado não informada")}</p>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        <MetaPill icon={Wrench}>{display(os?.ativo, "Ativo não informado")}</MetaPill>
                        <MetaPill icon={MapPin}>{[os?.predio, os?.andar, os?.local].filter(Boolean).join(" · ") || "Local não informado"}</MetaPill>
                        <MetaPill icon={Landmark} emphasis>CC {cc || "não mapeado"}</MetaPill>
                        <MetaPill icon={UserRound}>{display(os?.solicitante, "Solicitante não informado")}</MetaPill>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><CalendarClock className="h-2.5 w-2.5" /> {formatDate(p.material_request_date || p.created_at)}</span>
                        {sent && <span className="inline-flex items-center gap-1 text-emerald-300/80"><CheckCircle2 className="h-2.5 w-2.5" /> E-mail {formatDate(p.email_enviado_em)}</span>}
                      </div>
                    </div>

                    <div className="border-t border-white/[0.065] bg-black/[0.07] p-3 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
                          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Quantidade</p>
                          <p className="mt-0.5 font-display text-xl font-bold leading-none">{Number(p.quantidade || 1)}</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
                          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Equipe</p>
                          <p className="mt-0.5 truncate text-[11px] font-semibold">{display(os?.equipe)}</p>
                        </div>
                      </div>

                      <div className="mt-2">
                        <Select value={purchaseStatus} onValueChange={(value) => void setPurchaseStatus(p, value as StatusCompra)} disabled={updatingPurchase || deleting}>
                          <SelectTrigger className="h-8 w-full border-white/[0.08] bg-white/[0.025] text-[10px]">
                            {updatingPurchase ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShoppingCart className="mr-1 h-3 w-3" />}
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_COMPRA_ORDER.map((status) => <SelectItem key={status} value={status}>{STATUS_COMPRA_LABEL[status]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        type="button"
                        variant={sent ? "outline" : "default"}
                        className={cn("mt-1.5 h-8 w-full gap-1.5 text-[10px] font-semibold", sent && "border-white/10 bg-white/[0.025]")}
                        disabled={updating || deleting}
                        onClick={() => void setEmailForwarded(p, !sent)}
                      >
                        {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : sent ? <Undo2 className="h-3.5 w-3.5" /> : <MailCheck className="h-3.5 w-3.5" />}
                        {sent ? "Desfazer e-mail" : "Marcar e-mail enviado"}
                      </Button>

                      <div className="mt-1.5 grid grid-cols-4 gap-1">
                        <Button type="button" variant="ghost" onClick={() => setDetailRequest(p)} disabled={deleting} className="h-7 gap-1 rounded-md border border-white/[0.07] bg-white/[0.025] px-1 text-[9px]">
                          <Eye className="h-3 w-3" /> Ver
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setEditingRequest(p as EditableMaterialRequest)} disabled={deleting} className="h-7 gap-1 rounded-md border border-white/[0.07] bg-white/[0.025] px-1 text-[9px]">
                          <PencilLine className="h-3 w-3" /> Editar
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => void exportPdf(p)} disabled={exportingPdf || deleting} className="h-7 gap-1 rounded-md border border-white/[0.07] bg-white/[0.025] px-1 text-[9px]">
                          <FileText className="h-3 w-3" /> PDF
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void deleteRequest(p)}
                          disabled={deleting}
                          className="h-7 gap-1 rounded-md border border-red-400/15 bg-red-400/[0.045] px-1 text-[9px] text-red-300 hover:border-red-400/25 hover:bg-red-400/[0.10] hover:text-red-200"
                          title="Excluir solicitação de peça"
                        >
                          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          Excluir
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
        onOpenChange={(open) => { if (!open) setDetailRequest(null); }}
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
        onOpenChange={(open) => { if (!open) setEditingRequest(null); }}
        onSaved={handleMaterialSaved}
      />
    </PageShell>
  );
}
