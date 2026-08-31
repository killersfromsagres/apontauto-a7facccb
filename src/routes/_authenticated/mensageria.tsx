import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  Loader2,
  PackageOpen,
  Search,
  Send,
  Upload,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { SignaturePad } from "@/components/mensageria/signature-pad";
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
import { supabase } from "@/integrations/supabase/client";
import {
  describeMensageriaError,
  type MensageriaErrorInfo,
} from "@/lib/mensageria/errors";
import {
  parseMensageriaSpreadsheet,
  type MensageriaSpreadsheetImport,
  type SpreadsheetCell,
  type SpreadsheetRows,
} from "@/lib/mensageria/spreadsheet-import";

export const Route = createFileRoute("/_authenticated/mensageria")({
  component: MensageriaPage,
});

type MaloteStatus = "aguardando_entrega" | "entregue";
type EnvioStatus = "preparando" | "enviado" | "finalizado" | "devolvido";
type EnvioCategoria = "correios" | "juridico" | "malote_interno" | "outro";
type ViewMode = "operacao" | "recebimentos" | "pendentes" | "entregues" | "envios" | "setores";

type Setor = {
  id: string;
  nome: string;
  responsavel: string | null;
  ativo: boolean;
};

type Malote = {
  id: string;
  remetente: string;
  destinatario: string;
  codigo_rastreio: string | null;
  codigo_interno: string | null;
  item_descricao: string | null;
  local_recebimento: string;
  quantidade: number;
  setor: string;
  recebido_em: string | null;
  recebido_por: string;
  observacoes: string | null;
  status: MaloteStatus;
  entregue_em: string | null;
  entregue_para: string | null;
  assinatura_data_url: string | null;
  entrega_observacoes: string | null;
  legacy_import: boolean;
  legacy_source: string | null;
  legacy_source_row: number | null;
  legacy_delivery_row: number | null;
  created_at: string;
};

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
  observacoes: string;
};

type DeliveryForm = {
  entregue_para: string;
  entregue_em: string;
  entrega_observacoes: string;
  assinatura_data_url: string | null;
};

type Envio = {
  id: string;
  categoria: EnvioCategoria;
  remetente: string;
  destinatario: string;
  codigo_rastreio: string | null;
  item_descricao: string | null;
  nota_fiscal: string | null;
  enviado_em: string | null;
  enviado_por: string | null;
  status: EnvioStatus;
  finalizado_em: string | null;
  observacoes: string | null;
  legacy_import: boolean;
  legacy_source: string | null;
  legacy_source_row: number | null;
  created_at: string;
};

type EnvioForm = {
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

const FALLBACK_SECTORS: Setor[] = [
  { id: "juridico", nome: "JURIDICO", responsavel: "JURIDICO CORP - BR, JOYCE CRUZ E LUANA BOLZAN", ativo: true },
  { id: "multas", nome: "MULTAS", responsavel: "EDUARDA LOIOLA ARRUDA", ativo: true },
  { id: "doacoes", nome: "DOACOES", responsavel: "RH", ativo: true },
  { id: "logistica", nome: "LOGISTICA", responsavel: "LARISSA TORETA E TIME", ativo: true },
  { id: "compras", nome: "COMPRAS", responsavel: "RODRIGO COSTA RODRIGUES", ativo: true },
  { id: "telefonia", nome: "CONTAS TELEFONIA", responsavel: "OSMAN", ativo: true },
  { id: "financas", nome: "FINANCAS - CREDITOS", responsavel: "ANDERSON CABRAL, EDINALDO SANTANA E RONALDO SOUSA", ativo: true },
  { id: "serasa", nome: "SERASA E PROTESTO", responsavel: "LOCAL BR", ativo: true },
  { id: "fretes", nome: "PAGAMENTOS DE FRETES/FEDEX CORREIOS", responsavel: "EDUARDA LOIOLA ARRUDA / FACILITIES", ativo: true },
  { id: "nao-classificado", nome: "NÃO CLASSIFICADO", responsavel: "A definir", ativo: true },
];

function toDateTimeLocal(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(localValue: string) {
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) throw new Error("Data e hora inválidas.");
  return parsed.toISOString();
}

function formatDateTime(value: string | null, dateOnly = false) {
  if (!value) return "Não registrado no legado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(dateOnly ? {} : { timeStyle: "short" as const }),
  }).format(date);
}

function isToday(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function ageInDays(value: string | null) {
  if (!value) return 0;
  const received = new Date(value).getTime();
  if (Number.isNaN(received)) return 0;
  return Math.max(0, Math.floor((Date.now() - received) / 86_400_000));
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
    observacoes: "",
  };
}

function receiptFormFromMalote(malote: Malote): ReceiptForm {
  const received = malote.recebido_em ? new Date(malote.recebido_em) : new Date();
  return {
    remetente: malote.remetente,
    destinatario: malote.destinatario,
    codigo_rastreio: malote.codigo_rastreio ?? "",
    codigo_interno: malote.codigo_interno ?? "",
    item_descricao: malote.item_descricao ?? "",
    local_recebimento: malote.local_recebimento,
    quantidade: String(malote.quantidade),
    setor: malote.setor,
    recebido_em: toDateTimeLocal(received),
    recebido_por: malote.recebido_por,
    observacoes: malote.observacoes ?? "",
  };
}

function emptyDeliveryForm(malote?: Malote | null): DeliveryForm {
  return {
    entregue_para: malote?.destinatario ?? "",
    entregue_em: toDateTimeLocal(),
    entrega_observacoes: "",
    assinatura_data_url: null,
  };
}

function emptyEnvioForm(): EnvioForm {
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

function envioCategoryLabel(category: EnvioCategoria) {
  return ({
    correios: "Correios",
    juridico: "Jurídico",
    malote_interno: "Malote interno",
    outro: "Outro",
  })[category];
}

function MensageriaPage() {
  const [malotes, setMalotes] = useState<Malote[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [setores, setSetores] = useState<Setor[]>(FALLBACK_SECTORS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<MensageriaErrorInfo | null>(null);
  const [view, setView] = useState<ViewMode>("operacao");
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("todos");

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Malote | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>(emptyReceiptForm());
  const [deliveryQueueOpen, setDeliveryQueueOpen] = useState(false);
  const [deliveryTarget, setDeliveryTarget] = useState<Malote | null>(null);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(emptyDeliveryForm());
  const [detailsTarget, setDetailsTarget] = useState<Malote | null>(null);
  const [detailsSector, setDetailsSector] = useState("");
  const [envioOpen, setEnvioOpen] = useState(false);
  const [envioForm, setEnvioForm] = useState<EnvioForm>(emptyEnvioForm());
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<MensageriaSpreadsheetImport | null>(null);
  const [importReading, setImportReading] = useState(false);

  const reportActionError = (error: unknown, fallback: string) => {
    const issue = describeMensageriaError(error);
    if (["schema", "permission", "session"].includes(issue.kind)) {
      setLoadError(issue);
      setMalotes([]);
      setEnvios([]);
    }
    toast.error(issue.kind === "unknown" ? fallback : issue.message);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [malotesResult, setoresResult, enviosResult] = await Promise.all([
        (supabase as any)
          .from("mensageria_malotes")
          .select("*")
          .order("recebido_em", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("mensageria_setores")
          .select("*")
          .eq("ativo", true)
          .order("nome", { ascending: true }),
        (supabase as any)
          .from("mensageria_envios")
          .select("*")
          .order("enviado_em", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
      ]);

      if (malotesResult.error) throw malotesResult.error;
      if (setoresResult.error) throw setoresResult.error;
      if (enviosResult.error) throw enviosResult.error;
      setMalotes((malotesResult.data ?? []) as Malote[]);
      setEnvios((enviosResult.data ?? []) as Envio[]);

      if (setoresResult.data?.length) {
        setSetores(setoresResult.data as Setor[]);
      } else {
        setSetores(FALLBACK_SECTORS);
      }
    } catch (error) {
      console.error("Erro ao carregar mensageria:", error);
      const issue = describeMensageriaError(error);
      setMalotes([]);
      setEnvios([]);
      setSetores(FALLBACK_SECTORS);
      setLoadError(issue);
      toast.error(issue.title, { description: issue.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sectorMap = useMemo(() => new Map(setores.map((sector) => [sector.nome, sector])), [setores]);
  const backendReady = !loading && loadError === null;
  const pending = useMemo(() => malotes.filter((item) => item.status === "aguardando_entrega"), [malotes]);
  const delivered = useMemo(() => malotes.filter((item) => item.status === "entregue"), [malotes]);
  const activeShipments = useMemo(() => envios.filter((item) => item.status === "preparando" || item.status === "enviado"), [envios]);

  const stats = useMemo(() => ({
    recebidosHoje: malotes.filter((item) => isToday(item.recebido_em)).length,
    pendentes: pending.length,
    entreguesHoje: delivered.filter((item) => isToday(item.entregue_em)).length,
    atrasados: pending.filter((item) => ageInDays(item.recebido_em) >= 3).length,
    assinados: delivered.filter((item) => Boolean(item.assinatura_data_url)).length,
    setoresPendentes: new Set(pending.map((item) => item.setor)).size,
    enviosAtivos: activeShipments.length,
  }), [activeShipments, delivered, malotes, pending]);

  const oldestPending = useMemo(() => {
    return [...pending].sort((a, b) => {
      const av = a.recebido_em ? new Date(a.recebido_em).getTime() : Number.MAX_SAFE_INTEGER;
      const bv = b.recebido_em ? new Date(b.recebido_em).getTime() : Number.MAX_SAFE_INTEGER;
      return av - bv;
    })[0] ?? null;
  }, [pending]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return malotes.filter((malote) => {
      if (sectorFilter !== "todos" && malote.setor !== sectorFilter) return false;
      if (view === "pendentes" && malote.status !== "aguardando_entrega") return false;
      if (view === "entregues" && malote.status !== "entregue") return false;
      if (!term) return true;
      return [
        malote.remetente,
        malote.destinatario,
        malote.codigo_rastreio,
        malote.codigo_interno,
        malote.item_descricao,
        malote.setor,
        malote.recebido_por,
        malote.entregue_para,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [malotes, search, sectorFilter, view]);

  const visibleEnvios = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return envios;
    return envios.filter((envio) => [
      envio.remetente,
      envio.destinatario,
      envio.codigo_rastreio,
      envio.item_descricao,
      envio.nota_fiscal,
      envio.enviado_por,
      envio.status,
      envioCategoryLabel(envio.categoria),
    ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [envios, search]);

  const groupedPending = useMemo(() => {
    const groups = new Map<string, Malote[]>();
    for (const malote of pending) {
      const current = groups.get(malote.setor) ?? [];
      current.push(malote);
      groups.set(malote.setor, current);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [pending]);

  const openNewReceipt = () => {
    if (!backendReady) return void toast.error("A base de Mensageria precisa estar disponível para novos registros.");
    setEditingTarget(null);
    setReceiptForm(emptyReceiptForm());
    setReceiptOpen(true);
  };

  const openEditReceipt = (malote: Malote) => {
    if (malote.status === "entregue") {
      toast.info("Protocolos entregues ficam bloqueados para preservar a rastreabilidade.");
      return;
    }
    setEditingTarget(malote);
    setReceiptForm(receiptFormFromMalote(malote));
    setDetailsTarget(null);
    setReceiptOpen(true);
  };

  const handleSaveReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!backendReady) return void toast.error("A base de Mensageria precisa estar disponível para salvar o protocolo.");
    const quantidade = Number.parseInt(receiptForm.quantidade, 10);
    if (!receiptForm.remetente.trim() || !receiptForm.destinatario.trim()) return void toast.error("Informe remetente e destinatário.");
    if (!receiptForm.recebido_por.trim()) return void toast.error("Informe quem recebeu o malote na portaria.");
    if (!receiptForm.recebido_em) return void toast.error("Informe a data e hora do recebimento.");
    if (!Number.isFinite(quantidade) || quantidade < 1) return void toast.error("Informe uma quantidade válida.");

    let recebidoEm: string;
    try {
      recebidoEm = toIso(receiptForm.recebido_em);
    } catch {
      return void toast.error("Informe uma data e hora de recebimento válidas.");
    }

    const payload = {
      remetente: receiptForm.remetente.trim(),
      destinatario: receiptForm.destinatario.trim(),
      codigo_rastreio: receiptForm.codigo_rastreio.trim() || null,
      codigo_interno: receiptForm.codigo_interno.trim() || null,
      item_descricao: receiptForm.item_descricao.trim() || null,
      local_recebimento: receiptForm.local_recebimento.trim() || "Portaria",
      quantidade,
      setor: receiptForm.setor || "NÃO CLASSIFICADO",
      recebido_em: recebidoEm,
      recebido_por: receiptForm.recebido_por.trim(),
      observacoes: receiptForm.observacoes.trim() || null,
      legacy_import: false,
    };

    setSaving(true);
    try {
      if (editingTarget) {
        const { data, error } = await (supabase as any)
          .from("mensageria_malotes")
          .update(payload)
          .eq("id", editingTarget.id)
          .eq("status", "aguardando_entrega")
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Registro não alterado. Ele pode já ter sido entregue.");
        toast.success("Protocolo de recebimento atualizado.");
      } else {
        const { error } = await (supabase as any)
          .from("mensageria_malotes")
          .insert({ ...payload, status: "aguardando_entrega" });
        if (error) throw error;
        toast.success("Recebimento registrado e incluído na fila de entrega.");
      }
      setReceiptOpen(false);
      setEditingTarget(null);
      setReceiptForm(emptyReceiptForm());
      setView("pendentes");
      await loadData();
    } catch (error) {
      console.error("Erro ao salvar recebimento:", error);
      reportActionError(error, "Não foi possível salvar o recebimento.");
    } finally {
      setSaving(false);
    }
  };

  const openDelivery = (malote: Malote) => {
    if (!backendReady) return void toast.error("A base de Mensageria precisa estar disponível para registrar a entrega.");
    setDeliveryQueueOpen(false);
    setDeliveryTarget(malote);
    setDeliveryForm(emptyDeliveryForm(malote));
  };

  const handleDelivery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deliveryTarget) return;
    if (!backendReady) return void toast.error("A base de Mensageria precisa estar disponível para registrar a entrega.");
    if (!deliveryForm.entregue_para.trim()) return void toast.error("Informe o nome de quem recebeu a entrega.");
    if (!deliveryForm.entregue_em) return void toast.error("Informe a data e hora da entrega.");
    if (!deliveryForm.assinatura_data_url) return void toast.error("A assinatura digital é obrigatória para concluir a entrega.");

    let deliveryIso: string;
    try {
      deliveryIso = toIso(deliveryForm.entregue_em);
    } catch {
      return void toast.error("Informe uma data e hora de entrega válidas.");
    }
    if (deliveryTarget.recebido_em && new Date(deliveryIso).getTime() < new Date(deliveryTarget.recebido_em).getTime()) {
      return void toast.error("A data da entrega não pode ser anterior ao recebimento na portaria.");
    }

    setSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from("mensageria_malotes")
        .update({
          status: "entregue",
          entregue_em: deliveryIso,
          entregue_para: deliveryForm.entregue_para.trim(),
          assinatura_data_url: deliveryForm.assinatura_data_url,
          entrega_observacoes: deliveryForm.entrega_observacoes.trim() || null,
        })
        .eq("id", deliveryTarget.id)
        .eq("status", "aguardando_entrega")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("O malote já foi entregue ou não pôde ser atualizado.");

      toast.success("Entrega concluída com assinatura digital e protocolo atualizado.");
      setDeliveryTarget(null);
      setDeliveryForm(emptyDeliveryForm());
      setView("entregues");
      await loadData();
    } catch (error) {
      console.error("Erro ao concluir entrega:", error);
      reportActionError(error, "Não foi possível concluir a entrega.");
    } finally {
      setSaving(false);
    }
  };

  const openDetails = (malote: Malote) => {
    setDetailsTarget(malote);
    setDetailsSector(malote.setor);
  };

  const updateSector = async () => {
    if (!detailsTarget || !detailsSector || detailsSector === detailsTarget.setor) return;
    if (!backendReady) return void toast.error("A base de Mensageria precisa estar disponível para atualizar o setor.");
    setSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from("mensageria_malotes")
        .update({ setor: detailsSector })
        .eq("id", detailsTarget.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Registro não atualizado.");
      toast.success("Direcionamento do setor atualizado.");
      setDetailsTarget({ ...detailsTarget, setor: detailsSector });
      await loadData();
    } catch (error) {
      console.error("Erro ao atualizar setor:", error);
      reportActionError(error, "Não foi possível atualizar o setor.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEnvio = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!backendReady) return void toast.error("A base de Mensageria precisa estar disponível para registrar o envio.");
    if (!envioForm.remetente.trim() || !envioForm.destinatario.trim()) return void toast.error("Informe remetente e destinatário.");
    if (!envioForm.enviado_em) return void toast.error("Informe a data e hora do envio.");
    if (!envioForm.enviado_por.trim()) return void toast.error("Informe quem realizou o envio.");

    let enviadoEm: string;
    try {
      enviadoEm = toIso(envioForm.enviado_em);
    } catch {
      return void toast.error("Informe uma data e hora de envio válidas.");
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any).from("mensageria_envios").insert({
        categoria: envioForm.categoria,
        remetente: envioForm.remetente.trim(),
        destinatario: envioForm.destinatario.trim(),
        codigo_rastreio: envioForm.codigo_rastreio.trim() || null,
        item_descricao: envioForm.item_descricao.trim() || null,
        nota_fiscal: envioForm.nota_fiscal.trim() || null,
        enviado_em: enviadoEm,
        enviado_por: envioForm.enviado_por.trim(),
        status: "enviado",
        observacoes: envioForm.observacoes.trim() || null,
        legacy_import: false,
      });
      if (error) throw error;
      toast.success("Envio registrado e incluído no acompanhamento.");
      setEnvioOpen(false);
      setEnvioForm(emptyEnvioForm());
      setView("envios");
      await loadData();
    } catch (error) {
      console.error("Erro ao registrar envio:", error);
      reportActionError(error, "Não foi possível registrar o envio.");
    } finally {
      setSaving(false);
    }
  };

  const finalizeEnvio = async (envio: Envio) => {
    if (!backendReady) return void toast.error("A base de Mensageria precisa estar disponível para finalizar o envio.");
    setSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from("mensageria_envios")
        .update({ status: "finalizado", finalizado_em: new Date().toISOString() })
        .eq("id", envio.id)
        .in("status", ["preparando", "enviado"])
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("O envio já foi finalizado ou não pôde ser atualizado.");
      toast.success("Envio finalizado com data de conclusão registrada.");
      await loadData();
    } catch (error) {
      console.error("Erro ao finalizar envio:", error);
      reportActionError(error, "Não foi possível finalizar o envio.");
    } finally {
      setSaving(false);
    }
  };

  const handleSpreadsheetFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportReading(true);
    setImportPreview(null);
    setImportFileName(file.name);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const sheets = Object.fromEntries(workbook.SheetNames.map((name) => [
        name.trim().toLocaleUpperCase("pt-BR"),
        XLSX.utils.sheet_to_json<SpreadsheetCell[]>(workbook.Sheets[name], {
          header: 1,
          raw: true,
          defval: null,
        }) as SpreadsheetRows,
      ]));
      if (!sheets.ENTREGA) throw new Error("A aba ENTREGA não foi encontrada na planilha.");
      const preview = parseMensageriaSpreadsheet(sheets);
      if (!preview.malotes.length) throw new Error("A aba ENTREGA não contém registros para importar.");
      setImportPreview(preview);
    } catch (error) {
      console.error("Erro ao ler planilha de Mensageria:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha selecionada.");
    } finally {
      setImportReading(false);
      event.target.value = "";
    }
  };

  const confirmSpreadsheetImport = async () => {
    if (!importPreview || !backendReady) return;
    setSaving(true);
    try {
      const operations = [];
      if (importPreview.malotes.length) {
        operations.push((supabase as any)
          .from("mensageria_malotes")
          .upsert(importPreview.malotes, { onConflict: "legacy_source,legacy_source_row", ignoreDuplicates: true }));
      }
      if (importPreview.envios.length) {
        operations.push((supabase as any)
          .from("mensageria_envios")
          .upsert(importPreview.envios, { onConflict: "legacy_source,legacy_source_row", ignoreDuplicates: true }));
      }
      const results = await Promise.all(operations);
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw failure;
      toast.success("Histórico importado sem duplicações.", {
        description: `${importPreview.malotes.length} recebimentos/entregas e ${importPreview.envios.length} envios processados.`,
      });
      setImportOpen(false);
      setImportPreview(null);
      setImportFileName("");
      await loadData();
    } catch (error) {
      console.error("Erro ao importar histórico de Mensageria:", error);
      reportActionError(error, "Não foi possível importar o histórico.");
    } finally {
      setSaving(false);
    }
  };

  const exportWorkbook = () => {
    if (!malotes.length && !envios.length) return void toast.info("Não há protocolos para exportar.");
    const workbook = XLSX.utils.book_new();
    const rows = malotes.map((item) => ({
      Status: item.status === "entregue" ? "ENTREGUE" : "PENDENTE",
      Setor: item.setor,
      "Responsável do setor": sectorMap.get(item.setor)?.responsavel ?? "",
      Remetente: item.remetente,
      Destinatário: item.destinatario,
      "Código de rastreio": item.codigo_rastreio ?? "",
      "Código Sherwin": item.codigo_interno ?? "",
      Item: item.item_descricao ?? "",
      Quantidade: item.quantidade,
      "Data recebimento": item.recebido_em ? formatDateTime(item.recebido_em, item.legacy_import) : "",
      Local: item.local_recebimento,
      "Recebido na portaria por": item.recebido_por,
      "Data entrega": item.entregue_em ? formatDateTime(item.entregue_em, item.legacy_import) : "",
      "Entregue para": item.entregue_para ?? "",
      "Assinatura digital": item.assinatura_data_url ? "SIM" : item.legacy_import ? "NÃO DISPONÍVEL NO LEGADO" : "PENDENTE",
      "Observações recebimento": item.observacoes ?? "",
      "Observações entrega": item.entrega_observacoes ?? "",
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Controle de Malotes");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(envios.map((item) => ({
        Status: item.status.toLocaleUpperCase("pt-BR"),
        Categoria: envioCategoryLabel(item.categoria),
        Remetente: item.remetente,
        Destinatário: item.destinatario,
        "Código de rastreio": item.codigo_rastreio ?? "",
        Item: item.item_descricao ?? "",
        "Nota fiscal": item.nota_fiscal ?? "",
        "Data envio": item.enviado_em ? formatDateTime(item.enviado_em, item.legacy_import) : "",
        "Enviado por": item.enviado_por ?? "",
        "Data conclusão": item.finalizado_em ? formatDateTime(item.finalizado_em, item.legacy_import) : "",
        Observações: item.observacoes ?? "",
      }))),
      "Envios",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(setores.map((item) => ({ Setor: item.nome, Responsável: item.responsavel ?? "" }))),
      "Setores",
    );
    XLSX.writeFile(workbook, `mensageria-malotes-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Planilha operacional exportada.");
  };

  return (
    <PageShell
      title="Mensageria e Malotes"
      description="Recebimento na portaria, triagem por setor, entrega ao destinatário e comprovação por assinatura digital."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-2" disabled={!backendReady} title={!backendReady ? "A base de Mensageria precisa estar disponível para importar." : undefined}>
            <Upload className="h-4 w-4" /> Importar histórico
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportWorkbook} className="gap-2" disabled={!backendReady || (!malotes.length && !envios.length)} title={!backendReady ? "Aguarde a conexão com a base de Mensageria." : undefined}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setEnvioForm(emptyEnvioForm()); setEnvioOpen(true); }} className="gap-2" disabled={!backendReady} title={!backendReady ? "A base de Mensageria precisa estar disponível para novos envios." : undefined}>
            <Send className="h-4 w-4" /> Novo envio
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDeliveryQueueOpen(true)} disabled={!backendReady || !pending.length} title={!backendReady ? "A base de Mensageria precisa estar disponível para registrar entregas." : undefined}>
            Registrar entrega{pending.length ? ` (${pending.length})` : ""}
          </Button>
          <Button type="button" size="sm" onClick={openNewReceipt} disabled={!backendReady} title={!backendReady ? "A base de Mensageria precisa estar disponível para novos registros." : undefined}>Novo recebimento</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm">
          <div className="grid divide-y divide-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
            <Kpi label="Recebidos hoje" value={stats.recebidosHoje} detail="Entradas registradas" />
            <Kpi label="Aguardando entrega" value={stats.pendentes} detail={`${stats.setoresPendentes} setores envolvidos`} critical={stats.pendentes > 0} />
            <Kpi label="Entregues hoje" value={stats.entreguesHoje} detail="Protocolos concluídos" />
            <Kpi label="Há 3+ dias" value={stats.atrasados} detail="Pendências que exigem atenção" critical={stats.atrasados > 0} />
            <Kpi label="Com assinatura" value={stats.assinados} detail="Comprovações digitais" />
            <Kpi label="Envios ativos" value={stats.enviosAtivos} detail="Em acompanhamento" critical={stats.enviosAtivos > 0} />
          </div>
        </section>

        {loadError && (
          <section role="alert" aria-live="polite" className="overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card/80 to-card shadow-sm">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">{loadError.title}</p>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{loadError.message}</p>
                  <p className="mt-2 text-xs font-medium text-muted-foreground">Referência técnica: {loadError.reference}</p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void loadData()}>
                Verificar novamente
              </Button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border/70 bg-card/50 p-2 shadow-sm">
          <div className="flex flex-wrap gap-1">
            <ViewButton active={view === "operacao"} onClick={() => setView("operacao")}>Operação</ViewButton>
            <ViewButton active={view === "recebimentos"} onClick={() => setView("recebimentos")}>Recebimentos ({malotes.length})</ViewButton>
            <ViewButton active={view === "pendentes"} onClick={() => setView("pendentes")}>Pendentes ({pending.length})</ViewButton>
            <ViewButton active={view === "entregues"} onClick={() => setView("entregues")}>Entregues ({delivered.length})</ViewButton>
            <ViewButton active={view === "envios"} onClick={() => setView("envios")}>Envios ({envios.length})</ViewButton>
            <ViewButton active={view === "setores"} onClick={() => setView("setores")}>Setores e direcionamentos</ViewButton>
          </div>
        </section>

        {view === "operacao" ? (
          <OperationalOverview
            pending={pending}
            oldestPending={oldestPending}
            groupedPending={groupedPending}
            sectorMap={sectorMap}
            onDeliver={openDelivery}
            onDetails={openDetails}
            onSeePending={() => setView("pendentes")}
          />
        ) : view === "setores" ? (
          <SectorOverview setores={setores} malotes={malotes} />
        ) : view === "envios" ? (
          <>
            <section className="rounded-2xl border border-border/70 bg-card/50 p-4 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar remetente, destinatário, rastreio, nota fiscal ou status"
                  className="h-11 pl-9"
                />
              </div>
            </section>
            {loading ? <LoadingState /> : <ShipmentOverview envios={visibleEnvios} saving={saving} onFinalize={finalizeEnvio} />}
          </>
        ) : (
          <>
            <section className="rounded-2xl border border-border/70 bg-card/50 p-4 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar remetente, destinatário, rastreio, código Sherwin ou recebedor"
                    className="h-11 pl-9"
                  />
                </div>
                <select
                  value={sectorFilter}
                  onChange={(event) => setSectorFilter(event.target.value)}
                  className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Filtrar por setor"
                >
                  <option value="todos">Todos os setores</option>
                  {setores.map((setor) => <option key={setor.id} value={setor.nome}>{setor.nome}</option>)}
                </select>
              </div>
            </section>

            {loading ? (
              <LoadingState />
            ) : visible.length === 0 ? (
              <EmptyState />
            ) : (
              <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm">
                <div className="hidden grid-cols-[1.4fr_1.4fr_1fr_1fr_140px] gap-3 border-b border-border/70 bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
                  <span>Remetente → destinatário</span><span>Setor</span><span>Recebimento</span><span>Referências</span><span className="text-right">Ações</span>
                </div>
                <div className="divide-y divide-border/60">
                  {visible.map((malote) => (
                    <ProtocolRow
                      key={malote.id}
                      malote={malote}
                      sector={sectorMap.get(malote.setor)}
                      onDeliver={() => openDelivery(malote)}
                      onDetails={() => openDetails(malote)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTarget ? "Editar protocolo de recebimento" : "Novo recebimento na portaria"}</DialogTitle>
            <DialogDescription>
              Registre a entrada uma única vez. Depois, o mesmo protocolo seguirá para a fila de entrega e assinatura do destinatário final.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveReceipt} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Remetente" required><Input value={receiptForm.remetente} onChange={(e) => setReceiptForm((p) => ({ ...p, remetente: e.target.value }))} /></Field>
              <Field label="Destinatário" required><Input value={receiptForm.destinatario} onChange={(e) => setReceiptForm((p) => ({ ...p, destinatario: e.target.value }))} /></Field>
              <Field label="Código de rastreio"><Input value={receiptForm.codigo_rastreio} onChange={(e) => setReceiptForm((p) => ({ ...p, codigo_rastreio: e.target.value }))} placeholder="Ex.: OY123456789BR" /></Field>
              <Field label="Código interno Sherwin"><Input value={receiptForm.codigo_interno} onChange={(e) => setReceiptForm((p) => ({ ...p, codigo_interno: e.target.value }))} placeholder="Ex.: SW-28082601" /></Field>
              <Field label="Item / descrição"><Input value={receiptForm.item_descricao} onChange={(e) => setReceiptForm((p) => ({ ...p, item_descricao: e.target.value }))} /></Field>
              <Field label="Quantidade" required><Input type="number" min={1} max={9999} value={receiptForm.quantidade} onChange={(e) => setReceiptForm((p) => ({ ...p, quantidade: e.target.value }))} /></Field>
              <Field label="Setor" required>
                <select value={receiptForm.setor} onChange={(e) => setReceiptForm((p) => ({ ...p, setor: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {setores.map((setor) => <option key={setor.id} value={setor.nome}>{setor.nome}{setor.responsavel ? ` — ${setor.responsavel}` : ""}</option>)}
                </select>
              </Field>
              <Field label="Local de recebimento" required><Input value={receiptForm.local_recebimento} onChange={(e) => setReceiptForm((p) => ({ ...p, local_recebimento: e.target.value }))} /></Field>
              <Field label="Data e hora do recebimento" required><Input type="datetime-local" value={receiptForm.recebido_em} onChange={(e) => setReceiptForm((p) => ({ ...p, recebido_em: e.target.value }))} /></Field>
              <Field label="Recebido na portaria por" required><Input value={receiptForm.recebido_por} onChange={(e) => setReceiptForm((p) => ({ ...p, recebido_por: e.target.value }))} /></Field>
            </div>
            <Field label="Observações"><textarea value={receiptForm.observacoes} onChange={(e) => setReceiptForm((p) => ({ ...p, observacoes: e.target.value }))} rows={3} className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setReceiptOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving || !backendReady}>{saving ? "Salvando..." : editingTarget ? "Salvar alterações" : "Registrar recebimento"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={envioOpen} onOpenChange={setEnvioOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo envio</DialogTitle>
            <DialogDescription>Registre a saída para acompanhar o objeto até a conclusão, com rastreio e responsável.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEnvio} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Categoria" required>
                <select value={envioForm.categoria} onChange={(event) => setEnvioForm((current) => ({ ...current, categoria: event.target.value as EnvioCategoria }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="malote_interno">Malote interno</option>
                  <option value="correios">Correios</option>
                  <option value="juridico">Jurídico</option>
                  <option value="outro">Outro</option>
                </select>
              </Field>
              <Field label="Código de rastreio"><Input value={envioForm.codigo_rastreio} onChange={(event) => setEnvioForm((current) => ({ ...current, codigo_rastreio: event.target.value }))} placeholder="Ex.: OY123456789BR" /></Field>
              <Field label="Remetente" required><Input value={envioForm.remetente} onChange={(event) => setEnvioForm((current) => ({ ...current, remetente: event.target.value }))} /></Field>
              <Field label="Destinatário" required><Input value={envioForm.destinatario} onChange={(event) => setEnvioForm((current) => ({ ...current, destinatario: event.target.value }))} /></Field>
              <Field label="Item / descrição"><Input value={envioForm.item_descricao} onChange={(event) => setEnvioForm((current) => ({ ...current, item_descricao: event.target.value }))} /></Field>
              <Field label="Nota fiscal"><Input value={envioForm.nota_fiscal} onChange={(event) => setEnvioForm((current) => ({ ...current, nota_fiscal: event.target.value }))} /></Field>
              <Field label="Data e hora do envio" required><Input type="datetime-local" value={envioForm.enviado_em} onChange={(event) => setEnvioForm((current) => ({ ...current, enviado_em: event.target.value }))} /></Field>
              <Field label="Enviado por" required><Input value={envioForm.enviado_por} onChange={(event) => setEnvioForm((current) => ({ ...current, enviado_por: event.target.value }))} /></Field>
            </div>
            <Field label="Observações"><textarea value={envioForm.observacoes} onChange={(event) => setEnvioForm((current) => ({ ...current, observacoes: event.target.value }))} rows={3} className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEnvioOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving || !backendReady}>{saving ? "Salvando..." : "Registrar envio"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) { setImportPreview(null); setImportFileName(""); } }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar histórico de Mensageria</DialogTitle>
            <DialogDescription>Use a planilha de controle existente. A aba ENTREGA prevalece como histórico consolidado e a mesma linha nunca é duplicada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/15 px-5 py-8 text-center transition-colors hover:bg-muted/30 focus-within:ring-2 focus-within:ring-ring">
              {importReading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : <Upload className="h-7 w-7 text-muted-foreground" />}
              <span className="mt-3 text-sm font-semibold text-foreground">{importReading ? "Analisando planilha..." : "Selecionar arquivo Excel"}</span>
              <span className="mt-1 text-xs text-muted-foreground">Formatos .xlsx e .xls · nenhum registro é salvo antes da confirmação</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleSpreadsheetFile} disabled={importReading || saving || !backendReady} className="sr-only" />
            </label>

            {importPreview && (
              <div aria-live="polite" className="space-y-4">
                <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Prévia validada</p>
                  <p className="mt-2 font-semibold text-foreground">{importFileName}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Info label="Recebimentos/entregas" value={String(importPreview.malotes.length)} />
                    <Info label="Envios" value={String(importPreview.envios.length)} />
                    <Info label="Alertas de qualidade" value={String(importPreview.warnings.length)} />
                  </div>
                </section>
                {importPreview.warnings.length > 0 && (
                  <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
                    <p className="text-sm font-semibold text-foreground">Campos mantidos como não informados</p>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {importPreview.warnings.slice(0, 8).map((warning, index) => <li key={`${warning.sheet}-${warning.row}-${index}`}>• {warning.sheet}, linha {warning.row}: {warning.message}</li>)}
                    </ul>
                    {importPreview.warnings.length > 8 && <p className="mt-3 text-xs font-medium text-muted-foreground">Mais {importPreview.warnings.length - 8} alerta(s) serão preservados sem preenchimento artificial.</p>}
                  </section>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={confirmSpreadsheetImport} disabled={!importPreview || saving || importReading || !backendReady}>{saving ? "Importando..." : "Confirmar importação"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deliveryQueueOpen} onOpenChange={setDeliveryQueueOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fila para entrega</DialogTitle>
            <DialogDescription>Selecione o malote que será entregue ao destinatário. A conclusão exigirá assinatura digital.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {pending.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Não há malotes pendentes.</p> : pending.map((malote) => (
              <button key={malote.id} type="button" onClick={() => openDelivery(malote)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/60 p-4 text-left transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{malote.destinatario}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{malote.remetente} · {malote.setor}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Recebido {formatDateTime(malote.recebido_em, malote.legacy_import)} · {ageInDays(malote.recebido_em)} dia(s) em aberto</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deliveryTarget)} onOpenChange={(open) => { if (!open) setDeliveryTarget(null); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar entrega ao destinatário</DialogTitle>
            <DialogDescription>Confirme o recebedor, a data e colete a assinatura antes de concluir.</DialogDescription>
          </DialogHeader>
          {deliveryTarget && (
            <form onSubmit={handleDelivery} className="space-y-5">
              <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
                <div className="flex flex-wrap gap-2"><Badge variant="outline">{deliveryTarget.setor}</Badge>{deliveryTarget.codigo_interno && <Badge variant="outline">{deliveryTarget.codigo_interno}</Badge>}</div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destino</p>
                <p className="mt-1 font-semibold text-foreground">{deliveryTarget.destinatario}</p>
                <p className="mt-1 text-sm text-muted-foreground">Recebido na portaria em {formatDateTime(deliveryTarget.recebido_em, deliveryTarget.legacy_import)}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Entregue para" required><Input value={deliveryForm.entregue_para} onChange={(e) => setDeliveryForm((p) => ({ ...p, entregue_para: e.target.value }))} /></Field>
                <Field label="Data e hora da entrega" required><Input type="datetime-local" value={deliveryForm.entregue_em} onChange={(e) => setDeliveryForm((p) => ({ ...p, entregue_em: e.target.value }))} /></Field>
              </div>
              <SignaturePad key={deliveryTarget.id} value={deliveryForm.assinatura_data_url} onChange={(value) => setDeliveryForm((p) => ({ ...p, assinatura_data_url: value }))} disabled={saving} />
              <Field label="Observações da entrega"><textarea value={deliveryForm.entrega_observacoes} onChange={(e) => setDeliveryForm((p) => ({ ...p, entrega_observacoes: e.target.value }))} rows={3} className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></Field>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDeliveryTarget(null)}>Cancelar</Button>
                <Button type="submit" disabled={saving || !backendReady || !deliveryForm.assinatura_data_url}>{saving ? "Concluindo..." : "Concluir e registrar assinatura"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailsTarget)} onOpenChange={(open) => { if (!open) setDetailsTarget(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Protocolo do malote</DialogTitle><DialogDescription>Rastreabilidade completa da entrada até a entrega final.</DialogDescription></DialogHeader>
          {detailsTarget && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div><StatusBadge status={detailsTarget.status} /><p className="mt-2 text-lg font-semibold text-foreground">{detailsTarget.remetente} → {detailsTarget.destinatario}</p></div>
                {detailsTarget.status === "aguardando_entrega" && <Button type="button" variant="outline" size="sm" onClick={() => openEditReceipt(detailsTarget)} disabled={!backendReady}>Editar recebimento</Button>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Info label="Código de rastreio" value={detailsTarget.codigo_rastreio || "Não informado"} />
                <Info label="Código Sherwin" value={detailsTarget.codigo_interno || "Não informado"} />
                <Info label="Item / quantidade" value={`${detailsTarget.item_descricao || "Não informado"} · ${detailsTarget.quantidade}`} />
              </div>
              <ProtocolSection title="1. Recebimento na portaria">
                <Info label="Data" value={formatDateTime(detailsTarget.recebido_em, detailsTarget.legacy_import)} />
                <Info label="Local" value={detailsTarget.local_recebimento} />
                <Info label="Recebido por" value={detailsTarget.recebido_por || "Não registrado no legado"} />
                <Info label="Observações" value={detailsTarget.observacoes || "Sem observações"} />
              </ProtocolSection>
              <ProtocolSection title="2. Triagem e direcionamento">
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Setor / responsável</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <select value={detailsSector} onChange={(e) => setDetailsSector(e.target.value)} className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm">
                      {setores.map((setor) => <option key={setor.id} value={setor.nome}>{setor.nome}{setor.responsavel ? ` — ${setor.responsavel}` : ""}</option>)}
                    </select>
                    <Button type="button" variant="outline" onClick={updateSector} disabled={saving || !backendReady || detailsSector === detailsTarget.setor}>Atualizar direcionamento</Button>
                  </div>
                </div>
              </ProtocolSection>
              <ProtocolSection title="3. Entrega final">
                {detailsTarget.status === "entregue" ? (
                  <>
                    <Info label="Data" value={formatDateTime(detailsTarget.entregue_em, detailsTarget.legacy_import)} />
                    <Info label="Entregue para" value={detailsTarget.entregue_para || "Não registrado no legado"} />
                    <Info label="Observações" value={detailsTarget.entrega_observacoes || "Sem observações"} />
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assinatura de recebimento</p>
                      {detailsTarget.assinatura_data_url ? (
                        <div className="mt-2 rounded-xl border border-border bg-white p-3"><img src={detailsTarget.assinatura_data_url} alt={`Assinatura de ${detailsTarget.entregue_para || "recebedor"}`} className="max-h-36 w-full object-contain" /></div>
                      ) : (
                        <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">Registro legado: a planilha original não possuía assinatura digital.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="sm:col-span-2 flex items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div><p className="font-semibold text-foreground">Aguardando entrega</p><p className="mt-1 text-sm text-muted-foreground">O protocolo só será concluído após identificação do recebedor e assinatura.</p></div>
                    <Button type="button" size="sm" onClick={() => openDelivery(detailsTarget)} disabled={!backendReady}>Registrar entrega</Button>
                  </div>
                )}
              </ProtocolSection>
              {detailsTarget.legacy_import && <p className="text-xs leading-relaxed text-muted-foreground">Importado do histórico ({detailsTarget.legacy_source}, linha {detailsTarget.legacy_source_row ?? "—"}{detailsTarget.legacy_delivery_row ? `; entrega linha ${detailsTarget.legacy_delivery_row}` : ""}). Campos inexistentes no arquivo original permanecem como não registrados.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function OperationalOverview({ pending, oldestPending, groupedPending, sectorMap, onDeliver, onDetails, onSeePending }: {
  pending: Malote[];
  oldestPending: Malote | null;
  groupedPending: [string, Malote[]][];
  sectorMap: Map<string, Setor>;
  onDeliver: (malote: Malote) => void;
  onDetails: (malote: Malote) => void;
  onSeePending: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div><h2 className="font-semibold text-foreground">Fila para entrega</h2><p className="mt-1 text-sm text-muted-foreground">Separada por setor, pronta para coleta de assinatura.</p></div>
          <Button type="button" variant="ghost" size="sm" onClick={onSeePending}>Ver todos</Button>
        </div>
        {pending.length === 0 ? (
          <div className="px-5 py-12 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" /><p className="mt-3 font-medium text-foreground">Fila em dia</p><p className="mt-1 text-sm text-muted-foreground">Nenhum malote aguarda entrega.</p></div>
        ) : (
          <div className="divide-y divide-border/60">
            {pending.slice(0, 8).map((malote) => <ProtocolRow key={malote.id} malote={malote} sector={sectorMap.get(malote.setor)} onDeliver={() => onDeliver(malote)} onDetails={() => onDetails(malote)} compact />)}
          </div>
        )}
      </section>

      <div className="space-y-5">
        <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Prioridade operacional</p>
          {oldestPending ? (
            <>
              <p className="mt-3 text-lg font-semibold text-foreground">{oldestPending.destinatario}</p>
              <p className="mt-1 text-sm text-muted-foreground">{oldestPending.remetente}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Info label="Setor" value={oldestPending.setor} /><Info label="Em aberto" value={`${ageInDays(oldestPending.recebido_em)} dia(s)`} /></div>
              <Button type="button" className="mt-5 w-full" onClick={() => onDeliver(oldestPending)}>Registrar entrega</Button>
            </>
          ) : <p className="mt-3 text-sm text-muted-foreground">Sem pendências.</p>}
        </section>

        <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pendências por setor</p>
          <div className="mt-4 space-y-3">
            {groupedPending.length ? groupedPending.map(([sector, items]) => (
              <div key={sector} className="flex items-start justify-between gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{sector}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{sectorMap.get(sector)?.responsavel || "Responsável não cadastrado"}</p></div>
                <Badge variant="outline">{items.length}</Badge>
              </div>
            )) : <p className="text-sm text-muted-foreground">Sem pendências.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectorOverview({ setores, malotes }: { setores: Setor[]; malotes: Malote[] }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {setores.map((setor) => {
        const all = malotes.filter((item) => item.setor === setor.nome);
        const pending = all.filter((item) => item.status === "aguardando_entrega");
        return (
          <div key={setor.id} className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Setor</p><h3 className="mt-1 font-semibold text-foreground">{setor.nome}</h3></div><Badge variant={pending.length ? "outline" : "secondary"}>{pending.length} pend.</Badge></div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsável / referência</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{setor.responsavel || "Não cadastrado"}</p>
            <div className="mt-4 flex gap-4 border-t border-border/60 pt-4 text-sm"><span><strong>{all.length}</strong> protocolos</span><span><strong>{pending.length}</strong> em aberto</span></div>
          </div>
        );
      })}
    </section>
  );
}

function ShipmentOverview({ envios, saving, onFinalize }: { envios: Envio[]; saving: boolean; onFinalize: (envio: Envio) => void }) {
  if (!envios.length) {
    return <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-16 text-center"><Send className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold text-foreground">Nenhum envio encontrado</p><p className="mt-1 text-sm text-muted-foreground">Ajuste a busca, importe o histórico ou registre um novo envio.</p></div>;
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-sm">
      <div className="hidden grid-cols-[1.2fr_1.5fr_1fr_1fr_140px] gap-3 border-b border-border/70 bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
        <span>Status / categoria</span><span>Remetente → destinatário</span><span>Envio</span><span>Referências</span><span className="text-right">Ações</span>
      </div>
      <div className="divide-y divide-border/60">
        {envios.map((envio) => {
          const canFinalize = envio.status === "preparando" || envio.status === "enviado";
          return (
            <div key={envio.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_1.5fr_1fr_1fr_140px] lg:items-center lg:px-5">
              <div className="flex flex-wrap items-center gap-2"><EnvioStatusBadge status={envio.status} /><Badge variant="outline">{envioCategoryLabel(envio.categoria)}</Badge>{envio.legacy_import && <Badge variant="outline" className="text-muted-foreground">Legado</Badge>}</div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{envio.remetente} <span className="text-muted-foreground">→</span> {envio.destinatario}</p><p className="mt-1 truncate text-xs text-muted-foreground">{envio.item_descricao || "Item não informado"}</p></div>
              <div><p className="text-sm text-foreground">{formatDateTime(envio.enviado_em, envio.legacy_import)}</p><p className="mt-0.5 text-xs text-muted-foreground">{envio.enviado_por || "Responsável não registrado"}</p></div>
              <div className="min-w-0 text-xs text-muted-foreground"><p className="truncate">{envio.codigo_rastreio ? `Rastreio: ${envio.codigo_rastreio}` : "Sem rastreio"}</p><p className="mt-1 truncate">{envio.nota_fiscal ? `NF: ${envio.nota_fiscal}` : envio.finalizado_em ? `Concluído: ${formatDateTime(envio.finalizado_em)}` : "Sem nota fiscal"}</p></div>
              <div className="flex justify-end">
                {canFinalize ? <Button type="button" size="sm" onClick={() => onFinalize(envio)} disabled={saving}>Finalizar</Button> : <span className="text-xs font-medium text-muted-foreground">Sem ação pendente</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProtocolRow({ malote, sector, onDeliver, onDetails, compact = false }: { malote: Malote; sector?: Setor; onDeliver: () => void; onDetails: () => void; compact?: boolean }) {
  const isPending = malote.status === "aguardando_entrega";
  return (
    <div className={`grid gap-3 px-4 py-4 lg:items-center lg:px-5 ${compact ? "lg:grid-cols-[1.7fr_1fr_150px]" : "lg:grid-cols-[1.4fr_1.4fr_1fr_1fr_140px]"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={malote.status} />{malote.legacy_import && <Badge variant="outline" className="text-muted-foreground">Legado</Badge>}</div>
        <p className="mt-2 truncate text-sm font-semibold text-foreground">{malote.remetente} <span className="text-muted-foreground">→</span> {malote.destinatario}</p>
      </div>
      <div className="min-w-0"><p className="text-sm font-medium text-foreground">{malote.setor}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{sector?.responsavel || "Responsável não cadastrado"}</p></div>
      {!compact && <div><p className="text-sm text-foreground">{formatDateTime(malote.recebido_em, malote.legacy_import)}</p><p className="mt-0.5 text-xs text-muted-foreground">{malote.recebido_por || "Recebedor não registrado"}</p></div>}
      {!compact && <div className="min-w-0 text-xs text-muted-foreground"><p className="truncate">{malote.codigo_interno ? `Sherwin: ${malote.codigo_interno}` : "Sem código Sherwin"}</p><p className="mt-1 truncate">{malote.codigo_rastreio ? `Rastreio: ${malote.codigo_rastreio}` : "Sem rastreio"}</p></div>}
      {compact && <div><p className="text-sm font-medium text-foreground">{ageInDays(malote.recebido_em)} dia(s)</p><p className="text-xs text-muted-foreground">em aberto</p></div>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDetails}>Protocolo</Button>
        {isPending && <Button type="button" size="sm" onClick={onDeliver}>Entregar</Button>}
      </div>
    </div>
  );
}

function Kpi({ label, value, detail, critical = false }: { label: string; value: number; detail: string; critical?: boolean }) {
  return <div className="p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-tight ${critical ? "text-amber-500" : "text-foreground"}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function StatusBadge({ status }: { status: MaloteStatus }) {
  const pending = status === "aguardando_entrega";
  return <Badge variant="outline" className={pending ? "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-300" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"}>{pending ? "Aguardando entrega" : "Entregue"}</Badge>;
}

function EnvioStatusBadge({ status }: { status: EnvioStatus }) {
  const styles: Record<EnvioStatus, string> = {
    preparando: "border-slate-500/30 bg-slate-500/5 text-slate-600 dark:text-slate-300",
    enviado: "border-sky-500/30 bg-sky-500/5 text-sky-600 dark:text-sky-300",
    finalizado: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300",
    devolvido: "border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-300",
  };
  const labels: Record<EnvioStatus, string> = {
    preparando: "Preparando",
    enviado: "Enviado",
    finalizado: "Finalizado",
    devolvido: "Devolvido",
  };
  return <Badge variant="outline" className={styles[status]}>{labels[status]}</Badge>;
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>{children}</button>;
}

function LoadingState() {
  return <div className="flex flex-col items-center justify-center gap-3 py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><p className="text-sm text-muted-foreground">Carregando protocolos...</p></div>;
}

function EmptyState() {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-16 text-center"><PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold text-foreground">Nenhum protocolo encontrado</p><p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou registre um novo recebimento.</p></div>;
}

function ProtocolSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-border/70 bg-muted/15 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div></section>;
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}{required ? <span className="ml-1 text-destructive">*</span> : null}</span>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm text-foreground">{value}</p></div>;
}
