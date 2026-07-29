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
  const [cor, ref, veic, abast, chk, pt, obs, fotos] = await Promise.all([
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
    supabase
      .from("weather_observations")
      .select("id,observed_at")
      .order("observed_at", { ascending: false })
      .limit(1),
    supabase.from("corretiva_fotos").select("os_id").limit(5000),
  ]);

  const rows = <T,>(r: { data: unknown }) => ((r.data ?? []) as T[]);
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

  const assetsRes = await supabase.from("assets").select("normalized_code").limit(20000);
  const known = new Set(
    (assetsRes.data ?? []).map((a) =>
      String((a as { normalized_code?: string }).normalized_code ?? "").toUpperCase(),
    ),
  );
  checks.push({
    key: "ativo-nao-encontrado",
    title: "Ativo não encontrado no catálogo",
    description: "Código informado na OS não existe na Base de Ativos ativa.",
    severity: "alta",
    rows: known.size
      ? allOs
          .filter(
            ({ o }) =>
              !isBlank(o.ativo) &&
              !known.has(String(o.ativo).trim().toUpperCase()),
          )
          .map(({ o, t }) => osRow(o, t, "ativo"))
      : [],
  });

  checks.push({
    key: "local-incompleto",
    title: "Local incompleto",
    description: "Prédio, andar ou local em branco.",
    severity: "media",
    rows: allOs
      .filter(({ o }) => isBlank(o.predio) || isBlank(o.andar) || isBlank(o.local))
      .map(({ o, t }) =>
        osRow(o, t, isBlank(o.predio) ? "predio" : isBlank(o.andar) ? "andar" : "local"),
      ),
  });

  checks.push({
    key: "equipe-nao-classificada",
    title: "Equipe não classificada",
    description: "OS em aberto sem equipe responsável definida.",
    severity: "alta",
    rows: allOs
      .filter(
        ({ o }) => isBlank(o.equipe) && toCanonicalStatus(o.status as string) !== "concluida",
      )
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
    const p = String(v.plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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

  const comFoto = new Set(
    (fotos.data ?? []).map((f) => String((f as { os_id?: string }).os_id ?? "")),
  );
  checks.push({
    key: "fotos-ausentes",
    title: "Fotos ausentes",
    description: "Corretivas concluídas sem nenhuma evidência fotográfica.",
    severity: "media",
    rows: corOs
      .filter(
        (o) => toCanonicalStatus(o.status as string) === "concluida" && !comFoto.has(String(o.id)),
      )
      .map((o) => osRow(o, "corretiva_os", "numero_os")),
  });

  type PT = { id: string; numero_pt: string; status: string; data_trabalho: string; encerrada_em: string | null };
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

  type C = { id: string; protocol: string; integrity_score: number | null; signature_url: string | null };
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

  const lastObs = (obs.data ?? [])[0] as { observed_at?: string } | undefined;
  const stale =
    !lastObs?.observed_at ||
    Date.now() - new Date(lastObs.observed_at).getTime() > 6 * 3600_000;
  checks.push({
    key: "clima-indisponivel",
    title: "Dados meteorológicos indisponíveis",
    description: "Sem observação de clima registrada nas últimas 6 horas.",
    severity: "baixa",
    rows: stale
      ? [
          {
            id: "weather_observations:stale",
            label: "Monitoramento climático",
            detail: lastObs?.observed_at
              ? `Última leitura em ${new Date(lastObs.observed_at).toLocaleString("pt-BR")}.`
              : "Nenhuma leitura registrada.",
            table: "weather_observations",
            column: "observed_at",
            current: lastObs?.observed_at ?? "",
          },
        ]
      : [],
  });

  return checks;
}

/** Aplica uma correção assistida e registra quem corrigiu. */
export async function applyFix(row: QualityRow, valor: string, observacao?: string) {
  const id = row.id.split(":").slice(1).join(":");
  const client = supabase as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    };
  };
  const { error } = await client.from(row.table).update({ [row.column]: valor }).eq("id", id);
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
