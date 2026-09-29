import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  HardDrive,
  Loader2,
  PackageOpen,
  Search,
  Send,
  Upload,
} from "lucide-react";

import { SignaturePad } from "@/components/mensageria/signature-pad";
import { PageShell } from "@/components/page-shell";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  importLocalHistory,
  loadMensageriaSnapshot,
  saveLocalEnvio,
  saveLocalMalote,
} from "@/lib/mensageria/local-database";
import { mapSpreadsheetHistoryToLocal } from "@/lib/mensageria/local-import";
import type { Envio, EnvioCategoria, EnvioStatus, Malote, MaloteStatus, MensageriaSnapshot, Setor } from "@/lib/mensageria/models";
import { MENSAGERIA_SECTORS } from "@/lib/mensageria/seed-data";
import {
  parseMensageriaSpreadsheet,
  type MensageriaSpreadsheetImport,
  type SpreadsheetCell,
  type SpreadsheetRows,
} from "@/lib/mensageria/spreadsheet-import";

export const Route = createFileRoute("/_authenticated/mensageria")({
  component: MensageriaPage,
});

type ViewMode = "operacao" | "todos" | "pendentes" | "entregues" | "envios" | "setores";

type ReceiptForm = {
  remetente: string;
  destinatario: string;
  codigo_rastreio: string;
  codigo_interno: string;
  item_descricao: string;
  local_recebimento: string;
  quantidade: string;
  setor: string;
  recebido_em: string;
  recebido_por: string;
  assinatura_portaria_data_url: string | null;
  observacoes: string;
};

type DeliveryForm = {
  entregue_para: string;
  entregue_em: string;
  assinatura_entrega_data_url: string | null;
  entrega_observacoes: string;
};

type ShipmentForm = {
  categoria: EnvioCategoria;
  remetente: string;
  destinatario: string;
  codigo_rastreio: string;
  item_descricao: string;
  nota_fiscal: string;
  enviado_em: string;
  enviado_por: string;
  observacoes: string;
};

type ImportPreview = {
  fileName: string;
  parsed: MensageriaSpreadsheetImport;
  snapshot: MensageriaSnapshot;
};

function toDateTimeLocal(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida.");
  return date.toISOString();
}

function formatDateTime(value: string | null, legacy = false) {
  if (!value) return legacy ? "Não registrado na planilha" : "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(legacy ? {} : { timeStyle: "short" as const }),
  }).format(date);
}

function isToday(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function ageInDays(value: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function createId(prefix: string) {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function emptyReceiptForm(): ReceiptForm {
  return {
    remetente: "",
    destinatario: "",
    codigo_rastreio: "",
    codigo_interno: "",
    item_descricao: "",
    local_recebimento: "Portaria",
    quantidade: "1",
    setor: "NÃO CLASSIFICADO",
    recebido_em: toDateTimeLocal(),
    recebido_por: "",
    assinatura_portaria_data_url: null,
    observacoes: "",
  };
}

function receiptFormFromMalote(malote: Malote): ReceiptForm {
  return {
    remetente: malote.remetente,
    destinatario: malote.destinatario,
    codigo_rastreio: malote.codigo_rastreio ?? "",
    codigo_interno: malote.codigo_interno ?? "",
    item_descricao: malote.item_descricao ?? "",
    local_recebimento: malote.local_recebimento,
    quantidade: String(malote.quantidade),
    setor: malote.setor,
    recebido_em: toDateTimeLocal(malote.recebido_em ? new Date(malote.recebido_em) : new Date()),
    recebido_por: malote.recebido_por,
    assinatura_portaria_data_url: malote.assinatura_portaria_data_url,
    observacoes: malote.observacoes ?? "",
  };
}

function emptyDeliveryForm(malote?: Malote | null): DeliveryForm {
  return {
    entregue_para: malote?.destinatario ?? "",
    entregue_em: toDateTimeLocal(),
    assinatura_entrega_data_url: null,
    entrega_observacoes: "",
  };
}

function emptyShipmentForm(): ShipmentForm {
  return {
    categoria: "malote_interno",
    remetente: "",
    destinatario: "",
    codigo_rastreio: "",
    item_descricao: "",
    nota_fiscal: "",
    enviado_em: toDateTimeLocal(),
    enviado_por: "",
    observacoes: "",
  };
}

function shipmentCategoryLabel(category: EnvioCategoria) {
  return ({ correios: "Correios", juridico: "Jurídico", malote_interno: "Malote interno", outro: "Outro" })[category];
}

function MensageriaPage() {
  const [malotes, setMalotes] = useState<Malote[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("operacao");
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("todos");

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<Malote | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>(emptyReceiptForm());
  const [deliveryQueueOpen, setDeliveryQueueOpen] = useState(false);
  const [deliveryTarget, setDeliveryTarget] = useState<Malote | null>(null);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(emptyDeliveryForm());
  const [detailsTarget, setDetailsTarget] = useState<Malote | null>(null);
  const [detailsSector, setDetailsSector] = useState("");
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [shipmentForm, setShipmentForm] = useState<ShipmentForm>(emptyShipmentForm());
  const [importOpen, setImportOpen] = useState(false);
  const [importReading, setImportReading] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLocalError(null);
    try {
      const snapshot = await loadMensageriaSnapshot();
      setMalotes(snapshot.malotes);
      setEnvios(snapshot.envios);
    } catch (error) {
      console.error("Erro no armazenamento local da Mensageria:", error);
      const message = error instanceof Error ? error.message : "Não foi possível carregar o armazenamento local.";
      setLocalError(message);
      toast.error("Falha ao abrir a Mensageria local.", { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sectors = MENSAGERIA_SECTORS;
  const sectorMap = useMemo(() => new Map(sectors.map((item) => [item.nome, item])), [sectors]);
  const pending = useMemo(() => malotes.filter((item) => item.status === "aguardando_entrega"), [malotes]);
  const delivered = useMemo(() => malotes.filter((item) => item.status === "entregue"), [malotes]);
  const activeShipments = useMemo(() => envios.filter((item) => item.status === "preparando" || item.status === "enviado"), [envios]);

  const stats = useMemo(() => ({
    receivedToday: malotes.filter((item) => isToday(item.recebido_em)).length,
    pending: pending.length,
    deliveredToday: delivered.filter((item) => isToday(item.entregue_em)).length,
    overdue: pending.filter((item) => ageInDays(item.recebido_em) >= 3).length,
    signed: delivered.filter((item) => Boolean(item.assinatura_entrega_data_url)).length,
    sectorsPending: new Set(pending.map((item) => item.setor)).size,
    shipments: activeShipments.length,
  }), [activeShipments, delivered, malotes, pending]);

  const visibleMalotes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return malotes.filter((item) => {
      if (sectorFilter !== "todos" && item.setor !== sectorFilter) return false;
      if (view === "pendentes" && item.status !== "aguardando_entrega") return false;
      if (view === "entregues" && item.status !== "entregue") return false;
      if (!term) return true;
      return [item.remetente, item.destinatario, item.codigo_rastreio, item.codigo_interno, item.item_descricao, item.setor, item.recebido_por, item.entregue_para]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [malotes, search, sectorFilter, view]);

  const visibleShipments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return envios;
    return envios.filter((item) => [item.remetente, item.destinatario, item.codigo_rastreio, item.item_descricao, item.nota_fiscal, item.enviado_por, item.status]
      .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [envios, search]);

  const groupedPending = useMemo(() => {
    const groups = new Map<string, Malote[]>();
    pending.forEach((item) => groups.set(item.setor, [...(groups.get(item.setor) ?? []), item]));
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "pt-BR"));
  }, [pending]);

  const openDelivery = (malote: Malote) => {
    setDeliveryQueueOpen(false);
    setDetailsTarget(null);
    setDeliveryTarget(malote);
    setDeliveryForm(emptyDeliveryForm(malote));
  };

  const openEditReceipt = (malote: Malote) => {
    setDetailsTarget(null);
    setReceiptTarget(malote);
    setReceiptForm(receiptFormFromMalote(malote));
    setReceiptOpen(true);
  };

  const openDetails = (malote: Malote) => {
    setDetailsTarget(malote);
    setDetailsSector(malote.setor);
  };

  const handleReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number.parseInt(receiptForm.quantidade, 10);
    if (!receiptForm.remetente.trim() || !receiptForm.destinatario.trim()) return void toast.error("Informe remetente e destinatário.");
    if (!receiptForm.recebido_por.trim()) return void toast.error("Informe quem recebeu o malote na portaria.");
    if (!receiptForm.assinatura_portaria_data_url) return void toast.error("Colete a assinatura de recebimento na portaria.");
    if (!Number.isFinite(quantity) || quantity < 1) return void toast.error("Informe uma quantidade válida.");
    let receivedAt: string;
    try { receivedAt = toIso(receiptForm.recebido_em); } catch { return void toast.error("Informe uma data de recebimento válida."); }

    const now = new Date().toISOString();
    const malote: Malote = {
      ...(receiptTarget ?? {
        id: createId("malote"),
        status: "aguardando_entrega" as const,
        entregue_em: null,
        entregue_para: null,
        assinatura_entrega_data_url: null,
        entrega_observacoes: null,
        legacy_import: false,
        source_key: null,
        legacy_source: null,
        legacy_source_row: null,
        created_at: now,
      }),
      remetente: receiptForm.remetente.trim(),
      destinatario: receiptForm.destinatario.trim(),
      codigo_rastreio: receiptForm.codigo_rastreio.trim() || null,
      codigo_interno: receiptForm.codigo_interno.trim() || null,
      item_descricao: receiptForm.item_descricao.trim() || null,
      local_recebimento: receiptForm.local_recebimento.trim() || "Portaria",
      quantidade: quantity,
      setor: receiptForm.setor,
      recebido_em: receivedAt,
      recebido_por: receiptForm.recebido_por.trim(),
      assinatura_portaria_data_url: receiptForm.assinatura_portaria_data_url,
      observacoes: receiptForm.observacoes.trim() || null,
      updated_at: now,
    };
    setSaving(true);
    try {
      await saveLocalMalote(malote);
      await loadData();
      setReceiptOpen(false);
      setReceiptTarget(null);
      setReceiptForm(emptyReceiptForm());
      setView("pendentes");
      toast.success(receiptTarget ? "Protocolo de entrada atualizado." : "Recebimento registrado com assinatura da portaria.");
    } catch (error) {
      console.error("Erro ao salvar recebimento local:", error);
      toast.error("Não foi possível salvar o recebimento neste dispositivo.");
    } finally { setSaving(false); }
  };

  const handleDelivery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deliveryTarget) return;
    if (!deliveryForm.entregue_para.trim()) return void toast.error("Informe quem recebeu o malote.");
    if (!deliveryForm.assinatura_entrega_data_url) return void toast.error("A assinatura digital do destinatário é obrigatória.");
    let deliveredAt: string;
    try { deliveredAt = toIso(deliveryForm.entregue_em); } catch { return void toast.error("Informe uma data de entrega válida."); }
    if (deliveryTarget.recebido_em && new Date(deliveredAt).getTime() < new Date(deliveryTarget.recebido_em).getTime()) {
      return void toast.error("A entrega não pode ocorrer antes do recebimento na portaria.");
    }
    setSaving(true);
    try {
      await saveLocalMalote({
        ...deliveryTarget,
        status: "entregue",
        entregue_em: deliveredAt,
        entregue_para: deliveryForm.entregue_para.trim(),
        assinatura_entrega_data_url: deliveryForm.assinatura_entrega_data_url,
        entrega_observacoes: deliveryForm.entrega_observacoes.trim() || null,
        updated_at: new Date().toISOString(),
      });
      await loadData();
      setDeliveryTarget(null);
      setDeliveryForm(emptyDeliveryForm());
      setView("entregues");
      toast.success("Entrega concluída com assinatura digital.");
    } catch (error) {
      console.error("Erro ao salvar entrega local:", error);
      toast.error("Não foi possível salvar a entrega neste dispositivo.");
    } finally { setSaving(false); }
  };

  const updateSector = async () => {
    if (!detailsTarget || !detailsSector || detailsSector === detailsTarget.setor) return;
    setSaving(true);
    try {
      const updated = { ...detailsTarget, setor: detailsSector, updated_at: new Date().toISOString() };
      await saveLocalMalote(updated);
      await loadData();
      setDetailsTarget(updated);
      toast.success("Direcionamento atualizado.");
    } catch (error) {
      console.error("Erro ao atualizar setor local:", error);
      toast.error("Não foi possível atualizar o direcionamento.");
    } finally { setSaving(false); }
  };

  const handleShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shipmentForm.remetente.trim() || !shipmentForm.destinatario.trim()) return void toast.error("Informe remetente e destinatário.");
    if (!shipmentForm.enviado_por.trim()) return void toast.error("Informe quem realizou o envio.");
    let shippedAt: string;
    try { shippedAt = toIso(shipmentForm.enviado_em); } catch { return void toast.error("Informe uma data de envio válida."); }
    const now = new Date().toISOString();
    const envio: Envio = {
      id: createId("envio"),
      categoria: shipmentForm.categoria,
      remetente: shipmentForm.remetente.trim(),
      destinatario: shipmentForm.destinatario.trim(),
      codigo_rastreio: shipmentForm.codigo_rastreio.trim() || null,
      item_descricao: shipmentForm.item_descricao.trim() || null,
      nota_fiscal: shipmentForm.nota_fiscal.trim() || null,
      enviado_em: shippedAt,
      enviado_por: shipmentForm.enviado_por.trim(),
      status: "enviado",
      finalizado_em: null,
      observacoes: shipmentForm.observacoes.trim() || null,
      legacy_import: false,
      source_key: null,
      legacy_source: null,
      legacy_source_row: null,
      created_at: now,
      updated_at: now,
    };
    setSaving(true);
    try {
      await saveLocalEnvio(envio);
      await loadData();
      setShipmentOpen(false);
      setShipmentForm(emptyShipmentForm());
      setView("envios");
      toast.success("Envio registrado no acompanhamento local.");
    } catch (error) {
      console.error("Erro ao salvar envio local:", error);
      toast.error("Não foi possível salvar o envio neste dispositivo.");
    } finally { setSaving(false); }
  };

  const finalizeShipment = async (envio: Envio) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await saveLocalEnvio({ ...envio, status: "finalizado", finalizado_em: now, updated_at: now });
      await loadData();
      toast.success("Envio finalizado.");
    } catch (error) {
      console.error("Erro ao finalizar envio local:", error);
      toast.error("Não foi possível finalizar o envio.");
    } finally { setSaving(false); }
  };

  const readSpreadsheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportReading(true);
    setImportPreview(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const sheets = Object.fromEntries(workbook.SheetNames.map((name) => [
        name.trim().toLocaleUpperCase("pt-BR"),
        XLSX.utils.sheet_to_json<SpreadsheetCell[]>(workbook.Sheets[name], { header: 1, raw: true, defval: null }) as SpreadsheetRows,
      ]));
      if (!sheets.ENTREGA) throw new Error("A aba ENTREGA não foi encontrada.");
      const parsed = parseMensageriaSpreadsheet(sheets);
      if (!parsed.malotes.length) throw new Error("Nenhum protocolo foi encontrado na aba ENTREGA.");
      setImportPreview({ fileName: file.name, parsed, snapshot: mapSpreadsheetHistoryToLocal(parsed) });
    } catch (error) {
      console.error("Erro ao ler planilha:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
    } finally {
      setImportReading(false);
      event.target.value = "";
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setSaving(true);
    try {
      const result = await importLocalHistory(importPreview.snapshot.malotes, importPreview.snapshot.envios);
      await loadData();
      setImportOpen(false);
      setImportPreview(null);
      toast.success("Planilha processada sem duplicações.", { description: `${result.malotes} malote(s) e ${result.envios} envio(s) novos adicionados.` });
    } catch (error) {
      console.error("Erro ao importar planilha local:", error);
      toast.error("Não foi possível importar a planilha neste dispositivo.");
    } finally { setSaving(false); }
  };

  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(malotes.map((item) => ({
      Status: item.status === "entregue" ? "ENTREGUE" : "PENDENTE",
      Setor: item.setor,
      "Responsável do setor": sectorMap.get(item.setor)?.responsavel ?? "",
      Remetente: item.remetente,
      Destinatário: item.destinatario,
      "Código de rastreio": item.codigo_rastreio ?? "",
      "Código interno": item.codigo_interno ?? "",
      Item: item.item_descricao ?? "",
      Quantidade: item.quantidade,
      "Data recebimento": formatDateTime(item.recebido_em, item.legacy_import),
      Local: item.local_recebimento,
      "Recebido por": item.recebido_por,
      "Assinatura portaria": item.assinatura_portaria_data_url ? "SIM" : "NÃO DISPONÍVEL",
      "Data entrega": formatDateTime(item.entregue_em, item.legacy_import),
      "Entregue para": item.entregue_para ?? "",
      "Assinatura destinatário": item.assinatura_entrega_data_url ? "SIM" : "NÃO DISPONÍVEL",
      "Observações recebimento": item.observacoes ?? "",
      "Observações entrega": item.entrega_observacoes ?? "",
    }))), "Malotes");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(envios.map((item) => ({
      Status: item.status.toLocaleUpperCase("pt-BR"), Categoria: shipmentCategoryLabel(item.categoria), Remetente: item.remetente,
      Destinatário: item.destinatario, "Código de rastreio": item.codigo_rastreio ?? "", Item: item.item_descricao ?? "",
      "Nota fiscal": item.nota_fiscal ?? "", "Data envio": formatDateTime(item.enviado_em, item.legacy_import),
      "Enviado por": item.enviado_por ?? "", "Data conclusão": formatDateTime(item.finalizado_em, item.legacy_import), Observações: item.observacoes ?? "",
    }))), "Envios");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sectors.map((item) => ({ Setor: item.nome, Responsável: item.responsavel }))), "Setores");
    XLSX.writeFile(workbook, `mensageria-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Backup Excel exportado.");
  };

  return (
    <PageShell
      title="Mensageria e Malotes"
      description="Protocolo único da entrada na portaria até a entrega ao destinatário, com duas assinaturas e controle por setor."
      actions={<div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Importar Excel</Button>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportWorkbook} disabled={!malotes.length && !envios.length}><Download className="h-4 w-4" /> Exportar backup</Button>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => { setShipmentForm(emptyShipmentForm()); setShipmentOpen(true); }}><Send className="h-4 w-4" /> Novo envio</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDeliveryQueueOpen(true)} disabled={!pending.length}>Registrar entrega{pending.length ? ` (${pending.length})` : ""}</Button>
        <Button type="button" size="sm" onClick={() => { setReceiptTarget(null); setReceiptForm(emptyReceiptForm()); setReceiptOpen(true); }}>Novo recebimento</Button>
      </div>}
    >
      <div className="space-y-5">
        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><HardDrive className="h-5 w-5" /></span><div><p className="font-semibold text-foreground">Armazenamento local ativo</p><p className="mt-1 text-sm text-muted-foreground">Os dados e assinaturas ficam neste navegador. Exporte o backup para guardar ou mover o histórico para outro dispositivo.</p></div></div>
          <Badge variant="outline" className="w-fit border-emerald-500/30 text-emerald-600 dark:text-emerald-300">Sem dependência do Supabase</Badge>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Kpi label="Recebidos hoje" value={stats.receivedToday} detail="Entradas registradas" />
          <Kpi label="Aguardando entrega" value={stats.pending} detail={`${stats.sectorsPending} setores envolvidos`} critical={stats.pending > 0} />
          <Kpi label="Entregues hoje" value={stats.deliveredToday} detail="Protocolos concluídos" />
          <Kpi label="Há 3+ dias" value={stats.overdue} detail="Pendências prioritárias" critical={stats.overdue > 0} />
          <Kpi label="Assinaturas finais" value={stats.signed} detail="Comprovações digitais" />
          <Kpi label="Envios ativos" value={stats.shipments} detail="Em acompanhamento" />
        </section>

        {localError && <section role="alert" className="flex flex-col gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><div><p className="font-semibold text-foreground">Armazenamento local indisponível</p><p className="mt-1 text-sm text-muted-foreground">{localError}</p></div></div><Button type="button" variant="outline" size="sm" onClick={() => void loadData()}>Tentar novamente</Button></section>}

        <section className="rounded-2xl border border-border/70 bg-card/50 p-2 shadow-sm"><div className="flex flex-wrap gap-1">
          <ViewButton active={view === "operacao"} onClick={() => setView("operacao")}>Operação</ViewButton>
          <ViewButton active={view === "todos"} onClick={() => setView("todos")}>Todos ({malotes.length})</ViewButton>
          <ViewButton active={view === "pendentes"} onClick={() => setView("pendentes")}>Pendentes ({pending.length})</ViewButton>
          <ViewButton active={view === "entregues"} onClick={() => setView("entregues")}>Entregues ({delivered.length})</ViewButton>
          <ViewButton active={view === "envios"} onClick={() => setView("envios")}>Envios ({envios.length})</ViewButton>
          <ViewButton active={view === "setores"} onClick={() => setView("setores")}>Setores</ViewButton>
        </div></section>

        {view === "operacao" ? (
          <OperationalOverview pending={pending} grouped={groupedPending} sectorMap={sectorMap} onDeliver={openDelivery} onDetails={openDetails} onSeeAll={() => setView("pendentes")} />
        ) : view === "setores" ? (
          <SectorGrid sectors={sectors} malotes={malotes} />
        ) : view === "envios" ? (
          <><SearchBox value={search} onChange={setSearch} placeholder="Buscar remetente, destinatário, rastreio, NF ou status" />{loading ? <LoadingState /> : <ShipmentList envios={visibleShipments} saving={saving} onFinalize={finalizeShipment} />}</>
        ) : (
          <><SearchBox value={search} onChange={setSearch} placeholder="Buscar remetente, destinatário, rastreio, código interno ou recebedor" sectors={sectors} sectorFilter={sectorFilter} onSectorChange={setSectorFilter} />{loading ? <LoadingState /> : <ProtocolList malotes={visibleMalotes} sectorMap={sectorMap} onDeliver={openDelivery} onDetails={openDetails} />}</>
        )}
      </div>

      <Dialog open={receiptOpen} onOpenChange={(open) => { setReceiptOpen(open); if (!open) setReceiptTarget(null); }}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{receiptTarget ? "Editar protocolo de entrada" : "Novo recebimento na portaria"}</DialogTitle><DialogDescription>{receiptTarget ? "Atualize os dados registrados e preserve a rastreabilidade do protocolo." : "Crie o protocolo inicial, identifique o setor e colete a primeira assinatura."}</DialogDescription></DialogHeader><form onSubmit={handleReceipt} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Remetente" required><Input value={receiptForm.remetente} onChange={(e) => setReceiptForm((p) => ({ ...p, remetente: e.target.value }))} /></Field>
          <Field label="Destinatário final" required><Input value={receiptForm.destinatario} onChange={(e) => setReceiptForm((p) => ({ ...p, destinatario: e.target.value }))} /></Field>
          <Field label="Código de rastreio"><Input value={receiptForm.codigo_rastreio} onChange={(e) => setReceiptForm((p) => ({ ...p, codigo_rastreio: e.target.value }))} /></Field>
          <Field label="Código interno"><Input value={receiptForm.codigo_interno} onChange={(e) => setReceiptForm((p) => ({ ...p, codigo_interno: e.target.value }))} /></Field>
          <Field label="Item / descrição"><Input value={receiptForm.item_descricao} onChange={(e) => setReceiptForm((p) => ({ ...p, item_descricao: e.target.value }))} /></Field>
          <Field label="Quantidade" required><Input type="number" min={1} max={9999} value={receiptForm.quantidade} onChange={(e) => setReceiptForm((p) => ({ ...p, quantidade: e.target.value }))} /></Field>
          <Field label="Setor" required><SectorSelect value={receiptForm.setor} onChange={(value) => setReceiptForm((p) => ({ ...p, setor: value }))} sectors={sectors} /></Field>
          <Field label="Local de recebimento" required><Input value={receiptForm.local_recebimento} onChange={(e) => setReceiptForm((p) => ({ ...p, local_recebimento: e.target.value }))} /></Field>
          <Field label="Data e hora do recebimento" required><Input type="datetime-local" value={receiptForm.recebido_em} onChange={(e) => setReceiptForm((p) => ({ ...p, recebido_em: e.target.value }))} /></Field>
          <Field label="Recebido na portaria por" required><Input value={receiptForm.recebido_por} onChange={(e) => setReceiptForm((p) => ({ ...p, recebido_por: e.target.value }))} /></Field>
        </div>
        <SignaturePad value={receiptForm.assinatura_portaria_data_url} onChange={(value) => setReceiptForm((p) => ({ ...p, assinatura_portaria_data_url: value }))} disabled={saving} />
        <Field label="Observações do recebimento"><textarea rows={3} value={receiptForm.observacoes} onChange={(e) => setReceiptForm((p) => ({ ...p, observacoes: e.target.value }))} className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></Field>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setReceiptOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving || !receiptForm.assinatura_portaria_data_url}>{saving ? "Salvando..." : receiptTarget ? "Salvar alterações" : "Registrar recebimento"}</Button></DialogFooter>
      </form></DialogContent></Dialog>

      <Dialog open={Boolean(deliveryTarget)} onOpenChange={(open) => { if (!open) setDeliveryTarget(null); }}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{deliveryTarget?.status === "entregue" ? "Regularizar comprovante de entrega" : "Entrega ao destinatário"}</DialogTitle><DialogDescription>Informe a data real, confirme o recebedor e colete a assinatura digital final.</DialogDescription></DialogHeader>{deliveryTarget && <form onSubmit={handleDelivery} className="space-y-5">
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4"><div className="flex flex-wrap gap-2"><Badge variant="outline">{deliveryTarget.setor}</Badge>{deliveryTarget.codigo_interno && <Badge variant="outline">{deliveryTarget.codigo_interno}</Badge>}</div><p className="mt-3 font-semibold text-foreground">{deliveryTarget.remetente} → {deliveryTarget.destinatario}</p><p className="mt-1 text-sm text-muted-foreground">Recebido em {formatDateTime(deliveryTarget.recebido_em, deliveryTarget.legacy_import)}</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Entregue para" required><Input value={deliveryForm.entregue_para} onChange={(e) => setDeliveryForm((p) => ({ ...p, entregue_para: e.target.value }))} /></Field><Field label="Data e hora da entrega" required><Input type="datetime-local" value={deliveryForm.entregue_em} onChange={(e) => setDeliveryForm((p) => ({ ...p, entregue_em: e.target.value }))} /></Field></div>
        <SignaturePad key={deliveryTarget.id} value={deliveryForm.assinatura_entrega_data_url} onChange={(value) => setDeliveryForm((p) => ({ ...p, assinatura_entrega_data_url: value }))} disabled={saving} />
        <Field label="Observações da entrega"><textarea rows={3} value={deliveryForm.entrega_observacoes} onChange={(e) => setDeliveryForm((p) => ({ ...p, entrega_observacoes: e.target.value }))} className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></Field>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setDeliveryTarget(null)}>Cancelar</Button><Button type="submit" disabled={saving || !deliveryForm.assinatura_entrega_data_url}>{saving ? "Concluindo..." : "Concluir entrega"}</Button></DialogFooter>
      </form>}</DialogContent></Dialog>

      <Dialog open={deliveryQueueOpen} onOpenChange={setDeliveryQueueOpen}><DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Fila para entrega</DialogTitle><DialogDescription>Escolha o protocolo que será concluído com a assinatura do destinatário.</DialogDescription></DialogHeader><div className="space-y-2">{pending.length ? pending.map((item) => <button key={item.id} type="button" onClick={() => openDelivery(item)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-border/70 p-4 text-left transition-colors hover:bg-muted/40"><div className="min-w-0"><p className="truncate font-semibold text-foreground">{item.destinatario}</p><p className="mt-1 truncate text-sm text-muted-foreground">{item.remetente} · {item.setor}</p><p className="mt-1 text-xs text-muted-foreground">{ageInDays(item.recebido_em)} dia(s) em aberto</p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>) : <p className="py-8 text-center text-sm text-muted-foreground">Nenhum malote aguarda entrega.</p>}</div></DialogContent></Dialog>

      <Dialog open={Boolean(detailsTarget)} onOpenChange={(open) => { if (!open) setDetailsTarget(null); }}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Protocolo completo</DialogTitle><DialogDescription>Rastreabilidade da entrada na portaria até o destinatário final.</DialogDescription></DialogHeader>{detailsTarget && <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4"><div><MaloteStatusBadge status={detailsTarget.status} /><p className="mt-2 text-lg font-semibold text-foreground">{detailsTarget.remetente} → {detailsTarget.destinatario}</p></div><div className="flex flex-wrap gap-2">{detailsTarget.status === "aguardando_entrega" && <Button type="button" variant="outline" size="sm" onClick={() => openEditReceipt(detailsTarget)}>Editar entrada</Button>}{(detailsTarget.status === "aguardando_entrega" || !detailsTarget.assinatura_entrega_data_url) && <Button type="button" size="sm" onClick={() => openDelivery(detailsTarget)}>{detailsTarget.status === "entregue" ? "Adicionar assinatura" : "Registrar entrega"}</Button>}</div></div>
        <div className="grid gap-4 sm:grid-cols-3"><Info label="Rastreio" value={detailsTarget.codigo_rastreio || "Não informado"} /><Info label="Código interno" value={detailsTarget.codigo_interno || "Não informado"} /><Info label="Item / quantidade" value={`${detailsTarget.item_descricao || "Não informado"} · ${detailsTarget.quantidade}`} /></div>
        <ProtocolSection title="1. Recebimento na portaria"><Info label="Data" value={formatDateTime(detailsTarget.recebido_em, detailsTarget.legacy_import)} /><Info label="Local" value={detailsTarget.local_recebimento} /><Info label="Recebido por" value={detailsTarget.recebido_por} /><SignaturePreview label="Assinatura da portaria" value={detailsTarget.assinatura_portaria_data_url} legacy={detailsTarget.legacy_import} /></ProtocolSection>
        <ProtocolSection title="2. Setor e direcionamento"><div className="sm:col-span-2"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Setor / responsável</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><SectorSelect value={detailsSector} onChange={setDetailsSector} sectors={sectors} /><Button type="button" variant="outline" onClick={updateSector} disabled={saving || detailsSector === detailsTarget.setor}>Atualizar</Button></div></div></ProtocolSection>
        <ProtocolSection title="3. Entrega final">{detailsTarget.status === "entregue" ? <><Info label="Data" value={formatDateTime(detailsTarget.entregue_em, detailsTarget.legacy_import)} /><Info label="Entregue para" value={detailsTarget.entregue_para || "Não registrado na planilha"} /><Info label="Observações" value={detailsTarget.entrega_observacoes || "Sem observações"} /><SignaturePreview label="Assinatura do destinatário" value={detailsTarget.assinatura_entrega_data_url} legacy={detailsTarget.legacy_import} /></> : <div className="sm:col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="font-semibold text-foreground">Aguardando entrega</p><p className="mt-1 text-sm text-muted-foreground">A conclusão exigirá identificação e assinatura do destinatário.</p></div>}</ProtocolSection>
        {detailsTarget.legacy_import && <p className="text-xs text-muted-foreground">Registro importado de {detailsTarget.legacy_source}, linha {detailsTarget.legacy_source_row}. A planilha original não continha imagens de assinatura nem data separada de entrega.</p>}
      </div>}</DialogContent></Dialog>

      <Dialog open={shipmentOpen} onOpenChange={setShipmentOpen}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Novo envio</DialogTitle><DialogDescription>Registre Correios, Jurídico ou malote interno para acompanhar até a conclusão.</DialogDescription></DialogHeader><form onSubmit={handleShipment} className="space-y-5"><div className="grid gap-4 md:grid-cols-2">
        <Field label="Categoria" required><select value={shipmentForm.categoria} onChange={(e) => setShipmentForm((p) => ({ ...p, categoria: e.target.value as EnvioCategoria }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="malote_interno">Malote interno</option><option value="correios">Correios</option><option value="juridico">Jurídico</option><option value="outro">Outro</option></select></Field>
        <Field label="Código de rastreio"><Input value={shipmentForm.codigo_rastreio} onChange={(e) => setShipmentForm((p) => ({ ...p, codigo_rastreio: e.target.value }))} /></Field>
        <Field label="Remetente" required><Input value={shipmentForm.remetente} onChange={(e) => setShipmentForm((p) => ({ ...p, remetente: e.target.value }))} /></Field>
        <Field label="Destinatário" required><Input value={shipmentForm.destinatario} onChange={(e) => setShipmentForm((p) => ({ ...p, destinatario: e.target.value }))} /></Field>
        <Field label="Item"><Input value={shipmentForm.item_descricao} onChange={(e) => setShipmentForm((p) => ({ ...p, item_descricao: e.target.value }))} /></Field>
        <Field label="Nota fiscal"><Input value={shipmentForm.nota_fiscal} onChange={(e) => setShipmentForm((p) => ({ ...p, nota_fiscal: e.target.value }))} /></Field>
        <Field label="Data e hora do envio" required><Input type="datetime-local" value={shipmentForm.enviado_em} onChange={(e) => setShipmentForm((p) => ({ ...p, enviado_em: e.target.value }))} /></Field>
        <Field label="Enviado por" required><Input value={shipmentForm.enviado_por} onChange={(e) => setShipmentForm((p) => ({ ...p, enviado_por: e.target.value }))} /></Field>
      </div><Field label="Observações"><textarea rows={3} value={shipmentForm.observacoes} onChange={(e) => setShipmentForm((p) => ({ ...p, observacoes: e.target.value }))} className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></Field><DialogFooter><Button type="button" variant="ghost" onClick={() => setShipmentOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Registrar envio"}</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) setImportPreview(null); }}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Importar planilha</DialogTitle><DialogDescription>A aba ENTREGA é usada como histórico consolidado. As linhas já existentes não serão duplicadas.</DialogDescription></DialogHeader><div className="space-y-4"><label className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-border bg-muted/15 px-5 py-8 text-center hover:bg-muted/30"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">{importReading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}</span><span className="mt-3 text-sm font-semibold text-foreground">{importReading ? "Analisando..." : "Selecionar arquivo Excel"}</span><span className="mt-1 text-xs text-muted-foreground">.xlsx ou .xls · processado somente neste navegador</span><input type="file" accept=".xlsx,.xls" onChange={readSpreadsheet} disabled={importReading || saving} className="sr-only" /></label>{importPreview && <><section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="font-semibold text-foreground">{importPreview.fileName}</p><div className="mt-4 grid grid-cols-3 gap-3"><Info label="Malotes" value={String(importPreview.snapshot.malotes.length)} /><Info label="Envios" value={String(importPreview.snapshot.envios.length)} /><Info label="Alertas" value={String(importPreview.parsed.warnings.length)} /></div></section>{importPreview.parsed.warnings.length > 0 && <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="text-sm font-semibold text-foreground">Dados ausentes preservados</p><ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">{importPreview.parsed.warnings.slice(0, 8).map((warning, index) => <li key={`${warning.sheet}-${warning.row}-${index}`}>• {warning.sheet}, linha {warning.row}: {warning.message}</li>)}</ul>{importPreview.parsed.warnings.length > 8 && <p className="mt-2 text-xs text-muted-foreground">Mais {importPreview.parsed.warnings.length - 8} alerta(s).</p>}</section>}</>}</div><DialogFooter><Button type="button" variant="ghost" onClick={() => setImportOpen(false)}>Cancelar</Button><Button type="button" onClick={confirmImport} disabled={!importPreview || saving || importReading}>{saving ? "Importando..." : "Confirmar importação"}</Button></DialogFooter></DialogContent></Dialog>
    </PageShell>
  );
}

function OperationalOverview({ pending, grouped, sectorMap, onDeliver, onDetails, onSeeAll }: { pending: Malote[]; grouped: [string, Malote[]][]; sectorMap: Map<string, Setor>; onDeliver: (item: Malote) => void; onDetails: (item: Malote) => void; onSeeAll: () => void }) {
  const oldest = [...pending].sort((a, b) => (a.recebido_em ?? "9999").localeCompare(b.recebido_em ?? "9999"))[0] ?? null;
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]"><section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4"><div><h2 className="font-semibold text-foreground">Fila para entrega</h2><p className="mt-1 text-sm text-muted-foreground">Protocolos aguardando assinatura do destinatário.</p></div><Button type="button" variant="ghost" size="sm" onClick={onSeeAll}>Ver todos</Button></div>{pending.length ? <div className="divide-y divide-border/60">{pending.slice(0, 8).map((item) => <ProtocolRow key={item.id} item={item} sector={sectorMap.get(item.setor)} compact onDeliver={() => onDeliver(item)} onDetails={() => onDetails(item)} />)}</div> : <div className="px-5 py-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 font-semibold text-foreground">Fila em dia</p><p className="mt-1 text-sm text-muted-foreground">Nenhum malote aguarda entrega.</p></div>}</section><div className="space-y-5"><section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Prioridade operacional</p>{oldest ? <><p className="mt-3 text-lg font-semibold text-foreground">{oldest.destinatario}</p><p className="mt-1 text-sm text-muted-foreground">{oldest.remetente}</p><div className="mt-4 grid grid-cols-2 gap-3"><Info label="Setor" value={oldest.setor} /><Info label="Em aberto" value={`${ageInDays(oldest.recebido_em)} dia(s)`} /></div><Button type="button" className="mt-5 w-full" onClick={() => onDeliver(oldest)}>Registrar entrega</Button></> : <p className="mt-3 text-sm text-muted-foreground">Sem pendências.</p>}</section><section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pendências por setor</p><div className="mt-4 space-y-3">{grouped.length ? grouped.map(([sector, items]) => <div key={sector} className="flex items-start justify-between gap-3 border-b border-border/50 pb-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{sector}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{sectorMap.get(sector)?.responsavel || "Responsável a definir"}</p></div><Badge variant="outline">{items.length}</Badge></div>) : <p className="text-sm text-muted-foreground">Sem pendências.</p>}</div></section></div></div>;
}

function SearchBox({ value, onChange, placeholder, sectors, sectorFilter, onSectorChange }: { value: string; onChange: (value: string) => void; placeholder: string; sectors?: Setor[]; sectorFilter?: string; onSectorChange?: (value: string) => void }) {
  return <section className="rounded-2xl border border-border/70 bg-card/50 p-4 shadow-sm"><div className={sectors ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]" : ""}><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-11 pl-9" /></div>{sectors && <select value={sectorFilter} onChange={(e) => onSectorChange?.(e.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm"><option value="todos">Todos os setores</option>{sectors.map((sector) => <option key={sector.id} value={sector.nome}>{sector.nome}</option>)}</select>}</div></section>;
}

function ProtocolList({ malotes, sectorMap, onDeliver, onDetails }: { malotes: Malote[]; sectorMap: Map<string, Setor>; onDeliver: (item: Malote) => void; onDetails: (item: Malote) => void }) {
  if (!malotes.length) return <EmptyState icon={<PackageOpen className="h-8 w-8" />} title="Nenhum protocolo encontrado" description="Ajuste os filtros ou registre um novo recebimento." />;
  return <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm"><div className="hidden grid-cols-[1.4fr_1.3fr_1fr_1fr_140px] gap-3 border-b border-border/70 bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid"><span>Remetente → destinatário</span><span>Setor</span><span>Recebimento</span><span>Referências</span><span className="text-right">Ações</span></div><div className="divide-y divide-border/60">{malotes.map((item) => <ProtocolRow key={item.id} item={item} sector={sectorMap.get(item.setor)} onDeliver={() => onDeliver(item)} onDetails={() => onDetails(item)} />)}</div></section>;
}

function ProtocolRow({ item, sector, onDeliver, onDetails, compact = false }: { item: Malote; sector?: Setor; onDeliver: () => void; onDetails: () => void; compact?: boolean }) {
  return <div className={`grid gap-3 px-4 py-4 lg:items-center lg:px-5 ${compact ? "lg:grid-cols-[1.6fr_1fr_130px]" : "lg:grid-cols-[1.4fr_1.3fr_1fr_1fr_140px]"}`}><div className="min-w-0"><div className="flex flex-wrap gap-2"><MaloteStatusBadge status={item.status} />{item.legacy_import && <Badge variant="outline" className="text-muted-foreground">Planilha</Badge>}</div><p className="mt-2 truncate text-sm font-semibold text-foreground">{item.remetente} <span className="text-muted-foreground">→</span> {item.destinatario}</p></div><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{item.setor}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{sector?.responsavel || "Responsável a definir"}</p></div>{compact ? <div><p className="text-sm font-medium text-foreground">{ageInDays(item.recebido_em)} dia(s)</p><p className="text-xs text-muted-foreground">em aberto</p></div> : <><div><p className="text-sm text-foreground">{formatDateTime(item.recebido_em, item.legacy_import)}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.recebido_por}</p></div><div className="min-w-0 text-xs text-muted-foreground"><p className="truncate">{item.codigo_interno ? `Interno: ${item.codigo_interno}` : "Sem código interno"}</p><p className="mt-1 truncate">{item.codigo_rastreio ? `Rastreio: ${item.codigo_rastreio}` : "Sem rastreio"}</p></div></>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onDetails}>Protocolo</Button>{item.status === "aguardando_entrega" && <Button type="button" size="sm" onClick={onDeliver}>Entregar</Button>}</div></div>;
}

function ShipmentList({ envios, saving, onFinalize }: { envios: Envio[]; saving: boolean; onFinalize: (item: Envio) => void }) {
  if (!envios.length) return <EmptyState icon={<Send className="h-8 w-8" />} title="Nenhum envio encontrado" description="Registre um envio ou importe a planilha." />;
  return <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm"><div className="divide-y divide-border/60">{envios.map((item) => <div key={item.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_1.5fr_1fr_1fr_130px] lg:items-center lg:px-5"><div className="flex flex-wrap gap-2"><ShipmentStatusBadge status={item.status} /><Badge variant="outline">{shipmentCategoryLabel(item.categoria)}</Badge>{item.legacy_import && <Badge variant="outline">Planilha</Badge>}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{item.remetente} → {item.destinatario}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.item_descricao || "Item não informado"}</p></div><div><p className="text-sm text-foreground">{formatDateTime(item.enviado_em, item.legacy_import)}</p><p className="text-xs text-muted-foreground">{item.enviado_por || "Responsável não registrado"}</p></div><div className="min-w-0 text-xs text-muted-foreground"><p className="truncate">{item.codigo_rastreio ? `Rastreio: ${item.codigo_rastreio}` : "Sem rastreio"}</p><p className="mt-1 truncate">{item.nota_fiscal ? `NF: ${item.nota_fiscal}` : "Sem nota fiscal"}</p></div><div className="flex justify-end">{item.status === "enviado" || item.status === "preparando" ? <Button type="button" size="sm" disabled={saving} onClick={() => onFinalize(item)}>Finalizar</Button> : <span className="text-xs text-muted-foreground">Concluído</span>}</div></div>)}</div></section>;
}

function SectorGrid({ sectors, malotes }: { sectors: Setor[]; malotes: Malote[] }) {
  return <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sectors.map((sector) => { const all = malotes.filter((item) => item.setor === sector.nome); const pending = all.filter((item) => item.status === "aguardando_entrega"); return <article key={sector.id} className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Setor</p><h3 className="mt-1 font-semibold text-foreground">{sector.nome}</h3></div><Badge variant="outline">{pending.length} pend.</Badge></div><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsável</p><p className="mt-1 text-sm text-foreground">{sector.responsavel}</p><div className="mt-4 flex gap-5 border-t border-border/60 pt-4 text-sm"><span><strong>{all.length}</strong> protocolos</span><span><strong>{pending.length}</strong> em aberto</span></div></article>; })}</section>;
}

function SignaturePreview({ label, value, legacy }: { label: string; value: string | null; legacy: boolean }) {
  return <div className="sm:col-span-2"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>{value ? <div className="mt-2 rounded-xl border border-border bg-white p-3"><img src={value} alt={label} className="max-h-32 w-full object-contain" /></div> : <p className="mt-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">{legacy ? "A planilha original não possuía imagem de assinatura." : "Assinatura ainda não registrada."}</p>}</div>;
}

function SectorSelect({ value, onChange, sectors }: { value: string; onChange: (value: string) => void; sectors: Setor[] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{sectors.map((sector) => <option key={sector.id} value={sector.nome}>{sector.nome} — {sector.responsavel}</option>)}</select>;
}

function MaloteStatusBadge({ status }: { status: MaloteStatus }) { const pending = status === "aguardando_entrega"; return <Badge variant="outline" className={pending ? "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-300" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"}>{pending ? "Aguardando entrega" : "Entregue"}</Badge>; }
function ShipmentStatusBadge({ status }: { status: EnvioStatus }) { const labels: Record<EnvioStatus, string> = { preparando: "Preparando", enviado: "Enviado", finalizado: "Finalizado", devolvido: "Devolvido" }; const style = status === "finalizado" ? "border-emerald-500/30 text-emerald-600" : status === "devolvido" ? "border-rose-500/30 text-rose-600" : "border-sky-500/30 text-sky-600"; return <Badge variant="outline" className={style}>{labels[status]}</Badge>; }
function Kpi({ label, value, detail, critical = false }: { label: string; value: number; detail: string; critical?: boolean }) { return <article className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold ${critical ? "text-amber-500" : "text-foreground"}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>; }
function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>{children}</button>; }
function LoadingState() {
  return (
    <BrandedLoadingState
      label="Carregando mensageria"
      detail="Sincronizando protocolos, entregas e movimentações locais"
      variant="page"
    />
  );
}
function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-16 text-center"><span className="mx-auto flex w-fit text-muted-foreground">{icon}</span><p className="mt-3 font-semibold text-foreground">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>; }
function ProtocolSection({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border border-border/70 bg-muted/15 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div></section>; }
function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) { return <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}{required && <span className="ml-1 text-destructive">*</span>}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm text-foreground">{value}</p></div>; }
