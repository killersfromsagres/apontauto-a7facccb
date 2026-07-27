import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Package,
  RefreshCw,
  FileSpreadsheet,
  Search as SearchIcon,
  Send,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  CalendarClock,
  Plus,
  Trash2,
  Loader2,
  Building2,
  History,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadBlob } from "@/lib/download";
import {
  fetchControleItems,
  fetchCentrosCusto,
  fetchEnvios,
  upsertMeta,
  saveCentroCusto,
  deleteCentroCusto,
  registrarEnvioFacilities,
  STATUS_COMPRA_LABEL,
  STATUS_COMPRA_ORDER,
  type ControleItem,
  type CentroCusto,
  type EnvioFacilities,
  type StatusCompra,
} from "@/lib/controle/data";
import { exportControleMateriais } from "@/lib/controle/export";

export const Route = createFileRoute("/_authenticated/controle-materiais")({
  component: ControlePage,
  head: () => ({
    meta: [
      { title: "Controle de Materiais — Apont Auto" },
      {
        name: "description",
        content:
          "Central de controle de pedidos de peças e defeitos de Refrigeração e Corretiva, com centro de custo e comprovação de envio à Facilities.",
      },
      { property: "og:title", content: "Controle de Materiais" },
      {
        property: "og:description",
        content: "Peças, defeitos, centro de custo e comprovação de solicitações à Facilities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const statusBadge: Record<StatusCompra, string> = {
  aguardando: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  solicitado: "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300",
  em_cotacao: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
  comprado: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  recebido: "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300",
  cancelado: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
};

const origemBadge: Record<string, string> = {
  refrigeracao: "bg-sky-400/15 text-sky-600 border-sky-400/40 dark:text-sky-300",
  corretiva: "bg-orange-400/15 text-orange-600 border-orange-400/40 dark:text-orange-300",
};

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function toLocalInput(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Package;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <GlassCard className="p-3 sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="font-display text-xl font-bold leading-tight sm:text-2xl">{value}</div>
        </div>
      </div>
    </GlassCard>
  );
}

function ControlePage() {
  const [items, setItems] = useState<ControleItem[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [envios, setEnvios] = useState<EnvioFacilities[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [busca, setBusca] = useState("");
  const [fOrigem, setFOrigem] = useState<string>("todas");
  const [fTipo, setFTipo] = useState<string>("todos");
  const [fStatus, setFStatus] = useState<string>("todos");
  const [somenteSemCC, setSomenteSemCC] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ControleItem | null>(null);
  const [envioOpen, setEnvioOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [i, c, e] = await Promise.all([
        fetchControleItems(),
        fetchCentrosCusto(),
        fetchEnvios(),
      ]);
      setItems(i);
      setCentros(c);
      setEnvios(e);
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return items.filter((i) => {
      if (fOrigem !== "todas" && i.origem !== fOrigem) return false;
      if (fTipo !== "todos" && i.tipo !== fTipo) return false;
      const st = i.meta?.status_compra ?? "aguardando";
      if (fStatus !== "todos" && st !== fStatus) return false;
      if (somenteSemCC && i.meta?.centro_custo) return false;
      if (!q) return true;
      return [
        i.descricao,
        i.numeroOs,
        i.descricaoOs,
        i.predio,
        i.local,
        i.equipe,
        i.meta?.centro_custo,
        i.meta?.numero_requisicao,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, busca, fOrigem, fTipo, fStatus, somenteSemCC]);

  const kpis = useMemo(
    () => ({
      total: items.length,
      pecas: items.filter((i) => i.tipo === "peca").length,
      defeitos: items.filter((i) => i.tipo === "problema").length,
      semCC: items.filter((i) => !i.meta?.centro_custo).length,
      solicitados: items.filter((i) => i.meta?.data_solicitacao_facilities).length,
      pendentes: items.filter((i) => !i.meta?.data_solicitacao_facilities).length,
    }),
    [items],
  );

  const selectedItems = useMemo(
    () => filtered.filter((i) => selected.has(i.key)),
    [filtered, selected],
  );

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.key)),
    );

  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await exportControleMateriais({ itens: filtered, centros, envios });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `controle-materiais-${stamp}.xlsx`);
      toast.success("Planilha gerada com a aba de Centro de Custo.");
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao gerar a planilha.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageShell
      eyebrow="Suprimentos"
      title="Controle de Materiais"
      description="Todos os pedidos de peças e defeitos apontados em Refrigeração e Corretiva, com centro de custo, situação da compra e comprovação da data de envio à Facilities."
      actions={
        <>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button onClick={() => void doExport()} disabled={exporting || loading}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Exportar planilha
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <Kpi icon={ClipboardList} label="Registros" value={kpis.total} tone="bg-primary/15 text-primary" />
        <Kpi icon={Package} label="Peças" value={kpis.pecas} tone="bg-sky-500/15 text-sky-500" />
        <Kpi icon={AlertTriangle} label="Defeitos" value={kpis.defeitos} tone="bg-amber-500/15 text-amber-500" />
        <Kpi icon={Wallet} label="Sem centro de custo" value={kpis.semCC} tone="bg-rose-500/15 text-rose-500" />
        <Kpi icon={Send} label="Enviados p/ Facilities" value={kpis.solicitados} tone="bg-emerald-500/15 text-emerald-500" />
        <Kpi icon={CalendarClock} label="A solicitar" value={kpis.pendentes} tone="bg-violet-500/15 text-violet-500" />
      </div>

      <Tabs defaultValue="pedidos" className="mt-5">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="centros">Centros de custo</TabsTrigger>
          <TabsTrigger value="envios">Envios à Facilities</TabsTrigger>
        </TabsList>

        {/* ------------------------------ Pedidos ------------------------------ */}
        <TabsContent value="pedidos" className="mt-4 space-y-4">
          <GlassCard className="p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="relative lg:col-span-2">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por material, OS, local, centro de custo…"
                  className="pl-9"
                />
              </div>
              <Select value={fOrigem} onValueChange={setFOrigem}>
                <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as origens</SelectItem>
                  <SelectItem value="refrigeracao">Refrigeração</SelectItem>
                  <SelectItem value="corretiva">Corretiva</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fTipo} onValueChange={setFTipo}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Peças e defeitos</SelectItem>
                  <SelectItem value="peca">Somente peças</SelectItem>
                  <SelectItem value="problema">Somente defeitos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as situações</SelectItem>
                  {STATUS_COMPRA_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_COMPRA_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={somenteSemCC} onCheckedChange={(v) => setSomenteSemCC(Boolean(v))} />
                Somente sem centro de custo
              </label>
              <span className="text-sm text-muted-foreground">
                {filtered.length} de {items.length} registros
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={toggleAll} disabled={filtered.length === 0}>
                  {selected.size === filtered.length && filtered.length > 0
                    ? "Limpar seleção"
                    : "Selecionar todos"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setEnvioOpen(true)}
                  disabled={selectedItems.length === 0}
                >
                  <Send className="mr-2 h-4 w-4" /> Registrar envio ({selectedItems.length})
                </Button>
              </div>
            </div>
          </GlassCard>

          {loading ? (
            <GlassCard className="grid min-h-[30vh] place-items-center text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos…
              </span>
            </GlassCard>
          ) : filtered.length === 0 ? (
            <GlassCard className="grid min-h-[30vh] place-items-center text-sm text-muted-foreground">
              Nenhum registro encontrado com os filtros atuais.
            </GlassCard>
          ) : (
            <div className="grid gap-3">
              {filtered.map((i) => {
                const st = i.meta?.status_compra ?? "aguardando";
                const semCC = !i.meta?.centro_custo;
                return (
                  <GlassCard
                    key={i.key}
                    className={`p-3 sm:p-4 ${selected.has(i.key) ? "border-primary/60 ring-1 ring-primary/40" : ""}`}
                  >
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                      <Checkbox
                        className="mt-1"
                        checked={selected.has(i.key)}
                        onCheckedChange={() => toggle(i.key)}
                        aria-label="Selecionar item"
                      />
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={origemBadge[i.origem]}>
                            {i.origem === "refrigeracao" ? "Refrigeração" : "Corretiva"}
                          </Badge>
                          <Badge variant="outline">
                            {i.tipo === "peca" ? "Peça" : "Defeito"}
                          </Badge>
                          <Badge variant="outline" className="font-mono">OS {i.numeroOs}</Badge>
                          <Badge variant="outline" className={statusBadge[st]}>
                            {STATUS_COMPRA_LABEL[st]}
                          </Badge>
                          {semCC && (
                            <Badge variant="outline" className="bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-300">
                              Sem centro de custo
                            </Badge>
                          )}
                        </div>
                        <p className="break-words text-sm font-semibold leading-snug">
                          {i.descricao}
                          {i.quantidade ? (
                            <span className="ml-2 text-muted-foreground">× {i.quantidade}</span>
                          ) : null}
                        </p>
                        {i.descricaoOs && (
                          <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                            {i.descricaoOs}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{[i.predio, i.andar, i.local].filter(Boolean).join(" · ") || "Local não informado"}</span>
                          {i.equipe && <span>Equipe: {i.equipe}</span>}
                          <span>Apontado em {fmt(i.criadoEm)}</span>
                          {i.meta?.centro_custo && <span>CC: {i.meta.centro_custo}</span>}
                          {i.meta?.numero_requisicao && <span>Req.: {i.meta.numero_requisicao}</span>}
                          <span className={i.meta?.data_solicitacao_facilities ? "text-emerald-600 dark:text-emerald-400" : ""}>
                            Facilities: {fmt(i.meta?.data_solicitacao_facilities)}
                          </span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setEditing(i)}>
                        Gerenciar
                      </Button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* --------------------------- Centros de custo --------------------------- */}
        <TabsContent value="centros" className="mt-4">
          <CentrosCustoPanel centros={centros} onChanged={load} />
        </TabsContent>

        {/* -------------------------------- Envios -------------------------------- */}
        <TabsContent value="envios" className="mt-4 space-y-3">
          {envios.length === 0 ? (
            <GlassCard className="grid min-h-[30vh] place-items-center text-sm text-muted-foreground">
              Nenhum envio registrado até o momento.
            </GlassCard>
          ) : (
            envios.map((e) => (
              <GlassCard key={e.id} className="p-3 sm:p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
                        <History className="mr-1 h-3 w-3" /> {fmt(e.enviado_em)}
                      </Badge>
                      {e.centro_custo && <Badge variant="outline">CC {e.centro_custo}</Badge>}
                      {e.canal && <Badge variant="outline">{e.canal}</Badge>}
                    </div>
                    {e.destinatario && (
                      <p className="text-sm font-semibold">Para: {e.destinatario}</p>
                    )}
                    {e.observacao && (
                      <p className="break-words text-xs text-muted-foreground">{e.observacao}</p>
                    )}
                    <div className="max-h-32 overflow-y-auto rounded-xl bg-muted/40 p-2 text-xs">
                      {(e.itens ?? []).map((it, idx) => (
                        <div key={idx} className="truncate">
                          OS {it.numeroOs} — {it.descricao}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Badge variant="outline">{e.total_itens} itens</Badge>
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>
      </Tabs>

      <ItemDialog
        item={editing}
        centros={centros}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
      <EnvioDialog
        open={envioOpen}
        itens={selectedItems}
        centros={centros}
        onOpenChange={setEnvioOpen}
        onSaved={async () => {
          setSelected(new Set());
          await load();
        }}
      />
    </PageShell>
  );
}

/* --------------------------- Diálogo de item --------------------------- */

function ItemDialog({
  item,
  centros,
  onClose,
  onSaved,
}: {
  item: ControleItem | null;
  centros: CentroCusto[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [cc, setCc] = useState("");
  const [req, setReq] = useState("");
  const [forn, setForn] = useState("");
  const [valor, setValor] = useState("");
  const [status, setStatus] = useState<StatusCompra>("aguardando");
  const [data, setData] = useState("");
  const [solicitadoPor, setSolicitadoPor] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const m = item.meta;
    setCc(m?.centro_custo ?? "");
    setReq(m?.numero_requisicao ?? "");
    setForn(m?.fornecedor ?? "");
    setValor(m?.valor_estimado != null ? String(m.valor_estimado) : "");
    setStatus(m?.status_compra ?? "aguardando");
    setData(m?.data_solicitacao_facilities ? toLocalInput(m.data_solicitacao_facilities) : "");
    setSolicitadoPor(m?.solicitado_por ?? "");
    setObs(m?.observacao ?? "");
  }, [item]);

  const save = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await upsertMeta(item, {
        centro_custo: cc.trim() || null,
        numero_requisicao: req.trim() || null,
        fornecedor: forn.trim() || null,
        valor_estimado: valor.trim() ? Number(valor.replace(",", ".")) : null,
        status_compra: status,
        data_solicitacao_facilities: data ? new Date(data).toISOString() : null,
        solicitado_por: solicitadoPor.trim() || null,
        observacao: obs.trim() || null,
      });
      toast.success("Controle atualizado.");
      await onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">{item?.descricao}</DialogTitle>
          <DialogDescription>
            OS {item?.numeroOs} · {item?.origem === "refrigeracao" ? "Refrigeração" : "Corretiva"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Centro de custo</Label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              list="centros-custo-list"
              placeholder="Ex.: 4102-MANUT"
            />
            <datalist id="centros-custo-list">
              {centros.map((c) => (
                <option key={c.id} value={c.codigo}>{c.descricao ?? ""}</option>
              ))}
            </datalist>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Nº da requisição</Label>
              <Input value={req} onChange={(e) => setReq(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Fornecedor</Label>
              <Input value={forn} onChange={(e) => setForn(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Valor estimado (R$)</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
            </div>
            <div className="grid gap-1.5">
              <Label>Situação da compra</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusCompra)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_COMPRA_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_COMPRA_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Data/hora da solicitação à Facilities</Label>
              <Input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Solicitado por</Label>
              <Input value={solicitadoPor} onChange={(e) => setSolicitadoPor(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setData(toLocalInput())}
            className="justify-self-start"
          >
            <CalendarClock className="mr-2 h-4 w-4" /> Marcar solicitação agora
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- Diálogo de envio -------------------------- */

function EnvioDialog({
  open,
  itens,
  centros,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  itens: ControleItem[];
  centros: CentroCusto[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [quando, setQuando] = useState(toLocalInput());
  const [cc, setCc] = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [canal, setCanal] = useState("E-mail");
  const [solicitante, setSolicitante] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setQuando(toLocalInput());
  }, [open]);

  const submit = async () => {
    setSaving(true);
    try {
      await registrarEnvioFacilities({
        itens,
        enviadoEm: new Date(quando).toISOString(),
        centroCusto: cc.trim() || null,
        destinatario: destinatario.trim() || null,
        canal: canal.trim() || null,
        observacao: obs.trim() || null,
        solicitadoPor: solicitante.trim() || null,
      });
      toast.success("Envio registrado — data de solicitação comprovada.");
      onOpenChange(false);
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao registrar o envio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar solicitação à Facilities</DialogTitle>
          <DialogDescription>
            {itens.length} item(ns) serão marcados como solicitados na data informada. O registro
            fica no histórico e não pode ser alterado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Data e hora do envio</Label>
            <Input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Centro de custo</Label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} list="centros-custo-list-envio" />
              <datalist id="centros-custo-list-envio">
                {centros.map((c) => (
                  <option key={c.id} value={c.codigo}>{c.descricao ?? ""}</option>
                ))}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label>Canal</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="E-mail">E-mail</SelectItem>
                  <SelectItem value="Sistema">Sistema</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Presencial">Presencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Destinatário (Facilities)</Label>
              <Input value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Solicitado por</Label>
              <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Observação / protocolo</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
          </div>
          <div className="max-h-40 overflow-y-auto rounded-xl bg-muted/40 p-2 text-xs">
            {itens.map((i) => (
              <div key={i.key} className="truncate">OS {i.numeroOs} — {i.descricao}</div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={saving || itens.length === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Registrar envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------ Centros de custo ------------------------ */

function CentrosCustoPanel({
  centros,
  onChanged,
}: {
  centros: CentroCusto[];
  onChanged: () => Promise<void>;
}) {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!codigo.trim()) {
      toast.error("Informe o código do centro de custo.");
      return;
    }
    setSaving(true);
    try {
      await saveCentroCusto({
        codigo: codigo.trim(),
        descricao: descricao.trim() || null,
        responsavel: responsavel.trim() || null,
      } as any);
      setCodigo("");
      setDescricao("");
      setResponsavel("");
      toast.success("Centro de custo salvo.");
      await onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" /> Cadastrar centro de custo
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código (ex.: 4102-MANUT)" />
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição / área" />
          <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Responsável" />
          <Button onClick={() => void add()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Adicionar
          </Button>
        </div>
      </GlassCard>

      {centros.length === 0 ? (
        <GlassCard className="grid min-h-[20vh] place-items-center text-sm text-muted-foreground">
          Nenhum centro de custo cadastrado.
        </GlassCard>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {centros.map((c) => (
            <GlassCard key={c.id} className="p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-bold">{c.codigo}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.descricao ?? "—"}</div>
                  {c.responsavel && (
                    <div className="truncate text-xs text-muted-foreground">Resp.: {c.responsavel}</div>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Excluir centro de custo"
                  onClick={async () => {
                    try {
                      await deleteCentroCusto(c.id);
                      toast.success("Centro de custo removido.");
                      await onChanged();
                    } catch (err: any) {
                      toast.error(err?.message ?? "Falha ao remover.");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
