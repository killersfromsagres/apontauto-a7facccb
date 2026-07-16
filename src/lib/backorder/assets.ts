// Resolve Prédio/Andar/Espaço a partir do código do Ativo,
// equivalente aos VLOOKUP da planilha de referência.

export type AssetsMap = Map<string, string>; // ativo (upper) → denominação

export function makeAssetsMap(rows: Array<{ ativo: string; denominacao: string }>): AssetsMap {
  const m: AssetsMap = new Map();
  for (const r of rows) {
    const key = String(r.ativo ?? "").trim().toUpperCase();
    if (!key) continue;
    m.set(key, String(r.denominacao ?? "").trim());
  }
  return m;
}

export function resolveAtivo(
  assets: AssetsMap,
  ativo: string,
): { predio: string; andar: string; espaco: string } {
  const code = String(ativo ?? "").trim().toUpperCase();
  if (!code) return { predio: "", andar: "", espaco: "" };
  const p5 = code.slice(0, 5);
  const p7 = code.slice(0, 7);
  return {
    predio: assets.get(p5) ?? "",
    andar: assets.get(p7) ?? "",
    espaco: assets.get(code) ?? "",
  };
}
