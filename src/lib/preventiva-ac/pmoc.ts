// Constantes PMOC (Plano de Manutenção, Operação e Controle) — Lei 13.589/2018 e ABNT NBR 13971/16401.

export const TIPOS_EQUIPAMENTO = [
  "Split Hi-Wall",
  "Split Piso Teto",
  "Split Cassete",
  "Split Duto",
  "Multi Split",
  "VRF/VRV",
  "Janela",
  "Portátil",
  "Chiller",
  "Fancoil",
  "Self Contained",
] as const;

export const FLUIDOS = ["R-410A", "R-32", "R-22", "R-134A", "R-407C", "R-404A", "R-1234yf"] as const;

export const STATUS_EQUIPAMENTO = [
  "Operando normal",
  "Operando com restrição",
  "Parado — aguardando peça",
  "Parado — falha crítica",
  "Desativado",
] as const;

export const TIPOS_SERVICO = [
  "Preventiva Mensal",
  "Preventiva Trimestral",
  "Preventiva Semestral",
  "Preventiva Anual",
  "Inspeção Inicial (Cadastro)",
] as const;

// Checklist PMOC — atividades mínimas conforme Portaria 3.523/98 do MS e NBR 13971.
export type ChecklistItem = {
  key: string;
  label: string;
  grupo: "Filtros" | "Serpentina" | "Drenagem" | "Elétrico" | "Mecânico" | "Refrigeração";
};

export const CHECKLIST_PMOC: ChecklistItem[] = [
  { key: "filtro_limpeza", label: "Limpeza dos filtros de ar", grupo: "Filtros" },
  { key: "filtro_estado", label: "Verificação do estado / troca de filtros", grupo: "Filtros" },
  { key: "serp_evap", label: "Limpeza da serpentina evaporadora", grupo: "Serpentina" },
  { key: "serp_cond", label: "Limpeza da serpentina condensadora", grupo: "Serpentina" },
  { key: "gab_interno", label: "Higienização do gabinete interno", grupo: "Serpentina" },
  { key: "bandeja", label: "Limpeza da bandeja de condensado", grupo: "Drenagem" },
  { key: "dreno", label: "Desobstrução da linha de dreno", grupo: "Drenagem" },
  { key: "vazamento_agua", label: "Verificação de vazamento de água", grupo: "Drenagem" },
  { key: "eletrico_aperto", label: "Reaperto das conexões elétricas", grupo: "Elétrico" },
  { key: "eletrico_isolamento", label: "Verificação do isolamento dos cabos", grupo: "Elétrico" },
  { key: "eletrico_aterramento", label: "Verificação do aterramento", grupo: "Elétrico" },
  { key: "ventilador", label: "Verificação de ventilador / hélice / motor", grupo: "Mecânico" },
  { key: "ruido", label: "Verificação de ruído e vibração", grupo: "Mecânico" },
  { key: "fixacao", label: "Verificação de fixação e nivelamento", grupo: "Mecânico" },
  { key: "isol_tubulacao", label: "Isolamento térmico da tubulação de gás", grupo: "Refrigeração" },
  { key: "vazamento_gas", label: "Teste de vazamento de gás refrigerante", grupo: "Refrigeração" },
  { key: "carga_gas", label: "Verificação da carga de gás (pressão)", grupo: "Refrigeração" },
];

// Medições numéricas registradas na manutenção.
export type MedicaoDef = { key: string; label: string; unidade: string };
export const MEDICOES: MedicaoDef[] = [
  { key: "temp_insuflamento", label: "Temperatura de insuflamento", unidade: "°C" },
  { key: "temp_retorno", label: "Temperatura de retorno", unidade: "°C" },
  { key: "temp_ambiente", label: "Temperatura ambiente", unidade: "°C" },
  { key: "umidade", label: "Umidade relativa", unidade: "%" },
  { key: "pressao_alta", label: "Pressão alta", unidade: "psi" },
  { key: "pressao_baixa", label: "Pressão baixa", unidade: "psi" },
  { key: "corrente_a", label: "Corrente elétrica", unidade: "A" },
  { key: "tensao_v", label: "Tensão", unidade: "V" },
];

export type ChecklistStatus = "conforme" | "nao_conforme" | "na";
export type ChecklistState = Record<string, ChecklistStatus>;
export type MedicoesState = Record<string, string>;
