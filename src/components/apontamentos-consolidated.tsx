import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";
import {
  CalendarIcon,
  CalendarOff,
  Download,
  Droplets,
  Palmtree,
  Plus,
  Search,
  SprayCan,
  Trash2,
  Trees,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  colaboradoresPorEspecialidade,
  COLABORADORES_DEMARCHI,
  findColaborador,
  type Colaborador,
  type Especialidade,
} from "@/data/colaboradores-demarchi";
import {
  criarAusenciaId,
  loadAusencias,
  saveAusencias,
  statusNaData,
  type Ausencia,
  type StatusPresenca,
  type TipoAusencia,
} from "@/lib/apontamento/ausencias";
import {
  calcularApontamento,
  downloadBlob,
  type ApontamentoRow,
} from "@/lib/apontamento/apontamento";
import { generateApontamentosMultiSheetWorkbook } from "@/lib/apontamento/multi-exporter";

type Categoria = "abastecimento" | "limpeza" | "jardinagem";
type AppTab = Categoria | "ausencias";

interface CategoriaState {
  tecnicos: string[];
  data: string;
  osText: string;
  busca: string;
}

interface AusenciaDraft {
  matricula: string;
  tipo: TipoAusencia;
  inicio: string;
  fim: string;
  observacao: string;
}

interface CategoriaConfig {
  id: Categoria;
  label: string;
  especialidade: Especialidade;
  icon: typeof Droplets;
  accent: string;
  options: import("@/lib/apontamento/apontamento").ApontamentoOptions;
  hint?: string;
}

const CATEGORIAS: CategoriaConfig[] = [
  {
    id: "abastecimento",
    label: "Abastecimento",
    especialidade: "ABASTECIMENTO",
    icon: Droplets,
    accent: "text-orange-500",
    options: { mode: "pair" },
    hint: "Equipe em dupla — os técnicos escalados recebem as mesmas OS e horários.",
  },
  {
    id: "limpeza",
    label: "Limpeza",
    especialidade: "LIMPEZA",
    icon: SprayCan,
    accent: "text-emerald-500",
    options: { workBlocks: [[6 * 60, 13 * 60]] },
    hint: "Jornada padrão 06:00–13:00.",
  },
  {
    id: "jardinagem",
    label: "Jardinagem",
    especialidade: "JARDINAGEM",
    icon: Trees,
    accent: "text-green-600",
    options: { workBlocks: [[8 * 60, 17 * 60]] },
    hint: "Jornada 08:00–17:00 — todos os colaboradores encerram às 17:00.",
  },
];

const STORAGE_KEY = "apontauto:apontamentos-manual:v1";

const today = () => new Date().toISOString().slice(0, 10);

const emptyState = (): CategoriaState => ({
  tecnicos: [],
  data: today(),
  osText: "",
  busca: "",
});

const emptyAusenciaDraft = (data = today()): AusenciaDraft => ({
  matricula: "",
  tipo: "falta",
  inicio: data,
  fim: data,
  observacao: "",
});

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

    const parsed = JSON.parse(raw) as Partial<Record<Categoria, Partial<CategoriaState>>>;
    return {
      abastecimento: normalizeCategoryState(base.abastecimento, parsed.abastecimento),
      limpeza: normalizeCategoryState(base.limpeza, parsed.limpeza),
      jardinagem: normalizeCategoryState(base.jardinagem, parsed.jardinagem),
    };
  } catch {
    return base;
  }
}

function normalizeCategoryState(
  base: CategoriaState,
  state?: Partial<CategoriaState>,
): CategoriaState {
  return {
    ...base,
    ...state,
    tecnicos: Array.isArray(state?.tecnicos)
      ? state.tecnicos.filter((item): item is string => typeof item === "string")
      : [],
    busca: typeof state?.busca === "string" ? state.busca : "",
  };
}

export function ApontamentosConsolidated() {
  const [active, setActive] = useState<AppTab>("abastecimento");
  const [states, setStates] = useState<Record<Categoria, CategoriaState>>(loadStates);
  const [ausencias, setAusencias] = useState<Ausencia[]>(loadAusencias);
  const [ausenciaDraft, setAusenciaDraft] = useState<AusenciaDraft>(emptyAusenciaDraft);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    } catch {
      // Mantém o funcionamento da tela mesmo sem armazenamento local.
    }
  }, [states]);

  useEffect(() => {
    saveAusencias(ausencias);
  }, [ausencias]);

  const update = (cat: Categoria, patch: Partial<CategoriaState>) =>
    setStates((prev) => ({ ...prev, [cat]: { ...prev[cat], ...patch } }));

  const buildRows = (cat: Categoria, state: CategoriaState): ApontamentoRow[] => {
    const config = CATEGORIAS.find((item) => item.id === cat)!;
    const allowed = new Set(
      colaboradoresPorEspecialidade(config.especialidade).map((item) => item.matricula),
    );
    const tecnicosDisponiveis = state.tecnicos.filter(
      (matricula) =>
        allowed.has(matricula) &&
        statusNaData(matricula, state.data, ausencias) === "presente",
    );
    const osList = parseOsList(state.osText);

    if (!tecnicosDisponiveis.length || !state.data || !osList.length) return [];

    return calcularApontamento(
      { tecnicos: tecnicosDisponiveis, data: state.data, osList },
      config.options,
    );
  };

  const rowsByCat = useMemo(
    () => ({
      abastecimento: buildRows("abastecimento", states.abastecimento),
      limpeza: buildRows("limpeza", states.limpeza),
      jardinagem: buildRows("jardinagem", states.jardinagem),
    }),
    [states, ausencias],
  );

  const totalRows =
    rowsByCat.abastecimento.length + rowsByCat.limpeza.length + rowsByCat.jardinagem.length;

  const abrirRegistroAusencia = (
    colaborador: Colaborador,
    tipo: TipoAusencia,
    data: string,
  ) => {
    setAusenciaDraft({
      matricula: colaborador.matricula,
      tipo,
      inicio: data,
      fim: data,
      observacao: "",
    });
    setActive("ausencias");
  };

  const adicionarAusencia = (draft: AusenciaDraft) => {
    if (!draft.matricula || !draft.inicio || !draft.fim) {
      toast.error("Preencha colaborador e período.");
      return false;
    }
    if (draft.fim < draft.inicio) {
      toast.error("A data final não pode ser anterior à inicial.");
      return false;
    }

    const registro: Ausencia = {
      id: criarAusenciaId(),
      matricula: draft.matricula,
      tipo: draft.tipo,
      inicio: draft.inicio,
      fim: draft.fim,
      observacao: draft.observacao.trim() || undefined,
      criadoEm: new Date().toISOString(),
    };

    setAusencias((prev) => [registro, ...prev]);
    setStates((prev) => ({
      abastecimento: {
        ...prev.abastecimento,
        tecnicos: prev.abastecimento.tecnicos.filter((id) => id !== draft.matricula),
      },
      limpeza: {
        ...prev.limpeza,
        tecnicos: prev.limpeza.tecnicos.filter((id) => id !== draft.matricula),
      },
      jardinagem: {
        ...prev.jardinagem,
        tecnicos: prev.jardinagem.tecnicos.filter((id) => id !== draft.matricula),
      },
    }));

    toast.success(draft.tipo === "falta" ? "Falta registrada." : "Férias registradas.");
    setAusenciaDraft(emptyAusenciaDraft(draft.inicio));
    return true;
  };

  const downloadAll = async () => {
    if (!totalRows && !ausencias.length) {
      toast.error("Adicione apontamentos ou registros de faltas/férias.");
      return;
    }

    try {
      const absenceRows = [...ausencias]
        .sort((a, b) => b.inicio.localeCompare(a.inicio))
        .map((item) => {
          const colaborador = findColaborador(item.matricula);
          return {
            matricula: item.matricula,
            colaborador: colaborador?.nome ?? "Colaborador não localizado",
            especialidade: colaborador?.especialidade ?? "",
            tipo: item.tipo === "falta" ? ("Falta" as const) : ("Férias" as const),
            inicio: item.inicio,
            fim: item.fim,
            observacao: item.observacao,
          };
        });

      const blob = await generateApontamentosMultiSheetWorkbook(
        [
          { titulo: "ABASTECIMENTO", rows: rowsByCat.abastecimento },
          { titulo: "LIMPEZA", rows: rowsByCat.limpeza },
          { titulo: "JARDINAGEM", rows: rowsByCat.jardinagem },
        ],
        absenceRows,
      );

      downloadBlob(blob, `APONTAMENTOS_${today()}.xlsx`);
      toast.success("Planilha gerada com apontamentos, faltas e férias.");
    } catch {
      toast.error("Falha ao gerar planilha.");
    }
  };

  return (
    <PageShell
      title="Apontamentos"
      description="Escala da equipe DEMARCHI, distribuição de OS e controle de faltas e férias."
      actions={
        <Button onClick={downloadAll} disabled={!totalRows && !ausencias.length}>
          <Download className="mr-2 h-4 w-4" /> Baixar Excel
        </Button>
      }
    >
      <Tabs value={active} onValueChange={(value) => setActive(value as AppTab)}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          {CATEGORIAS.map((config) => {
            const count = rowsByCat[config.id].length;
            const Icon = config.icon;

            return (
              <TabsTrigger key={config.id} value={config.id} className="gap-2">
                <Icon className={`h-4 w-4 ${config.accent}`} />
                <span className="hidden sm:inline">{config.label}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="ausencias" className="gap-2">
            <CalendarOff className="h-4 w-4 text-amber-500" />
            <span>Faltas & Férias</span>
            {ausencias.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {ausencias.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {CATEGORIAS.map((config) => (
          <TabsContent key={config.id} value={config.id} className="mt-4">
            <CategoriaEditor
              config={config}
              state={states[config.id]}
              rows={rowsByCat[config.id]}
              ausencias={ausencias}
              onChange={(patch) => update(config.id, patch)}
              onPrepareAusencia={abrirRegistroAusencia}
            />
          </TabsContent>
        ))}

        <TabsContent value="ausencias" className="mt-4">
          <AusenciasManager
            ausencias={ausencias}
            draft={ausenciaDraft}
            onDraftChange={setAusenciaDraft}
            onAdd={adicionarAusencia}
            onDelete={(id) => {
              setAusencias((prev) => prev.filter((item) => item.id !== id));
              toast.success("Registro removido.");
            }}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function CategoriaEditor({
  config,
  state,
  rows,
  ausencias,
  onChange,
  onPrepareAusencia,
}: {
  config: CategoriaConfig;
  state: CategoriaState;
  rows: ApontamentoRow[];
  ausencias: Ausencia[];
  onChange: (patch: Partial<CategoriaState>) => void;
  onPrepareAusencia: (colaborador: Colaborador, tipo: TipoAusencia, data: string) => void;
}) {
  const colaboradores = useMemo(
    () => colaboradoresPorEspecialidade(config.especialidade),
    [config.especialidade],
  );

  const statusMap = useMemo(
    () =>
      new Map(
        colaboradores.map((colaborador) => [
          colaborador.matricula,
          statusNaData(colaborador.matricula, state.data, ausencias),
        ]),
      ),
    [colaboradores, state.data, ausencias],
  );

  const counts = useMemo(() => {
    let presentes = 0;
    let faltas = 0;
    let ferias = 0;

    for (const status of statusMap.values()) {
      if (status === "presente") presentes++;
      if (status === "falta") faltas++;
      if (status === "ferias") ferias++;
    }

    return { presentes, faltas, ferias };
  }, [statusMap]);

  const tecnicosDisponiveis = state.tecnicos.filter(
    (matricula) => statusMap.get(matricula) === "presente",
  );
  const osList = useMemo(() => parseOsList(state.osText), [state.osText]);

  const colaboradoresFiltrados = useMemo(() => {
    const query = normalizeSearch(state.busca);
    if (!query) return colaboradores;

    return colaboradores.filter((colaborador) =>
      normalizeSearch(`${colaborador.nome} ${colaborador.matricula}`).includes(query),
    );
  }, [colaboradores, state.busca]);

  const toggleTecnico = (matricula: string, checked: boolean) => {
    if (statusMap.get(matricula) !== "presente") return;

    if (checked) {
      onChange({ tecnicos: Array.from(new Set([...state.tecnicos, matricula])) });
      return;
    }

    onChange({ tecnicos: state.tecnicos.filter((id) => id !== matricula) });
  };

  const selecionarPresentes = () => {
    onChange({
      tecnicos: colaboradores
        .filter((item) => statusMap.get(item.matricula) === "presente")
        .map((item) => item.matricula),
    });
  };

  const isPair = config.options.mode === "pair";
  const totalMin = (
    config.options.workBlocks ?? [
      [8 * 60, 12 * 60],
      [13 * 60, 17 * 60],
    ]
  ).reduce((sum, [start, end]) => sum + (end - start), 0);
  const osPorTecnico = tecnicosDisponiveis.length
    ? isPair
      ? osList.length
      : Math.ceil(osList.length / tecnicosDisponiveis.length)
    : 0;
  const minPorOs = osPorTecnico ? Math.floor(totalMin / osPorTecnico) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Users} label="Equipe" value={colaboradores.length} />
        <MetricCard icon={UserCheck} label="Presentes" value={counts.presentes} />
        <MetricCard icon={UserX} label="Faltas" value={counts.faltas} />
        <MetricCard icon={Palmtree} label="Férias" value={counts.ferias} />
        <MetricCard icon={UserCheck} label="Escalados" value={tecnicosDisponiveis.length} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[390px_1fr]">
        <GlassCard>
          <div className="space-y-4">
            <div>
              <h3 className={`text-sm font-semibold uppercase tracking-wider ${config.accent}`}>
                {config.label}
              </h3>
              {config.hint && (
                <p className="mt-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                  {config.hint}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Data do apontamento</Label>
              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-8"
                  value={state.data}
                  onChange={(event) => onChange({ data: event.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Faltas e férias desta data são aplicadas automaticamente à escala.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ordens de Serviço</Label>
              <Textarea
                rows={12}
                placeholder="Uma OS por linha (ou separadas por vírgula)"
                value={state.osText}
                onChange={(event) => onChange({ osText: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {osList.length} OS · {tecnicosDisponiveis.length} colaborador
                {tecnicosDisponiveis.length === 1 ? "" : "es"} escalado
                {tecnicosDisponiveis.length > 0 && osList.length > 0 && (
                  <>
                    {" · "}≈{osPorTecnico} OS por colaborador ({minPorOs} min/OS)
                  </>
                )}
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => onChange({ tecnicos: [], osText: "", busca: "" })}
              className="w-full"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Limpar apontamento
            </Button>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Equipe DEMARCHI — {config.label}</h3>
                <p className="text-xs text-muted-foreground">
                  Selecione quem será escalado. Colaboradores em falta ou férias ficam bloqueados.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={selecionarPresentes}>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Selecionar presentes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChange({ tecnicos: [] })}
                  disabled={!state.tecnicos.length}
                >
                  Limpar escala
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar colaborador por nome ou matrícula..."
                value={state.busca}
                onChange={(event) => onChange({ busca: event.target.value })}
              />
            </div>

            <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
              {colaboradoresFiltrados.map((colaborador) => {
                const status = statusMap.get(colaborador.matricula) ?? "presente";
                const checked =
                  status === "presente" && state.tecnicos.includes(colaborador.matricula);

                return (
                  <div
                    key={colaborador.matricula}
                    className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/30 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Checkbox
                        checked={checked}
                        disabled={status !== "presente"}
                        onCheckedChange={(value) =>
                          toggleTecnico(colaborador.matricula, value === true)
                        }
                        aria-label={`Escalar ${colaborador.nome}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{colaborador.nome}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          Matrícula {colaborador.matricula}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <StatusBadge status={status} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onPrepareAusencia(colaborador, "falta", state.data)}
                      >
                        Falta
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onPrepareAusencia(colaborador, "ferias", state.data)}
                      >
                        Férias
                      </Button>
                    </div>
                  </div>
                );
              })}

              {colaboradoresFiltrados.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum colaborador encontrado.
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Prévia — {config.label}</h3>
            <p className="text-xs text-muted-foreground">
              A prévia usa somente colaboradores presentes e escalados.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {rows.length} linha{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Plus className="h-6 w-6" />
            <p className="text-sm">
              Selecione colaboradores presentes e informe as OS para gerar a distribuição.
            </p>
          </div>
        ) : (
          <div className="scroll-fluid max-h-[65vh] overflow-auto rounded-lg border border-border/60 animate-in fade-in-0 duration-300">
            <Table>
              <TableHeader className="sticky top-0 z-10 backdrop-blur-md">
                <TableRow>
                  <TableHead className="bg-[#FA8072] text-black">Colaborador</TableHead>
                  <TableHead className="bg-[#7CC77C] text-black">Data Início</TableHead>
                  <TableHead className="bg-[#7CC77C] text-black">Data Final</TableHead>
                  <TableHead className="bg-[#D8B4FE] text-black">OS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const colaborador = findColaborador(row.tecnico);

                  return (
                    <TableRow key={`${row.tecnico}-${row.os}-${index}`}>
                      <TableCell>
                        <div className="text-xs font-medium">{colaborador?.nome ?? row.tecnico}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.tecnico}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {row.dataInicio.toLocaleString("pt-BR", { timeZone: "UTC" })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {row.dataFinal.toLocaleString("pt-BR", { timeZone: "UTC" })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.os}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function AusenciasManager({
  ausencias,
  draft,
  onDraftChange,
  onAdd,
  onDelete,
}: {
  ausencias: Ausencia[];
  draft: AusenciaDraft;
  onDraftChange: (draft: AusenciaDraft) => void;
  onAdd: (draft: AusenciaDraft) => boolean;
  onDelete: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");

  const colaboradores = useMemo(
    () =>
      [...COLABORADORES_DEMARCHI].sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR"),
      ),
    [],
  );

  const registrosFiltrados = useMemo(() => {
    const query = normalizeSearch(busca);

    return [...ausencias]
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
      .filter((item) => {
        if (!query) return true;
        const colaborador = findColaborador(item.matricula);
        return normalizeSearch(
          `${colaborador?.nome ?? ""} ${item.matricula} ${item.tipo} ${item.inicio} ${item.fim}`,
        ).includes(query);
      });
  }, [ausencias, busca]);

  const totalFaltas = ausencias.filter((item) => item.tipo === "falta").length;
  const totalFerias = ausencias.filter((item) => item.tipo === "ferias").length;
  const pessoasComRegistro = new Set(ausencias.map((item) => item.matricula)).size;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <MetricCard icon={CalendarOff} label="Registros" value={ausencias.length} />
        <MetricCard icon={UserX} label="Faltas" value={totalFaltas} />
        <MetricCard icon={Palmtree} label="Férias" value={totalFerias} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <GlassCard>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Novo registro</h3>
              <p className="text-xs text-muted-foreground">
                Cadastre uma falta ou período de férias. O status será aplicado automaticamente
                nos apontamentos das datas correspondentes.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Colaborador</Label>
              <Select
                value={draft.matricula}
                onValueChange={(matricula) => onDraftChange({ ...draft, matricula })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((colaborador) => (
                    <SelectItem key={colaborador.matricula} value={colaborador.matricula}>
                      {colaborador.nome} · {colaborador.matricula}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={draft.tipo}
                onValueChange={(tipo) =>
                  onDraftChange({ ...draft, tipo: tipo as TipoAusencia })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="falta">Falta</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input
                  type="date"
                  value={draft.inicio}
                  onChange={(event) => {
                    const inicio = event.target.value;
                    onDraftChange({
                      ...draft,
                      inicio,
                      fim: draft.fim < inicio ? inicio : draft.fim,
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input
                  type="date"
                  min={draft.inicio}
                  value={draft.fim}
                  onChange={(event) => onDraftChange({ ...draft, fim: event.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea
                rows={3}
                placeholder="Opcional: motivo, observação do gestor..."
                value={draft.observacao}
                onChange={(event) =>
                  onDraftChange({ ...draft, observacao: event.target.value })
                }
              />
            </div>

            <Button type="button" className="w-full" onClick={() => onAdd(draft)}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar {draft.tipo === "falta" ? "falta" : "férias"}
            </Button>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Histórico de faltas e férias</h3>
                <p className="text-xs text-muted-foreground">
                  {pessoasComRegistro} colaborador
                  {pessoasComRegistro === 1 ? "" : "es"} com registro.
                </p>
              </div>
              <div className="relative w-full lg:w-[360px]">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar nome, matrícula, tipo ou data..."
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                />
              </div>
            </div>

            {registrosFiltrados.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum registro de falta ou férias encontrado.
              </div>
            ) : (
              <div className="max-h-[600px] space-y-2 overflow-auto pr-1">
                {registrosFiltrados.map((item) => {
                  const colaborador = findColaborador(item.matricula);

                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/30 p-3 lg:flex-row lg:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {colaborador?.nome ?? item.matricula}
                          </p>
                          <Badge
                            variant="secondary"
                            className={
                              item.tipo === "falta"
                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            }
                          >
                            {item.tipo === "falta" ? "Falta" : "Férias"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Matrícula {item.matricula}
                          {colaborador ? ` · ${colaborador.especialidade}` : ""}
                          {" · "}
                          {formatDate(item.inicio)}
                          {item.fim !== item.inicio ? ` até ${formatDate(item.fim)}` : ""}
                        </p>
                        {item.observacao && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.observacao}
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3">
      <div className="rounded-lg bg-muted p-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-none">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusPresenca }) {
  if (status === "falta") {
    return (
      <Badge variant="secondary" className="bg-red-500/10 text-red-600 dark:text-red-400">
        Falta
      </Badge>
    );
  }

  if (status === "ferias") {
    return (
      <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
        Férias
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
      Presente
    </Badge>
  );
}

function parseOsList(value: string) {
  return value
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
