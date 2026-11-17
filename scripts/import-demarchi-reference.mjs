// Read-only workbook extraction. Usage: node scripts/import-demarchi-reference.mjs /path/formula.xlsx
// Outputs additive SQL; never writes or changes the input workbook.
import fs from "node:fs";
import crypto from "node:crypto";
import XLSX from "xlsx";

const input = process.argv[2];
if (!input) throw new Error("Informe o caminho da planilha de referência.");
const book = XLSX.read(fs.readFileSync(input), { type: "buffer" });
const read = (name) =>
  XLSX.utils
    .sheet_to_json(book.Sheets[name], { header: 1, defval: "" })
    .slice(1)
    .filter((r) => r.some((v) => v !== ""));
const raw = read("ativos");
const levels = {
  PLANTA: "planta",
  "PRÉDIO / ÁREA": "predio",
  "ANDAR / PAVIMENTO": "andar",
  "AMBIENTE / LOCAL": "ambiente",
  EQUIPAMENTO: "equipamento",
};
const quote = (value) => (value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`);
const assets = raw.map((row, i) => ({
  code: `DEM${String(i + 1).padStart(6, "0")}`,
  source: String(row[2]).trim(),
  name: String(row[3]).trim(),
  kind: levels[row[1]],
  parent: String(row[4]).trim(),
}));
const bySource = new Map(assets.map((a) => [a.source, a]));
if (bySource.size !== assets.length || assets.some((a) => !a.kind || !a.name || !a.source))
  throw new Error("Ativos duplicados ou inválidos.");
const depth = (asset, seen = new Set()) => {
  if (seen.has(asset.source)) throw new Error("Ciclo na hierarquia.");
  if (asset.kind === "planta") return 0;
  const parent = bySource.get(asset.parent);
  if (!parent) throw new Error(`Pai ausente: ${asset.source}`);
  return 1 + depth(parent, new Set([...seen, asset.source]));
};
const assetParts = [
  "-- Fonte: formula.xlsx, aba ativos. Códigos temporários editáveis; vínculos usam UUID.\nbegin;\n",
];
for (let d = 0; d <= 4; d++) {
  const group = assets.filter((a) => depth(a) === d);
  for (let offset = 0; offset < group.length; offset += 500) {
    const chunk = group.slice(offset, offset + 500);
    assetParts.push(
      `insert into public.dem_assets(code,name,kind,source_ref,parent_id,source_parent)\nselect x.code,x.name,x.kind,x.source_ref,p.id,x.source_parent from (values\n${chunk.map((a) => `(${[a.code, a.name, a.kind, a.source, a.kind === "planta" ? null : a.parent].map(quote).join(",")})`).join(",\n")}\n) x(code,name,kind,source_ref,source_parent) left join public.dem_assets p on p.source_ref=x.source_parent\non conflict(source_ref) do nothing;\n`,
    );
  }
}
assetParts.push(
  `select setval('public.dem_asset_number_seq',greatest(${assets.length}, coalesce((select max(substring(code from '^DEM([0-9]+)$')::bigint) from public.dem_assets),1)));\ncommit;\n`,
);
fs.writeFileSync(
  "supabase/migrations/20261117142642_demarchi_reference_assets.sql",
  assetParts.join("\n"),
);

const planVersions = [
  "20261117142656",
  "20261117142703",
  "20261117142726",
  "20261117142732",
  "20261117142737",
  "20261117142743",
];
const plans = read("Plano");
const excelDate = (value) => {
  const p = XLSX.SSF.parse_date_code(Number(value));
  if (!p) throw new Error("Data preventiva inválida.");
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
};
for (let start = 0, part = 0; start < plans.length; start += 600, part++) {
  const rows = plans.slice(start, start + 600);
  const values = rows.map((r) => {
    if (!bySource.has(String(r[1]))) throw new Error(`Ativo ausente no plano ${r[1]}`);
    const key = crypto.createHash("sha256").update(`${r[1]}|${r[2]}`).digest("hex");
    return `(${[key, r[1], r[3], r[2], Number(r[5]) === 2 ? "mes" : "dia", Number(r[6]), excelDate(r[4]), Number(r[7]) || 0].map(quote).join(",")})`;
  });
  const sql = `-- Fonte: formula.xlsx, aba Plano. Datas históricas preservadas. Revisar antes de ativar.\nbegin;\ninsert into public.dem_preventive_plans(source_key,asset_id,name,routine_code,interval_unit,interval_value,next_due,source_due,tolerance_days,active)\nselect x.source_key,a.id,x.name,x.routine_code,x.unit,x.interval_value::integer,x.due::date,x.due::date,x.tolerance::integer,false\nfrom (values\n${values.join(",\n")}\n) x(source_key,asset_ref,name,routine_code,unit,interval_value,due,tolerance) join public.dem_assets a on a.source_ref=x.asset_ref\non conflict(source_key) do nothing;\ncommit;\n`;
  fs.writeFileSync(
    `supabase/migrations/${planVersions[part]}_demarchi_reference_plans_${part + 1}.sql`,
    sql,
  );
}
const summary = {
  source: "formula.xlsx",
  assets: assets.length,
  levels: assets.reduce((o, a) => ((o[a.kind] = (o[a.kind] || 0) + 1), o), {}),
  plans: plans.length,
  importedPlansActive: false,
  oldDataPreserved: true,
};
fs.writeFileSync("docs/DEMARCHI_IMPORT_SUMMARY.json", JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary));
