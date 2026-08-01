import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Boxes,
  Search as SearchIcon,
  Plus,
  Minus,
  Trash2,
  FileSpreadsheet,
  Send,
  Loader2,
  ShoppingCart,
  PackagePlus,
  History,
  RefreshCw,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob } from "@/lib/download";
import {
  fetchCatalogo,
  fetchMinhasSolicitacoes,
  criarSolicitacao,
  enviarSolicitacao,
  excluirSolicitacao,
  PRIORIDADE_LABEL,
  STATUS_LABEL,
  UNIDADES,
  type CarrinhoItem,
  type MaterialCatalogo,
  type Prioridade,
  type Solicitacao,
  type StatusSolicitacao,
} from "@/lib/materiais/data";
import { exportSolicitacaoMateriais, exportHistoricoSolicitacoes } from "@/lib/materiais/export";

export const Route = createFileRoute("/_authenticated/solicitacao-materiais")({
  component: SolicitacaoMateriaisPage,
  head: () => ({
    meta: [
      { title: "Solicitação de Materiais — Apont Auto" },
      {
        name: "description",
        content:
          "Interface do colaborador para selecionar materiais do catálogo, montar a solicitação e exportar a planilha pronta para o Suprimentos.",
      },
      { property: "og:title", content: "Solicitação de Materiais" },
      {
        property: "og:description",
        content: "Catálogo, carrinho de materiais e exportação automática da planilha de pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const statusTone: Record<StatusSolicitacao, string> = {
  rascunho: "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300",
  enviada: "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300",
  em_analise: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
  aprovada: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  atendida: "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300",
  cancelada: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
};

const prioridadeTone: Record<Prioridade, string> = {
  baixa: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  normal: "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300",
  alta: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  urgente: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Boxes;
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

function SolicitacaoMateriaisPage() {
  const [catalogo, setCatalogo] = useState<MaterialCatalogo[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [detalhe, setDetalhe] = useState<Solicitacao | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ descricao: "", codigo: "", unidade: "UN", quantidade: 1 });

  const [form, setForm] = useState({
    solicitante: "",
    setor: "",
    centroCusto: "",
    predio: "",
    local: "",
    prioridade: "normal" as Prioridade,
    observacao: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [cat, sols] = await Promise.all([fetchCatalogo(), fetchMinhasSolicitacoes()]);
      setCatalogo(cat);
      setSolicitacoes(sols);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível carregar os materiais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      const nome =
        (u?.user_metadata?.nome as string) ||
        (u?.user_metadata?.full_name as string) ||
        (u?.email ? u.email.split("@")[0] : "");
      if (nome) setForm((f) => (f.solicitante ? f : { ...f, solicitante: nome }));
    })();
  }, []);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    catalogo.forEach((m) => m.categoria && set.add(m.categoria));
    return Array.from(set).sort();
  }, [catalogo]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return catalogo.filter((m) => {
      if (categoria !== "todas" && m.categoria !== categoria) return false;
      if (!q) return true;
      return (
        m.nome.toLowerCase().includes(q) ||
        m.codigo.toLowerCase().includes(q) ||
        (m.categoria ?? "").toLowerCase().includes(q) ||
        (m.descricao ?? "").toLowerCase().includes(q)
      );
    });
  }, [catalogo, busca, categoria]);

  const totalQtd = carrinho.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

  function addCatalogo(m: MaterialCatalogo) {
    setCarrinho((prev) => {
      const found = prev.find((i) => i.catalogoId === m.id);
      if (found) {
        return prev.map((i) =>
          i.catalogoId === m.id ? { ...i, quantidade: i.quantidade + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          key: `cat:${m.id}`,
          catalogoId: m.id,
          codigo: m.codigo,
          descricao: m.nome,
          unidade: m.unidade,
          quantidade: 1,
          justificativa: "",
        },
      ];
    });
    toast.success(`${m.nome} adicionado`, { duration: 1200 });
  }

  function patchItem(key: string, patch: Partial<CarrinhoItem>) {
    setCarrinho((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key: string) {
    setCarrinho((prev) => prev.filter((i) => i.key !== key));
  }

  function addManual() {
    if (!manual.descricao.trim()) {
      toast.warning("Informe a descrição do material.");
      return;
    }
    setCarrinho((prev) => [
      ...prev,
      {
        key: `man:${Date.now()}`,
        catalogoId: null,
        codigo: manual.codigo.trim(),
        descricao: manual.descricao.trim(),
        unidade: manual.unidade,
        quantidade: Math.max(0.01, Number(manual.quantidade) || 1),
        justificativa: "",
      },
    ]);
    setManual({ descricao: "", codigo: "", unidade: "UN", quantidade: 1 });
    setManualOpen(false);
  }

  function validar() {
    if (!form.solicitante.trim()) {
      toast.warning("Informe o nome do solicitante.");
      return false;
    }
    if (carrinho.length === 0) {
      toast.warning("Adicione ao menos um material à solicitação.");
      return false;
    }
    return true;
  }

  async function exportarCarrinho() {
    if (carrinho.length === 0) {
      toast.warning("Adicione materiais antes de exportar.");
      return;
    }
    const blob = await exportSolicitacaoMateriais({
      cabecalho: {
        solicitante: form.solicitante || "—",
        setor: form.setor,
        centroCusto: form.centroCusto,
        predio: form.predio,
        local: form.local,
        prioridade: form.prioridade,
        status: "rascunho",
        observacao: form.observacao,
        criadoEm: new Date().toISOString(),
      },
      itens: carrinho,
    });
    downloadBlob(blob, `solicitacao-materiais-${slug(form.solicitante || "colaborador")}.xlsx`);
    toast.success("Planilha gerada.");
  }

  async function salvar(status: "rascunho" | "enviada") {
    if (!validar()) return;
    setSalvando(true);
    try {
      const sol = await criarSolicitacao({
        solicitante: form.solicitante.trim(),
        setor: form.setor,
        centroCusto: form.centroCusto,
        predio: form.predio,
        local: form.local,
        prioridade: form.prioridade,
        observacao: form.observacao,
        status,
        itens: carrinho,
      });
      setCarrinho([]);
      setForm((f) => ({ ...f, observacao: "" }));
      await load();
      toast.success(
        status === "enviada"
          ? `Solicitação ${sol.numero} enviada.`
          : `Rascunho ${sol.numero} salvo.`,
      );
      if (status === "enviada") {
        const blob = await exportSolicitacaoMateriais({
          cabecalho: {
            numero: sol.numero,
            solicitante: sol.solicitante,
            setor: sol.setor,
            centroCusto: sol.centro_custo,
            predio: sol.predio,
            local: sol.local,
            prioridade: sol.prioridade,
            status: sol.status,
            observacao: sol.observacao,
            criadoEm: sol.created_at,
          },
          itens: sol.itens,
        });
        downloadBlob(blob, `${sol.numero}.xlsx`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar a solicitação.");
    } finally {
      setSalvando(false);
    }
  }

  async function exportarSolicitacao(s: Solicitacao) {
    const blob = await exportSolicitacaoMateriais({
      cabecalho: {
        numero: s.numero,
        solicitante: s.solicitante,
        setor: s.setor,
        centroCusto: s.centro_custo,
        predio: s.predio,
        local: s.local,
        prioridade: s.prioridade,
        status: s.status,
        observacao: s.observacao,
        criadoEm: s.created_at,
      },
      itens: s.itens,
    });
    downloadBlob(blob, `${s.numero}.xlsx`);
  }

  const enviadas = solicitacoes.filter((s) => s.status !== "rascunho").length;
  const itensSolicitados = solicitacoes.reduce((sum, s) => sum + s.itens.length, 0);

  return (
    <PageShell
      eyebrow="Materiais e Serviços"
      title="Solicitação de Materiais"
      description="Escolha os materiais no catálogo, ajuste quantidade e justificativa e gere a planilha profissional pronta para o Suprimentos — sem digitar item por item."
      actions={
        <>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={() => void exportarCarrinho()}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar planilha
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          icon={Boxes}
          label="Materiais no catálogo"
          value={catalogo.length}
          tone="bg-sky-500/15 text-sky-600 dark:text-sky-300"
        />
        <Kpi
          icon={ShoppingCart}
          label="Itens na solicitação"
          value={carrinho.length}
          tone="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
        />
        <Kpi
          icon={CheckCircle2}
          label="Solicitações enviadas"
          value={enviadas}
          tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
        />
        <Kpi
          icon={ClipboardList}
          label="Itens já pedidos"
          value={itensSolicitados}
          tone="bg-amber-500/15 text-amber-600 dark:text-amber-300"
        />
      </div>

      <Tabs defaultValue="nova" className="mt-5">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="nova" className="gap-2">
            <PackagePlus className="h-4 w-4" /> Nova solicitação
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" /> Minhas solicitações
          </TabsTrigger>
        </TabsList>

        {/* ------------------------- Nova solicitação ------------------------- */}
        <TabsContent value="nova" className="mt-4">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* Catálogo */}
            <GlassCard className="min-w-0 p-4">
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative min-w-0">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome, código ou categoria"
                    className="h-11 pl-9"
                  />
                </div>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="h-11 sm:w-48">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as categorias</SelectItem>
                    {categorias.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9"
                  onClick={() => setManualOpen(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Material fora do catálogo
                </Button>
              </div>

              <div className="max-h-[26rem] min-w-0 space-y-2 overflow-y-auto pr-1">
                {loading && (
                  <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo…
                  </div>
                )}
                {!loading && filtrados.length === 0 && (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhum material encontrado. Use “Material fora do catálogo”.
                  </div>
                )}
                {filtrados.map((m) => {
                  const noCarrinho = carrinho.find((i) => i.catalogoId === m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => addCatalogo(m)}
                      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="font-medium break-words [overflow-wrap:anywhere]">
                            {m.nome}
                          </span>
                          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                            {m.codigo}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                          {[m.categoria, m.descricao].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {m.unidade}
                        </Badge>
                        <span
                          className={`grid h-9 w-9 place-items-center rounded-full ${
                            noCarrinho
                              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                              : "bg-primary/15 text-primary"
                          }`}
                        >
                          {noCarrinho ? (
                            <span className="text-xs font-bold">{noCarrinho.quantidade}</span>
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </GlassCard>

            {/* Carrinho + dados */}
            <div className="min-w-0 space-y-4">
              <GlassCard className="min-w-0 p-4">
                <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <h3 className="min-w-0 truncate font-display text-lg font-bold">
                    Materiais selecionados
                  </h3>
                  <Badge variant="outline" className="shrink-0">
                    {carrinho.length} itens · {totalQtd.toLocaleString("pt-BR")} un.
                  </Badge>
                </div>

                {carrinho.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Toque em um material do catálogo para adicioná-lo aqui.
                  </div>
                ) : (
                  <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                    {carrinho.map((i) => (
                      <li
                        key={i.key}
                        className="min-w-0 overflow-hidden rounded-xl border bg-background/50 p-3"
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                          <div className="min-w-0">
                            <div className="font-medium break-words [overflow-wrap:anywhere]">
                              {i.descricao}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {i.codigo || "sem código"} · {i.unidade}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 shrink-0 text-rose-600"
                            onClick={() => removeItem(i.key)}
                            aria-label="Remover material"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1 rounded-full border bg-background/70 p-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full"
                              onClick={() =>
                                patchItem(i.key, {
                                  quantidade: Math.max(1, Number(i.quantidade) - 1),
                                })
                              }
                              aria-label="Diminuir"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              value={String(i.quantidade)}
                              inputMode="decimal"
                              onChange={(e) =>
                                patchItem(i.key, {
                                  quantidade: Math.max(
                                    0,
                                    Number(e.target.value.replace(",", ".")) || 0,
                                  ),
                                })
                              }
                              className="h-8 w-16 border-0 bg-transparent text-center font-semibold shadow-none focus-visible:ring-0"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full"
                              onClick={() =>
                                patchItem(i.key, { quantidade: Number(i.quantidade) + 1 })
                              }
                              aria-label="Aumentar"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <Select
                            value={i.unidade}
                            onValueChange={(v) => patchItem(i.key, { unidade: v })}
                          >
                            <SelectTrigger className="h-10 w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIDADES.map((u) => (
                                <SelectItem key={u} value={u}>
                                  {u}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Input
                          value={i.justificativa}
                          onChange={(e) => patchItem(i.key, { justificativa: e.target.value })}
                          placeholder="Justificativa / onde será aplicado"
                          className="mt-2 h-10"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </GlassCard>

              <GlassCard className="min-w-0 p-4">
                <h3 className="mb-3 font-display text-lg font-bold">Dados da solicitação</h3>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <Label>Solicitante *</Label>
                    <Input
                      className="mt-1 h-11"
                      value={form.solicitante}
                      onChange={(e) => setForm({ ...form, solicitante: e.target.value })}
                      placeholder="Seu nome"
                    />
                  </div>
                  <div className="min-w-0">
                    <Label>Setor / equipe</Label>
                    <Input
                      className="mt-1 h-11"
                      value={form.setor}
                      onChange={(e) => setForm({ ...form, setor: e.target.value })}
                      placeholder="Ex.: Refrigeração"
                    />
                  </div>
                  <div className="min-w-0">
                    <Label>Centro de custo</Label>
                    <Input
                      className="mt-1 h-11"
                      value={form.centroCusto}
                      onChange={(e) => setForm({ ...form, centroCusto: e.target.value })}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label>Prioridade</Label>
                    <Select
                      value={form.prioridade}
                      onValueChange={(v) => setForm({ ...form, prioridade: v as Prioridade })}
                    >
                      <SelectTrigger className="mt-1 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRIORIDADE_LABEL) as Prioridade[]).map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORIDADE_LABEL[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Label>Prédio</Label>
                    <Input
                      className="mt-1 h-11"
                      value={form.predio}
                      onChange={(e) => setForm({ ...form, predio: e.target.value })}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label>Local / andar</Label>
                    <Input
                      className="mt-1 h-11"
                      value={form.local}
                      onChange={(e) => setForm({ ...form, local: e.target.value })}
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <Label>Observações</Label>
                    <Textarea
                      className="mt-1"
                      rows={3}
                      value={form.observacao}
                      onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                      placeholder="Informações adicionais para o Suprimentos"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="h-12 flex-1"
                    onClick={() => void salvar("enviada")}
                    loading={salvando}
                  >
                    {salvando ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Enviar e gerar planilha
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 flex-1"
                    onClick={() => void salvar("rascunho")}
                    loading={salvando}
                  >
                    Salvar rascunho
                  </Button>
                </div>
              </GlassCard>
            </div>
          </div>
        </TabsContent>

        {/* --------------------------- Histórico --------------------------- */}
        <TabsContent value="historico" className="mt-4">
          <GlassCard className="min-w-0 p-4">
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <h3 className="min-w-0 truncate font-display text-lg font-bold">
                Minhas solicitações
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={async () => {
                  if (solicitacoes.length === 0) {
                    toast.warning("Nenhuma solicitação registrada.");
                    return;
                  }
                  const blob = await exportHistoricoSolicitacoes(solicitacoes);
                  downloadBlob(blob, "historico-solicitacoes-materiais.xlsx");
                }}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Exportar tudo
              </Button>
            </div>

            {solicitacoes.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Você ainda não registrou solicitações de materiais.
              </div>
            ) : (
              <ul className="min-w-0 space-y-2">
                {solicitacoes.map((s) => (
                  <li
                    key={s.id}
                    className="min-w-0 overflow-hidden rounded-xl border bg-background/50 p-3"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => setDetalhe(s)}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="font-mono font-bold">{s.numero}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${statusTone[s.status]}`}
                          >
                            {STATUS_LABEL[s.status]}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${prioridadeTone[s.prioridade]}`}
                          >
                            {PRIORIDADE_LABEL[s.prioridade]}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                          {s.itens.length} item(ns) · {s.solicitante} ·{" "}
                          {fmt(s.enviada_em ?? s.created_at)}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          aria-label="Exportar planilha"
                          onClick={() => void exportarSolicitacao(s)}
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                        </Button>
                        {s.status === "rascunho" && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-primary"
                              aria-label="Enviar solicitação"
                              onClick={async () => {
                                try {
                                  await enviarSolicitacao(s.id);
                                  await load();
                                  toast.success(`Solicitação ${s.numero} enviada.`);
                                } catch (e: any) {
                                  toast.error(e?.message ?? "Falha ao enviar.");
                                }
                              }}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-rose-600"
                              aria-label="Excluir rascunho"
                              onClick={async () => {
                                try {
                                  await excluirSolicitacao(s.id);
                                  await load();
                                  toast.success("Rascunho excluído.");
                                } catch (e: any) {
                                  toast.error(e?.message ?? "Falha ao excluir.");
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>

      {/* Material fora do catálogo */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md p-4 sm:w-full sm:p-6">
          <DialogHeader>
            <DialogTitle>Material fora do catálogo</DialogTitle>
            <DialogDescription>
              Descreva o material com o máximo de detalhes para o Suprimentos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descrição *</Label>
              <Input
                className="mt-1 h-11"
                value={manual.descricao}
                onChange={(e) => setManual({ ...manual, descricao: e.target.value })}
                placeholder="Ex.: Registro de gaveta 3/4 bruto"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <Label>Código</Label>
                <Input
                  className="mt-1 h-11"
                  value={manual.codigo}
                  onChange={(e) => setManual({ ...manual, codigo: e.target.value })}
                />
              </div>
              <div>
                <Label>Unidade</Label>
                <Select
                  value={manual.unidade}
                  onValueChange={(v) => setManual({ ...manual, unidade: v })}
                >
                  <SelectTrigger className="mt-1 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Qtd.</Label>
                <Input
                  className="mt-1 h-11"
                  inputMode="decimal"
                  value={String(manual.quantidade)}
                  onChange={(e) =>
                    setManual({
                      ...manual,
                      quantidade: Number(e.target.value.replace(",", ".")) || 0,
                    })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addManual}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe da solicitação */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto overflow-x-hidden p-4 sm:w-full sm:p-6">
          <DialogHeader className="min-w-0">
            <DialogTitle className="break-words [overflow-wrap:anywhere]">
              {detalhe?.numero}
            </DialogTitle>
            <DialogDescription>
              {detalhe ? `${detalhe.solicitante} · ${fmt(detalhe.created_at)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detalhe && (
            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/30 p-3 text-xs min-[380px]:grid-cols-2">
                <Info label="Setor" value={detalhe.setor ?? "—"} />
                <Info label="Centro de custo" value={detalhe.centro_custo ?? "—"} />
                <Info label="Prédio" value={detalhe.predio ?? "—"} />
                <Info label="Local" value={detalhe.local ?? "—"} />
                <Info label="Prioridade" value={PRIORIDADE_LABEL[detalhe.prioridade]} />
                <Info label="Situação" value={STATUS_LABEL[detalhe.status]} />
              </div>
              {detalhe.observacao && (
                <p className="text-sm break-words [overflow-wrap:anywhere] text-muted-foreground">
                  {detalhe.observacao}
                </p>
              )}
              <ul className="min-w-0 space-y-2">
                {detalhe.itens.map((i) => (
                  <li key={i.id} className="min-w-0 rounded-lg border bg-background/40 p-3 text-sm">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium break-words [overflow-wrap:anywhere]">
                        {i.descricao}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {i.quantidade} {i.unidade}
                      </Badge>
                      {i.codigo && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {i.codigo}
                        </Badge>
                      )}
                    </div>
                    {i.justificativa && (
                      <p className="mt-1 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                        {i.justificativa}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => detalhe && void exportarSolicitacao(detalhe)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar planilha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="break-words [overflow-wrap:anywhere] text-sm">{value}</div>
    </div>
  );
}
