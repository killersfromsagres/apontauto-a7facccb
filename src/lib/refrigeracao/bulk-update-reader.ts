// Leitura da planilha de atualização em massa de OS de Refrigeração.
// Somente `numero_os` é obrigatório. Demais campos são opcionais e só
// serão aplicados quando presentes na planilha (células vazias são ignoradas
// para não sobrescrever dados existentes com nulos).

export type RefrigOsUpdate = {
  numero_os: string;
  patch: Partial<{
    nome_os: string | null;
    predio: string | null;
    andar: string | null;
    local: string | null;
    tipo: string | null;
    equipe: string | null;
    ativo: string;
    equipamento: string;
    patrimonio: string | null;
  }>;
};

const norm = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

type Field =
  | "numero_os"
  | "nome_os"
  | "predio"
  | "andar"
  | "local"
  | "tipo"
  | "equipe"
  | "ativo"
  | "equipamento"
  | "patrimonio";

const ALIASES: Record<Field, string[]> = {
  numero_os: ["ordemdeservico", "os", "numeroos", "nos", "ordemservico", "numero"],
  nome_os: ["nomeos", "nome", "descricao", "descricaoos"],
  predio: ["predio", "novopredio", "edificio"],
  andar: ["andar", "novoandar", "pavimento"],
  local: ["local", "novoambiente", "ambiente", "novolocal", "localizacao", "sala"],
  tipo: ["tipo", "novotipo"],
  equipe: ["equipe", "novaequipe", "colaborador", "novocolaborador", "responsavel", "time"],
  ativo: ["ativo", "novoativo", "codigoativo", "tag"],
  equipamento: ["equipamento", "novoequipamento", "descricaoequip"],
  patrimonio: ["patrimonio", "novopatrimonio"],
};

export async function readRefrigOsUpdateFile(file: File): Promise<RefrigOsUpdate[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha vazia.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rows.length === 0) return [];

  const headerMap = new Map<string, Field>();
  for (const raw of Object.keys(rows[0])) {
    const nk = norm(raw);
    for (const [target, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (aliases.some((a) => nk === a || nk.startsWith(a))) {
        if (!headerMap.has(raw)) headerMap.set(raw, target);
        break;
      }
    }
  }

  const present = new Set(headerMap.values());
  if (!present.has("numero_os")) {
    throw new Error("Coluna obrigatória ausente: 'Ordem de Serviço' (numero_os).");
  }

  const out = new Map<string, RefrigOsUpdate>();
  for (const r of rows) {
    const patch: RefrigOsUpdate["patch"] = {};
    let numero = "";
    for (const [rawKey, field] of headerMap) {
      const rawVal = r[rawKey];
      const val = rawVal == null ? "" : String(rawVal).trim();
      if (field === "numero_os") {
        numero = val;
        continue;
      }
      if (val === "") continue; // ignora vazios — não sobrescreve
      if (field === "ativo" || field === "equipamento") {
        patch[field] = val;
      } else {
        (patch as any)[field] = val;
      }
    }
    if (!numero) continue;
    if (Object.keys(patch).length === 0) continue;
    // dedup por numero_os — mantém a última ocorrência mesclada
    const prev = out.get(numero);
    out.set(numero, { numero_os: numero, patch: { ...(prev?.patch ?? {}), ...patch } });
  }
  return Array.from(out.values());
}
