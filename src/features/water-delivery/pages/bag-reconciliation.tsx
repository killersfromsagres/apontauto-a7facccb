import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  PackageX,
  Plus,
  Scale,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
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
import { EmptyState, KpiCard } from "@/components/pcm";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { hojeISO, listPontos, listVisitas, pontoLabel } from "@/features/water-delivery/queries/api";
import {
  BAG_MOVIMENTO_LABEL,
  calcularAlertas,
  listBagMovimentos,
  listBagTipos,
  registrarMovimento,
  salvarBagTipo,
  type BagMovimentoTipo,
  type BagTipo,
} from "@/features/water-delivery/queries/bags";


function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MOVIMENTOS: BagMovimentoTipo[] = [
  "carga_rota",
  "entrega",
  "recolhimento_vazia",
  "retorno",
  "perda",
  "avaria",
  "ajuste",
  "entrada_fornecedor",
];

export function BagReconciliation() {
  const [de, setDe] = useState(diasAtras(29));
  const [ate, setAte] = useState(hojeISO());
  const qc = useQueryClient();

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", de, ate],
    queryFn: () => listVisitas(de, ate),
  });
  const tipos = useQuery({ queryKey: ["agua", "bag-tipos"], queryFn: listBagTipos });
  const movimentos = useQuery({
    queryKey: ["agua", "bag-movimentos", de, ate],
    queryFn: () => listBagMovimentos(de, ate),
  });
  const rotas = useQuery({
    queryKey: ["agua", "rotas-divergencia", de, ate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("agua_rotas")
        .select("id,data,divergencia_bags,bags_danificadas")
        .gte("data", de)
        .lte("data", ate);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        data: string;
        divergencia_bags: number | null;
        bags_danificadas: number | null;
      }[];
    },
  });

  const porId = useMemo(() => new Map((pontos.data ?? []).map((p) => [p.id, p])), [pontos.data]);

  const linhas = useMemo(() => {
    const acc = new Map<string, { previstas: number; entregues: number; visitas: number }>();
    for (const v of visitas.data ?? []) {
      const cur = acc.get(v.ponto_id) ?? { previstas: 0, entregues: 0, visitas: 0 };
      cur.previstas += v.bags_previstas ?? 0;
      cur.entregues += v.bags_entregues ?? 0;
      cur.visitas += 1;
      acc.set(v.ponto_id, cur);
    }
    return [...acc.entries()]
      .map(([id, t]) => ({
        id,
        nome: porId.get(id) ? pontoLabel(porId.get(id)!) : "Ponto removido",
        ...t,
        saldo: t.entregues - t.previstas,
      }))
      .sort((a, b) => a.saldo - b.saldo);
  }, [visitas.data, porId]);

  const totais = useMemo(
    () =>
      linhas.reduce(
        (a, l) => ({
          previstas: a.previstas + l.previstas,
          entregues: a.entregues + l.entregues,
          deficit: a.deficit + Math.max(0, l.previstas - l.entregues),
        }),
        { previstas: 0, entregues: 0, deficit: 0 },
      ),
    [linhas],
  );

  const alertas = useMemo(
    () =>
      calcularAlertas({
        tipos: tipos.data ?? [],
        movimentos: movimentos.data ?? [],
        visitas: (visitas.data ?? []).map((v) => ({
          ponto_id: v.ponto_id,
          nome: porId.get(v.ponto_id) ? pontoLabel(porId.get(v.ponto_id)!) : "Ponto removido",
          bags_previstas: v.bags_previstas ?? 0,
          bags_entregues: v.bags_entregues ?? null,
          status: v.status,
        })),
        rotas: rotas.data ?? [],
      }),
    [tipos.data, movimentos.data, visitas.data, rotas.data, porId],
  );

  const cobertura = totais.previstas
    ? Math.round((totais.entregues / totais.previstas) * 100)
    : 0;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["agua", "bag-tipos"] });
    void qc.invalidateQueries({ queryKey: ["agua", "bag-movimentos"] });
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="bags-de">De</Label>
            <Input id="bags-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bags-ate">Até</Label>
            <Input id="bags-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">
            Saldo = bags entregues menos bags previstas no período.
          </p>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Bags previstas"
          value={totais.previstas}
          icon={<Scale className="h-4 w-4" />}
        />
        <KpiCard
          label="Bags entregues"
          value={totais.entregues}
          icon={<PackageCheck className="h-4 w-4" />}
        />
        <KpiCard
          label="Déficit acumulado"
          value={totais.deficit}
          icon={<PackageMinus className="h-4 w-4" />}
        />
        <KpiCard
          label="Cobertura"
          value={`${cobertura}%`}
          icon={<PackageX className="h-4 w-4" />}
        />
      </div>

      <Tabs defaultValue="estoque">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="movimentos">Movimentações</TabsTrigger>
          <TabsTrigger value="alertas">
            Alertas{alertas.length ? ` (${alertas.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="pontos">Por ponto</TabsTrigger>
        </TabsList>

        <TabsContent value="estoque" className="mt-4">
          <EstoqueTab tipos={tipos.data ?? []} loading={tipos.isLoading} onSaved={invalidate} />
        </TabsContent>

        <TabsContent value="movimentos" className="mt-4">
          <MovimentosTab
            tipos={tipos.data ?? []}
            movimentos={movimentos.data ?? []}
            loading={movimentos.isLoading}
            onSaved={invalidate}
          />
        </TabsContent>

        <TabsContent value="alertas" className="mt-4 space-y-2">
          {alertas.length === 0 ? (
            <EmptyState
              title="Nenhum alerta no período"
              description="Estoques dentro do mínimo e nenhuma divergência relevante encontrada."
            />
          ) : (
            alertas.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "rounded-2xl border bg-card/40 p-3",
                  a.severidade === "alta"
                    ? "border-rose-400/40"
                    : a.severidade === "media"
                      ? "border-amber-400/40"
                      : "border-border/50",
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      a.severidade === "alta"
                        ? "text-rose-300"
                        : a.severidade === "media"
                          ? "text-amber-300"
                          : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{a.titulo}</p>
                    <p className="text-xs text-muted-foreground">{a.detalhe}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="pontos" className="mt-4">
          {visitas.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <EmptyState
              title="Sem movimentação de bags"
              description="Nenhuma visita registrada no período selecionado."
            />
          ) : (
            <div className="space-y-2">
              {linhas.map((l) => {
                const pct = l.previstas ? Math.min(100, (l.entregues / l.previstas) * 100) : 0;
                return (
                  <div key={l.id} className="rounded-2xl border border-border/50 bg-card/40 p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <p className="truncate text-sm font-semibold">{l.nome}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
                          l.saldo < 0
                            ? "border-rose-400/40 text-rose-300"
                            : "border-emerald-400/40 text-emerald-300",
                        )}
                      >
                        {l.saldo > 0 ? `+${l.saldo}` : l.saldo}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-primary/80 transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {l.entregues}/{l.previstas} bags · {l.visitas} visita(s)
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------ estoque

function EstoqueTab({
  tipos,
  loading,
  onSaved,
}: {
  tipos: BagTipo[];
  loading: boolean;
  onSaved: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [edicao, setEdicao] = useState<BagTipo | null>(null);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        size="sm"
        onClick={() => {
          setEdicao(null);
          setAberto(true);
        }}
      >
        <Plus className="mr-1.5 h-4 w-4" /> Novo tipo de bag
      </Button>

      {tipos.length === 0 ? (
        <EmptyState
          title="Nenhum tipo de bag cadastrado"
          description="Cadastre capacidade, estoque mínimo e local de armazenamento."
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tipos.map((t) => {
            const critico = t.estoque_atual < t.estoque_minimo;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setEdicao(t);
                  setAberto(true);
                }}
                className={cn(
                  "rounded-2xl border bg-card/40 p-3 text-left transition-colors hover:bg-card/70",
                  critico ? "border-rose-400/40" : "border-border/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{t.nome}</p>
                  <span className="shrink-0 rounded-full border border-border/50 px-2 py-0.5 text-[11px]">
                    {t.codigo}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.capacidade_label ?? "—"} · {t.local_armazenamento ?? "sem local"}
                  {t.fornecedor ? ` · ${t.fornecedor}` : ""}
                </p>
                <p
                  className={cn(
                    "mt-2 text-sm tabular-nums",
                    critico ? "text-rose-300" : "text-emerald-300",
                  )}
                >
                  {t.estoque_atual} {t.unidade}{" "}
                  <span className="text-xs text-muted-foreground">
                    (mín. {t.estoque_minimo}){t.ativo ? "" : " · inativo"}
                  </span>
                </p>
              </button>
            );
          })}
        </div>
      )}

      <BagTipoDialog
        aberto={aberto}
        tipo={edicao}
        onOpenChange={setAberto}
        onSaved={() => {
          setAberto(false);
          onSaved();
        }}
      />
    </div>
  );
}

function BagTipoDialog({
  aberto,
  tipo,
  onOpenChange,
  onSaved,
}: {
  aberto: boolean;
  tipo: BagTipo | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => vazio(tipo));

  // Reinicia o formulário quando o diálogo abre com outro registro.
  const chave = `${aberto}-${tipo?.id ?? "novo"}`;
  const [chaveAtual, setChaveAtual] = useState(chave);
  if (chave !== chaveAtual) {
    setChaveAtual(chave);
    setForm(vazio(tipo));
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarBagTipo(tipo?.id ?? null, {
        codigo: form.codigo.trim().toUpperCase(),
        nome: form.nome.trim(),
        capacidade_label: form.capacidade_label.trim() || null,
        capacidade_litros: form.capacidade_litros ? Number(form.capacidade_litros) : null,
        unidade: form.unidade.trim() || "un",
        estoque_minimo: Number(form.estoque_minimo) || 0,
        local_armazenamento: form.local_armazenamento.trim() || null,
        fornecedor: form.fornecedor.trim() || null,
        observacao: form.observacao.trim() || null,
        ativo: form.ativo,
      }),
    onSuccess: () => {
      toast.success("Tipo de bag salvo.");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar."),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tipo ? "Editar tipo de bag" : "Novo tipo de bag"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código">
            <Input
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            />
          </Field>
          <Field label="Nome">
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Capacidade (texto)">
            <Input
              value={form.capacidade_label}
              placeholder="20 L"
              onChange={(e) => setForm({ ...form, capacidade_label: e.target.value })}
            />
          </Field>
          <Field label="Capacidade (litros)">
            <Input
              type="number"
              inputMode="decimal"
              value={form.capacidade_litros}
              onChange={(e) => setForm({ ...form, capacidade_litros: e.target.value })}
            />
          </Field>
          <Field label="Unidade">
            <Input
              value={form.unidade}
              onChange={(e) => setForm({ ...form, unidade: e.target.value })}
            />
          </Field>
          <Field label="Estoque mínimo">
            <Input
              type="number"
              inputMode="numeric"
              value={form.estoque_minimo}
              onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
            />
          </Field>
          <Field label="Local de armazenamento">
            <Input
              value={form.local_armazenamento}
              onChange={(e) => setForm({ ...form, local_armazenamento: e.target.value })}
            />
          </Field>
          <Field label="Fornecedor (opcional)">
            <Input
              value={form.fornecedor}
              onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Observação">
              <Textarea
                rows={2}
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              id="bag-ativo"
              checked={form.ativo}
              onCheckedChange={(v) => setForm({ ...form, ativo: v })}
            />
            <Label htmlFor="bag-ativo">Ativo</Label>
          </div>
          {tipo ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              O estoque atual ({tipo.estoque_atual} {tipo.unidade}) só muda por movimentação — use a
              aba Movimentações para ajustes autorizados.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={!form.codigo.trim() || !form.nome.trim() || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function vazio(t: BagTipo | null) {
  return {
    codigo: t?.codigo ?? "",
    nome: t?.nome ?? "",
    capacidade_label: t?.capacidade_label ?? "",
    capacidade_litros: t?.capacidade_litros != null ? String(t.capacidade_litros) : "",
    unidade: t?.unidade ?? "un",
    estoque_minimo: String(t?.estoque_minimo ?? 0),
    local_armazenamento: t?.local_armazenamento ?? "",
    fornecedor: t?.fornecedor ?? "",
    observacao: t?.observacao ?? "",
    ativo: t?.ativo ?? true,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// -------------------------------------------------------------- movimentos

function MovimentosTab({
  tipos,
  movimentos,
  loading,
  onSaved,
}: {
  tipos: BagTipo[];
  movimentos: { id: string; tipo: BagMovimentoTipo; quantidade: number; ocorrido_em: string; motivo: string | null; bag_tipo_id: string; responsavel: string | null; veiculo: string | null }[];
  loading: boolean;
  onSaved: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipoBag, setTipoBag] = useState<string>("");
  const [movimento, setMovimento] = useState<BagMovimentoTipo>("entrada_fornecedor");
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [veiculo, setVeiculo] = useState("");

  const nomePorTipo = useMemo(() => new Map(tipos.map((t) => [t.id, t.nome])), [tipos]);

  const registrar = useMutation({
    mutationFn: () =>
      registrarMovimento({
        bagTipoId: tipoBag,
        tipo: movimento,
        quantidade: Number(quantidade),
        motivo: motivo || null,
        responsavel: responsavel || null,
        veiculo: veiculo || null,
      }),
    onSuccess: () => {
      toast.success("Movimentação registrada.");
      setAberto(false);
      setQuantidade("1");
      setMotivo("");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível registrar."),
  });

  return (
    <div className="space-y-3">
      <Button
        size="sm"
        disabled={tipos.length === 0}
        onClick={() => {
          setTipoBag(tipos[0]?.id ?? "");
          setAberto(true);
        }}
      >
        <PackagePlus className="mr-1.5 h-4 w-4" /> Nova movimentação
      </Button>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
      ) : movimentos.length === 0 ? (
        <EmptyState
          title="Nenhuma movimentação no período"
          description="Cargas de rota, entregas, perdas e ajustes aparecem aqui."
        />
      ) : (
        <div className="space-y-2">
          {movimentos.map((m) => (
            <div key={m.id} className="rounded-2xl border border-border/50 bg-card/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold">
                  {BAG_MOVIMENTO_LABEL[m.tipo]}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {nomePorTipo.get(m.bag_tipo_id) ?? "—"}
                  </span>
                </p>
                <span className="shrink-0 text-sm tabular-nums">{m.quantidade}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(m.ocorrido_em).toLocaleString("pt-BR")}
                {m.responsavel ? ` · ${m.responsavel}` : ""}
                {m.veiculo ? ` · ${m.veiculo}` : ""}
                {m.motivo ? ` · ${m.motivo}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova movimentação de bags</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo de bag">
              <Select value={tipoBag} onValueChange={setTipoBag}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Movimentação">
              <Select value={movimento} onValueChange={(v) => setMovimento(v as BagMovimentoTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVIMENTOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {BAG_MOVIMENTO_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quantidade">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </Field>
            <Field label="Responsável">
              <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
            </Field>
            <Field label="Veículo (opcional)">
              <Input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Motivo (obrigatório em perda, avaria e ajuste)">
                <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={registrar.isPending} onClick={() => registrar.mutate()}>
              <Boxes className="mr-1.5 h-4 w-4" /> Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
