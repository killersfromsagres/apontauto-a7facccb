// Categorias de status do Backorder — espelham a função SQL
// `public.backorder_status_cat` (fonte: coluna G da planilha oficial).

export const STATUS_CATS = [
  "aberto",
  "pendente",
  "programado",
  "em_execucao",
  "aguardando_aprovacao",
  "concluido",
  "fechado",
  "validado",
  "nao_validado",
  "nao_executada",
  "cancelado",
] as const;

export type StatusCat = (typeof STATUS_CATS)[number];

export const STATUS_LABEL: Record<StatusCat, string> = {
  aberto: "Em aberto",
  pendente: "Pendente",
  programado: "Programado",
  em_execucao: "Em execução",
  aguardando_aprovacao: "Aguardando aprovação",
  concluido: "Concluído",
  fechado: "Fechado",
  validado: "Validado",
  nao_validado: "Não validado",
  nao_executada: "Não executada",
  cancelado: "Cancelado",
};

/** Cor semântica (token-friendly) usada em badges e gráficos. */
export const STATUS_COLOR: Record<StatusCat, string> = {
  aberto: "#3B82F6",
  pendente: "#F59E0B",
  programado: "#8B5CF6",
  em_execucao: "#06B6D4",
  aguardando_aprovacao: "#EAB308",
  concluido: "#10B981",
  fechado: "#059669",
  validado: "#14B8A6",
  nao_validado: "#F97316",
  nao_executada: "#EF4444",
  cancelado: "#DC2626",
};

/** Grupos macro usados nos KPIs. */
export const ABERTOS_CATS: StatusCat[] = ["aberto", "pendente", "programado", "em_execucao"];
export const CONCLUIDOS_CATS: StatusCat[] = ["concluido", "fechado", "validado"];
export const CANCELADOS_CATS: StatusCat[] = ["cancelado", "nao_executada"];

const strip = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Mesma lógica da função SQL — mantenha as duas em sincronia. */
export function toStatusCat(raw: unknown): StatusCat {
  const s = strip(raw);
  if (!s) return "aberto";
  if (/CANCEL|RECUSAD|REPROVAD/.test(s)) return "cancelado";
  if (/NAO EXECUTAD|NAO REALIZAD/.test(s)) return "nao_executada";
  if (/NAO VALIDAD/.test(s)) return "nao_validado";
  if (/AGUARDANDO APROVA|AGUARD.*APROVA|APROVACAO PENDENTE/.test(s)) return "aguardando_aprovacao";
  if (/EM EXECU|EXECUCAO|ANDAMENTO/.test(s)) return "em_execucao";
  if (/PROGRAMAD|AGENDAD/.test(s)) return "programado";
  if (/VALIDAD/.test(s)) return "validado";
  if (/CONCLU|FINALIZAD|ATENDID|RESOLVID/.test(s)) return "concluido";
  if (/FECHAD|ENCERRAD/.test(s)) return "fechado";
  if (/PENDENTE/.test(s)) return "pendente";
  return "aberto";
}

export const isConcluido = (c: StatusCat) => CONCLUIDOS_CATS.includes(c);
export const isCancelado = (c: StatusCat) => CANCELADOS_CATS.includes(c);
export const isAberto = (c: StatusCat) => ABERTOS_CATS.includes(c);
