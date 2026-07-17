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
  const self = index.byCodigo.get(code);
  if (!self) {
    // Fallback compat: LEFT(5/7) — só quando não há árvore real na base.
    if (!index.hasTree) {
      const p5 = index.byCodigo.get(code.slice(0, 5));
      const p7 = index.byCodigo.get(code.slice(0, 7));
      return {
        predio: p5?.nome ?? "",
        andar: p7?.nome ?? "",
        espaco: "",
        found: !!(p5 || p7),
      };
    }
    return { predio: "", andar: "", espaco: "", found: false };
  }

  const predio = findAncestor(index, code, (n) => n.nivel === "PREDIO");
  const andar = findAncestor(index, code, (n) => n.nivel === "ANDAR");
  // Espaço = o próprio nó se for Ambiente/Andar/Prédio; se for Equipamento,
  // sobe até o Ambiente pai (não expõe o nome do equipamento como "espaço").
  let espacoNode: AssetNode | null = self;
  if (self.nivel === "EQUIPAMENTO") {
    espacoNode = findAncestor(index, code, (n) => n.nivel === "AMBIENTE");
  } else if (self.nivel === "ANDAR" || self.nivel === "PREDIO" || self.nivel === "PLANTA") {
    // Chamado aberto no nível de Andar/Prédio: espaço fica vazio.
    espacoNode = null;
  }

  return {
    predio: predio?.nome ?? "",
    andar: andar?.nome ?? "",
    espaco: espacoNode?.nome ?? "",
    found: true,
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
