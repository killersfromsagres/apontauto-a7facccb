// Motor de priorização inteligente do Backorder.
// Aplica regras configuráveis (palavras-gatilho, prédios sensíveis,
// criticidade original, tempo em aberto) sobre cada OS aberta.

export type PredioSensivel = { predio: string; motivo: string; nivel: number };
export type KeywordRule = {
  familia: string;
  label: string;
  nivel: number;
  keywords: string[];
};

export interface PriorityConfig {
  predios_sensiveis: PredioSensivel[];
  keyword_rules: KeywordRule[];
  dias_forca_prioridade: number;
  familias_habilitadas: Record<string, boolean>;
  last_scan_at: string | null;
}

export const DEFAULT_CONFIG: PriorityConfig = {
  predios_sensiveis: [{ predio: "C70", motivo: "Área de Cozinha", nivel: 3 }],
  keyword_rules: [
    {
      familia: "higiene",
      label: "Higiene/Saúde",
      nivel: 3,
      keywords: [
        "sanitario entupido",
        "entupimento",
        "vazamento de esgoto",
        "esgoto",
        "mau cheiro",
        "falta de agua",
        "contaminacao",
        "banheiro entupido",
      ],
    },
    {
      familia: "seguranca",
      label: "Risco Operacional",
      nivel: 3,
      keywords: [
        "fio exposto",
        "cabo exposto",
        "curto circuito",
        "principio de incendio",
        "vazamento de gas",
        "estrutura comprometida",
        "porta de emergencia",
        "risco de queda",
      ],
    },
    {
      familia: "cozinha",
      label: "Área de Cozinha",
      nivel: 2,
      keywords: ["cozinha", "refeitorio", "copa", "restaurante", "camara fria"],
    },
  ],
  dias_forca_prioridade: 60,
  familias_habilitadas: {
    higiene: true,
    cozinha: true,
    seguranca: true,
    criticidade: true,
    tempo: true,
  },
  last_scan_at: null,
};

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export interface ScanInputRow {
  os: string;
  nome: string;
  ativo: string;
  predio: string;
  espaco: string;
  outros: string;
  criticidade?: string;
  atividade: string;
  data_solicitacao: string;
  finalizado: boolean;
}

export interface ScanResult {
  os: string;
  is_prioridade: boolean;
  motivo_prioridade: string | null;
  prioridade_nivel: number;
}

function daysBetween(iso: string): number {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}

export function scanRow(row: ScanInputRow, cfg: PriorityConfig): ScanResult {
  if (row.finalizado) {
    return { os: row.os, is_prioridade: false, motivo_prioridade: null, prioridade_nivel: 0 };
  }

  const hits: Array<{ label: string; nivel: number }> = [];
  const hay = [row.nome, row.espaco, row.outros, row.ativo].map(norm).join(" | ");
  const predio = norm(row.predio);

  // Prédios sensíveis
  if (cfg.familias_habilitadas.cozinha !== false) {
    for (const p of cfg.predios_sensiveis) {
      if (predio && predio.includes(norm(p.predio))) {
        hits.push({ label: `Prédio ${p.predio} — ${p.motivo}`, nivel: p.nivel });
      }
    }
  }

  // Palavras-gatilho
  for (const rule of cfg.keyword_rules) {
    if (cfg.familias_habilitadas[rule.familia] === false) continue;
    for (const kw of rule.keywords) {
      if (hay.includes(norm(kw))) {
        hits.push({ label: `${rule.label} — “${kw}”`, nivel: rule.nivel });
        break;
      }
    }
  }

  // Criticidade original alta
  if (cfg.familias_habilitadas.criticidade !== false) {
    const crit = norm(row.criticidade ?? "");
    if (/emergenc|alta|urgen|critic/.test(crit)) {
      hits.push({ label: "Criticidade original alta", nivel: 3 });
    }
  }

  // Tempo em aberto
  if (cfg.familias_habilitadas.tempo !== false) {
    const dias = daysBetween(row.data_solicitacao);
    if (dias >= cfg.dias_forca_prioridade) {
      hits.push({ label: `Aberto há ${dias} dias`, nivel: 1 });
    }
  }

  if (hits.length === 0) {
    return { os: row.os, is_prioridade: false, motivo_prioridade: null, prioridade_nivel: 0 };
  }

  hits.sort((a, b) => b.nivel - a.nivel);
  const top = hits[0];
  const motivo = hits
    .slice(0, 3)
    .map((h) => h.label)
    .join(" · ");
  return {
    os: row.os,
    is_prioridade: true,
    motivo_prioridade: motivo,
    prioridade_nivel: top.nivel,
  };
}

export function scanAll(rows: ScanInputRow[], cfg: PriorityConfig): ScanResult[] {
  return rows.map((r) => scanRow(r, cfg));
}
