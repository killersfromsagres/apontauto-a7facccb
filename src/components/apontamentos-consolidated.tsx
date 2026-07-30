import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";
import {
  CalendarIcon,
  Download,
  Plus,
  Trash2,
  UserCog,
  X,
  Droplets,
  SprayCan,
  Trees,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calcularApontamento,
  downloadBlob,
  type ApontamentoRow,
} from "@/lib/apontamento/apontamento";
import { generateApontamentosMultiSheetWorkbook } from "@/lib/apontamento/multi-exporter";

type Categoria = "abastecimento" | "limpeza" | "jardinagem";

interface CategoriaState {
  tecnicos: string[];
  tecInput: string;
  data: string;
  osText: string;
}

const CATEGORIAS: {
  id: Categoria;
  label: string;
  icon: typeof Droplets;
  accent: string;
  options: import("@/lib/apontamento/apontamento").ApontamentoOptions;
  hint?: string;
}[] = [
  {
    id: "abastecimento",
    label: "Abastecimento",
    icon: Droplets,
    accent: "text-orange-500",
    // Dupla: todos os técnicos recebem as mesmas OS e horários.
    options: { mode: "pair" },
    hint: "Equipe em dupla — os dois técnicos recebem as mesmas OS e horários.",
  },
  {
    id: "limpeza",
    label: "Limpeza",
    icon: SprayCan,
    accent: "text-emerald-500",
    // Jornada 06:00–13:00 em bloco único.
    options: { workBlocks: [[6 * 60, 13 * 60]] },
    hint: "Jornada padrão 06:00–13:00.",
  },
  {
    id: "jardinagem",
    label: "Jardinagem",
    icon: Trees,
    accent: "text-green-600",
    // Jornada única 08:00–17:00 para garantir que todos os colaboradores
    // encerrem o expediente às 17:00.
    options: { workBlocks: [[8 * 60, 17 * 60]] },
    hint: "Jornada 08:00–17:00 — todos os colaboradores encerram às 17:00.",
  },
];

const emptyState = (): CategoriaState => ({
  tecnicos: [],
  tecInput: "",
  data: new Date().toISOString().slice(0, 10),
  osText: "",
});

const STORAGE_KEY = "apontauto:apontamentos-manual:v1";

function loadStates(): Record<Categoria, CategoriaState> {
  const base = {
    abastecimento: emptyState(),
    limpeza: emptyState(),
    jardinagem: emptyState(),
  };
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<Categoria, CategoriaState>>;
    return {
      abastecimento: { ...base.abastecimento, ...(parsed.abastecimento ?? {}) },
      limpeza: { ...base.limpeza, ...(parsed.limpeza ?? {}) },
      jardinagem: { ...base.jardinagem, ...(parsed.jardinagem ?? {}) },
    };
  } catch {
    return base;
  }
}

export function ApontamentosConsolidated() {
  const [active, setActive] = useState<Categoria>("abastecimento");
  const [states, setStates] = useState<Record<Categoria, CategoriaState>>(loadStates);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    } catch {
      /* quota exceeded — ignore */
    }
  }, [states]);

  const update = (cat: Categoria, patch: Partial<CategoriaState>) =>
    setStates((prev) => ({ ...prev, [cat]: { ...prev[cat], ...patch } }));

  const buildRows = (cat: Categoria, s: CategoriaState): ApontamentoRow[] => {
    const osList = s.osText
      .split(/\r?\n|,|;/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!s.tecnicos.length || !s.data || !osList.length) return [];
    const opts = CATEGORIAS.find((c) => c.id === cat)!.options;
    return calcularApontamento({ tecnicos: s.tecnicos, data: s.data, osList }, opts);
  };

  const rowsByCat = useMemo(
    () => ({
      abastecimento: buildRows("abastecimento", states.abastecimento),
      limpeza: buildRows("limpeza", states.limpeza),
      jardinagem: buildRows("jardinagem", states.jardinagem),
    }),
    [states],
  );

  const totalRows =
    rowsByCat.abastecimento.length + rowsByCat.limpeza.length + rowsByCat.jardinagem.length;

  const downloadAll = async () => {
    if (!totalRows) return toast.error("Adicione dados em pelo menos uma categoria.");
    try {
      const blob = await generateApontamentosMultiSheetWorkbook([
        { titulo: "ABASTECIMENTO", rows: rowsByCat.abastecimento },
        { titulo: "LIMPEZA", rows: rowsByCat.limpeza },
        { titulo: "JARDINAGEM", rows: rowsByCat.jardinagem },
      ]);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `APONTAMENTOS_${stamp}.xlsx`);
      toast.success("Planilha gerada com todas as abas");
    } catch {
      toast.error("Falha ao gerar planilha");
    }
  };

  return (
    <PageShell
      title="Apontamentos"
      description="Registre técnicos e OS por categoria e baixe um Excel único com uma aba para cada serviço."
      actions={
        <Button onClick={downloadAll} disabled={!totalRows}>
          <Download className="mr-2 h-4 w-4" /> Baixar Excel
        </Button>
      }
    >
      <Tabs value={active} onValueChange={(v) => setActive(v as Categoria)}>
        <TabsList className="w-full md:grid md:w-full md:grid-cols-3">
          {CATEGORIAS.map((c) => {
            const count = rowsByCat[c.id].length;
            const Icon = c.icon;
            return (
              <TabsTrigger key={c.id} value={c.id} className="gap-2">
                <Icon className={`h-4 w-4 ${c.accent}`} />
                <span className="hidden sm:inline">{c.label}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {CATEGORIAS.map((c) => (
          <TabsContent key={c.id} value={c.id} className="mt-4">
            <CategoriaEditor
              label={c.label}
              accent={c.accent}
              hint={c.hint}
              options={c.options}
              state={states[c.id]}
              rows={rowsByCat[c.id]}
              onChange={(patch) => update(c.id, patch)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}

function CategoriaEditor({
  label,
  accent,
  hint,
  options,
  state,
  rows,
  onChange,
}: {
  label: string;
  accent: string;
  hint?: string;
  options: import("@/lib/apontamento/apontamento").ApontamentoOptions;
  state: CategoriaState;
  rows: ApontamentoRow[];
  onChange: (patch: Partial<CategoriaState>) => void;
}) {
  const osList = useMemo(
    () =>
      state.osText
        .split(/\r?\n|,|;/)
        .map((s) => s.trim())
        .filter(Boolean),
    [state.osText],
  );

  const addTecnicos = (raw: string) => {
    const items = raw
      .split(/[,;\n\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) return;
    const set = new Set(state.tecnicos);
    for (const it of items) set.add(it);
    onChange({ tecnicos: Array.from(set), tecInput: "" });
  };

  const removeTecnico = (id: string) =>
    onChange({ tecnicos: state.tecnicos.filter((t) => t !== id) });

  const isPair = options.mode === "pair";
  const totalMin = (
    options.workBlocks ?? [
      [8 * 60, 12 * 60],
      [13 * 60, 17 * 60],
    ]
  ).reduce((s, [a, b]) => s + (b - a), 0);
  const osPorTecnico = state.tecnicos.length
    ? isPair
      ? osList.length
      : Math.ceil(osList.length / state.tecnicos.length)
    : 0;
  const minPorOs = osPorTecnico ? Math.floor(totalMin / osPorTecnico) : 0;

  const clear = () => onChange({ tecnicos: [], tecInput: "", osText: "" });

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
      <GlassCard>
        <div className="space-y-4">
          <h3 className={`text-sm font-semibold uppercase tracking-wider ${accent}`}>{label}</h3>
          {hint && (
            <p className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              {hint}
            </p>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <UserCog className="h-3.5 w-3.5" /> Técnicos (ID / matrícula)
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex.: 12345 (cole vários — separa automático)"
                value={state.tecInput}
                onChange={(e) => onChange({ tecInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTecnicos(state.tecInput);
                  }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (/[\n\r,;\t]/.test(text)) {
                    e.preventDefault();
                    addTecnicos(text);
                  }
                }}
                onBlur={() => state.tecInput && addTecnicos(state.tecInput)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => addTecnicos(state.tecInput)}
                disabled={!state.tecInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {state.tecnicos.map((id) => (
                <Badge
                  key={id}
                  variant="secondary"
                  className="gap-1 rounded-md py-1 pl-2 pr-1 font-mono text-xs"
                >
                  {id}
                  <button
                    type="button"
                    onClick={() => removeTecnico(id)}
                    className="ml-1 rounded-sm hover:bg-background/60"
                    aria-label={`Remover técnico ${id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {state.tecnicos.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Adicione uma ou mais identificações — separe por Enter ou vírgula.
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Data</Label>
            <div className="relative">
              <CalendarIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                className="pl-8"
                value={state.data}
                onChange={(e) => onChange({ data: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ordens de Serviço</Label>
            <Textarea
              rows={10}
              placeholder="Uma OS por linha (ou separadas por vírgula)"
              value={state.osText}
              onChange={(e) => onChange({ osText: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {osList.length} OS · {state.tecnicos.length} técnico
              {state.tecnicos.length === 1 ? "" : "s"}
              {state.tecnicos.length > 0 && osList.length > 0 && (
                <>
                  {" · "}≈{osPorTecnico} OS por técnico ({minPorOs} min/OS)
                </>
              )}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={clear} className="flex-1">
              <Trash2 className="mr-2 h-4 w-4" /> Limpar categoria
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Prévia — {label}</h3>
          <span className="text-xs text-muted-foreground">
            {rows.length} linha{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Plus className="h-6 w-6" />
            <p className="text-sm">Preencha o formulário para gerar a distribuição de horários.</p>
          </div>
        ) : (
          <div className="scroll-fluid max-h-[65vh] overflow-auto rounded-lg border border-border/60 animate-in fade-in-0 duration-300">
            <Table>
              <TableHeader className="sticky top-0 z-10 backdrop-blur-md">
                <TableRow>
                  <TableHead className="bg-[#FA8072] text-black">Técnico</TableHead>
                  <TableHead className="bg-[#7CC77C] text-black">Data Início</TableHead>
                  <TableHead className="bg-[#7CC77C] text-black">Data Final</TableHead>
                  <TableHead className="bg-[#D8B4FE] text-black">OS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.tecnico}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.dataInicio.toLocaleString("pt-BR", { timeZone: "UTC" })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.dataFinal.toLocaleString("pt-BR", { timeZone: "UTC" })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.os}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
