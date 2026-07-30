import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FileSpreadsheet,
  FileText,
  Images,
  Printer,
  Share2,
  TriangleAlert,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, KpiCard } from "@/components/pcm";
import {
  VISITA_STATUS_LABEL,
  hojeISO,
  listFiltros,
  listPontos,
  listVisitas,
  type VisitaStatus,
} from "@/features/water-delivery/queries/api";
import { listFiltroAtivos } from "@/features/water-delivery/filters/filtros";
import { listOcorrencias } from "@/features/water-delivery/mutations/execucao";
import { listRotas } from "@/features/water-delivery/queries/programacao";
import { calcularEntrega, calcularFiltros } from "@/features/water-delivery/reports/indicadores";
import {
  compartilharResumo,
  exportarIndicadoresExcel,
  exportarPacoteEvidencias,
  exportarRelatorioDivergencia,
  exportarRelatorioFiltros,
  exportarRelatorioPredio,
  exportarRotaPdf,
  imprimirPainel,
  resumoTexto,
} from "@/features/water-delivery/reports/relatorios";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/indicadores")({
  component: Indicadores,
});

function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const STATUS_COLOR: Record<VisitaStatus, string> = {
  pendente: "var(--muted-foreground)",
  concluida: "oklch(0.72 0.16 158)",
  parcial: "oklch(0.78 0.15 80)",
  nao_realizada: "oklch(0.68 0.19 20)",
  cancelada: "var(--border)",
  em_deslocamento: "oklch(0.72 0.13 240)",
  em_atendimento: "oklch(0.76 0.14 210)",
  sem_necessidade: "oklch(0.7 0.05 250)",
  acesso_bloqueado: "oklch(0.66 0.18 30)",
  local_fechado: "oklch(0.64 0.16 350)",
  falta_bags: "oklch(0.75 0.16 60)",
  endereco_divergente: "oklch(0.7 0.15 300)",
  reprogramada: "oklch(0.74 0.12 100)",
};

function Tabela({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  }
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/40">
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1.5 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Indicadores() {
  const [de, setDe] = useState(diasAtras(29));
  const [ate, setAte] = useState(hojeISO());
  const [ocupado, setOcupado] = useState<string | null>(null);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", de, ate],
    queryFn: () => listVisitas(de, ate),
  });
  const rotas = useQuery({
    queryKey: ["agua", "rotas", de, ate],
    queryFn: () => listRotas(de, ate),
  });
  const ocorrencias = useQuery({
    queryKey: ["agua", "ocorrencias", de, ate],
    queryFn: () => listOcorrencias(de, ate),
  });
  const solicitacoes = useQuery({ queryKey: ["agua", "filtros"], queryFn: listFiltros });
  const ativosFiltro = useQuery({ queryKey: ["agua", "filtro-ativos"], queryFn: listFiltroAtivos });

  const rows = useMemo(() => visitas.data ?? [], [visitas.data]);
  const periodo = `${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}`;

  const entrega = useMemo(
    () => calcularEntrega({ visitas: rows, rotas: rotas.data ?? [], pontos: pontos.data ?? [] }),
    [rows, rotas.data, pontos.data],
  );
  const filtros = useMemo(
    () =>
      calcularFiltros({
        solicitacoes: solicitacoes.data ?? [],
        ativos: ativosFiltro.data ?? [],
      }),
    [solicitacoes.data, ativosFiltro.data],
  );

  const porStatus = useMemo(() => {
    const acc = new Map<VisitaStatus, number>();
    for (const v of rows) acc.set(v.status, (acc.get(v.status) ?? 0) + 1);
    return [...acc.entries()].map(([status, valor]) => ({
      status,
      nome: VISITA_STATUS_LABEL[status],
      valor,
    }));
  }, [rows]);

  const serieDiaria = useMemo(() => {
    const acc = new Map<string, number>();
    for (const v of rows) acc.set(v.data, (acc.get(v.data) ?? 0) + (v.bags_entregues ?? 0));
    return [...acc.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, bags]) => ({ data: data.slice(8) + "/" + data.slice(5, 7), bags }));
  }, [rows]);

  async function acao(chave: string, fn: () => Promise<unknown> | unknown, ok: string) {
    setOcupado(chave);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o arquivo.");
    } finally {
      setOcupado(null);
    }
  }

  if (visitas.isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-4" data-export-ignore="true">
        <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="ind-de">De</Label>
            <Input id="ind-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ind-ate">Até</Label>
            <Input id="ind-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>
      </GlassCard>

      <Tabs defaultValue="entrega">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="entrega">Entrega de água</TabsTrigger>
          <TabsTrigger value="filtros">Filtros</TabsTrigger>
          <TabsTrigger value="exportacoes">Exportações</TabsTrigger>
        </TabsList>

        {/* ----------------------------- 18.1 ----------------------------- */}
        <TabsContent value="entrega" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Paradas no período" value={entrega.totalParadas} />
            <KpiCard label="Taxa de conclusão" value={`${entrega.taxaConclusao}%`} />
            <KpiCard label="Bags entregues" value={entrega.bagsEntregues} />
            <KpiCard label="Média por ponto" value={entrega.mediaPorPonto} />
            <KpiCard label="Não realizadas" value={entrega.naoRealizadas} />
            <KpiCard label="Evidências faltantes" value={entrega.evidenciasFaltantes} />
            <KpiCard label="Divergências de bags" value={entrega.divergenciasBags} />
            <KpiCard label="Previsto x realizado" value={`${entrega.aderenciaPrevistoRealizado}%`} />
            <KpiCard label="Tempo médio/parada" value={`${entrega.tempoMedioParadaMin} min`} />
            <KpiCard label="Duração média/rota" value={`${entrega.duracaoMediaRotaMin} min`} />
            <KpiCard label="Quilometragem" value={`${entrega.kmTotal} km`} />
            <KpiCard label="Bags recolhidas" value={entrega.bagsRecolhidas} />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="Sem dados no período"
              description="Ajuste as datas ou registre execuções na Rota do Dia."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Cumprimento por dia da semana</h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={entrega.porDia.map((l) => ({ dia: l.chave.slice(0, 3), taxa: l.taxa }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="taxa" radius={[6, 6, 0, 0]} fill="var(--primary)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Distribuição por status</h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porStatus} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                        {porStatus.map((s) => (
                          <Cell key={s.status} fill={STATUS_COLOR[s.status]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Bags entregues por dia</h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={serieDiaria}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                      <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="bags" stroke="var(--primary)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Cumprimento por prédio</h2>
                <Tabela
                  head={["Prédio", "Paradas", "Taxa", "Bags"]}
                  rows={entrega.porPredio.slice(0, 12).map((l) => [l.chave, l.total, `${l.taxa}%`, l.bags])}
                />
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Produtividade por colaborador</h2>
                <Tabela
                  head={["Colaborador", "Paradas", "Bags", "Tempo médio", "Bags/h"]}
                  rows={entrega.porColaborador.slice(0, 12).map((l) => [
                    l.chave,
                    l.total,
                    l.bags,
                    `${l.tempoMedioParadaMin} min`,
                    l.produtividadeBagsHora,
                  ])}
                />
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Rotas — duração e quilometragem</h2>
                <Tabela
                  head={["Data", "Equipe", "Paradas", "Duração", "Km", "Diverg."]}
                  rows={entrega.rotas.slice(0, 12).map((r) => [
                    r.data.slice(8) + "/" + r.data.slice(5, 7),
                    r.equipe || "—",
                    r.paradas,
                    r.duracaoMin != null ? `${r.duracaoMin} min` : "—",
                    r.km ?? "—",
                    r.divergencia,
                  ])}
                />
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Motivos de não realização</h2>
                <Tabela
                  head={["Motivo", "Ocorrências"]}
                  rows={entrega.motivos.slice(0, 12).map((m) => [m.motivo, m.qtd])}
                />
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Reincidência de acesso bloqueado</h2>
                <Tabela
                  head={["Ponto", "Ocorrências"]}
                  rows={entrega.reincidenciaAcesso.slice(0, 10).map((r) => [r.ponto, r.qtd])}
                />
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Utilização de veículos</h2>
                <Tabela
                  head={["Veículo", "Rotas", "Km", "Paradas"]}
                  rows={entrega.porVeiculo.slice(0, 10).map((v) => [
                    v.veiculo,
                    v.rotas,
                    Math.round(v.km * 10) / 10,
                    v.paradas,
                  ])}
                />
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Consumo estimado por local</h2>
                <Tabela
                  head={["Prédio", "Pontos", "Bags", "Média/ponto"]}
                  rows={entrega.consumoPorLocal.slice(0, 12).map((c) => [
                    c.predio,
                    c.pontos,
                    c.bags,
                    c.mediaPorPonto,
                  ])}
                />
              </GlassCard>
            </div>
          )}
        </TabsContent>

        {/* ----------------------------- 18.2 ----------------------------- */}
        <TabsContent value="filtros" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Solicitações abertas" value={filtros.abertas} />
            <KpiCard label="Vencidas" value={filtros.vencidas} />
            <KpiCard label="Cumprimento de SLA" value={`${filtros.slaCumprimentoPct}%`} />
            <KpiCard label="Reincidências" value={filtros.reincidencia} />
            <KpiCard label="Tempo médio de triagem" value={`${filtros.tempoTriagemMedioH} h`} />
            <KpiCard label="Tempo médio de conclusão" value={`${filtros.tempoConclusaoMedioH} h`} />
            <KpiCard label="Preventiva x corretiva" value={`${filtros.preventivas} x ${filtros.corretivas}`} />
            <KpiCard
              label="Avaliação pós-serviço"
              value={filtros.avaliacaoMedia != null ? `${filtros.avaliacaoMedia} (${filtros.avaliacoes})` : "—"}
            />
          </div>

          {filtros.total === 0 ? (
            <EmptyState title="Sem solicitações" description="Nenhum pedido de filtro registrado até agora." />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Por prioridade</h2>
                <Tabela
                  head={["Prioridade", "Solicitações"]}
                  rows={filtros.porPrioridade.map((p) => [p.prioridade, p.qtd])}
                />
              </GlassCard>

              <GlassCard className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Quantidade por prédio</h2>
                <Tabela
                  head={["Prédio", "Solicitações", "Concluídas"]}
                  rows={filtros.porPredio.slice(0, 12).map((p) => [p.predio, p.qtd, p.concluidas])}
                />
              </GlassCard>

              <GlassCard className="space-y-3 p-4 lg:col-span-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <TriangleAlert className="size-4 text-amber-400" />
                  Filtros vencendo em até 30 dias
                </h2>
                <Tabela
                  head={["Filtro", "Próxima troca", "Dias restantes"]}
                  rows={filtros.vencendo
                    .slice(0, 15)
                    .map((v) => [
                      v.ponto,
                      v.proximaTroca.split("-").reverse().join("/"),
                      v.diasRestantes,
                    ])}
                />
              </GlassCard>

              {filtros.custoTotal != null && (
                <GlassCard className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Material consumido informado no período:{" "}
                    <span className="font-semibold text-foreground">{filtros.custoTotal}</span> unidade(s).
                  </p>
                </GlassCard>
              )}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------- 18.3 ----------------------------- */}
        <TabsContent value="exportacoes" className="space-y-4 pt-4">
          <GlassCard className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Planilhas e relatórios</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Button
                variant="outline"
                disabled={ocupado !== null}
                onClick={() =>
                  acao(
                    "excel",
                    () => exportarIndicadoresExcel({ entrega, filtros, periodo }),
                    "Planilha de indicadores gerada.",
                  )
                }
              >
                <FileSpreadsheet className="size-4" /> Excel de indicadores
              </Button>

              <Button
                variant="outline"
                disabled={ocupado !== null}
                onClick={() =>
                  acao("predio", () => exportarRelatorioPredio(entrega, periodo), "Relatório por prédio gerado.")
                }
              >
                <FileSpreadsheet className="size-4" /> Relatório por prédio
              </Button>

              <Button
                variant="outline"
                disabled={ocupado !== null}
                onClick={() =>
                  acao(
                    "diverg",
                    () =>
                      exportarRelatorioDivergencia({
                        entrega,
                        ocorrencias: ocorrencias.data ?? [],
                        periodo,
                      }),
                    "Relatório de divergências gerado.",
                  )
                }
              >
                <TriangleAlert className="size-4" /> Relatório de divergência
              </Button>

              <Button
                variant="outline"
                disabled={ocupado !== null}
                onClick={() =>
                  acao(
                    "filtros",
                    () =>
                      exportarRelatorioFiltros({
                        indicadores: filtros,
                        solicitacoes: solicitacoes.data ?? [],
                        periodo,
                      }),
                    "Relatório de filtros gerado.",
                  )
                }
              >
                <FileSpreadsheet className="size-4" /> Relatório de filtros
              </Button>

              <Button
                variant="outline"
                disabled={ocupado !== null}
                onClick={() =>
                  acao(
                    "evid",
                    () => {
                      const qtd = exportarPacoteEvidencias({
                        visitas: rows,
                        pontos: pontos.data ?? [],
                        periodo,
                      });
                      if (!qtd) throw new Error("Nenhuma evidência no período.");
                    },
                    "Pacote de evidências exportado.",
                  )
                }
              >
                <Images className="size-4" /> Pacote de evidências
              </Button>

              <Button variant="outline" onClick={imprimirPainel}>
                <Printer className="size-4" /> Imprimir painel
              </Button>

              <Button
                variant="outline"
                onClick={() =>
                  acao(
                    "share",
                    async () => {
                      const ok = await compartilharResumo(resumoTexto(entrega, filtros, periodo));
                      if (!ok) throw new Error("Compartilhamento cancelado.");
                    },
                    "Resumo compartilhado.",
                  )
                }
              >
                <Share2 className="size-4" /> Compartilhar resumo
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">PDF de rota</h2>
            <p className="text-xs text-muted-foreground">
              Inclui identidade Apont Auto, protocolo, equipe, veículo, hodômetros, bags, paradas,
              ocorrências, miniaturas das fotos, assinatura e identificador do documento.
            </p>
            {(rotas.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma rota no período selecionado.</p>
            ) : (
              <ul className="space-y-2">
                {(rotas.data ?? []).slice(0, 20).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-card/40 p-2.5"
                  >
                    <span className="min-w-0 text-sm">
                      {r.data.split("-").reverse().join("/")} · {r.turno} · {r.equipe || "sem equipe"}
                      <span className="block text-xs text-muted-foreground">
                        {r.veiculo ?? "sem veículo"} · {r.status}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={ocupado !== null}
                      onClick={() =>
                        acao(
                          `pdf-${r.id}`,
                          async () => {
                            const res = await exportarRotaPdf({
                              rota: r,
                              visitas: rows.filter((v) => v.rota_id === r.id),
                              pontos: pontos.data ?? [],
                              ocorrencias: ocorrencias.data ?? [],
                            });
                            return res;
                          },
                          "Relatório de rota gerado.",
                        )
                      }
                    >
                      <FileText className="size-4" /> PDF da rota
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
