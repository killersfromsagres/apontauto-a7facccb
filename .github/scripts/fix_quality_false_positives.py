from pathlib import Path

path = Path('src/features/quality/checks.ts')
text = path.read_text(encoding='utf-8')

# Add robust code normalizer after isBlank.
old = 'const isBlank = (v: unknown) => !String(v ?? "").trim();\n'
new = '''const isBlank = (v: unknown) => !String(v ?? "").trim();

/** Normaliza códigos vindos de SAP/Prisma/planilhas sem perder o identificador real. */
const normalizeAssetCode = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
'''
if old not in text:
    raise SystemExit('isBlank anchor not found')
text = text.replace(old, new, 1)

# Remove weather/photos from the initial data fan-out. Both are non-blocking/optional quality dimensions.
old = '''  const [cor, ref, veic, abast, chk, pt, obs, fotos] = await Promise.all([
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
  ]);'''
new = '''  const [cor, ref, veic, abast, chk, pt] = await Promise.all([
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
  ]);'''
if old not in text:
    raise SystemExit('Promise.all block not found')
text = text.replace(old, new, 1)

# Replace catalog + location rules with normalized matching and hierarchical fallback.
start = text.index('  const assetsRes = await supabase.from("assets")')
end = text.index('\n\n  checks.push({\n    key: "equipe-nao-classificada"', start)
new_block = '''  type CatalogAsset = {
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
      const level = String(current.level ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toUpperCase();
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
  });'''
text = text[:start] + new_block + text[end:]

# Remove photo check: photos are optional evidence in the current corrective workflow.
photo_start = text.index('  const comFoto = new Set(')
photo_end = text.index('\n\n  type PT = {', photo_start)
text = text[:photo_start] + '''  // Evidência fotográfica é opcional no fluxo atual de corretivas. A ausência
  // de foto não representa inconsistência cadastral e, portanto, não entra no
  // score/pendências da Central de Qualidade. Fotos existentes continuam
  // disponíveis normalmente no módulo operacional.
''' + text[photo_end:]

# Remove weather check: external/optional telemetry must not degrade data quality.
weather_start = text.index('  const lastObs = (obs.data ?? [])[0]')
weather_end = text.index('\n\n  return checks;', weather_start)
text = text[:weather_start] + '''  // Clima é uma integração externa e opcional. Indisponibilidade/atraso de
  // telemetria não é erro dos dados internos e não deve gerar pendência nem
  // reduzir a qualidade da base. O módulo consumidor deve tratar seu próprio
  // estado de indisponibilidade de forma não bloqueante.
''' + text[weather_end:]

path.write_text(text, encoding='utf-8')
