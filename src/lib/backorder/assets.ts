// Resolve Prédio / Andar / Espaço a partir do código do Ativo,
// usando a tabela assets_ref (Ativo → Denominação).
//
// Regra de hierarquia:
//  - Prédio  = denominação da linha cujo código = LEFT(ativo, 5)
//  - Andar   = denominação da linha cujo código = LEFT(ativo, 7)
//  - Espaço  = denominação da linha cujo código = ativo completo

export interface AssetRef {
  ativo: string;
  denominacao: string;
}

export interface Resolved {
  predio: string;
  andar: string;
  espaco: string;
  found: boolean; // false quando código não existir em nenhum nível
}

export function buildAssetIndex(refs: AssetRef[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const r of refs) {
    const key = (r.ativo ?? "").trim();
    if (key) idx.set(key.toUpperCase(), r.denominacao ?? "");
  }
  return idx;
}

export function resolveAtivo(index: Map<string, string>, ativoRaw: string): Resolved {
  const ativo = (ativoRaw ?? "").trim().toUpperCase();
  if (!ativo) return { predio: "", andar: "", espaco: "", found: false };
  const predio = index.get(ativo.slice(0, 5)) ?? "";
  const andar = index.get(ativo.slice(0, 7)) ?? "";
  const espaco = index.get(ativo) ?? "";
  return {
    predio,
    andar,
    espaco,
    found: Boolean(predio || andar || espaco),
  };
}
