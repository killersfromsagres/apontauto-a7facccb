// Motor central de resolução hierárquica de Ativos.
//
// Substitui a lógica antiga baseada em LEFT(codigo, 5/7): agora
// caminha pela árvore via `codigo_pai` + `nivel`, o que funciona para
// qualquer unidade/planta independentemente do tamanho do código.
// Mantém compatibilidade com bases antigas (sem `nivel`/`codigo_pai`)
// caindo em fallback por comprimento — sinaliza que a base precisa
// ser reimportada com a estrutura completa.

export interface AssetNode {
  codigo: string;
  nome: string;
  nivel: NivelAtivo;
  codigoPai: string | null;
}

export type NivelAtivo =
  | "PLANTA"
  | "PREDIO"
  | "ANDAR"
  | "AMBIENTE"
  | "EQUIPAMENTO"
  | "";

export interface AssetsIndex {
  byCodigo: Map<string, AssetNode>;
  /** true quando a base tem informação de hierarquia real (nível/pai). */
  hasTree: boolean;
}

const norm = (v: unknown) =>
  String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function classifyNivel(raw: string): NivelAtivo {
  const s = norm(raw);
  if (!s) return "";
  if (s.includes("PLANTA")) return "PLANTA";
  if (s.includes("PREDIO") || s.includes("AREA")) return "PREDIO";
  if (s.includes("ANDAR") || s.includes("PAVIMENT")) return "ANDAR";
  if (s.includes("AMBIENTE") || s.includes("LOCAL")) return "AMBIENTE";
  if (s.includes("EQUIP")) return "EQUIPAMENTO";
  return "";
}

export function buildAssetsIndex(
  rows: Array<{ ativo: string; denominacao?: string; nivel?: string; codigo_pai?: string | null }>,
): AssetsIndex {
  const byCodigo = new Map<string, AssetNode>();
  let hasTree = false;
  for (const r of rows) {
    const codigo = String(r.ativo ?? "").trim().toUpperCase();
    if (!codigo) continue;
    const nivel = classifyNivel(String(r.nivel ?? ""));
    const pai = r.codigo_pai ? String(r.codigo_pai).trim().toUpperCase() : null;
    if (nivel || pai) hasTree = true;
    byCodigo.set(codigo, {
      codigo,
      nome: String(r.denominacao ?? "").trim(),
      nivel,
      codigoPai: pai || null,
    });
  }
  return { byCodigo, hasTree };
}

/** Sobe a árvore a partir de `code` até encontrar o primeiro ancestral
 *  (inclusivo) que satisfaça o predicado. */
function findAncestor(
  index: AssetsIndex,
  code: string,
  match: (node: AssetNode) => boolean,
): AssetNode | null {
  let cur = index.byCodigo.get(code) ?? null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.codigo)) {
    if (match(cur)) return cur;
    seen.add(cur.codigo);
    cur = cur.codigoPai ? index.byCodigo.get(cur.codigoPai) ?? null : null;
  }
  return null;
}

export interface ResolveResult {
  predio: string;
  andar: string;
  espaco: string;
  found: boolean;
}

export function resolveAtivoTree(index: AssetsIndex, ativo: string): ResolveResult {
  const code = String(ativo ?? "").trim().toUpperCase();
  if (!code) return { predio: "", andar: "", espaco: "", found: false };

  // Fallback estilo VLOOKUP manual do Excel:
  //   Prédio   = VLOOKUP(LEFT(ativo;5); ativos)
  //   Andar    = VLOOKUP(LEFT(ativo;7); ativos)
  //   Ambiente = VLOOKUP(ativo;         ativos)
  // Aplicado por-Ativo quando a árvore não devolve o nível — reproduz
  // exatamente o comportamento que o usuário fazia arrastando a fórmula.
  const byLeft = (n: number) => {
    if (code.length < n) return "";
    const node = index.byCodigo.get(code.slice(0, n));
    return node?.nome ?? "";
  };
  const self = index.byCodigo.get(code);

  if (!self) {
    // Ativo desconhecido: só resta o LEFT.
    const predio = byLeft(5);
    const andar = byLeft(7);
    const espaco = ""; // sem self, não temos Ambiente confiável
    return { predio, andar, espaco, found: !!(predio || andar) };
  }

  const predioNode = findAncestor(index, code, (n) => n.nivel === "PREDIO");
  const andarNode = findAncestor(index, code, (n) => n.nivel === "ANDAR");
  // Espaço = o próprio nó se for Ambiente/Andar/Prédio; se for Equipamento,
  // sobe até o Ambiente pai (não expõe o nome do equipamento como "espaço").
  let espacoNode: AssetNode | null = self;
  if (self.nivel === "EQUIPAMENTO") {
    espacoNode = findAncestor(index, code, (n) => n.nivel === "AMBIENTE");
  } else if (self.nivel === "ANDAR" || self.nivel === "PREDIO" || self.nivel === "PLANTA") {
    espacoNode = null;
  }

  // Preenchimento com fallback LEFT quando árvore veio vazia.
  let predio = predioNode?.nome ?? "";
  let andar = andarNode?.nome ?? "";
  let espaco = espacoNode?.nome ?? "";
  if (!predio) predio = byLeft(5);
  if (!andar) andar = byLeft(7);
  if (!espaco && self.nivel !== "PLANTA" && self.nivel !== "PREDIO" && self.nivel !== "ANDAR") {
    // Ambiente = próprio ativo pelo nome (VLOOKUP direto).
    espaco = self.nome ?? "";
  }

  return { predio, andar, espaco, found: true };
}


/** Diagnóstico do Ativo para decidir badges "—" (não aplicável) vs "não encontrado".
 *  Não faz adivinhação — usa exclusivamente a árvore real. */
export function describeAtivo(index: AssetsIndex, ativo: string): {
  found: boolean;
  nivelSelf: NivelAtivo;
  /** Campos em que "vazio" é esperado (o próprio Ativo já é aquele nível ou acima). */
  naFields: { predio: boolean; andar: boolean; espaco: boolean };
} {
  const code = String(ativo ?? "").trim().toUpperCase();
  const self = code ? index.byCodigo.get(code) : undefined;
  if (!self) {
    return {
      found: false,
      nivelSelf: "",
      naFields: { predio: false, andar: false, espaco: false },
    };
  }
  const nivel = self.nivel;
  return {
    found: true,
    nivelSelf: nivel,
    naFields: {
      predio: nivel === "PLANTA",
      andar: nivel === "PLANTA" || nivel === "PREDIO",
      espaco: nivel === "PLANTA" || nivel === "PREDIO" || nivel === "ANDAR",
    },
  };
}

// -------------------------------------------------------------------
// Compat com a API antiga (assets.ts anterior). Muitos call sites
// ainda usam `makeAssetsMap` / `resolveAtivo` — mantemos como shim.
// -------------------------------------------------------------------
export type AssetsMap = AssetsIndex;

export function makeAssetsMap(
  rows: Array<{ ativo: string; denominacao?: string; nivel?: string; codigo_pai?: string | null }>,
): AssetsMap {
  return buildAssetsIndex(rows);
}

export function resolveAtivo(
  map: AssetsMap,
  ativo: string,
): { predio: string; andar: string; espaco: string } {
  const r = resolveAtivoTree(map, ativo);
  return { predio: r.predio, andar: r.andar, espaco: r.espaco };
}
