from pathlib import Path
import re

root = Path.cwd()

path = root / "src/lib/materiais/cost-center-mapping.ts"
text = path.read_text(encoding="utf-8")
old_norm = '''export function normalizeAssetCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\\s+/g, "");
}
'''
new_norm = '''export function normalizeAssetCode(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
'''
if old_norm not in text:
    raise SystemExit("normalizeAssetCode target not found")
text = text.replace(old_norm, new_norm)

old_resolver = '''export function resolveCostCenter(
  item: { centro_custo?: string | null } | null | undefined,
  os: { ativo?: string | null } | null | undefined,
  mappings?: Map<string, AssetCostCenterRecord>,
) {
  const persisted = normalizeCostCenter(item?.centro_custo);
  if (persisted) return persisted;
  const asset = normalizeAssetCode(os?.ativo);
  if (!asset || !mappings) return "";
  return mappings.get(asset)?.cost_center || "";
}
'''
new_resolver = '''export function resolveCostCenter(
  item: { centro_custo?: string | null } | null | undefined,
  os: { ativo?: string | null } | null | undefined,
  mappings?: Map<string, AssetCostCenterRecord>,
) {
  const persisted = normalizeCostCenter(item?.centro_custo);
  if (persisted) return persisted;

  const asset = normalizeAssetCode(os?.ativo);
  if (!asset || !mappings?.size) return "";

  // Primeiro respeita um vínculo exato. Quando a OS possui um ativo detalhado
  // (ex.: DEMPATESAL15), aplica o prefixo patrimonial mais específico cadastrado
  // na base oficial (ex.: DEMPA -> Centro de Custo do prédio A160).
  const exact = mappings.get(asset)?.cost_center;
  if (exact) return exact;

  let bestCostCenter = "";
  let bestPrefixLength = 0;
  for (const [prefix, record] of mappings.entries()) {
    const normalizedPrefix = normalizeAssetCode(prefix);
    if (!normalizedPrefix || normalizedPrefix.length <= bestPrefixLength) continue;
    if (!asset.startsWith(normalizedPrefix)) continue;
    const candidate = normalizeCostCenter(record.cost_center);
    if (!candidate) continue;
    bestPrefixLength = normalizedPrefix.length;
    bestCostCenter = candidate;
  }

  return bestCostCenter;
}
'''
if old_resolver not in text:
    raise SystemExit("resolveCostCenter target not found")
text = text.replace(old_resolver, new_resolver)
path.write_text(text, encoding="utf-8")

pdf_path = root / "src/lib/materiais/compras-premium-pdf.ts"
pdf = pdf_path.read_text(encoding="utf-8")
if "const selected = photos.slice(0, 6);" not in pdf:
    raise SystemExit("PDF photo selection target not found")
pdf = pdf.replace("const selected = photos.slice(0, 6);", "const selected = photos;")
pdf, count = re.subn(
    r'\n  if \(photos\.length > selected\.length\) \{.*?\n  \}\n  return y;',
    '\n  return y;',
    pdf,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("PDF remaining-photo note target not found")
pdf_path.write_text(pdf, encoding="utf-8")

print("Centro de Custo por prefixo e PDF completo atualizados.")
