import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
// xlsx is dynamically imported inside handleFile to keep it out of the initial route chunk.
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  X,
  Users,
  ClipboardCheck,
  Filter,
  Search,
  Download,
} from "lucide-react";
import { generateProgramacaoWorkbook, downloadBlob } from "@/lib/preventiva/exporter";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  processPreventiva,
  TEAM_COLORS,
  type ProcessResult,
  type Team,
} from "@/lib/preventiva/processor";
import { getSettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/preventiva")({ component: Page });

function Page() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<Team | "Todas">("Todas");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const s = getSettings();
      const res = processPreventiva(rows, {
        tipo: "Preventiva",
        siteAllowed: s.siteAllowed,
        refrig1: s.refrig1,
        refrig2: s.refrig2,
        refrig3: s.refrig3,
        hidraulicaKeywords: s.hidraulicaKeywords,
      });
      setResult(res);
      setFileName(file.name);
      toast.success(
        `${res.total} OS processadas — ${res.discardedBySite} descartadas (fora de DEMARCHI)`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler o arquivo. Verifique se é um .xlsx válido.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const filtered = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    return result.ordered.filter((o) => {
      if (teamFilter !== "Todas" && o.equipe !== teamFilter) return false;
      if (!q) return true;
      return [o.ordemServico, o.nomeOS, o.predio, o.local, o.ativo, o.equipamento]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [result, query, teamFilter]);

  const teamCounts = useMemo(() => {
    if (!result) return [] as { team: Team; count: number }[];
    return (Object.keys(result.byTeam) as Team[])
      .map((t) => ({ team: t, count: result.byTeam[t].length }))
      .sort((a, b) => b.count - a.count);
  }, [result]);

  const reset = () => {
    setResult(null);
    setFileName(null);
    setQuery("");
    setTeamFilter("Todas");
  };

  return (
    <PageShell
      title="Programação Preventiva"
      description="Faça upload da planilha bruta — o sistema filtra DEMARCHI e distribui as OS entre as equipes automaticamente."
      actions={
        result && (
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                try {
                  const blob = await generateProgramacaoWorkbook(result.ordered);
                  const stamp = new Date().toISOString().slice(0, 10);
                  downloadBlob(blob, `PROGRAMACAO_${stamp}.xlsx`);
                  toast.success("Planilha PROGRAMAÇÃO gerada");
                } catch (e) {
                  console.error(e);
                  toast.error("Falha ao gerar a planilha");
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Baixar PROGRAMAÇÃO
            </Button>
            <Button variant="outline" onClick={reset}>
              <X className="mr-2 h-4 w-4" /> Novo upload
            </Button>
          </div>
        )
      }
    >
      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <GlassCard>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-12 md:p-16 ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:border-primary/50 hover:bg-accent/30"
                }`}
              >
                <div className="rounded-2xl bg-primary/10 p-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    Arraste a planilha ou clique para selecionar
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Formato aceito: .xlsx — o processamento é feito no navegador.
                  </p>
                </div>
                {loading && (
                  <p className="text-sm text-primary animate-pulse">Processando…</p>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                icon={<FileSpreadsheet className="h-5 w-5" />}
                label="Arquivo"
                value={fileName ?? "—"}
                hint="Origem"
              />
              <SummaryCard
                icon={<ClipboardCheck className="h-5 w-5" />}
                label="OS Válidas"
                value={String(result.total)}
                hint="após filtro DEMARCHI"
              />
              <SummaryCard
                icon={<Filter className="h-5 w-5" />}
                label="Descartadas"
                value={String(result.discardedBySite)}
                hint="outros sites"
              />
              <SummaryCard
                icon={<Users className="h-5 w-5" />}
                label="Equipes"
                value={String(teamCounts.length)}
                hint="com carga atribuída"
              />
            </div>

            <GlassCard>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Distribuição por equipe
              </h3>
              <div className="flex flex-wrap gap-2">
                <TeamChip
                  team={"Todas" as Team}
                  count={result.total}
                  active={teamFilter === "Todas"}
                  onClick={() => setTeamFilter("Todas")}
                />
                {teamCounts.map((t) => (
                  <TeamChip
                    key={t.team}
                    team={t.team}
                    count={t.count}
                    active={teamFilter === t.team}
                    onClick={() => setTeamFilter(t.team)}
                  />
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <Tabs defaultValue="table">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <TabsList className="w-full sm:w-auto">
                    <TabsTrigger value="table" className="flex-1 sm:flex-none">Tabela</TabsTrigger>
                    <TabsTrigger value="category" className="flex-1 sm:flex-none">Por Categoria</TabsTrigger>
                  </TabsList>
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar OS, prédio, ativo…"
                      className="pl-8"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>

                <TabsContent value="table">
                  <div className="scroll-fluid max-h-[65vh] overflow-auto rounded-lg border border-border/60">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-background/80 backdrop-blur-md">
                        <TableRow>
                          <TableHead>OS</TableHead>
                          <TableHead>Nome OS</TableHead>
                          <TableHead>Prédio</TableHead>
                          <TableHead>Andar</TableHead>
                          <TableHead>Local</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Equipe</TableHead>
                          <TableHead>SLA</TableHead>
                          <TableHead>Ativo</TableHead>
                          <TableHead>Equipamento</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {filtered.slice(0, 500).map((o, i) => (
                          <TableRow key={`${o.ordemServico}-${i}`}>
                            <TableCell className="font-mono text-xs">{o.ordemServico}</TableCell>
                            <TableCell className="max-w-[240px] truncate">{o.nomeOS}</TableCell>
                            <TableCell>{o.predio}</TableCell>
                            <TableCell>{o.andar}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{o.local}</TableCell>
                            <TableCell>{o.tipo}</TableCell>
                            <TableCell>
                              <span
                                className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium text-white"
                                style={{ backgroundColor: TEAM_COLORS[o.equipe] }}
                              >
                                {o.equipe}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {o.dataSLA ? new Date(o.dataSLA).toLocaleDateString("pt-BR") : "—"}
                            </TableCell>
                            <TableCell className="text-xs">{o.ativo || "—"}</TableCell>
                            <TableCell className="text-xs">{o.equipamento || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filtered.length > 500 && (
                      <p className="p-3 text-center text-xs text-muted-foreground">
                        Exibindo 500 de {filtered.length} linhas — refine a busca para ver o
                        restante.
                      </p>
                    )}
                    {filtered.length === 0 && (
                      <p className="p-8 text-center text-sm text-muted-foreground">
                        Nenhuma OS corresponde ao filtro.
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="category">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {(Object.keys(result.byCategory) as Array<keyof typeof result.byCategory>).map(
                      (cat) => (
                        <div
                          key={cat}
                          className="rounded-xl border border-border/60 bg-background/40 p-4"
                        >
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">
                            {cat}
                          </p>
                          <p className="mt-1 text-2xl font-semibold">
                            {result.byCategory[cat].length}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ordens de serviço identificadas
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">{icon}</div>
      </div>
    </GlassCard>
  );
}

function TeamChip({
  team,
  count,
  active,
  onClick,
}: {
  team: Team;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const color = team in TEAM_COLORS ? TEAM_COLORS[team] : "#6B7280";
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/60 bg-background/50 hover:border-primary/50"
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span>{team}</span>
      <Badge variant="secondary" className="ml-1">
        {count}
      </Badge>
    </button>
  );
}
