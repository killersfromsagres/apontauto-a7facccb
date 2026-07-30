import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Droplets,
  Filter,
  Gauge,
  PackageCheck,
  PackageMinus,
  RotateCcw,
  Scale,
  Truck,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, KpiCard } from "@/components/pcm";
import { cn } from "@/lib/utils";
import {
  diaSemanaISO,
  hojeISO,
  listFiltros,
  listPontos,
  listProgramacao,
  listVisitas,
  pontoLabel,
  VISITA_STATUS_LABEL,
  type Ponto,
  type Visita,
  type VisitaStatus,
} from "@/features/water-delivery/queries/api";
import { DIA_LABEL } from "@/features/water-delivery/importer/reader";


/** Minutos considerados por parada quando não há histórico suficiente. */
const MINUTOS_PADRAO_PARADA = 12;
const TODOS = "__todos__";

function diasAtras(dias: number, base = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const brDate = (iso: string) => iso.split("-").reverse().join("/");

function hhmm(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function duracao(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

/** Select nativo — leve, acessível e confortável no toque. */
function Selecao({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full min-w-0 truncate rounded-xl border border-border/60 bg-card/60 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value={TODOS}>Todos</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Anel({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative grid size-32 shrink-0 place-items-center">
      <svg viewBox="0 0 120 120" className="size-32 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted/30" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-2xl font-bold leading-none tabular-nums">{pct}%</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">conclusão</p>
      </div>
    </div>
  );
}

function Alerta({
  tone,
  icon,
  title,
  detail,
}: {
  tone: "danger" | "warn" | "info";
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-2.5",
        tone === "danger"
          ? "border-rose-400/40 bg-rose-500/8 text-rose-200"
          : tone === "warn"
            ? "border-amber-400/40 bg-amber-500/8 text-amber-200"
            : "border-sky-400/40 bg-sky-500/8 text-sky-200",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function WaterDeliveryDashboard() {
  const hoje = hojeISO();
  const [data, setData] = useState(hoje);
  const [colaborador, setColaborador] = useState(TODOS);
  const [veiculo, setVeiculo] = useState(TODOS);
  const [predio, setPredio] = useState(TODOS);
  const [status, setStatus] = useState<string>(TODOS);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const prog = useQuery({ queryKey: ["agua", "programacao"], queryFn: listProgramacao });
  const doDiaQ = useQuery({
    queryKey: ["agua", "visitas", data, data],
    queryFn: () => listVisitas(data, data),
  });
  const periodoQ = useQuery({
    queryKey: ["agua", "visitas", diasAtras(29, new Date(`${data}T12:00:00`)), data],
    queryFn: () => listVisitas(diasAtras(29, new Date(`${data}T12:00:00`)), data),
  });
  const filtrosQ = useQuery({ queryKey: ["agua", "filtros"], queryFn: listFiltros });

  const carregando = pontos.isLoading || prog.isLoading || doDiaQ.isLoading;

  const porId = useMemo(
    () => new Map<string, Ponto>((pontos.data ?? []).map((p) => [p.id, p])),
    [pontos.data],
  );

  const resp = (v: Visita) => v.responsavel ?? porId.get(v.ponto_id)?.responsavel ?? null;
  const veic = (v: Visita) => v.veiculo ?? porId.get(v.ponto_id)?.veiculo ?? null;

  const opcoes = useMemo(() => {
    const base = doDiaQ.data ?? [];
    const uniq = (xs: (string | null | undefined)[]) =>
      [...new Set(xs.filter((x): x is string => Boolean(x && x.trim())))].sort();
    return {
      colaboradores: uniq([
        ...base.map(resp),
        ...(pontos.data ?? []).map((p) => p.responsavel),
      ]),
      veiculos: uniq([...base.map(veic), ...(pontos.data ?? []).map((p) => p.veiculo)]),
      predios: uniq((pontos.data ?? []).map((p) => p.predio)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doDiaQ.data, pontos.data, porId]);

  const filtrar = useMemo(
    () => (v: Visita) => {
      const p = porId.get(v.ponto_id);
      if (colaborador !== TODOS && resp(v) !== colaborador) return false;
      if (veiculo !== TODOS && veic(v) !== veiculo) return false;
      if (predio !== TODOS && p?.predio !== predio) return false;
      if (status !== TODOS && v.status !== status) return false;
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porId, colaborador, veiculo, predio, status],
  );

  const doDia = useMemo(() => (doDiaQ.data ?? []).filter(filtrar), [doDiaQ.data, filtrar]);
  const periodo = useMemo(
    () => (periodoQ.data ?? []).filter(filtrar),
    [periodoQ.data, filtrar],
  );

  const filtrosAtivos =
    (colaborador !== TODOS ? 1 : 0) +
    (veiculo !== TODOS ? 1 : 0) +
    (predio !== TODOS ? 1 : 0) +
    (status !== TODOS ? 1 : 0);

  const k = useMemo(() => {
    const dia = diaSemanaISO(data);
    const programados = (prog.data ?? []).filter((p) => {
      if (p.dia_semana !== dia) return false;
      const pt = porId.get(p.ponto_id);
      if (predio !== TODOS && pt?.predio !== predio) return false;
      if (colaborador !== TODOS && pt?.responsavel !== colaborador) return false;
      if (veiculo !== TODOS && pt?.veiculo !== veiculo) return false;
      return true;
    }).length;

    const por = (s: VisitaStatus) => doDia.filter((v) => v.status === s).length;
    const concluidas = por("concluida");
    const parciais = por("parcial");
    const previstos = Math.max(programados, doDia.length);
    const pct = previstos ? Math.round(((concluidas + parciais) / previstos) * 100) : 0;

    const carregadas = doDia.reduce((a, v) => a + (v.bags_previstas ?? 0), 0);
    const entregues = doDia.reduce((a, v) => a + (v.bags_entregues ?? 0), 0);
    const executadas = doDia.filter((v) => v.status === "concluida" || v.status === "parcial");
    const vazias = executadas.reduce((a, v) => a + (v.bags_entregues ?? 0), 0);
    const restantes = Math.max(0, carregadas - entregues);
    const divergencia = entregues - executadas.reduce((a, v) => a + (v.bags_previstas ?? 0), 0);

    const semFoto = executadas.filter((v) => !v.foto_url).length;

    const marcos = executadas
      .map((v) => v.executado_em)
      .filter((x): x is string => Boolean(x))
      .map((x) => new Date(x).getTime())
      .sort((a, b) => a - b);
    const realMin = marcos.length > 1 ? (marcos.at(-1)! - marcos[0]!) / 60000 : 0;
    const medioMin = marcos.length > 1 ? realMin / (marcos.length - 1) : 0;
    const estimadaMin = previstos * MINUTOS_PADRAO_PARADA;

    const abertos = (filtrosQ.data ?? []).filter(
      (f) => f.situacao === "aberta" || f.situacao === "em_atendimento",
    );
    const limite = new Date(`${data}T00:00:00`);
    limite.setDate(limite.getDate() + 7);
    const vencendo = abertos.filter(
      (f) => f.prevista_para && new Date(`${f.prevista_para}T00:00:00`) <= limite,
    ).length;

    return {
      previstos,
      concluidas,
      pendentes: por("pendente"),
      parciais,
      naoRealizadas: por("nao_realizada"),
      reprogramadas: por("cancelada"),
      pct,
      carregadas,
      entregues,
      vazias,
      restantes,
      divergencia,
      semFoto,
      medioMin,
      realMin,
      estimadaMin,
      filtrosAbertos: abertos.length,
      filtrosVencendo: vencendo,
      colaboradores: [...new Set(doDia.map(resp).filter(Boolean))] as string[],
      veiculos: [...new Set(doDia.map(veic).filter(Boolean))] as string[],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doDia, prog.data, porId, data, predio, colaborador, veiculo, filtrosQ.data]);

  const timeline = useMemo(
    () =>
      [...doDia].sort((a, b) => {
        const oa = porId.get(a.ponto_id)?.ordem ?? 999;
        const ob = porId.get(b.ponto_id)?.ordem ?? 999;
        return oa - ob;
      }),
    [doDia, porId],
  );

  const predios = useMemo(() => {
    const acc = new Map<string, { total: number; ok: number; bags: number }>();
    for (const v of doDia) {
      const nome = porId.get(v.ponto_id)?.predio ?? "Sem prédio";
      const cur = acc.get(nome) ?? { total: 0, ok: 0, bags: 0 };
      cur.total += 1;
      if (v.status === "concluida" || v.status === "parcial") cur.ok += 1;
      cur.bags += v.bags_entregues ?? 0;
      acc.set(nome, cur);
    }
    return [...acc.entries()]
      .map(([nome, t]) => ({ nome, ...t }))
      .sort((a, b) => b.total - a.total);
  }, [doDia, porId]);

  const porDiaSemana = useMemo(() => {
    const acc = new Map<number, { entregues: number; visitas: number }>();
    for (const v of periodo) {
      const cur = acc.get(v.dia_semana) ?? { entregues: 0, visitas: 0 };
      cur.entregues += v.bags_entregues ?? 0;
      cur.visitas += 1;
      acc.set(v.dia_semana, cur);
    }
    return [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      dia: DIA_LABEL[d] ?? String(d),
      ...(acc.get(d) ?? { entregues: 0, visitas: 0 }),
    }));
  }, [periodo]);

  const ranking = useMemo(() => {
    const acc = new Map<string, number>();
    for (const v of periodo) {
      const nome = porId.get(v.ponto_id) ? pontoLabel(porId.get(v.ponto_id)!) : "Ponto removido";
      acc.set(nome, (acc.get(nome) ?? 0) + (v.bags_entregues ?? 0));
    }
    return [...acc.entries()]
      .map(([nome, bags]) => ({ nome, bags }))
      .sort((a, b) => b.bags - a.bags)
      .slice(0, 8);
  }, [periodo, porId]);

  const excecoes = useMemo(
    () =>
      periodo
        .filter((v) => v.status === "nao_realizada" || v.status === "parcial")
        .sort((a, b) => (a.data < b.data ? 1 : -1))
        .slice(0, 8),
    [periodo],
  );

  const agora = new Date();
  const atrasadas = useMemo(
    () =>
      doDia.filter((v) => {
        if (v.status !== "pendente" || data !== hoje) return false;
        const fim = porId.get(v.ponto_id)?.janela_fim;
        if (!fim) return false;
        const [h, m] = fim.split(":").map(Number);
        return agora.getHours() * 60 + agora.getMinutes() > (h ?? 0) * 60 + (m ?? 0);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doDia, porId, data, hoje],
  );

  const semResponsavel = doDia.length > 0 && k.colaboradores.length === 0;

  if (carregando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros ------------------------------------------------------- */}
      <GlassCard className="p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="agua-data" className="text-[11px] text-muted-foreground">
              Data
            </Label>
            <Input
              id="agua-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value || hoje)}
              className="h-10"
            />
          </div>
          <Selecao
            id="agua-colab"
            label="Equipe / colaborador"
            value={colaborador}
            onChange={setColaborador}
            options={opcoes.colaboradores}
          />
          <Selecao
            id="agua-veic"
            label="Veículo"
            value={veiculo}
            onChange={setVeiculo}
            options={opcoes.veiculos}
          />
          <Selecao
            id="agua-predio"
            label="Prédio"
            value={predio}
            onChange={setPredio}
            options={opcoes.predios}
          />
          <div className="min-w-0 space-y-1">
            <Label htmlFor="agua-status" className="text-[11px] text-muted-foreground">
              Status
            </Label>
            <select
              id="agua-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 w-full min-w-0 truncate rounded-xl border border-border/60 bg-card/60 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value={TODOS}>Todos</option>
              {Object.entries(VISITA_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        {filtrosAtivos > 0 && (
          <button
            type="button"
            onClick={() => {
              setColaborador(TODOS);
              setVeiculo(TODOS);
              setPredio(TODOS);
              setStatus(TODOS);
            }}
            className="mt-2.5 text-xs text-primary underline-offset-2 hover:underline"
          >
            Limpar filtros ({filtrosAtivos})
          </button>
        )}
      </GlassCard>

      {/* Progresso + alertas -------------------------------------------- */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <GlassCard className="flex items-center gap-4 p-4">
          <Anel pct={k.pct} />
          <div className="min-w-0 space-y-1.5 text-sm">
            <p className="text-eyebrow">{brDate(data)} · {DIA_LABEL[diaSemanaISO(data)]}</p>
            <p className="tabular-nums">
              <span className="font-semibold">{k.concluidas + k.parciais}</span> de{" "}
              <span className="font-semibold">{k.previstos}</span> paradas atendidas
            </p>
            <p className="text-xs text-muted-foreground">
              Estimado {duracao(k.estimadaMin)} · real {duracao(k.realMin)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Veículo: {k.veiculos.join(", ") || "não informado"}
            </p>
            <Link
              to="/abastecimento/agua/rota"
              className="inline-flex items-center gap-1 text-xs text-primary"
            >
              Abrir rota do dia <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </GlassCard>

        <GlassCard className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold">Alertas operacionais</h2>
          </div>
          <div className="space-y-2">
            {atrasadas.length > 0 && (
              <Alerta
                tone="danger"
                icon={<Clock className="size-4" />}
                title={`${atrasadas.length} parada(s) atrasada(s)`}
                detail="Janela de atendimento vencida e visita ainda pendente."
              />
            )}
            {semResponsavel && (
              <Alerta
                tone="warn"
                icon={<UserRound className="size-4" />}
                title="Rota sem responsável"
                detail="Nenhuma parada do dia possui colaborador atribuído."
              />
            )}
            {k.veiculos.length === 0 && doDia.length > 0 && (
              <Alerta
                tone="warn"
                icon={<Truck className="size-4" />}
                title="Veículo não definido"
                detail="Defina o veículo da rota em Programação para liberar a execução."
              />
            )}
            {k.semFoto > 0 && (
              <Alerta
                tone="warn"
                icon={<Camera className="size-4" />}
                title={`${k.semFoto} execução(ões) sem foto`}
                detail="Evidência fotográfica obrigatória ainda não enviada."
              />
            )}
            {k.divergencia !== 0 && (
              <Alerta
                tone={k.divergencia < 0 ? "danger" : "info"}
                icon={<Scale className="size-4" />}
                title={`Divergência de bags: ${k.divergencia > 0 ? "+" : ""}${k.divergencia}`}
                detail="Diferença entre bags previstas e entregues nas paradas executadas."
              />
            )}
            {atrasadas.length === 0 &&
              !semResponsavel &&
              k.semFoto === 0 &&
              k.divergencia === 0 &&
              k.veiculos.length > 0 && (
                <EmptyState
                  title="Nenhum alerta ativo"
                  description="A operação do dia está dentro do previsto."
                />
              )}
          </div>
        </GlassCard>
      </div>

      {/* KPIs ------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Previstos hoje" value={k.previstos} icon={<Droplets className="h-4 w-4" />} />
        <KpiCard label="Concluídos" value={k.concluidas} icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Pendentes" value={k.pendentes} icon={<Clock className="h-4 w-4" />} />
        <KpiCard label="Parciais" value={k.parciais} icon={<PackageMinus className="h-4 w-4" />} />
        <KpiCard label="Não realizados" value={k.naoRealizadas} icon={<XCircle className="h-4 w-4" />} />
        <KpiCard label="Reprogramados" value={k.reprogramadas} icon={<RotateCcw className="h-4 w-4" />} />
        <KpiCard label="Conclusão" value={`${k.pct}%`} icon={<Gauge className="h-4 w-4" />} />
        <KpiCard label="Bags carregadas" value={k.carregadas} icon={<Scale className="h-4 w-4" />} />
        <KpiCard label="Bags entregues" value={k.entregues} icon={<PackageCheck className="h-4 w-4" />} />
        <KpiCard label="Bags vazias recolhidas" value={k.vazias} icon={<PackageMinus className="h-4 w-4" />} />
        <KpiCard label="Bags restantes" value={k.restantes} icon={<Droplets className="h-4 w-4" />} />
        <KpiCard
          label="Divergência inventário"
          value={`${k.divergencia > 0 ? "+" : ""}${k.divergencia}`}
          icon={<Scale className="h-4 w-4" />}
        />
        <KpiCard label="Fotos pendentes" value={k.semFoto} icon={<Camera className="h-4 w-4" />} />
        <KpiCard label="Tempo médio/parada" value={duracao(k.medioMin)} icon={<Clock className="h-4 w-4" />} />
        <KpiCard
          label="Duração da rota"
          value={duracao(k.realMin)}
          hint={`Estimada ${duracao(k.estimadaMin)}`}
          icon={<Clock className="h-4 w-4" />}
        />
        <KpiCard label="Filtros abertos" value={k.filtrosAbertos} icon={<Filter className="h-4 w-4" />} />
        <KpiCard
          label="Filtros vencendo"
          value={k.filtrosVencendo}
          hint="Vencidos ou em até 7 dias"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KpiCard
          label="Colaboradores em rota"
          value={k.colaboradores.length}
          hint={k.colaboradores.join(", ") || "sem atribuição"}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {/* Timeline + prédios ---------------------------------------------- */}
      <div className="grid gap-3 lg:grid-cols-2">
        <GlassCard className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Timeline da rota</h2>
          {timeline.length === 0 ? (
            <EmptyState
              title="Sem paradas no filtro"
              description="Ajuste os filtros ou gere a rota do dia."
            />
          ) : (
            <ol className="relative space-y-2.5 pl-4">
              <span className="absolute left-[5px] top-1 h-[calc(100%-0.5rem)] w-px bg-border/60" />
              {timeline.map((v) => {
                const p = porId.get(v.ponto_id);
                const ok = v.status === "concluida";
                return (
                  <li key={v.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-4 top-2 size-2.5 rounded-full ring-2 ring-background",
                        ok
                          ? "bg-emerald-400"
                          : v.status === "pendente"
                            ? "bg-muted-foreground/60"
                            : "bg-amber-400",
                      )}
                    />
                    <div className="rounded-xl border border-border/50 bg-card/40 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm">
                          {p ? pontoLabel(p) : "Ponto removido"}
                        </p>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {hhmm(v.executado_em)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {VISITA_STATUS_LABEL[v.status]} · {v.bags_entregues ?? 0}/
                        {v.bags_previstas} bags
                        {v.foto_url ? "" : " · sem foto"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </GlassCard>

        <GlassCard className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Prédios atendidos</h2>
          </div>
          {predios.length === 0 ? (
            <EmptyState title="Sem prédios no filtro" description="Nenhuma parada encontrada." />
          ) : (
            <ul className="space-y-2">
              {predios.map((p) => {
                const pct = p.total ? Math.round((p.ok / p.total) * 100) : 0;
                return (
                  <li key={p.nome} className="rounded-xl border border-border/50 bg-card/40 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm">{p.nome}</p>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {p.ok}/{p.total} · {p.bags} bags
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-primary/80 transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Gráfico + ranking ------------------------------------------------ */}
      <div className="grid gap-3 lg:grid-cols-2">
        <GlassCard className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Bags por dia da semana (30 dias)</h2>
          <div className="h-56 w-full">
            <Suspense fallback={<Skeleton className="h-full w-full rounded-xl" />}>
              <BagsPorDiaChart dados={porDiaSemana} />
            </Suspense>
          </div>
        </GlassCard>

        <GlassCard className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Ranking de locais por bags (30 dias)</h2>
          {ranking.length === 0 ? (
            <EmptyState title="Sem entregas no período" description="Nada a ranquear ainda." />
          ) : (
            <ul className="space-y-2">
              {ranking.map((r, i) => {
                const max = ranking[0]?.bags || 1;
                return (
                  <li key={r.nome} className="flex items-center gap-2.5">
                    <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{r.nome}</p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${(r.bags / max) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums">{r.bags}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Exceções --------------------------------------------------------- */}
      <GlassCard className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Quadro de exceções (30 dias)</h2>
          <Link
            to="/abastecimento/agua/historico"
            className="inline-flex items-center gap-1 text-xs text-primary"
          >
            Histórico <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {excecoes.length === 0 ? (
          <EmptyState
            title="Período sem exceções"
            description="Nenhuma entrega parcial ou não realizada registrada."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {excecoes.map((v) => (
              <li key={v.id} className="rounded-xl border border-border/50 bg-card/40 p-2.5">
                <p className="truncate text-sm">
                  {porId.get(v.ponto_id) ? pontoLabel(porId.get(v.ponto_id)!) : "Ponto removido"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {brDate(v.data)} · {VISITA_STATUS_LABEL[v.status]}
                  {v.motivo ? ` — ${v.motivo}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
