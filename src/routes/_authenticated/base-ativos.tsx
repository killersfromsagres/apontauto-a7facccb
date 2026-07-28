import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Star,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { downloadBlob } from "@/lib/download";
import {
  deleteCatalog,
  importCatalog,
  listCatalogs,
  setActiveCatalog,
} from "@/features/assets/services/asset-catalog";
import { invalidateAssetGraphCache } from "@/features/assets/services/asset-graph-loader";
import {
  FIELD_LABELS,
  readAssetSheet,
  rowsToRecords,
  type AssetField,
  type ColumnMapping,
  type SheetPreview,
} from "@/features/assets/services/asset-sheet-reader";
import {
  validateAssetRecords,
  type CatalogValidationIssue,
} from "@/features/assets/services/asset-resolver";

export const Route = createFileRoute("/_authenticated/base-ativos")({
  head: () => ({
    meta: [
      { title: "Base de Ativos | Apontauto" },
      {
        name: "description",
        content:
          "Importe, versione e ative o catálogo de ativos usado por todos os módulos PCM.",
      },
      { property: "og:title", content: "Base de Ativos | Apontauto" },
      {
        property: "og:description",
        content: "Catálogo versionado de ativos para os módulos PCM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BaseAtivosPage,
});

const FIELDS: AssetField[] = [
  "code",
  "name",
  "level",
  "parentCode",
  "parentName",
  "businessUnit",
];

const ISSUE_LABEL: Record<CatalogValidationIssue["type"], string> = {
  "empty-code": "Código vazio",
  "duplicate-code": "Código duplicado",
  "missing-parent": "Ativo pai inexistente",
  cycle: "Ciclo na hierarquia",
  "unknown-level": "Nível desconhecido",
};

function BaseAtivosPage() {
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [sheet, setSheet] = useState<string>("");
  const [name, setName] = useState("");
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const catalogs = useQuery({ queryKey: ["asset-catalogs"], queryFn: listCatalogs });

  const records = useMemo(
    () => (preview ? rowsToRecords(preview.rows, mapping) : []),
    [preview, mapping],
  );
  const validation = useMemo(
    () => (records.length ? validateAssetRecords(records) : { issues: [], valid: [] }),
    [records],
  );

  const issueCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const i of validation.issues) acc[i.type] = (acc[i.type] ?? 0) + 1;
    return acc;
  }, [validation.issues]);

  async function handleFile(f: File, forcedSheet?: string) {
    setReading(true);
    try {
      const p = await readAssetSheet(f, forcedSheet);
      if (!p.detectedSheet) {
        toast.error("Não consegui identificar uma aba com ativos nesta planilha.");
        return;
      }
      setFile(f);
      setPreview(p);
      setSheet(p.detectedSheet);
      setMapping(p.mapping);
      if (!name) setName(f.name.replace(/\.(xlsx|xls|csv)$/i, ""));
      if (!p.mapping.code) {
        toast.warning("Confirme o mapeamento: a coluna de Ativo não foi detectada.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler a planilha.");
    } finally {
      setReading(false);
    }
  }

  const importMut = useMutation({
    mutationFn: async (activate: boolean) => {
      if (!validation.valid.length) throw new Error("Nenhum ativo válido para importar.");
      setProgress({ done: 0, total: validation.valid.length });
      const catalog = await importCatalog({
        name: name.trim() || "Base de Ativos",
        sourceFilename: file?.name ?? null,
        records: validation.valid,
        activate,
        metadata: {
          sheet,
          mapping,
          issues: issueCounts,
        },
        onProgress: (done, total) => setProgress({ done, total }),
      });
      return catalog;
    },
    onSuccess: (catalog) => {
      invalidateAssetGraphCache();
      qc.invalidateQueries({ queryKey: ["asset-catalogs"] });
      setProgress(null);
      toast.success(
        `Catálogo "${catalog.name}" (v${catalog.version}) importado com ${catalog.total_assets} ativos.`,
      );
      setFile(null);
      setPreview(null);
    },
    onError: (e: any) => {
      setProgress(null);
      toast.error(e?.message ?? "Falha ao importar o catálogo.");
    },
  });

  const activateMut = useMutation({
    mutationFn: setActiveCatalog,
    onSuccess: () => {
      invalidateAssetGraphCache();
      qc.invalidateQueries({ queryKey: ["asset-catalogs"] });
      toast.success("Base ativa atualizada.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao ativar."),
  });

  const deleteMut = useMutation({
    mutationFn: deleteCatalog,
    onSuccess: () => {
      invalidateAssetGraphCache();
      qc.invalidateQueries({ queryKey: ["asset-catalogs"] });
      toast.success("Catálogo removido.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao excluir."),
  });

  function downloadIssues() {
    const header = "Tipo;Linha;Codigo;Detalhe\n";
    const body = validation.issues
      .map(
        (i) =>
          `${ISSUE_LABEL[i.type]};${i.row};${i.code};${(i.detail ?? "").replace(/;/g, ",")}`,
      )
      .join("\n");
    downloadBlob(
      new Blob(["\ufeff" + header + body], { type: "text/csv;charset=utf-8" }),
      `inconsistencias-base-ativos.csv`,
    );
  }

  return (
    <PageShell
      eyebrow="PCM"
      title="Base de Ativos"
      description="Importe a planilha da base, valide a hierarquia e defina qual catálogo os módulos vão usar."
    >
      <div className="space-y-5">
        {!isAdmin && (
          <GlassCard className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-400" />
            Somente administradores podem importar ou ativar catálogos. Você pode
            visualizar as versões existentes.
          </GlassCard>
        )}

        {/* ---------- Upload ---------- */}
        <GlassCard className="space-y-4 p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">Importar planilha</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Arquivo (XLSX, XLS ou CSV)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={!isAdmin || reading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome do catálogo</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Base DEMARCHI — Julho/2026"
                disabled={!isAdmin}
              />
            </div>
          </div>
          {reading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo planilha…
            </p>
          )}
        </GlassCard>

        {preview && (
          <>
            {/* ---------- Mapeamento ---------- */}
            <GlassCard className="space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-lg font-semibold">
                    Mapeamento de colunas
                  </h3>
                </div>
                {preview.sheetNames.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Aba</Label>
                    <Select
                      value={sheet}
                      onValueChange={(v) => {
                        setSheet(v);
                        if (file) void handleFile(file, v);
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.sheetNames.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FIELDS.map((field) => (
                  <div key={field} className="space-y-1.5">
                    <Label className="text-xs">
                      {FIELD_LABELS[field]}
                      {field === "code" && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={mapping[field] ?? "__none__"}
                      onValueChange={(v) =>
                        setMapping((m) => ({
                          ...m,
                          [field]: v === "__none__" ? undefined : v,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Não usar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não usar</SelectItem>
                        {preview.headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* ---------- Relatório ---------- */}
            <GlassCard className="space-y-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">
                  Relatório de validação
                </h3>
                {validation.issues.length > 0 && (
                  <Button size="sm" variant="outline" onClick={downloadIssues}>
                    <Download className="mr-2 h-4 w-4" /> Baixar inconsistências
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{preview.totalRows} linhas lidas</Badge>
                <Badge className="bg-emerald-500/15 text-emerald-400">
                  {validation.valid.length} ativos válidos
                </Badge>
                {Object.entries(issueCounts).map(([type, count]) => (
                  <Badge key={type} className="bg-amber-500/15 text-amber-400">
                    {ISSUE_LABEL[type as CatalogValidationIssue["type"]]}: {count}
                  </Badge>
                ))}
                {validation.issues.length === 0 && (
                  <Badge className="bg-emerald-500/15 text-emerald-400">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Sem inconsistências
                  </Badge>
                )}
              </div>

              {/* Prévia 50 linhas */}
              <div className="max-h-[360px] overflow-auto rounded-2xl border border-border/50">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="sticky top-0 bg-background/90 backdrop-blur">
                    <tr>
                      {FIELDS.map((f) => (
                        <th key={f} className="px-3 py-2 font-semibold">
                          {FIELD_LABELS[f]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-3 py-1.5 font-mono">{r.code}</td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5">{r.level}</td>
                        <td className="px-3 py-1.5 font-mono">{r.parentCode ?? ""}</td>
                        <td className="px-3 py-1.5">{r.parentName}</td>
                        <td className="px-3 py-1.5">{r.businessUnit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!isAdmin || importMut.isPending || !validation.valid.length}
                  onClick={() => importMut.mutate(false)}
                >
                  {importMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  Confirmar importação
                </Button>
                <Button
                  variant="secondary"
                  disabled={!isAdmin || importMut.isPending || !validation.valid.length}
                  onClick={() => importMut.mutate(true)}
                >
                  <Star className="mr-2 h-4 w-4" /> Importar e definir como base ativa
                </Button>
                {progress && (
                  <span className="self-center text-xs text-muted-foreground">
                    {progress.done}/{progress.total} ativos gravados
                  </span>
                )}
              </div>
            </GlassCard>
          </>
        )}

        {/* ---------- Versões ---------- */}
        <GlassCard className="space-y-3 p-4 sm:p-6">
          <h3 className="font-display text-lg font-semibold">Catálogos</h3>
          {catalogs.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
          <div className="space-y-2">
            {(catalogs.data ?? []).map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    <Badge variant="secondary">v{c.version}</Badge>
                    {c.is_active && (
                      <Badge className="bg-emerald-500/15 text-emerald-400">Base ativa</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.total_assets ?? 0} ativos ·{" "}
                    {c.imported_at ? new Date(c.imported_at).toLocaleString("pt-BR") : "—"}
                    {c.source_filename ? ` · ${c.source_filename}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!c.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isAdmin || activateMut.isPending}
                      onClick={() => activateMut.mutate(c.id)}
                    >
                      <Star className="mr-2 h-4 w-4" /> Definir como base ativa
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!isAdmin || deleteMut.isPending}
                    onClick={() => deleteMut.mutate(c.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {!catalogs.isLoading && (catalogs.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum catálogo importado ainda.
              </p>
            )}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
