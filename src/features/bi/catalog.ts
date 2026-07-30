/**
 * BI Studio — catálogo de datasets, métricas, KPIs e modelos de painel.
 *
 * Tudo aqui é declarativo: a UI monta os gráficos a partir destas definições,
 * sem que o usuário precise conhecer Power BI ou escrever SQL.
 */

export type DatasetKey =
  | "work_orders"
  | "backlog"
  | "preventive"
  | "assets"
  | "taludes_pt"
  | "checklists"
  | "fuelings"
  | "occurrences"
  | "vehicles"
  | "pecas"
  | "materiais"
  | "legal";

export type Row = Record<string, unknown>;
export type Datasets = Partial<Record<DatasetKey, Row[]>>;

export type DatasetDef = {
  key: DatasetKey;
  label: string;
  /** View (preferida) ou tabela lida com a RLS do próprio usuário. */
  source: string;
  /** Campo usado pelo filtro de período. */
  dateField: string;
  /** Campos elegíveis como dimensão. */
  dimensions: { key: string; label: string }[];
  /** Campos numéricos agregáveis. */
  measures?: { key: string; label: string }[];
};

export const DATASETS: Record<DatasetKey, DatasetDef> = {
  work_orders: {
    key: "work_orders",
    label: "Ordens de serviço",
    source: "vw_bi_work_orders",
    dateField: "created_at",
    dimensions: [
      { key: "equipe", label: "Equipe" },
      { key: "modalidade", label: "Modalidade" },
      { key: "status", label: "Status" },
      { key: "predio", label: "Prédio" },
      { key: "andar", label: "Andar" },
      { key: "ativo", label: "Ativo" },
    ],
    measures: [{ key: "horas_execucao", label: "Horas de execução" }],
  },
  backlog: {
    key: "backlog",
    label: "Backlog de corretivas",
    source: "vw_bi_backlog",
    dateField: "data_solicitacao",
    dimensions: [
      { key: "equipe", label: "Equipe" },
      { key: "criticidade", label: "Criticidade" },
      { key: "predio", label: "Prédio" },
      { key: "andar", label: "Andar" },
      { key: "atividade", label: "Atividade" },
    ],
    measures: [{ key: "idade_dias", label: "Idade (dias)" }],
  },
  preventive: {
    key: "preventive",
    label: "Preventivas / PMOC",
    source: "vw_bi_preventive_compliance",
    dateField: "data_manutencao",
    dimensions: [
      { key: "tipo_servico", label: "Tipo de serviço" },
      { key: "tipo_equipamento", label: "Equipamento" },
      { key: "predio", label: "Prédio" },
      { key: "status_equipamento", label: "Status" },
      { key: "colaborador", label: "Colaborador" },
    ],
  },
  assets: {
    key: "assets",
    label: "Ativos e localização",
    source: "vw_bi_assets",
    dateField: "updated_at",
    dimensions: [
      { key: "nivel", label: "Nível" },
      { key: "unidade_negocio", label: "Unidade" },
      { key: "descricao_pai", label: "Local pai" },
    ],
  },
  taludes_pt: {
    key: "taludes_pt",
    label: "Taludes, chuva e PT",
    source: "vw_bi_taludes_weather_pt",
    dateField: "solicitada_em",
    dimensions: [
      { key: "status", label: "Status da PT" },
      { key: "equipe", label: "Equipe" },
      { key: "max_intensity", label: "Intensidade da chuva" },
    ],
    measures: [
      { key: "horas_suspensas", label: "Horas suspensas" },
      { key: "accumulated_mm", label: "Chuva acumulada (mm)" },
    ],
  },
  checklists: {
    key: "checklists",
    label: "Checklists de frota",
    source: "vw_bi_vehicle_checklists",
    dateField: "created_at",
    dimensions: [
      { key: "veiculo", label: "Veículo" },
      { key: "overall_status", label: "Resultado" },
      { key: "checklist_type", label: "Tipo" },
    ],
    measures: [{ key: "integrity_score", label: "Score de integridade" }],
  },
  fuelings: {
    key: "fuelings",
    label: "Abastecimentos",
    source: "vw_bi_vehicle_fuelings",
    dateField: "fueled_at",
    dimensions: [
      { key: "veiculo", label: "Veículo" },
      { key: "fuel_type", label: "Combustível" },
      { key: "station", label: "Posto" },
    ],
    measures: [
      { key: "liters", label: "Litros" },
      { key: "total_value", label: "Valor total" },
      { key: "price_per_liter", label: "Preço por litro" },
    ],
  },
  occurrences: {
    key: "occurrences",
    label: "Ocorrências de frota",
    source: "vehicle_occurrences",
    dateField: "opened_at",
    dimensions: [
      { key: "occurrence_type", label: "Tipo" },
      { key: "severity", label: "Severidade" },
      { key: "state", label: "Situação" },
    ],
  },
  vehicles: {
    key: "vehicles",
    label: "Veículos",
    source: "vehicles",
    dateField: "created_at",
    dimensions: [
      { key: "status", label: "Status" },
      { key: "fuel_type", label: "Combustível" },
      { key: "prefix", label: "Prefixo" },
    ],
  },
  pecas: {
    key: "pecas",
    label: "Peças solicitadas",
    source: "corretiva_pecas",
    dateField: "created_at",
    dimensions: [
      { key: "status_gestor", label: "Status" },
      { key: "urgencia", label: "Urgência" },
      { key: "descricao", label: "Peça" },
    ],
    measures: [{ key: "quantidade", label: "Quantidade" }],
  },
  materiais: {
    key: "materiais",
    label: "Materiais e compras",
    source: "controle_materiais_meta",
    dateField: "created_at",
    dimensions: [
      { key: "centro_custo", label: "Centro de custo" },
      { key: "status_compra", label: "Status da compra" },
      { key: "fornecedor", label: "Fornecedor" },
      { key: "origem", label: "Origem" },
    ],
    measures: [{ key: "valor_estimado", label: "Valor estimado" }],
  },
  legal: {
    key: "legal",
    label: "Itens legais",
    source: "legal_items",
    dateField: "created_at",
    dimensions: [
      { key: "periodicidade", label: "Periodicidade" },
      { key: "responsavel", label: "Responsável" },
      { key: "empresa", label: "Empresa" },
      { key: "predio", label: "Prédio" },
    ],
  },
};

/* ------------------------------ Widgets ------------------------------ */

export type ChartType =
  | "kpi"
  | "line"
  | "area"
  | "bar"
  | "stacked"
  | "donut"
  | "pareto"
  | "heatmap"
  | "timeline"
  | "gauge"
  | "table";

export const CHART_LABEL: Record<ChartType, string> = {
  kpi: "Indicador",
  line: "Linha",
  area: "Área",
  bar: "Barras",
  stacked: "Barras empilhadas",
  donut: "Donut",
  pareto: "Pareto",
  heatmap: "Heatmap",
  timeline: "Timeline",
  gauge: "Gauge",
  table: "Tabela analítica",
};

export type Aggregation = "count" | "sum" | "avg" | "max" | "distinct";

export type WidgetSpec = {
  id: string;
  title: string;
  chart: ChartType;
  dataset: DatasetKey;
  /** Para gráficos: dimensão do eixo. Para séries temporais use `bucket`. */
  dimension?: string;
  /** Agrupa por dia/semana/mês do `dateField`. */
  bucket?: "day" | "week" | "month";
  aggregation?: Aggregation;
  /** Campo numérico para sum/avg/max. */
  field?: string;
  /** Segunda dimensão (barras empilhadas / heatmap). */
  series?: string;
  /** KPI do registro (`chart: "kpi"` ou `"gauge"`). */
  kpi?: KpiKey;
  size: "sm" | "md" | "lg";
  filters?: Record<string, string>;
};

/* -------------------------------- KPIs -------------------------------- */

export type KpiKey =
  | "backlog_total"
  | "backlog_idade_media"
  | "sla_vencido"
  | "cumprimento_programacao"
  | "preventivas_no_prazo"
  | "mttr"
  | "mtbf"
  | "disponibilidade"
  | "reincidencia"
  | "espera_material"
  | "custo_por_ativo"
  | "custo_por_equipe"
  | "horas_planejadas_executadas"
  | "retrabalho"
  | "veiculos_bloqueados"
  | "checklists_nc"
  | "consumo_medio"
  | "custo_km"
  | "horas_suspensas_chuva"
  | "pt_liberadas"
  | "pt_suspensas"
  | "pt_encerradas";

export type KpiDef = {
  key: KpiKey;
  label: string;
  hint: string;
  datasets: DatasetKey[];
  unit?: string;
  /** Quando true, valores menores são melhores. */
  lowerIsBetter?: boolean;
  /** Alvo usado no gauge (0-100 quando percentual). */
  target?: number;
  compute: (d: Datasets) => number | null;
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const rows = (d: Datasets, k: DatasetKey) => d[k] ?? [];
const avg = (list: number[]) =>
  list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
const days = (a: unknown, b: unknown) => {
  const t1 = new Date(String(a ?? "")).getTime();
  const t2 = new Date(String(b ?? "")).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return (t2 - t1) / 86_400_000;
};

export const KPIS: Record<KpiKey, KpiDef> = {
  backlog_total: {
    key: "backlog_total",
    label: "Backlog total",
    hint: "Chamados de backorder ainda abertos.",
    datasets: ["backlog"],
    lowerIsBetter: true,
    compute: (d) => rows(d, "backlog").filter((r) => !r.finalizado).length,
  },
  backlog_idade_media: {
    key: "backlog_idade_media",
    label: "Idade média do backlog",
    hint: "Média de dias em aberto.",
    unit: "d",
    datasets: ["backlog"],
    lowerIsBetter: true,
    compute: (d) =>
      avg(
        rows(d, "backlog")
          .filter((r) => !r.finalizado)
          .map((r) => num(r.idade_dias)),
      ),
  },
  sla_vencido: {
    key: "sla_vencido",
    label: "SLA vencido",
    hint: "Backlog + OS com prazo estourado.",
    datasets: ["backlog", "work_orders"],
    lowerIsBetter: true,
    compute: (d) =>
      rows(d, "backlog").filter((r) => r.sla_vencido).length +
      rows(d, "work_orders").filter((r) => r.sla_vencido).length,
  },
  cumprimento_programacao: {
    key: "cumprimento_programacao",
    label: "Cumprimento da programação",
    hint: "OS programadas concluídas até a data prevista.",
    unit: "%",
    target: 90,
    datasets: ["work_orders"],
    compute: (d) => {
      const prog = rows(d, "work_orders").filter((r) => r.data_programada);
      if (!prog.length) return null;
      const ok = prog.filter(
        (r) =>
          r.fim && new Date(String(r.fim)) <= new Date(`${String(r.data_programada)}T23:59:59`),
      ).length;
      return (ok / prog.length) * 100;
    },
  },
  preventivas_no_prazo: {
    key: "preventivas_no_prazo",
    label: "Preventivas no prazo",
    hint: "Registros de preventiva/PMOC executados no mês previsto.",
    unit: "%",
    target: 95,
    datasets: ["preventive"],
    compute: (d) => {
      const list = rows(d, "preventive").filter((r) => r.data_manutencao);
      if (!list.length) return null;
      const ok = list.filter(
        (r) => String(r.status_equipamento ?? "").toLowerCase() !== "pendente",
      ).length;
      return (ok / list.length) * 100;
    },
  },
  mttr: {
    key: "mttr",
    label: "MTTR",
    hint: "Tempo médio de reparo (horas entre início e fim).",
    unit: "h",
    datasets: ["work_orders"],
    lowerIsBetter: true,
    compute: (d) =>
      avg(
        rows(d, "work_orders")
          .filter((r) => r.horas_execucao != null)
          .map((r) => num(r.horas_execucao)),
      ),
  },
  mtbf: {
    key: "mtbf",
    label: "MTBF",
    hint: "Tempo médio entre falhas por ativo, no período analisado.",
    unit: "h",
    datasets: ["work_orders"],
    compute: (d) => {
      const list = rows(d, "work_orders").filter((r) => r.ativo);
      if (list.length < 2) return null;
      const times = list.map((r) => new Date(String(r.created_at)).getTime()).sort((a, b) => a - b);
      const span = (times[times.length - 1] - times[0]) / 3_600_000;
      return span > 0 ? span / list.length : null;
    },
  },
  disponibilidade: {
    key: "disponibilidade",
    label: "Disponibilidade",
    hint: "MTBF / (MTBF + MTTR).",
    unit: "%",
    target: 95,
    datasets: ["work_orders"],
    compute: (d) => {
      const mttr = KPIS.mttr.compute(d);
      const mtbf = KPIS.mtbf.compute(d);
      if (!mttr || !mtbf) return null;
      return (mtbf / (mtbf + mttr)) * 100;
    },
  },
  reincidencia: {
    key: "reincidencia",
    label: "Reincidência",
    hint: "Ativos com mais de uma OS no período.",
    unit: "%",
    datasets: ["work_orders"],
    lowerIsBetter: true,
    compute: (d) => {
      const map = new Map<string, number>();
      for (const r of rows(d, "work_orders")) {
        const key = String(r.ativo ?? "").trim();
        if (!key) continue;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      if (!map.size) return null;
      const rep = [...map.values()].filter((n) => n > 1).length;
      return (rep / map.size) * 100;
    },
  },
  espera_material: {
    key: "espera_material",
    label: "Espera por material",
    hint: "Dias médios entre a solicitação da peça e a última movimentação.",
    unit: "d",
    datasets: ["pecas"],
    lowerIsBetter: true,
    compute: (d) =>
      avg(
        rows(d, "pecas")
          .map((r) => days(r.created_at, r.updated_at))
          .filter((n): n is number => n != null && n >= 0),
      ),
  },
  custo_por_ativo: {
    key: "custo_por_ativo",
    label: "Custo por ativo",
    hint: "Valor estimado de materiais dividido pelos ativos atendidos.",
    unit: "R$",
    datasets: ["materiais", "work_orders"],
    compute: (d) => {
      const total = rows(d, "materiais").reduce((a, r) => a + num(r.valor_estimado), 0);
      const ativos = new Set(
        rows(d, "work_orders")
          .map((r) => String(r.ativo ?? ""))
          .filter(Boolean),
      ).size;
      return ativos ? total / ativos : total || null;
    },
  },
  custo_por_equipe: {
    key: "custo_por_equipe",
    label: "Custo por equipe",
    hint: "Valor estimado de materiais dividido pelas equipes ativas.",
    unit: "R$",
    datasets: ["materiais", "work_orders"],
    compute: (d) => {
      const total = rows(d, "materiais").reduce((a, r) => a + num(r.valor_estimado), 0);
      const equipes = new Set(
        rows(d, "work_orders")
          .map((r) => String(r.equipe ?? ""))
          .filter(Boolean),
      ).size;
      return equipes ? total / equipes : total || null;
    },
  },
  horas_planejadas_executadas: {
    key: "horas_planejadas_executadas",
    label: "Horas executadas / planejadas",
    hint: "Relação entre horas apontadas e 2h padrão por OS programada.",
    unit: "%",
    target: 100,
    datasets: ["work_orders"],
    compute: (d) => {
      const list = rows(d, "work_orders");
      const exec = list.reduce((a, r) => a + num(r.horas_execucao), 0);
      const plan = list.filter((r) => r.data_programada).length * 2;
      return plan ? (exec / plan) * 100 : null;
    },
  },
  retrabalho: {
    key: "retrabalho",
    label: "Taxa de retrabalho",
    hint: "OS repetidas no mesmo ativo + equipamento.",
    unit: "%",
    datasets: ["work_orders"],
    lowerIsBetter: true,
    compute: (d) => {
      const list = rows(d, "work_orders");
      if (!list.length) return null;
      const map = new Map<string, number>();
      for (const r of list) {
        const key = `${String(r.ativo ?? "")}|${String(r.equipamento ?? "")}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      const extras = [...map.values()].reduce((a, n) => a + Math.max(0, n - 1), 0);
      return (extras / list.length) * 100;
    },
  },
  veiculos_bloqueados: {
    key: "veiculos_bloqueados",
    label: "Veículos bloqueados",
    hint: "Frota impedida de rodar.",
    datasets: ["vehicles"],
    lowerIsBetter: true,
    compute: (d) =>
      rows(d, "vehicles").filter((r) => String(r.status ?? "") === "bloqueado").length,
  },
  checklists_nc: {
    key: "checklists_nc",
    label: "Checklists com não conformidade",
    hint: "Checklists reprovados ou com bloqueio crítico.",
    datasets: ["checklists"],
    lowerIsBetter: true,
    compute: (d) =>
      rows(d, "checklists").filter(
        (r) => r.critical_block || String(r.overall_status ?? "") !== "aprovado",
      ).length,
  },
  consumo_medio: {
    key: "consumo_medio",
    label: "Consumo médio",
    hint: "km rodados / litros abastecidos (tanques cheios).",
    unit: "km/L",
    datasets: ["fuelings"],
    compute: (d) => {
      const byVehicle = new Map<string, Row[]>();
      for (const r of rows(d, "fuelings")) {
        const k = String(r.veiculo ?? "—");
        byVehicle.set(k, [...(byVehicle.get(k) ?? []), r]);
      }
      const ratios: number[] = [];
      for (const list of byVehicle.values()) {
        const ord = [...list].sort(
          (a, b) =>
            new Date(String(a.fueled_at)).getTime() - new Date(String(b.fueled_at)).getTime(),
        );
        for (let i = 1; i < ord.length; i++) {
          const km = num(ord[i].odometer_km) - num(ord[i - 1].odometer_km);
          const l = num(ord[i].liters);
          if (km > 0 && l > 0 && km / l < 40) ratios.push(km / l);
        }
      }
      return avg(ratios);
    },
  },
  custo_km: {
    key: "custo_km",
    label: "Custo por quilômetro",
    hint: "Valor abastecido dividido pela quilometragem percorrida.",
    unit: "R$/km",
    datasets: ["fuelings"],
    lowerIsBetter: true,
    compute: (d) => {
      const list = rows(d, "fuelings");
      if (list.length < 2) return null;
      const kms = list.map((r) => num(r.odometer_km)).filter((n) => n > 0);
      if (kms.length < 2) return null;
      const dist = Math.max(...kms) - Math.min(...kms);
      const total = list.reduce((a, r) => a + num(r.total_value), 0);
      return dist > 0 ? total / dist : null;
    },
  },
  horas_suspensas_chuva: {
    key: "horas_suspensas_chuva",
    label: "Horas suspensas por chuva",
    hint: "Somatório de horas com PT suspensa por evento de chuva.",
    unit: "h",
    datasets: ["taludes_pt"],
    lowerIsBetter: true,
    compute: (d) => rows(d, "taludes_pt").reduce((a, r) => a + num(r.horas_suspensas), 0) || null,
  },
  pt_liberadas: {
    key: "pt_liberadas",
    label: "PTs liberadas",
    hint: "Permissões de trabalho liberadas no período.",
    datasets: ["taludes_pt"],
    compute: (d) => rows(d, "taludes_pt").filter((r) => r.liberada_em).length,
  },
  pt_suspensas: {
    key: "pt_suspensas",
    label: "PTs suspensas",
    hint: "Permissões suspensas (chuva ou decisão do gestor).",
    datasets: ["taludes_pt"],
    lowerIsBetter: true,
    compute: (d) => rows(d, "taludes_pt").filter((r) => r.suspensa_em).length,
  },
  pt_encerradas: {
    key: "pt_encerradas",
    label: "PTs encerradas",
    hint: "Permissões finalizadas no período.",
    datasets: ["taludes_pt"],
    compute: (d) => rows(d, "taludes_pt").filter((r) => r.encerrada_em).length,
  },
};

export const KPI_LIST = Object.values(KPIS);

/* ------------------------------ Modelos ------------------------------ */

export type TemplateDef = {
  key: string;
  label: string;
  description: string;
  widgets: Omit<WidgetSpec, "id">[];
};

const w = (spec: Omit<WidgetSpec, "id">) => spec;

export const TEMPLATES: TemplateDef[] = [
  {
    key: "executivo",
    label: "Visão Executiva PCM",
    description: "Panorama de backlog, SLA, produtividade e custo em uma tela.",
    widgets: [
      w({
        title: "Backlog total",
        chart: "kpi",
        dataset: "backlog",
        kpi: "backlog_total",
        size: "sm",
      }),
      w({ title: "SLA vencido", chart: "kpi", dataset: "backlog", kpi: "sla_vencido", size: "sm" }),
      w({ title: "MTTR", chart: "kpi", dataset: "work_orders", kpi: "mttr", size: "sm" }),
      w({
        title: "Disponibilidade",
        chart: "gauge",
        dataset: "work_orders",
        kpi: "disponibilidade",
        size: "sm",
      }),
      w({
        title: "OS por mês",
        chart: "area",
        dataset: "work_orders",
        bucket: "month",
        aggregation: "count",
        size: "lg",
      }),
      w({
        title: "Backlog por equipe",
        chart: "bar",
        dataset: "backlog",
        dimension: "equipe",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "OS por modalidade",
        chart: "donut",
        dataset: "work_orders",
        dimension: "modalidade",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Pareto de atividades",
        chart: "pareto",
        dataset: "backlog",
        dimension: "atividade",
        aggregation: "count",
        size: "lg",
      }),
    ],
  },
  {
    key: "backlog-sla",
    label: "Backlog e SLA",
    description: "Idade do backlog, criticidade e prazos estourados.",
    widgets: [
      w({
        title: "Backlog total",
        chart: "kpi",
        dataset: "backlog",
        kpi: "backlog_total",
        size: "sm",
      }),
      w({
        title: "Idade média",
        chart: "kpi",
        dataset: "backlog",
        kpi: "backlog_idade_media",
        size: "sm",
      }),
      w({ title: "SLA vencido", chart: "kpi", dataset: "backlog", kpi: "sla_vencido", size: "sm" }),
      w({
        title: "Backlog por criticidade",
        chart: "donut",
        dataset: "backlog",
        dimension: "criticidade",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Idade média por equipe",
        chart: "bar",
        dataset: "backlog",
        dimension: "equipe",
        aggregation: "avg",
        field: "idade_dias",
        size: "md",
      }),
      w({
        title: "Equipe × criticidade",
        chart: "heatmap",
        dataset: "backlog",
        dimension: "equipe",
        series: "criticidade",
        size: "lg",
      }),
      w({
        title: "Abertura por semana",
        chart: "line",
        dataset: "backlog",
        bucket: "week",
        aggregation: "count",
        size: "lg",
      }),
      w({ title: "Backlog detalhado", chart: "table", dataset: "backlog", size: "lg" }),
    ],
  },
  {
    key: "corretivas-equipe",
    label: "Corretivas por equipe",
    description: "Volume, status e tempo de execução por equipe.",
    widgets: [
      w({ title: "MTTR", chart: "kpi", dataset: "work_orders", kpi: "mttr", size: "sm" }),
      w({
        title: "Retrabalho",
        chart: "kpi",
        dataset: "work_orders",
        kpi: "retrabalho",
        size: "sm",
      }),
      w({
        title: "Reincidência",
        chart: "kpi",
        dataset: "work_orders",
        kpi: "reincidencia",
        size: "sm",
      }),
      w({
        title: "OS por equipe",
        chart: "bar",
        dataset: "work_orders",
        dimension: "equipe",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Equipe × status",
        chart: "stacked",
        dataset: "work_orders",
        dimension: "equipe",
        series: "status",
        size: "lg",
      }),
      w({
        title: "Horas por equipe",
        chart: "bar",
        dataset: "work_orders",
        dimension: "equipe",
        aggregation: "sum",
        field: "horas_execucao",
        size: "md",
      }),
      w({ title: "Linha do tempo de OS", chart: "timeline", dataset: "work_orders", size: "lg" }),
    ],
  },
  {
    key: "preventivas",
    label: "Preventivas planejadas x realizadas",
    description: "Aderência da programação preventiva.",
    widgets: [
      w({
        title: "Preventivas no prazo",
        chart: "gauge",
        dataset: "preventive",
        kpi: "preventivas_no_prazo",
        size: "sm",
      }),
      w({
        title: "Cumprimento da programação",
        chart: "gauge",
        dataset: "work_orders",
        kpi: "cumprimento_programacao",
        size: "sm",
      }),
      w({
        title: "Horas exec./plan.",
        chart: "kpi",
        dataset: "work_orders",
        kpi: "horas_planejadas_executadas",
        size: "sm",
      }),
      w({
        title: "Execuções por mês",
        chart: "area",
        dataset: "preventive",
        bucket: "month",
        aggregation: "count",
        size: "lg",
      }),
      w({
        title: "Por tipo de serviço",
        chart: "donut",
        dataset: "preventive",
        dimension: "tipo_servico",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Por prédio",
        chart: "bar",
        dataset: "preventive",
        dimension: "predio",
        aggregation: "count",
        size: "md",
      }),
    ],
  },
  {
    key: "pmoc",
    label: "PMOC",
    description: "Cobertura do plano de manutenção de climatização.",
    widgets: [
      w({
        title: "Registros PMOC",
        chart: "kpi",
        dataset: "preventive",
        kpi: "preventivas_no_prazo",
        size: "sm",
      }),
      w({
        title: "Equipamentos por tipo",
        chart: "donut",
        dataset: "preventive",
        dimension: "tipo_equipamento",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Status dos equipamentos",
        chart: "bar",
        dataset: "preventive",
        dimension: "status_equipamento",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Prédio × tipo de serviço",
        chart: "heatmap",
        dataset: "preventive",
        dimension: "predio",
        series: "tipo_servico",
        size: "lg",
      }),
      w({ title: "Registros detalhados", chart: "table", dataset: "preventive", size: "lg" }),
    ],
  },
  {
    key: "refrigeracao",
    label: "Refrigeração",
    description: "OS de climatização, status e locais críticos.",
    widgets: [
      w({
        title: "OS de refrigeração",
        chart: "kpi",
        dataset: "work_orders",
        kpi: "mttr",
        size: "sm",
      }),
      w({
        title: "Status",
        chart: "donut",
        dataset: "work_orders",
        dimension: "status",
        aggregation: "count",
        filters: { modalidade: "refrigeracao" },
        size: "md",
      }),
      w({
        title: "Por prédio",
        chart: "bar",
        dataset: "work_orders",
        dimension: "predio",
        aggregation: "count",
        filters: { modalidade: "refrigeracao" },
        size: "md",
      }),
      w({
        title: "Volume por semana",
        chart: "line",
        dataset: "work_orders",
        bucket: "week",
        aggregation: "count",
        filters: { modalidade: "refrigeracao" },
        size: "lg",
      }),
      w({
        title: "Pareto de ativos",
        chart: "pareto",
        dataset: "work_orders",
        dimension: "ativo",
        aggregation: "count",
        filters: { modalidade: "refrigeracao" },
        size: "lg",
      }),
    ],
  },
  {
    key: "materiais",
    label: "Materiais e peças",
    description: "Solicitações, centro de custo e espera por material.",
    widgets: [
      w({
        title: "Espera por material",
        chart: "kpi",
        dataset: "pecas",
        kpi: "espera_material",
        size: "sm",
      }),
      w({
        title: "Custo por ativo",
        chart: "kpi",
        dataset: "materiais",
        kpi: "custo_por_ativo",
        size: "sm",
      }),
      w({
        title: "Custo por equipe",
        chart: "kpi",
        dataset: "materiais",
        kpi: "custo_por_equipe",
        size: "sm",
      }),
      w({
        title: "Valor por centro de custo",
        chart: "bar",
        dataset: "materiais",
        dimension: "centro_custo",
        aggregation: "sum",
        field: "valor_estimado",
        size: "md",
      }),
      w({
        title: "Status da compra",
        chart: "donut",
        dataset: "materiais",
        dimension: "status_compra",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Peças mais pedidas",
        chart: "pareto",
        dataset: "pecas",
        dimension: "descricao",
        aggregation: "sum",
        field: "quantidade",
        size: "lg",
      }),
    ],
  },
  {
    key: "ativos",
    label: "Ativos e localização",
    description: "Cobertura da base de ativos e hierarquia de locais.",
    widgets: [
      w({
        title: "Ativos por nível",
        chart: "donut",
        dataset: "assets",
        dimension: "nivel",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Ativos por unidade",
        chart: "bar",
        dataset: "assets",
        dimension: "unidade_negocio",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "OS por ativo (Pareto)",
        chart: "pareto",
        dataset: "work_orders",
        dimension: "ativo",
        aggregation: "count",
        size: "lg",
      }),
      w({ title: "Base de ativos", chart: "table", dataset: "assets", size: "lg" }),
    ],
  },
  {
    key: "taludes",
    label: "Taludes, chuva e PT",
    description: "Permissões de trabalho, suspensões e impacto da chuva.",
    widgets: [
      w({
        title: "PTs liberadas",
        chart: "kpi",
        dataset: "taludes_pt",
        kpi: "pt_liberadas",
        size: "sm",
      }),
      w({
        title: "PTs suspensas",
        chart: "kpi",
        dataset: "taludes_pt",
        kpi: "pt_suspensas",
        size: "sm",
      }),
      w({
        title: "PTs encerradas",
        chart: "kpi",
        dataset: "taludes_pt",
        kpi: "pt_encerradas",
        size: "sm",
      }),
      w({
        title: "Horas suspensas por chuva",
        chart: "kpi",
        dataset: "taludes_pt",
        kpi: "horas_suspensas_chuva",
        size: "sm",
      }),
      w({
        title: "PT por status",
        chart: "donut",
        dataset: "taludes_pt",
        dimension: "status",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Chuva acumulada por PT",
        chart: "bar",
        dataset: "taludes_pt",
        dimension: "max_intensity",
        aggregation: "sum",
        field: "accumulated_mm",
        size: "md",
      }),
      w({ title: "Linha do tempo das PTs", chart: "timeline", dataset: "taludes_pt", size: "lg" }),
    ],
  },
  {
    key: "frota",
    label: "Frota e checklist",
    description: "Disponibilidade da frota e conformidade dos checklists.",
    widgets: [
      w({
        title: "Veículos bloqueados",
        chart: "kpi",
        dataset: "vehicles",
        kpi: "veiculos_bloqueados",
        size: "sm",
      }),
      w({
        title: "Checklists com NC",
        chart: "kpi",
        dataset: "checklists",
        kpi: "checklists_nc",
        size: "sm",
      }),
      w({
        title: "Score médio",
        chart: "gauge",
        dataset: "checklists",
        kpi: "checklists_nc",
        size: "sm",
      }),
      w({
        title: "Checklists por veículo",
        chart: "bar",
        dataset: "checklists",
        dimension: "veiculo",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Resultado dos checklists",
        chart: "donut",
        dataset: "checklists",
        dimension: "overall_status",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Ocorrências por severidade",
        chart: "stacked",
        dataset: "occurrences",
        dimension: "occurrence_type",
        series: "severity",
        size: "lg",
      }),
    ],
  },
  {
    key: "abastecimento",
    label: "Abastecimento e consumo",
    description: "Litros, custo e eficiência por veículo.",
    widgets: [
      w({
        title: "Consumo médio",
        chart: "kpi",
        dataset: "fuelings",
        kpi: "consumo_medio",
        size: "sm",
      }),
      w({ title: "Custo por km", chart: "kpi", dataset: "fuelings", kpi: "custo_km", size: "sm" }),
      w({
        title: "Litros por veículo",
        chart: "bar",
        dataset: "fuelings",
        dimension: "veiculo",
        aggregation: "sum",
        field: "liters",
        size: "md",
      }),
      w({
        title: "Valor por mês",
        chart: "area",
        dataset: "fuelings",
        bucket: "month",
        aggregation: "sum",
        field: "total_value",
        size: "lg",
      }),
      w({
        title: "Preço médio por posto",
        chart: "bar",
        dataset: "fuelings",
        dimension: "station",
        aggregation: "avg",
        field: "price_per_liter",
        size: "md",
      }),
      w({ title: "Abastecimentos", chart: "table", dataset: "fuelings", size: "lg" }),
    ],
  },
  {
    key: "conformidade",
    label: "Segurança e conformidade",
    description: "Itens legais, responsáveis e periodicidade.",
    widgets: [
      w({
        title: "Itens por periodicidade",
        chart: "donut",
        dataset: "legal",
        dimension: "periodicidade",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Itens por responsável",
        chart: "bar",
        dataset: "legal",
        dimension: "responsavel",
        aggregation: "count",
        size: "md",
      }),
      w({
        title: "Itens por prédio",
        chart: "bar",
        dataset: "legal",
        dimension: "predio",
        aggregation: "count",
        size: "md",
      }),
      w({ title: "Itens legais", chart: "table", dataset: "legal", size: "lg" }),
    ],
  },
];

/** Views expostas ao conector de BI (Power BI, Excel, etc.). */
export const BI_VIEWS = [
  {
    name: "vw_bi_work_orders",
    label: "Ordens de serviço (corretiva + refrigeração)",
    dataset: "work_orders" as DatasetKey,
  },
  { name: "vw_bi_backlog", label: "Backlog de corretivas", dataset: "backlog" as DatasetKey },
  {
    name: "vw_bi_preventive_compliance",
    label: "Preventivas e PMOC",
    dataset: "preventive" as DatasetKey,
  },
  { name: "vw_bi_assets", label: "Ativos e localização", dataset: "assets" as DatasetKey },
  {
    name: "vw_bi_taludes_weather_pt",
    label: "Taludes, chuva e PT",
    dataset: "taludes_pt" as DatasetKey,
  },
  {
    name: "vw_bi_vehicle_checklists",
    label: "Checklists de frota",
    dataset: "checklists" as DatasetKey,
  },
  { name: "vw_bi_vehicle_fuelings", label: "Abastecimentos", dataset: "fuelings" as DatasetKey },
];
