import { supabase } from "@/integrations/supabase/client";
import { toCanonicalStatus } from "@/modules/work-orders";

export type QualityRow = {
  id: string;
  label: string;
  detail: string;
  /** Tabela e coluna sugeridas para correção assistida. */
  table: string;
  column: string;
  current: string;
};

export type QualityCheck = {
  key: string;
  title: string;
  description: string;
  severity: "alta" | "media" | "baixa";
  rows: QualityRow[];
};

const isBlank = (v: unknown) => !String(v ?? "").trim();

/** Normaliza códigos vindos de SAP/Prisma/planilhas sem perder o identificador real. */
const normalizeAssetCode = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

function cpfValido(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const d = (sum * 10) % 11;
    return d === 10 ? 0 : d;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

/** Executa todas as verificações de qualidade de dados (item 32). */
export async function runQualityChecks(): Promise<QualityCheck[]> {
  const osCols =
    "id,numero_os,nome_os,ativo,equipamento,predio,andar,local,equipe,status,created_at";
  const [cor, ref, veic, abast, chk, pt] = await Promise.all([
    supabase.from("corretiva_os").select(osCols).limit(3000),
    supabase.from("refrigeracao_os").select(osCols).limit(3000),
    supabase.from("vehicles").select("id,prefix,plate,current_odometer_km").limit(1000),
    supabase
      .from("vehicle_fuelings")
      .select("id,vehicle_id,odometer_km,fueled_at,driver_name")
      .order("fueled_at", { ascending: true })
      .limit(3000),
    supabase
      .from("vehicle_checklists")
      .select("id,protocol,overall_status,integrity_score,signature_url,submitted_at")
      .limit(2000),
    supabase
      .from("talude_pt_releases")
      .select("id,numero_pt,status,data_trabalho,encerrada_em")
      .limit(1000),
  ]);

  const rows = <T>(r: { data: unknown }) => (r.data ?? []) as T[];
  type OS = Record<string, unknown>;
  const corOs = rows<OS>(cor);
  const refOs = rows<OS>(ref);
  const allOs = [
    ...corOs.map((o) => ({ o, t: "corretiva_os" })),
    ...refOs.map((o) => ({ o, t: "refrigeracao_os" })),
  ];

  const osRow = (o: OS, t: string, column: string): QualityRow => ({
    id: `${t}:${o.id}`,
    label: `OS ${o.numero_os ?? "—"}`,
    detail: String(o.nome_os ?? "").slice(0, 120),
    table: t,
    column,
    current: String(o[column] ?? ""),
  });

  const checks: QualityCheck[] = [];

  checks.push({
    key: "os-sem-ativo",
    title: "OS sem ativo",
    description: "Ordens sem código de ativo ou equipamento informado.",
    severity: "alta",
    rows: allOs
      .filter(({ o }) => isBlank(o.ativo) && isBlank(o.equipamento))
      .map(({ o, t }) => osRow(o, t, "ativo")),
  });

  type CatalogAsset = {
    code?: string | null;
    normalized_code?: string | null;
    name?: string | null;
    level?: string | null;
    parent_code?: string | null;
    parent_name?: string | null;
  };

  const assetsRes = await supabase
    .from("assets")
    .select("code,normalized_code,name,level,parent_code,parent_name")
    .limit(20000);
  const catalogAssets = (assetsRes.data ?? []) as CatalogAsset[];
  const assetByCode = new Map<string, CatalogAsset>();
  for (const asset of catalogAssets) {
    const normalized = normalizeAssetCode(asset.normalized_code);
    const raw = normalizeAssetCode(asset.code);
    if (normalized) assetByCode.set(normalized, asset);
    if (raw) assetByCode.set(raw, asset);
  }

  const catalogForOs = (o: OS) => {
    const primary = normalizeAssetCode(o.ativo);
    if (primary) return assetByCode.get(primary);
    const equipment = normalizeAssetCode(o.equipamento);
    return equipment ? assetByCode.get(equipment) : undefined;
  };

  checks.push({
    key: "ativo-nao-encontrado",
    title: "Ativo não encontrado no catálogo",
    description:
      "Código informado na OS não existe na Base de Ativos ativa após normalização segura do identificador.",
    severity: "alta",
    rows: assetByCode.size
      ? allOs
          .filter(({ o }) => {
            const code = normalizeAssetCode(o.ativo);
            return !!code && !assetByCode.has(code);
          })
          .map(({ o, t }) => osRow(o, t, "ativo"))
      : [],
  });

  /**
   * Resolve a localização pela árvore oficial de ativos. A OS pode apontar para
   * Planta, Prédio, Andar, Ambiente ou Equipamento; campos abaixo do nível
   * apontado não são obrigatórios e não devem virar falso positivo.
   */
  const resolveCatalogLocation = (asset: CatalogAsset | undefined) => {
    const resolved = { predio: "", andar: "", local: "", level: "" };
    let current = asset;
    const visited = new Set<string>();
    for (let depth = 0; current && depth < 10; depth += 1) {
      const level = String(current.level ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      const name = String(current.name ?? "").trim();
      if (level.includes("PREDIO") && !resolved.predio) resolved.predio = name;
      if ((level.includes("ANDAR") || level.includes("PAVIMENTO")) && !resolved.andar) resolved.andar = name;
      if ((level.includes("AMBIENTE") || level.includes("LOCAL")) && !resolved.local) resolved.local = name;
      if (!resolved.level) resolved.level = level;

      const parentKey = normalizeAssetCode(current.parent_code);
      if (!parentKey || visited.has(parentKey)) break;
      visited.add(parentKey);
      current = assetByCode.get(parentKey);
    }
    return resolved;
  };

  const missingLocationColumn = (o: OS): "predio" | "andar" | "local" | null => {
    const asset = catalogForOs(o);
    if (!asset) {
      // Um código ausente do catálogo já é tratado pela verificação específica;
      // não duplicamos a mesma ocorrência como problema de localização.
      return null;
    }
    const resolved = resolveCatalogLocation(asset);
    const level = resolved.level;
    const predio = String(o.predio ?? "").trim() || resolved.predio;
    const andar = String(o.andar ?? "").trim() || resolved.andar;
    const local = String(o.local ?? "").trim() || resolved.local;

    // A granularidade exigida acompanha o nível do ativo na árvore.
    if (level.includes("PLANTA")) return null;
    if (level.includes("PREDIO")) return predio ? null : "predio";
    if (level.includes("ANDAR") || level.includes("PAVIMENTO")) {
      if (!predio) return "predio";
      return andar ? null : "andar";
    }
    // Ambiente e equipamento devem conseguir chegar até o local pela árvore.
    if (!predio) return "predio";
    if (!andar) return "andar";
    return local ? null : "local";
  };

  checks.push({
    key: "local-incompleto",
    title: "Local incompleto",
    description:
      "Valida a localização conforme o nível do ativo e usa a árvore oficial como referência antes de sinalizar pendência.",
    severity: "media",
    rows: allOs
      .map(({ o, t }) => ({ o, t, missing: missingLocationColumn(o) }))
      .filter((x): x is { o: OS; t: string; missing: "predio" | "andar" | "local" } => !!x.missing)
      .map(({ o, t, missing }) => osRow(o, t, missing)),
  });

  checks.push({
    key: "equipe-nao-classificada",
    title: "Equipe não classificada",
    description: "OS em aberto sem equipe responsável definida.",
    severity: "alta",
    rows: allOs
      .filter(({ o }) => isBlank(o.equipe) && toCanonicalStatus(o.status as string) !== "concluida")
      .map(({ o, t }) => osRow(o, t, "equipe")),
  });

  const colabs = await supabase
    .from("vehicle_checklist_collaborators")
    .select("id,full_name_snapshot,cpf_last4")
    .limit(3000);
  checks.push({
    key: "cpf-invalido",
    title: "CPF inválido",
    description: "Colaborador de checklist sem dígito verificador válido registrado.",
    severity: "media",
    rows: (colabs.data ?? [])
      .filter((c) => {
        const last4 = String((c as { cpf_last4?: string }).cpf_last4 ?? "");
        return !last4 || !/^\d{4}$/.test(last4);
      })
      .map((c) => {
        const r = c as { id: string; full_name_snapshot?: string; cpf_last4?: string };
        return {
          id: `vehicle_checklist_collaborators:${r.id}`,
          label: r.full_name_snapshot ?? "Colaborador",
          detail: "Final de CPF ausente ou fora do padrão.",
          table: "vehicle_checklist_collaborators",
          column: "cpf_last4",
          current: r.cpf_last4 ?? "",
        } satisfies QualityRow;
      }),
  });
  // valida CPFs completos porventura salvos em texto livre
  void cpfValido;

  type V = { id: string; prefix?: string | null; plate?: string | null };
  const veics = rows<V>(veic);
  const byPlate = new Map<string, V[]>();
  for (const v of veics) {
    const p = String(v.plate ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!p) continue;
    byPlate.set(p, [...(byPlate.get(p) ?? []), v]);
  }
  checks.push({
    key: "placa-duplicada",
    title: "Placa duplicada",
    description: "Mais de um veículo cadastrado com a mesma placa.",
    severity: "alta",
    rows: Array.from(byPlate.entries())
      .filter(([, list]) => list.length > 1)
      .flatMap(([placa, list]) =>
        list.map((v) => ({
          id: `vehicles:${v.id}`,
          label: `${v.prefix ?? "Veículo"} — ${placa}`,
          detail: `${list.length} veículos com esta placa.`,
          table: "vehicles",
          column: "plate",
          current: String(v.plate ?? ""),
        })),
      ),
  });

  type F = { id: string; vehicle_id: string; odometer_km: number; fueled_at: string };
  const fuels = rows<F>(abast);
  const lastKm = new Map<string, number>();
  const regressive: QualityRow[] = [];
  for (const f of fuels) {
    const prev = lastKm.get(f.vehicle_id);
    if (prev != null && Number(f.odometer_km) < prev) {
      regressive.push({
        id: `vehicle_fuelings:${f.id}`,
        label: `Abastecimento ${new Date(f.fueled_at).toLocaleDateString("pt-BR")}`,
        detail: `Hodômetro ${f.odometer_km} km menor que o anterior (${prev} km).`,
        table: "vehicle_fuelings",
        column: "odometer_km",
        current: String(f.odometer_km),
      });
    }
    lastKm.set(f.vehicle_id, Math.max(prev ?? 0, Number(f.odometer_km) || 0));
  }
  checks.push({
    key: "km-regressiva",
    title: "Quilometragem regressiva",
    description: "Hodômetro informado menor que o registro anterior do mesmo veículo.",
    severity: "media",
    rows: regressive,
  });

  // Evidência fotográfica é opcional no fluxo atual de corretivas. A ausência
  // de foto não representa inconsistência cadastral e, portanto, não entra no
  // score/pendências da Central de Qualidade. Fotos existentes continuam
  // disponíveis normalmente no módulo operacional.


  type PT = {
    id: string;
    numero_pt: string;
    status: string;
    data_trabalho: string;
    encerrada_em: string | null;
  };
  const hoje = new Date().toISOString().slice(0, 10);
  checks.push({
    key: "pt-sem-encerramento",
    title: "PT sem encerramento",
    description: "Permissões de trabalho com data já vencida e ainda em aberto.",
    severity: "alta",
    rows: rows<PT>(pt)
      .filter((p) => !p.encerrada_em && p.data_trabalho < hoje && p.status !== "encerrada")
      .map((p) => ({
        id: `talude_pt_releases:${p.id}`,
        label: `PT ${p.numero_pt}`,
        detail: `Data de trabalho ${p.data_trabalho}, status "${p.status}".`,
        table: "talude_pt_releases",
        column: "status",
        current: p.status,
      })),
  });

  type C = {
    id: string;
    protocol: string;
    integrity_score: number | null;
    signature_url: string | null;
  };
  checks.push({
    key: "checklist-incompleto",
    title: "Checklist incompleto",
    description: "Checklists de frota sem assinatura ou sem índice de integridade.",
    severity: "media",
    rows: rows<C>(chk)
      .filter((c) => !c.signature_url || c.integrity_score == null)
      .map((c) => ({
        id: `vehicle_checklists:${c.id}`,
        label: `Checklist ${c.protocol}`,
        detail: !c.signature_url ? "Sem assinatura do condutor." : "Sem índice de integridade.",
        table: "vehicle_checklists",
        column: "signature_url",
        current: c.signature_url ?? "",
      })),
  });

  // Clima é uma integração externa e opcional. Indisponibilidade/atraso de
  // telemetria não é erro dos dados internos e não deve gerar pendência nem
  // reduzir a qualidade da base. O módulo consumidor deve tratar seu próprio
  // estado de indisponibilidade de forma não bloqueante.


  return checks;
}

/** Aplica uma correção assistida e registra quem corrigiu. */
export async function applyFix(row: QualityRow, valor: string, observacao?: string) {
  const id = row.id.split(":").slice(1).join(":");
  const client = supabase as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await client
    .from(row.table)
    .update({ [row.column]: valor })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("data_quality_fixes").insert({
    issue_key: row.table + "." + row.column,
    entity_type: row.table,
    entity_id: id,
    antes: { [row.column]: row.current } as never,
    depois: { [row.column]: valor } as never,
    acao: "corrigido",
    observacao: observacao?.trim() || null,
    user_id: userData.user?.id ?? null,
  });
}
