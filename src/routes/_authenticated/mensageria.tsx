import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheck2,
  CalendarPlus2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileSignature,
  Inbox,
  Loader2,
  MapPin,
  PackageCheck,
  PackageOpen,
  Plus,
  Search,
  Send,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
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
import { SignaturePad } from "@/components/mensageria/signature-pad";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/mensageria")({
  component: MensageriaPage,
});

type MaloteStatus = "aguardando_entrega" | "entregue";
type StatusFilter = "todos" | MaloteStatus;

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

function toDateTimeLocal(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(localValue: string) {
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) throw new Error("Data e hora inválidas.");
  return parsed.toISOString();
}

function formatDateTime(value: string | null, legacy = false) {
  if (!value) return "Não registrado no legado";
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
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
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

function emptyDeliveryForm(malote?: Malote | null): DeliveryForm {
  return {
    entregue_para: malote?.destinatario ?? "",
    entregue_em: toDateTimeLocal(),
    entrega_observacoes: "",
    assinatura_data_url: null,
  };
}

function MensageriaPage() {
  const [malotes, setMalotes] = useState<Malote[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("aguardando_entrega");
  const [sectorFilter, setSectorFilter] = useState("todos");

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>(emptyReceiptForm());

  const [deliveryTarget, setDeliveryTarget] = useState<Malote | null>(null);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(emptyDeliveryForm());

  const [detailsTarget, setDetailsTarget] = useState<Malote | null>(null);
  const [detailsSector, setDetailsSector] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [malotesResult, setoresResult] = await Promise.all([
        (supabase as any)
          .from("mensageria_malotes")
          .select("*")
          .order("recebido_em", { ascending: false }),
        (supabase as any)
          .from("mensageria_setores")
          .select("*")
          .eq("ativo", true)
          .order("nome", { ascending: true }),
      ]);

      if (malotesResult.error) throw malotesResult.error;
      if (setoresResult.error) throw setoresResult.error;

      setMalotes((malotesResult.data ?? []) as Malote[]);
      setSetores((setoresResult.data ?? []) as Setor[]);
    } catch (error) {
      console.error("Erro ao carregar mensageria:", error);
      toast.error("Não foi possível carregar os malotes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return malotes.filter((malote) => {
      if (statusFilter !== "todos" && malote.status !== statusFilter) return false;
      if (sectorFilter !== "todos" && malote.setor !== sectorFilter) return false;
      if (!term) return true;

      return [
        malote.remetente,
        malote.destinatario,
        malote.codigo_rastreio,
        malote.codigo_interno,
        malote.item_descricao,
        malote.setor,
      ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [malotes, search, sectorFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      recebidosHoje: malotes.filter((item) => isToday(item.recebido_em)).length,
      pendentes: malotes.filter((item) => item.status === "aguardando_entrega").length,
      entreguesHoje: malotes.filter((item) => isToday(item.entregue_em)).length,
      setores: new Set(
        malotes
          .filter((item) => item.status === "aguardando_entrega")
          .map((item) => item.setor),
      ).size,
    }),
    [malotes],
  );

  const handleCreateReceipt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantidade = Number.parseInt(receiptForm.quantidade, 10);
    if (!receiptForm.remetente.trim() || !receiptForm.destinatario.trim()) {
      toast.error("Informe remetente e destinatário.");
      return;
    }
    if (!receiptForm.recebido_por.trim()) {
      toast.error("Informe quem recebeu o malote na portaria.");
      return;
    }
    if (!Number.isFinite(quantidade) || quantidade < 1) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        remetente: receiptForm.remetente.trim(),
        destinatario: receiptForm.destinatario.trim(),
        codigo_rastreio: receiptForm.codigo_rastreio.trim() || null,
        codigo_interno: receiptForm.codigo_interno.trim() || null,
        item_descricao: receiptForm.item_descricao.trim() || null,
        local_recebimento: receiptForm.local_recebimento.trim() || "Portaria",
        quantidade,
        setor: receiptForm.setor || "NÃO CLASSIFICADO",
        recebido_em: toIso(receiptForm.recebido_em),
        recebido_por: receiptForm.recebido_por.trim(),
        observacoes: receiptForm.observacoes.trim() || null,
        status: "aguardando_entrega",
        legacy_import: false,
      };

      const { error } = await (supabase as any).from("mensageria_malotes").insert(payload);
      if (error) throw error;

      toast.success("Recebimento registrado. Malote aguardando entrega.");
      setReceiptOpen(false);
      setReceiptForm(emptyReceiptForm());
      await loadData();
    } catch (error) {
      console.error("Erro ao registrar recebimento:", error);
      toast.error("Não foi possível registrar o recebimento.");
    } finally {
      setSaving(false);
    }
  };

  const openDelivery = (malote: Malote) => {
    setDeliveryTarget(malote);
    setDeliveryForm(emptyDeliveryForm(malote));
  };

  const handleDelivery = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deliveryTarget) return;
    if (!deliveryForm.entregue_para.trim()) {
      toast.error("Informe o nome de quem recebeu a entrega.");
      return;
    }
    if (!deliveryForm.assinatura_data_url) {
      toast.error("A assinatura digital é obrigatória para concluir a entrega.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("mensageria_malotes")
        .update({
          status: "entregue",
          entregue_em: toIso(deliveryForm.entregue_em),
          entregue_para: deliveryForm.entregue_para.trim(),
          assinatura_data_url: deliveryForm.assinatura_data_url,
          entrega_observacoes: deliveryForm.entrega_observacoes.trim() || null,
        })
        .eq("id", deliveryTarget.id)
        .eq("status", "aguardando_entrega");

      if (error) throw error;

      toast.success("Entrega concluída com assinatura digital.");
      setDeliveryTarget(null);
      setDeliveryForm(emptyDeliveryForm());
      await loadData();
    } catch (error) {
      console.error("Erro ao concluir entrega:", error);
      toast.error("Não foi possível concluir a entrega.");
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
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("mensageria_malotes")
        .update({ setor: detailsSector })
        .eq("id", detailsTarget.id);
      if (error) throw error;

      toast.success("Setor atualizado.");
      const updated = { ...detailsTarget, setor: detailsSector };
      setDetailsTarget(updated);
      await loadData();
    } catch (error) {
      console.error("Erro ao atualizar setor:", error);
      toast.error("Não foi possível atualizar o setor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title="Mensageria e Malotes"
      description="Controle do recebimento na portaria até a entrega final com assinatura digital e rastreabilidade por setor."
      actions={
        <Button
          variant="glass"
          size="sm"
          className="gap-2 bg-primary/20 text-primary-glow border-primary/40"
          onClick={() => {
            setReceiptForm(emptyReceiptForm());
            setReceiptOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Registrar recebimento
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={CalendarPlus2} label="Recebidos hoje" value={stats.recebidosHoje} />
          <StatCard icon={Clock3} label="Aguardando entrega" value={stats.pendentes} emphasis />
          <StatCard icon={CalendarCheck2} label="Entregues hoje" value={stats.entreguesHoje} />
          <StatCard icon={UsersRound} label="Setores com pendências" value={stats.setores} />
        </div>

        <GlassCard className="p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por remetente, destinatário, rastreio ou código interno..."
                className="h-11 bg-white/5 pl-9 border-white/10"
              />
            </div>
            <select
              value={sectorFilter}
              onChange={(event) => setSectorFilter(event.target.value)}
              className="h-11 rounded-xl border border-white/10 bg-background/80 px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Filtrar por setor"
            >
              <option value="todos">Todos os setores</option>
              {setores.map((setor) => (
                <option key={setor.id} value={setor.nome}>
                  {setor.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <FilterButton
              active={statusFilter === "aguardando_entrega"}
              onClick={() => setStatusFilter("aguardando_entrega")}
            >
              Pendentes ({stats.pendentes})
            </FilterButton>
            <FilterButton
              active={statusFilter === "entregue"}
              onClick={() => setStatusFilter("entregue")}
            >
              Entregues
            </FilterButton>
            <FilterButton active={statusFilter === "todos"} onClick={() => setStatusFilter("todos")}>
              Todos ({malotes.length})
            </FilterButton>
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando protocolos de mensageria...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 font-semibold text-foreground">Nenhum malote encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste os filtros ou registre um novo recebimento.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((malote) => (
              <MaloteCard
                key={malote.id}
                malote={malote}
                onDeliver={() => openDelivery(malote)}
                onDetails={() => openDetails(malote)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-3xl border-white/10 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Registrar recebimento na portaria</DialogTitle>
            <DialogDescription>
              Crie o protocolo de entrada. O malote ficará pendente até a entrega ao destinatário.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateReceipt} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Remetente" required>
                <Input
                  value={receiptForm.remetente}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, remetente: event.target.value }))
                  }
                  placeholder="Empresa ou pessoa remetente"
                />
              </Field>
              <Field label="Destinatário" required>
                <Input
                  value={receiptForm.destinatario}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, destinatario: event.target.value }))
                  }
                  placeholder="Pessoa ou área destinatária"
                />
              </Field>
              <Field label="Código de rastreio">
                <Input
                  value={receiptForm.codigo_rastreio}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, codigo_rastreio: event.target.value }))
                  }
                  placeholder="Ex.: OY123456789BR"
                />
              </Field>
              <Field label="Código interno Sherwin">
                <Input
                  value={receiptForm.codigo_interno}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, codigo_interno: event.target.value }))
                  }
                  placeholder="Ex.: SW-28082601"
                />
              </Field>
              <Field label="Item / descrição">
                <Input
                  value={receiptForm.item_descricao}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, item_descricao: event.target.value }))
                  }
                  placeholder="Envelope, caixa, aparelho..."
                />
              </Field>
              <Field label="Quantidade" required>
                <Input
                  type="number"
                  min={1}
                  max={9999}
                  value={receiptForm.quantidade}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, quantidade: event.target.value }))
                  }
                />
              </Field>
              <Field label="Setor" required>
                <select
                  value={receiptForm.setor}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, setor: event.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {setores.map((setor) => (
                    <option key={setor.id} value={setor.nome}>
                      {setor.nome}
                      {setor.responsavel ? ` — ${setor.responsavel}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Local do recebimento" required>
                <Input
                  value={receiptForm.local_recebimento}
                  onChange={(event) =>
                    setReceiptForm((current) => ({
                      ...current,
                      local_recebimento: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Data e hora do recebimento" required>
                <Input
                  type="datetime-local"
                  value={receiptForm.recebido_em}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, recebido_em: event.target.value }))
                  }
                />
              </Field>
              <Field label="Recebido na portaria por" required>
                <Input
                  value={receiptForm.recebido_por}
                  onChange={(event) =>
                    setReceiptForm((current) => ({ ...current, recebido_por: event.target.value }))
                  }
                  placeholder="Nome do colaborador"
                />
              </Field>
            </div>

            <Field label="Observações">
              <textarea
                value={receiptForm.observacoes}
                onChange={(event) =>
                  setReceiptForm((current) => ({ ...current, observacoes: event.target.value }))
                }
                rows={3}
                className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Informações adicionais do recebimento..."
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setReceiptOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}
                Salvar recebimento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deliveryTarget)}
        onOpenChange={(open) => {
          if (!open) setDeliveryTarget(null);
        }}
      >
        <DialogContent className="max-w-2xl border-white/10 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Confirmar entrega do malote</DialogTitle>
            <DialogDescription>
              A entrega será registrada somente após a assinatura do recebedor.
            </DialogDescription>
          </DialogHeader>

          {deliveryTarget && (
            <form onSubmit={handleDelivery} className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{deliveryTarget.setor}</Badge>
                  {deliveryTarget.codigo_interno && (
                    <Badge variant="outline">{deliveryTarget.codigo_interno}</Badge>
                  )}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">Destinatário</p>
                <p className="font-semibold text-foreground">{deliveryTarget.destinatario}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recebido em {formatDateTime(deliveryTarget.recebido_em, deliveryTarget.legacy_import)}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Entregue para" required>
                  <Input
                    value={deliveryForm.entregue_para}
                    onChange={(event) =>
                      setDeliveryForm((current) => ({
                        ...current,
                        entregue_para: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Data e hora da entrega" required>
                  <Input
                    type="datetime-local"
                    value={deliveryForm.entregue_em}
                    onChange={(event) =>
                      setDeliveryForm((current) => ({
                        ...current,
                        entregue_em: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <SignaturePad
                key={deliveryTarget.id}
                value={deliveryForm.assinatura_data_url}
                onChange={(value) =>
                  setDeliveryForm((current) => ({ ...current, assinatura_data_url: value }))
                }
                disabled={saving}
              />

              <Field label="Observações da entrega">
                <textarea
                  value={deliveryForm.entrega_observacoes}
                  onChange={(event) =>
                    setDeliveryForm((current) => ({
                      ...current,
                      entrega_observacoes: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Observações opcionais..."
                />
              </Field>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDeliveryTarget(null)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !deliveryForm.assinatura_data_url}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSignature className="h-4 w-4" />
                  )}
                  Concluir entrega
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailsTarget)}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
      >
        <DialogContent className="max-w-2xl border-white/10 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Protocolo do malote</DialogTitle>
            <DialogDescription>
              Rastreabilidade do recebimento na portaria até a entrega final.
            </DialogDescription>
          </DialogHeader>

          {detailsTarget && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Remetente" value={detailsTarget.remetente} />
                <Info label="Destinatário" value={detailsTarget.destinatario} />
                <Info label="Código de rastreio" value={detailsTarget.codigo_rastreio || "Não informado"} />
                <Info label="Código interno" value={detailsTarget.codigo_interno || "Não informado"} />
                <Info label="Item" value={detailsTarget.item_descricao || "Não informado"} />
                <Info label="Quantidade" value={String(detailsTarget.quantidade)} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recebimento na portaria
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Info
                    label="Data"
                    value={formatDateTime(detailsTarget.recebido_em, detailsTarget.legacy_import)}
                  />
                  <Info label="Local" value={detailsTarget.local_recebimento} />
                  <Info label="Recebido por" value={detailsTarget.recebido_por} />
                  <Info label="Observações" value={detailsTarget.observacoes || "Sem observações"} />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Entrega final
                </p>
                {detailsTarget.status === "entregue" ? (
                  <div className="mt-3 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Info
                        label="Data"
                        value={
                          detailsTarget.entregue_em
                            ? formatDateTime(detailsTarget.entregue_em)
                            : "Data não registrada no legado"
                        }
                      />
                      <Info
                        label="Recebido por"
                        value={detailsTarget.entregue_para || "Não registrado no legado"}
                      />
                      <Info
                        label="Observações"
                        value={detailsTarget.entrega_observacoes || "Sem observações"}
                      />
                    </div>
                    {detailsTarget.assinatura_data_url ? (
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">Assinatura digital</p>
                        <div className="rounded-xl bg-white p-3">
                          <img
                            src={detailsTarget.assinatura_data_url}
                            alt={`Assinatura de ${detailsTarget.entregue_para || "recebedor"}`}
                            className="max-h-40 w-full object-contain"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                        Registro importado da planilha antiga: não havia assinatura digital disponível.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-sm text-amber-300">
                    <Clock3 className="h-4 w-4" />
                    Aguardando entrega ao destinatário.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Classificação por setor
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select
                    value={detailsSector}
                    onChange={(event) => setDetailsSector(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {setores.map((setor) => (
                      <option key={setor.id} value={setor.nome}>
                        {setor.nome}
                        {setor.responsavel ? ` — ${setor.responsavel}` : ""}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={updateSector}
                    disabled={saving || detailsSector === detailsTarget.setor}
                  >
                    Salvar setor
                  </Button>
                </div>
              </div>

              {detailsTarget.legacy_import && (
                <p className="text-xs text-muted-foreground">
                  Importado da planilha histórica ({detailsTarget.legacy_source}, linha{" "}
                  {detailsTarget.legacy_source_row ?? "—"}). Campos ausentes no arquivo original
                  permaneceram como não registrados.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  emphasis = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <GlassCard className={`p-4 ${emphasis ? "border-amber-400/25 bg-amber-500/[0.04]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
        <div className={`rounded-xl p-2 ${emphasis ? "bg-amber-500/15 text-amber-300" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </GlassCard>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      className={active ? "bg-white/10" : ""}
    >
      {children}
    </Button>
  );
}

function MaloteCard({
  malote,
  onDeliver,
  onDetails,
}: {
  malote: Malote;
  onDeliver: () => void;
  onDetails: () => void;
}) {
  const pending = malote.status === "aguardando_entrega";

  return (
    <GlassCard className="overflow-hidden border-white/10 p-0 transition-colors hover:bg-white/[0.05]">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 gap-3">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                pending ? "bg-amber-500/12 text-amber-300" : "bg-emerald-500/12 text-emerald-300"
              }`}
            >
              {pending ? <PackageOpen className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={pending ? "border-amber-500/30 text-amber-300" : "border-emerald-500/30 text-emerald-300"}>
                  {pending ? "Aguardando entrega" : "Entregue"}
                </Badge>
                <Badge variant="outline">{malote.setor}</Badge>
                {malote.legacy_import && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Legado
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex min-w-0 items-center gap-2 text-sm">
                <span className="truncate font-semibold text-foreground">{malote.remetente}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-semibold text-foreground">{malote.destinatario}</span>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarPlus2 className="h-3.5 w-3.5" />
                  {formatDateTime(malote.recebido_em, malote.legacy_import)}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {malote.local_recebimento}
                </span>
                <span className="flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" />
                  {malote.recebido_por}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {malote.codigo_rastreio && <span>Rastreio: {malote.codigo_rastreio}</span>}
                {malote.codigo_interno && <span>Interno: {malote.codigo_interno}</span>}
                <span>Qtd.: {malote.quantidade}</span>
                {malote.item_descricao && <span>{malote.item_descricao}</span>}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onDetails}>
              Ver protocolo
            </Button>
            {pending && (
              <Button type="button" size="sm" className="gap-2" onClick={onDeliver}>
                <Send className="h-4 w-4" />
                Registrar entrega
              </Button>
            )}
          </div>
        </div>
      </div>

      {!pending && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/5 bg-emerald-500/[0.025] px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            {malote.entregue_em ? formatDateTime(malote.entregue_em) : "Entrega registrada no legado"}
          </span>
          <span>{malote.entregue_para || "Recebedor não registrado no legado"}</span>
          {malote.assinatura_data_url && (
            <span className="flex items-center gap-1.5 text-emerald-300">
              <FileSignature className="h-3.5 w-3.5" />
              Assinado digitalmente
            </span>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-foreground">{value}</p>
    </div>
  );
}
