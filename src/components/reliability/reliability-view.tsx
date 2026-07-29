import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  AlertOctagon,
  ClipboardList,
  HeartPulse,
  Plus,
  Save,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  aggregateByAsset,
  fetchActions,
  fetchAnalyses,
  fetchCriticality,
  fetchFailures,
  ISHIKAWA_KEYS,
  ISHIKAWA_LABEL,
  pareto,
  type AssetCriticality,
  type RcaAnalysis,
} from "@/features/reliability/data";

const healthTone = (v: number | null) =>
  v == null
    ? "text-muted-foreground"
    : v >= 75
      ? "text-emerald-400"
      : v >= 50
        ? "text-amber-400"
        : "text-destructive";

export function ReliabilityView() {
  const qc = useQueryClient();
  const failuresQ = useQuery({ queryKey: ["reliability-failures"], queryFn: fetchFailures });
  const critQ = useQuery({ queryKey: ["asset-criticality"], queryFn: fetchCriticality });
  const analysesQ = useQuery({ queryKey: ["rca-analyses"], queryFn: fetchAnalyses });
  const actionsQ = useQuery({ queryKey: ["rca-actions"], queryFn: fetchActions });

  const assets = useMemo(
    () => aggregateByAsset(failuresQ.data ?? [], critQ.data ?? []),
    [failuresQ.data, critQ.data],
  );
  const paretoAtivos = useMemo(
    () => pareto(assets.slice(0, 15).map((a) => ({ label: a.ativo, value: a.falhas }))),
    [assets],
  );
  const paretoModos = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of failuresQ.data ?? []) {
      const modo = (f.titulo.split("-")[0] || f.titulo || "Não informado").trim().slice(0, 40);
      map.set(modo, (map.get(modo) ?? 0) + 1);
    }
    return pareto(Array.from(map, ([label, value]) => ({ label, value }))).slice(0, 12);
  }, [failuresQ.data]);

  const comMtbf = assets.filter((a) => a.mtbfDias != null);
  const comMttr = assets.filter((a) => a.mttrHoras != null);
  const mtbfGeral = comMtbf.length
    ? comMtbf.reduce((s, a) => s + (a.mtbfDias ?? 0), 0) / comMtbf.length
    : null;
  const mttrGeral = comMttr.length
    ? comMttr.reduce((s, a) => s + (a.mttrHoras ?? 0), 0) / comMttr.length
    : null;

  // --- Criticidade -------------------------------------------------------
  const [critEdit, setCritEdit] = useState<Partial<AssetCriticality> | null>(null);
  async function saveCrit() {
    if (!critEdit?.asset_code?.trim()) return toast.error("Informe o código do ativo.");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("asset_criticality").upsert(
      {
        asset_code: critEdit.asset_code.trim().toUpperCase(),
        asset_name: critEdit.asset_name ?? null,
        classe_abc: (critEdit.classe_abc ?? "C") as "A" | "B" | "C",
        impacto_seguranca: critEdit.impacto_seguranca ?? 0,
        impacto_operacional: critEdit.impacto_operacional ?? 0,
        impacto_ambiental: critEdit.impacto_ambiental ?? 0,
        redundancia: critEdit.redundancia ?? false,
        custo_parada_hora: critEdit.custo_parada_hora ?? null,
        lead_time_dias: critEdit.lead_time_dias ?? null,
        proxima_preventiva: critEdit.proxima_preventiva || null,
        observacao: critEdit.observacao ?? null,
        updated_by: u.user?.id ?? null,
      },
      { onConflict: "asset_code" },
    );
    if (error) return toast.error(error.message);
    toast.success("Criticidade salva.");
    setCritEdit(null);
    qc.invalidateQueries({ queryKey: ["asset-criticality"] });
  }

  // --- RCA ---------------------------------------------------------------
  const [rca, setRca] = useState<Partial<RcaAnalysis> | null>(null);
  const [novaAcao, setNovaAcao] = useState({ acao: "", responsavel: "", prazo: "" });

  async function saveRca() {
    if (!rca?.titulo?.trim()) return toast.error("Informe o título da análise.");
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      titulo: rca.titulo.trim(),
      asset_code: rca.asset_code ?? null,
      modo_falha: rca.modo_falha ?? null,
      porques: (rca.porques ?? []) as never,
      ishikawa: (rca.ishikawa ?? {}) as never,
      causa_raiz: rca.causa_raiz ?? null,
      status: rca.status ?? "aberta",
      eficacia_validada: rca.eficacia_validada ?? false,
      eficacia_observacao: rca.eficacia_observacao ?? null,
    };
    const { error } = rca.id
      ? await supabase.from("rca_analyses").update(payload).eq("id", rca.id)
      : await supabase.from("rca_analyses").insert({ ...payload, created_by: u.user?.id });
    if (error) return toast.error(error.message);
    toast.success("Análise salva.");
    setRca(null);
    qc.invalidateQueries({ queryKey: ["rca-analyses"] });
  }

  async function addAcao(analysisId: string) {
    if (!novaAcao.acao.trim()) return toast.error("Descreva a ação.");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("rca_actions").insert({
      analysis_id: analysisId,
      acao: novaAcao.acao.trim(),
      responsavel: novaAcao.responsavel || null,
      prazo: novaAcao.prazo || null,
      created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    setNovaAcao({ acao: "", responsavel: "", prazo: "" });
    qc.invalidateQueries({ queryKey: ["rca-actions"] });
  }

  async function toggleAcao(id: string, status: string) {
    await supabase.from("rca_actions").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["rca-actions"] });
  }

  return (
    <PageShell
      eyebrow="Ativos e Confiabilidade"
      title="Confiabilidade e Causa Raiz"
      description="Falhas reincidentes, Pareto por ativo e modo de falha, MTBF, MTTR, saúde de ativos, 5 Porquês, Ishikawa e planos de ação com validação de eficácia."
      actions={
        <Button onClick={() => setRca({ porques: ["", "", "", "", ""], ishikawa: {} })}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova análise
        </Button>
      }
    >
      <Tabs defaultValue="indicadores" className="space-y-5">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          <TabsTrigger value="saude">Saúde de ativos</TabsTrigger>
          <TabsTrigger value="criticidade">Criticidade</TabsTrigger>
          <TabsTrigger value="rca">Causa raiz</TabsTrigger>
        </TabsList>

        <TabsContent value="indicadores" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <GlassCard variant="block">
              <div className="text-eyebrow">MTBF médio</div>
              <div className="mt-1 text-2xl font-bold">
                {mtbfGeral != null ? `${mtbfGeral.toFixed(1)} d` : "dados insuficientes"}
              </div>
            </GlassCard>
            <GlassCard variant="block">
              <div className="text-eyebrow">MTTR médio</div>
              <div className="mt-1 text-2xl font-bold">
                {mttrGeral != null ? `${mttrGeral.toFixed(1)} h` : "dados insuficientes"}
              </div>
            </GlassCard>
            <GlassCard variant="block">
              <div className="text-eyebrow">Ativos reincidentes</div>
              <div className="mt-1 text-2xl font-bold">
                {assets.filter((a) => a.reincidente).length}
              </div>
            </GlassCard>
            <GlassCard variant="block">
              <div className="text-eyebrow">Falhas registradas</div>
              <div className="mt-1 text-2xl font-bold">{failuresQ.data?.length ?? 0}</div>
            </GlassCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard className="space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertOctagon className="h-4 w-4 text-primary" /> Pareto por ativo
              </div>
              {paretoAtivos.map((p) => (
                <div key={p.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="truncate">{p.label}</span>
                    <span className="text-muted-foreground">
                      {p.value} · {p.acumulado}%
                    </span>
                  </div>
                  <Progress value={(p.value / (paretoAtivos[0]?.value || 1)) * 100} className="h-1.5" />
                </div>
              ))}
              {paretoAtivos.length === 0 && (
                <p className="text-sm text-muted-foreground">Dados insuficientes.</p>
              )}
            </GlassCard>

            <GlassCard className="space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <Activity className="h-4 w-4 text-primary" /> Pareto por modo de falha
              </div>
              {paretoModos.map((p) => (
                <div key={p.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="truncate">{p.label}</span>
                    <span className="text-muted-foreground">
                      {p.value} · {p.acumulado}%
                    </span>
                  </div>
                  <Progress value={(p.value / (paretoModos[0]?.value || 1)) * 100} className="h-1.5" />
                </div>
              ))}
              {paretoModos.length === 0 && (
                <p className="text-sm text-muted-foreground">Dados insuficientes.</p>
              )}
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="saude">
          <GlassCard className="overflow-x-auto">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <HeartPulse className="h-4 w-4 text-primary" /> Top ativos críticos
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Falhas</TableHead>
                  <TableHead className="text-right">MTBF</TableHead>
                  <TableHead className="text-right">MTTR</TableHead>
                  <TableHead>Última falha</TableHead>
                  <TableHead>Tendência</TableHead>
                  <TableHead className="text-right">Saúde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.slice(0, 60).map((a) => (
                  <TableRow key={a.ativo}>
                    <TableCell className="font-medium">
                      {a.ativo}
                      {a.reincidente && (
                        <Badge className="ml-2 border-amber-500/40 bg-amber-500/10 text-amber-300">
                          reincidente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{a.falhas}</TableCell>
                    <TableCell className="text-right">
                      {a.mtbfDias != null ? `${a.mtbfDias.toFixed(1)} d` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.mttrHoras != null ? `${a.mttrHoras.toFixed(1)} h` : "—"}
                    </TableCell>
                    <TableCell>
                      {a.ultimaFalha ? new Date(a.ultimaFalha).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      {a.tendencia === "melhorando" && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <TrendingUp className="h-3.5 w-3.5" /> melhorando
                        </span>
                      )}
                      {a.tendencia === "piorando" && (
                        <span className="flex items-center gap-1 text-destructive">
                          <TrendingDown className="h-3.5 w-3.5" /> piorando
                        </span>
                      )}
                      {a.tendencia === "estavel" && <span className="text-muted-foreground">estável</span>}
                      {a.tendencia === "sem_dados" && (
                        <span className="text-muted-foreground">dados insuficientes</span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${healthTone(a.saude)}`}>
                      {a.saude != null ? a.saude : "dados insuficientes"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {assets.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ainda não há ordens suficientes para calcular saúde de ativos.
              </p>
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="criticidade" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setCritEdit({ classe_abc: "C" })}>
              <Plus className="mr-1.5 h-4 w-4" /> Classificar ativo
            </Button>
          </div>
          <GlassCard className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead>ABC</TableHead>
                  <TableHead className="text-right">Seg.</TableHead>
                  <TableHead className="text-right">Oper.</TableHead>
                  <TableHead className="text-right">Amb.</TableHead>
                  <TableHead>Redundância</TableHead>
                  <TableHead className="text-right">Custo parada/h</TableHead>
                  <TableHead>Próx. preventiva</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(critQ.data ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.asset_code}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.classe_abc}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.impacto_seguranca}</TableCell>
                    <TableCell className="text-right">{c.impacto_operacional}</TableCell>
                    <TableCell className="text-right">{c.impacto_ambiental}</TableCell>
                    <TableCell>{c.redundancia ? "Sim" : "Não"}</TableCell>
                    <TableCell className="text-right">
                      {c.custo_parada_hora != null
                        ? c.custo_parada_hora.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </TableCell>
                    <TableCell>{c.proxima_preventiva ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setCritEdit(c)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(critQ.data ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum ativo classificado ainda.
              </p>
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="rca" className="space-y-4">
          {(analysesQ.data ?? []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-muted-foreground">Nenhuma análise registrada.</p>
            </GlassCard>
          )}
          {(analysesQ.data ?? []).map((a) => {
            const acoes = (actionsQ.data ?? []).filter((x) => x.analysis_id === a.id);
            return (
              <GlassCard key={a.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{a.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.asset_code ?? "sem ativo"} · {a.modo_falha ?? "modo não informado"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{a.status}</Badge>
                    {a.eficacia_validada && (
                      <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                        eficácia validada
                      </Badge>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setRca(a)}>
                      Editar
                    </Button>
                  </div>
                </div>
                {a.causa_raiz && (
                  <p className="rounded-lg border border-border/50 bg-card/40 p-2 text-sm">
                    <strong>Causa raiz:</strong> {a.causa_raiz}
                  </p>
                )}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ClipboardList className="h-4 w-4" /> Plano de ação
                  </div>
                  {acoes.map((ac) => (
                    <div key={ac.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 p-2 text-sm">
                      <span>{ac.acao}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {ac.responsavel ?? "sem responsável"} · {ac.prazo ?? "sem prazo"}
                        <Select value={ac.status} onValueChange={(v) => toggleAcao(ac.id, v)}>
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendente">Pendente</SelectItem>
                            <SelectItem value="em_andamento">Em andamento</SelectItem>
                            <SelectItem value="concluida">Concluída</SelectItem>
                            <SelectItem value="cancelada">Cancelada</SelectItem>
                          </SelectContent>
                        </Select>
                      </span>
                    </div>
                  ))}
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Input
                      className="sm:col-span-2"
                      placeholder="Nova ação"
                      value={novaAcao.acao}
                      onChange={(e) => setNovaAcao({ ...novaAcao, acao: e.target.value })}
                    />
                    <Input
                      placeholder="Responsável"
                      value={novaAcao.responsavel}
                      onChange={(e) => setNovaAcao({ ...novaAcao, responsavel: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={novaAcao.prazo}
                        onChange={(e) => setNovaAcao({ ...novaAcao, prazo: e.target.value })}
                      />
                      <Button size="icon" onClick={() => addAcao(a.id)} aria-label="Adicionar ação">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Criticidade */}
      <Dialog open={!!critEdit} onOpenChange={(o) => !o && setCritEdit(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criticidade do ativo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Código do ativo</Label>
              <Input
                value={critEdit?.asset_code ?? ""}
                onChange={(e) => setCritEdit({ ...critEdit, asset_code: e.target.value })}
              />
            </div>
            <div>
              <Label>Classe ABC</Label>
              <Select
                value={critEdit?.classe_abc ?? "C"}
                onValueChange={(v) => setCritEdit({ ...critEdit, classe_abc: v as "A" | "B" | "C" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — crítico</SelectItem>
                  <SelectItem value="B">B — importante</SelectItem>
                  <SelectItem value="C">C — comum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(
              [
                ["impacto_seguranca", "Impacto em segurança (0-5)"],
                ["impacto_operacional", "Impacto operacional (0-5)"],
                ["impacto_ambiental", "Impacto ambiental (0-5)"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <Label>{label}</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={critEdit?.[k] ?? 0}
                  onChange={(e) => setCritEdit({ ...critEdit, [k]: Number(e.target.value) })}
                />
              </div>
            ))}
            <div>
              <Label>Custo de parada por hora (R$)</Label>
              <Input
                type="number"
                value={critEdit?.custo_parada_hora ?? ""}
                onChange={(e) =>
                  setCritEdit({ ...critEdit, custo_parada_hora: Number(e.target.value) || null })
                }
              />
            </div>
            <div>
              <Label>Lead time (dias)</Label>
              <Input
                type="number"
                value={critEdit?.lead_time_dias ?? ""}
                onChange={(e) =>
                  setCritEdit({ ...critEdit, lead_time_dias: Number(e.target.value) || null })
                }
              />
            </div>
            <div>
              <Label>Próxima preventiva</Label>
              <Input
                type="date"
                value={critEdit?.proxima_preventiva ?? ""}
                onChange={(e) => setCritEdit({ ...critEdit, proxima_preventiva: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={critEdit?.redundancia ?? false}
                onCheckedChange={(v) => setCritEdit({ ...critEdit, redundancia: v })}
              />
              <Label>Possui redundância</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveCrit}>
              <Save className="mr-1.5 h-4 w-4" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RCA */}
      <Dialog open={!!rca} onOpenChange={(o) => !o && setRca(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Análise de causa raiz</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input
                value={rca?.titulo ?? ""}
                onChange={(e) => setRca({ ...rca, titulo: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Ativo</Label>
                <Input
                  value={rca?.asset_code ?? ""}
                  onChange={(e) => setRca({ ...rca, asset_code: e.target.value })}
                />
              </div>
              <div>
                <Label>Modo de falha</Label>
                <Input
                  value={rca?.modo_falha ?? ""}
                  onChange={(e) => setRca({ ...rca, modo_falha: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>5 Porquês</Label>
              {Array.from({ length: 5 }, (_, i) => (
                <Input
                  key={i}
                  placeholder={`Por quê? ${i + 1}`}
                  value={rca?.porques?.[i] ?? ""}
                  onChange={(e) => {
                    const arr = [...(rca?.porques ?? ["", "", "", "", ""])];
                    arr[i] = e.target.value;
                    setRca({ ...rca, porques: arr });
                  }}
                />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ISHIKAWA_KEYS.map((k) => (
                <div key={k}>
                  <Label>{ISHIKAWA_LABEL[k]}</Label>
                  <Input
                    value={rca?.ishikawa?.[k] ?? ""}
                    onChange={(e) =>
                      setRca({ ...rca, ishikawa: { ...(rca?.ishikawa ?? {}), [k]: e.target.value } })
                    }
                  />
                </div>
              ))}
            </div>
            <div>
              <Label>Causa raiz</Label>
              <Textarea
                value={rca?.causa_raiz ?? ""}
                onChange={(e) => setRca({ ...rca, causa_raiz: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Status</Label>
                <Select
                  value={rca?.status ?? "aberta"}
                  onValueChange={(v) => setRca({ ...rca, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_analise">Em análise</SelectItem>
                    <SelectItem value="plano_definido">Plano definido</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={rca?.eficacia_validada ?? false}
                  onCheckedChange={(v) => setRca({ ...rca, eficacia_validada: v })}
                />
                <Label>Eficácia validada</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveRca}>
              <Save className="mr-1.5 h-4 w-4" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
