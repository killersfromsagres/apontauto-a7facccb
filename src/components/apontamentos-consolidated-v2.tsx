import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  Download,
  Droplets,
  Edit3,
  Loader2,
  Palmtree,
  Plus,
  RefreshCcw,
  Search,
  SprayCan,
  Trash2,
  Trees,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  colaboradoresPorEspecialidade,
  COLABORADORES_DEMARCHI,
  findColaborador,
  type Colaborador,
  type Especialidade,
} from "@/data/colaboradores-demarchi";
import {
  calcularApontamento,
  downloadBlob,
  type ApontamentoRow,
} from "@/lib/apontamento/apontamento";
import {
  ausenciaNaData,
  criarAusenciaId,
  dataLocalHoje,
  dataSeguinte,
  diasInclusivos,
  loadAusencias,
  periodosSobrepostos,
  saveAusencias,
  situacaoAusencia,
  statusNaData,
  type Ausencia,
  type SituacaoAusencia,
  type StatusPresenca,
  type TipoAusencia,
} from "@/lib/apontamento/ausencias";
import { generateApontamentosMultiSheetWorkbook } from "@/lib/apontamento/multi-exporter";
import { supabase } from "@/integrations/supabase/client";

type Categoria = "abastecimento" | "limpeza" | "jardinagem";
type AppTab = Categoria | "ausencias";
type FiltroSituacao = "todos" | SituacaoAusencia;

interface CategoriaState {
  tecnicos: string[];
  data: string;
  osText: string;
  busca: string;
}

interface AusenciaDraft {
  id?: string;
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
  accentSoft: string;
  options: import("@/lib/apontamento/apontamento").ApontamentoOptions;
  hint: string;
}

const CATEGORIAS: CategoriaConfig[] = [
  {
    id: "abastecimento",
    label: "Abastecimento",
    especialidade: "ABASTECIMENTO",
    icon: Droplets,
    accent: "text-orange-500",
    accentSoft: "bg-orange-500/10 border-orange-500/20",
    options: { mode: "pair" },
    hint: "Equipe em dupla — os técnicos escalados recebem as mesmas OS e horários.",
  },
  {
    id: "limpeza",
    label: "Limpeza",
    especialidade: "LIMPEZA",
    icon: SprayCan,
    accent: "text-emerald-500",
    accentSoft: "bg-emerald-500/10 border-emerald-500/20",
    options: { workBlocks: [[6 * 60, 13 * 60]] },
    hint: "Jornada padrão 06:00–13:00.",
  },
  {
    id: "jardinagem",
    label: "Jardinagem",
    especialidade: "JARDINAGEM",
    icon: Trees,
    accent: "text-green-600",
    accentSoft: "bg-green-500/10 border-green-500/20",
    options: { workBlocks: [[8 * 60, 17 * 60]] },
    hint: "Jornada 08:00–17:00 — todos os colaboradores encerram às 17:00.",
  },
];

const STORAGE_KEY = "apontauto:apontamentos-manual:v1";
const today = dataLocalHoje;

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

function normalizeCategoryState(base: CategoriaState, state?: Partial<CategoriaState>): CategoriaState {
  return {
    ...base,
    ...state,
    tecnicos: Array.isArray(state?.tecnicos)
      ? state.tecnicos.filter((item): item is string => typeof item === "string")
      : [],
    busca: typeof state?.busca === "string" ? state.busca : "",
  };
}

function fromDbRow(row: any): Ausencia {
  return {
    id: String(row.id),
    matricula: String(row.matricula),
    tipo: row.tipo === "ferias" ? "ferias" : "falta",
    inicio: String(row.inicio),
    fim: String(row.fim),
    observacao: row.observacao ? String(row.observacao) : undefined,
    criadoEm: String(row.criado_em ?? new Date().toISOString()),
    atualizadoEm: row.atualizado_em ? String(row.atualizado_em) : undefined,
  };
}

function toDbRow(item: Ausencia) {
  return {
    id: item.id,
    matricula: item.matricula,
    tipo: item.tipo,
    inicio: item.inicio,
    fim: item.fim,
    observacao: item.observacao ?? null,
    criado_em: item.criadoEm,
    atualizado_em: item.atualizadoEm ?? item.criadoEm,
  };
}

export function ApontamentosConsolidatedV2() {
  const [active, setActive] = useState<AppTab>("abastecimento");
  const [states, setStates] = useState<Record<Categoria, CategoriaState>>(loadStates);
  const [ausencias, setAusencias] = useState<Ausencia[]>(loadAusencias);
  const [ausenciaDraft, setAusenciaDraft] = useState<AusenciaDraft>(emptyAusenciaDraft);
  const [syncing, setSyncing] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    } catch {
      // Mantém a tela funcional mesmo sem armazenamento local.
    }
  }, [states]);

  useEffect(() => {
    saveAusencias(ausencias);
  }, [ausencias]);

  const syncAusencias = useCallback(async (showFeedback = false) => {
    setSyncing(true);
    const local = loadAusencias();

    try {
      const client = supabase as any;
      const { data, error } = await client
        .from("apontamento_ausencias")
        .select("id,matricula,tipo,inicio,fim,observacao,criado_em,atualizado_em")
        .order("inicio", { ascending: false });

      if (error) throw error;

      let remote = (data ?? []).map(fromDbRow) as Ausencia[];
      const remoteIds = new Set(remote.map((item) => item.id));
      const missingLocal = local.filter((item) => !remoteIds.has(item.id));

      if (missingLocal.length) {
        const { error: uploadError } = await client
          .from("apontamento_ausencias")
          .upsert(missingLocal.map(toDbRow), { onConflict: "id" });
        if (uploadError) throw uploadError;
        remote = [...remote, ...missingLocal];
      }

      const merged = Array.from(new Map(remote.map((item) => [item.id, item])).values());
      setAusencias(merged);
      saveAusencias(merged);
      setCloudReady(true);
      if (showFeedback) toast.success("Faltas e férias sincronizadas com o sistema.");
    } catch (error: any) {
      setCloudReady(false);
      setAusencias(local);
      if (showFeedback) {
        toast.warning(error?.message || "Sem sincronização com o banco; mantendo dados deste navegador.");
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void syncAusencias(false);
  }, [syncAusencias]);

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

  const abrirRegistroAusencia = (colaborador: Colaborador, tipo: TipoAusencia, data: string) => {
    setAusenciaDraft({
      matricula: colaborador.matricula,
      tipo,
      inicio: data || today(),
      fim: data || today(),
      observacao: "",
    });
    setActive("ausencias");
  };

  const editarAusencia = (item: Ausencia) => {
    setAusenciaDraft({
      id: item.id,
      matricula: item.matricula,
      tipo: item.tipo,
      inicio: item.inicio,
      fim: item.fim,
      observacao: item.observacao ?? "",
    });
    setActive("ausencias");
  };

  const salvarAusencia = async (draft: AusenciaDraft) => {
    if (!draft.matricula || !draft.inicio || !draft.fim) {
      toast.error("Preencha colaborador, início e fim do período.");
      return false;
    }

    const duration = diasInclusivos(draft.inicio, draft.fim);
    if (!duration) {
      toast.error("Confira o período: a data final deve ser igual ou posterior à inicial.");
      return false;
    }

    const overlap = ausencias.find(
      (item) =>
        item.id !== draft.id &&
        item.matricula === draft.matricula &&
        periodosSobrepostos(item, draft),
    );
    if (overlap) {
      toast.error(
        `Já existe ${overlap.tipo === "ferias" ? "um período de férias" : "uma falta"} para esse colaborador entre ${formatDate(overlap.inicio)} e ${formatDate(overlap.fim)}.`,
      );
      return false;
    }

    const original = draft.id ? ausencias.find((item) => item.id === draft.id) : undefined;
    const now = new Date().toISOString();
    const registro: Ausencia = {
      id: original?.id ?? criarAusenciaId(),
      matricula: draft.matricula,
      tipo: draft.tipo,
      inicio: draft.inicio,
      fim: draft.fim,
      observacao: draft.observacao.trim() || undefined,
      criadoEm: original?.criadoEm ?? now,
      atualizadoEm: now,
    };

    setAusencias((prev) => [registro, ...prev.filter((item) => item.id !== registro.id)]);

    // Remove da seleção atual apenas se a data daquele apontamento estiver dentro
    // do período. O colaborador volta automaticamente a ficar disponível após o fim.
    setStates((prev) => {
      const next = { ...prev };
      for (const config of CATEGORIAS) {
        const state = next[config.id];
        if (state.data >= registro.inicio && state.data <= registro.fim) {
          next[config.id] = {
            ...state,
            tecnicos: state.tecnicos.filter((id) => id !== registro.matricula),
          };
        }
      }
      return next;
    });

    try {
      const client = supabase as any;
      const { error } = await client
        .from("apontamento_ausencias")
        .upsert(toDbRow(registro), { onConflict: "id" });
      if (error) throw error;
      setCloudReady(true);
    } catch (error: any) {
      setCloudReady(false);
      toast.warning(
        error?.message || "Registro salvo neste navegador, mas ainda não sincronizado com o banco.",
      );
    }

    toast.success(
      draft.tipo === "ferias"
        ? `Férias salvas por ${duration} dia${duration === 1 ? "" : "s"}, até ${formatDate(draft.fim)} inclusive.`
        : `Falta salva por ${duration} dia${duration === 1 ? "" : "s"}.`,
    );
    setAusenciaDraft(emptyAusenciaDraft(draft.inicio));
    return true;
  };

  const removerAusencia = async (id: string) => {
    const atual = ausencias.find((item) => item.id === id);
    if (!atual) return;
    setAusencias((prev) => prev.filter((item) => item.id !== id));

    try {
      const client = supabase as any;
      const { error } = await client.from("apontamento_ausencias").delete().eq("id", id);
      if (error) throw error;
    } catch (error: any) {
      setAusencias((prev) => [atual, ...prev]);
      toast.error(error?.message || "Não foi possível remover o registro do banco.");
      return;
    }

    toast.success("Registro removido.");
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

  const hoje = today();
  const activeNow = ausencias.filter((item) => situacaoAusencia(item, hoje) === "ativa");

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-3 sm:p-5 lg:p-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="relative overflow-hidden bg-slate-950 px-5 py-6 text-white sm:px-7">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Operação DEMARCHI</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Apontamentos & Gestão de Equipe</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Escala operacional com bloqueio automático por faltas e férias. O período final é inclusivo e o retorno ocorre no dia seguinte ao término.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className={cloudReady ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}>
                {cloudReady ? "Sincronizado no sistema" : "Modo local"}
              </Badge>
              <Button variant="outline" onClick={() => void syncAusencias(true)} disabled={syncing} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Sincronizar
              </Button>
              <Button onClick={downloadAll} disabled={!totalRows && !ausencias.length} className="bg-white text-slate-950 hover:bg-slate-100">
                <Download className="mr-2 h-4 w-4" /> Baixar Excel
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4 sm:p-5">
          <MetricCard icon={Users} label="Colaboradores" value={COLABORADORES_DEMARCHI.length} tone="slate" />
          <MetricCard icon={CalendarOff} label="Ausentes hoje" value={activeNow.length} tone="red" />
          <MetricCard icon={Palmtree} label="Em férias hoje" value={activeNow.filter((item) => item.tipo === "ferias").length} tone="amber" />
          <MetricCard icon={UserCheck} label="Linhas de apontamento" value={totalRows} tone="emerald" />
        </div>
      </section>

      <Tabs value={active} onValueChange={(value) => setActive(value as AppTab)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1 md:grid-cols-4">
          {CATEGORIAS.map((config) => {
            const Icon = config.icon;
            return (
              <TabsTrigger key={config.id} value={config.id} className="gap-2 rounded-xl py-2.5">
                <Icon className={`h-4 w-4 ${config.accent}`} />
                {config.label}
                {!!rowsByCat[config.id].length && <Badge variant="secondary">{rowsByCat[config.id].length}</Badge>}
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="ausencias" className="gap-2 rounded-xl py-2.5">
            <CalendarOff className="h-4 w-4 text-amber-500" />
            Faltas & Férias
            {!!activeNow.length && <Badge className="bg-amber-500 text-white">{activeNow.length}</Badge>}
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
            syncing={syncing}
            onDraftChange={setAusenciaDraft}
            onSave={salvarAusencia}
            onEdit={editarAusencia}
            onCancelEdit={() => setAusenciaDraft(emptyAusenciaDraft())}
            onDelete={(id) => void removerAusencia(id)}
            onSync={() => void syncAusencias(true)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CategoriaEditor({ config, state, rows, ausencias, onChange, onPrepareAusencia }: {
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
    () => new Map(colaboradores.map((item) => [item.matricula, statusNaData(item.matricula, state.data, ausencias)])),
    [colaboradores, state.data, ausencias],
  );
  const counts = useMemo(() => {
    const values = [...statusMap.values()];
    return {
      presentes: values.filter((status) => status === "presente").length,
      faltas: values.filter((status) => status === "falta").length,
      ferias: values.filter((status) => status === "ferias").length,
    };
  }, [statusMap]);
  const tecnicosDisponiveis = state.tecnicos.filter((id) => statusMap.get(id) === "presente");
  const osList = useMemo(() => parseOsList(state.osText), [state.osText]);
  const colaboradoresFiltrados = useMemo(() => {
    const query = normalizeSearch(state.busca);
    if (!query) return colaboradores;
    return colaboradores.filter((item) => normalizeSearch(`${item.nome} ${item.matricula}`).includes(query));
  }, [colaboradores, state.busca]);

  const selecionarPresentes = () => onChange({
    tecnicos: colaboradores.filter((item) => statusMap.get(item.matricula) === "presente").map((item) => item.matricula),
  });

  const toggleTecnico = (matricula: string, checked: boolean) => {
    if (statusMap.get(matricula) !== "presente") return;
    onChange({
      tecnicos: checked
        ? Array.from(new Set([...state.tecnicos, matricula]))
        : state.tecnicos.filter((id) => id !== matricula),
    });
  };

  const isPair = config.options.mode === "pair";
  const totalMin = (config.options.workBlocks ?? [[8 * 60, 12 * 60], [13 * 60, 17 * 60]])
    .reduce((sum, [start, end]) => sum + (end - start), 0);
  const osPorTecnico = tecnicosDisponiveis.length
    ? isPair ? osList.length : Math.ceil(osList.length / tecnicosDisponiveis.length)
    : 0;
  const minPorOs = osPorTecnico ? Math.floor(totalMin / osPorTecnico) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Users} label="Equipe" value={colaboradores.length} tone="slate" />
        <MetricCard icon={UserCheck} label="Presentes" value={counts.presentes} tone="emerald" />
        <MetricCard icon={UserX} label="Faltas" value={counts.faltas} tone="red" />
        <MetricCard icon={Palmtree} label="Férias" value={counts.ferias} tone="amber" />
        <MetricCard icon={CheckCircle2} label="Escalados" value={tecnicosDisponiveis.length} tone="blue" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <Panel>
          <div className={`rounded-xl border p-3 ${config.accentSoft}`}>
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${config.accent}`}>{config.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{config.hint}</p>
          </div>

          <div className="mt-4 space-y-2">
            <Label>Data do apontamento</Label>
            <Input type="date" value={state.data} onChange={(event) => onChange({ data: event.target.value })} />
            <p className="text-xs text-muted-foreground">O sistema verifica o período completo das férias para esta data.</p>
          </div>

          <div className="mt-4 space-y-2">
            <Label>Ordens de Serviço</Label>
            <Textarea rows={12} placeholder="Uma OS por linha (ou separadas por vírgula)" value={state.osText} onChange={(event) => onChange({ osText: event.target.value })} />
            <p className="text-xs text-muted-foreground">
              {osList.length} OS · {tecnicosDisponiveis.length} escalado(s)
              {tecnicosDisponiveis.length > 0 && osList.length > 0 ? ` · ≈${osPorTecnico} OS/colaborador (${minPorOs} min/OS)` : ""}
            </p>
          </div>

          <Button variant="outline" onClick={() => onChange({ tecnicos: [], osText: "", busca: "" })} className="mt-4 w-full">
            <Trash2 className="mr-2 h-4 w-4" /> Limpar apontamento
          </Button>
        </Panel>

        <Panel>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-semibold">Equipe DEMARCHI — {config.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Férias e faltas bloqueiam a escala durante todo o período cadastrado.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={selecionarPresentes}><UserCheck className="mr-2 h-4 w-4" /> Selecionar presentes</Button>
              <Button variant="outline" size="sm" onClick={() => onChange({ tecnicos: [] })}>Limpar escala</Button>
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar colaborador por nome ou matrícula..." value={state.busca} onChange={(event) => onChange({ busca: event.target.value })} />
          </div>

          <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
            {colaboradoresFiltrados.map((colaborador) => {
              const status = statusMap.get(colaborador.matricula) ?? "presente";
              const ausencia = ausenciaNaData(colaborador.matricula, state.data, ausencias);
              const checked = status === "presente" && state.tecnicos.includes(colaborador.matricula);

              return (
                <div key={colaborador.matricula} className={`rounded-xl border p-3 transition ${status === "presente" ? "border-border bg-background/40" : status === "ferias" ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Checkbox checked={checked} disabled={status !== "presente"} onCheckedChange={(value) => toggleTecnico(colaborador.matricula, value === true)} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{colaborador.nome}</p>
                        <p className="font-mono text-xs text-muted-foreground">Matrícula {colaborador.matricula}</p>
                        {ausencia && (
                          <p className={`mt-1 text-xs font-medium ${ausencia.tipo === "ferias" ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-400"}`}>
                            {ausencia.tipo === "ferias" ? `Férias até ${formatDate(ausencia.fim)} · retorno ${formatDate(dataSeguinte(ausencia.fim))}` : `Falta: ${formatDate(ausencia.inicio)}${ausencia.fim !== ausencia.inicio ? ` a ${formatDate(ausencia.fim)}` : ""}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={status} />
                      <Button variant="outline" size="sm" onClick={() => onPrepareAusencia(colaborador, "falta", state.data)}>Falta</Button>
                      <Button variant="outline" size="sm" onClick={() => onPrepareAusencia(colaborador, "ferias", state.data)}>Férias</Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!colaboradoresFiltrados.length && <div className="py-10 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado.</div>}
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Prévia — {config.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Somente colaboradores presentes e escalados entram na distribuição.</p>
          </div>
          <Badge variant="secondary">{rows.length} linha(s)</Badge>
        </div>
        {!rows.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Selecione colaboradores presentes e informe as OS para gerar a distribuição.</div>
        ) : (
          <div className="max-h-[65vh] overflow-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Data Início</TableHead>
                  <TableHead>Data Final</TableHead>
                  <TableHead>OS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const colaborador = findColaborador(row.tecnico);
                  return (
                    <TableRow key={`${row.tecnico}-${row.os}-${index}`}>
                      <TableCell><div className="text-xs font-medium">{colaborador?.nome ?? row.tecnico}</div><div className="font-mono text-[11px] text-muted-foreground">{row.tecnico}</div></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{row.dataInicio.toLocaleString("pt-BR", { timeZone: "UTC" })}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{row.dataFinal.toLocaleString("pt-BR", { timeZone: "UTC" })}</TableCell>
                      <TableCell className="font-mono text-xs">{row.os}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AusenciasManager({ ausencias, draft, syncing, onDraftChange, onSave, onEdit, onCancelEdit, onDelete, onSync }: {
  ausencias: Ausencia[];
  draft: AusenciaDraft;
  syncing: boolean;
  onDraftChange: (draft: AusenciaDraft) => void;
  onSave: (draft: AusenciaDraft) => Promise<boolean>;
  onEdit: (item: Ausencia) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onSync: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroSituacao>("todos");
  const hoje = today();
  const colaboradores = useMemo(() => [...COLABORADORES_DEMARCHI].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), []);
  const duration = diasInclusivos(draft.inicio, draft.fim);

  const counts = useMemo(() => ({
    ativos: ausencias.filter((item) => situacaoAusencia(item, hoje) === "ativa").length,
    feriasAtivas: ausencias.filter((item) => item.tipo === "ferias" && situacaoAusencia(item, hoje) === "ativa").length,
    faltasAtivas: ausencias.filter((item) => item.tipo === "falta" && situacaoAusencia(item, hoje) === "ativa").length,
    futuras: ausencias.filter((item) => situacaoAusencia(item, hoje) === "futura").length,
  }), [ausencias, hoje]);

  const registrosFiltrados = useMemo(() => {
    const query = normalizeSearch(busca);
    return [...ausencias]
      .sort((a, b) => {
        const order = { ativa: 0, futura: 1, encerrada: 2 } as Record<SituacaoAusencia, number>;
        const diff = order[situacaoAusencia(a, hoje)] - order[situacaoAusencia(b, hoje)];
        return diff || b.inicio.localeCompare(a.inicio);
      })
      .filter((item) => filtro === "todos" || situacaoAusencia(item, hoje) === filtro)
      .filter((item) => {
        if (!query) return true;
        const colaborador = findColaborador(item.matricula);
        return normalizeSearch(`${colaborador?.nome ?? ""} ${item.matricula} ${item.tipo} ${item.inicio} ${item.fim}`).includes(query);
      });
  }, [ausencias, busca, filtro, hoje]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CalendarCheck2} label="Ausências ativas" value={counts.ativos} tone="red" />
        <MetricCard icon={Palmtree} label="Férias hoje" value={counts.feriasAtivas} tone="amber" />
        <MetricCard icon={UserX} label="Faltas hoje" value={counts.faltasAtivas} tone="red" />
        <MetricCard icon={CalendarClock} label="Próximas" value={counts.futuras} tone="blue" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Panel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{draft.id ? "Editando registro" : "Novo registro"}</p>
              <h3 className="mt-1 text-lg font-semibold">{draft.tipo === "ferias" ? "Período de férias" : "Falta / afastamento"}</h3>
            </div>
            {draft.id && <Button variant="ghost" size="icon" onClick={onCancelEdit}><X className="h-4 w-4" /></Button>}
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label>Colaborador</Label>
              <Select value={draft.matricula} onValueChange={(matricula) => onDraftChange({ ...draft, matricula })}>
                <SelectTrigger><SelectValue placeholder="Selecione um colaborador" /></SelectTrigger>
                <SelectContent>{colaboradores.map((item) => <SelectItem key={item.matricula} value={item.matricula}>{item.nome} · {item.matricula}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={draft.tipo === "falta" ? "default" : "outline"} onClick={() => onDraftChange({ ...draft, tipo: "falta" })}><UserX className="mr-2 h-4 w-4" /> Falta</Button>
              <Button type="button" variant={draft.tipo === "ferias" ? "default" : "outline"} onClick={() => onDraftChange({ ...draft, tipo: "ferias" })}><Palmtree className="mr-2 h-4 w-4" /> Férias</Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Início</Label><Input type="date" value={draft.inicio} onChange={(event) => { const inicio = event.target.value; onDraftChange({ ...draft, inicio, fim: draft.fim < inicio ? inicio : draft.fim }); }} /></div>
              <div className="space-y-2"><Label>Fim (inclusive)</Label><Input type="date" min={draft.inicio} value={draft.fim} onChange={(event) => onDraftChange({ ...draft, fim: event.target.value })} /></div>
            </div>

            {draft.inicio && draft.fim && duration > 0 && (
              <div className={`rounded-xl border p-3 ${draft.tipo === "ferias" ? "border-amber-500/25 bg-amber-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                <p className="text-sm font-semibold">{formatDate(draft.inicio)} → {formatDate(draft.fim)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{duration} dia{duration === 1 ? "" : "s"} corrido{duration === 1 ? "" : "s"}, incluindo a data final.</p>
                {draft.tipo === "ferias" && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Retorno previsto: {formatDate(dataSeguinte(draft.fim))}</p>}
              </div>
            )}

            <div className="space-y-2"><Label>Observação</Label><Textarea rows={3} placeholder="Motivo, observação do gestor, informação complementar..." value={draft.observacao} onChange={(event) => onDraftChange({ ...draft, observacao: event.target.value })} /></div>

            <Button className="w-full" onClick={() => void onSave(draft)}>
              {draft.id ? <Edit3 className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {draft.id ? "Salvar alterações" : `Registrar ${draft.tipo === "ferias" ? "férias" : "falta"}`}
            </Button>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-semibold">Gestão de faltas e férias</h3>
              <p className="mt-1 text-xs text-muted-foreground">Ativos primeiro, depois futuros e histórico encerrado.</p>
            </div>
            <Button variant="outline" size="sm" onClick={onSync} disabled={syncing}>{syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />} Atualizar</Button>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar nome, matrícula, tipo ou data..." value={busca} onChange={(event) => setBusca(event.target.value)} /></div>
            <Select value={filtro} onValueChange={(value) => setFiltro(value as FiltroSituacao)}><SelectTrigger className="lg:w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="ativa">Em andamento</SelectItem><SelectItem value="futura">Próximos</SelectItem><SelectItem value="encerrada">Encerrados</SelectItem></SelectContent></Select>
          </div>

          <div className="mt-4 max-h-[650px] space-y-2 overflow-auto pr-1">
            {registrosFiltrados.map((item) => {
              const colaborador = findColaborador(item.matricula);
              const situation = situacaoAusencia(item, hoje);
              const days = diasInclusivos(item.inicio, item.fim);
              return (
                <div key={item.id} className={`rounded-xl border p-4 ${situation === "ativa" ? item.tipo === "ferias" ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5" : "border-border bg-background/30"}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{colaborador?.nome ?? item.matricula}</p>
                        <AbsenceTypeBadge tipo={item.tipo} />
                        <SituationBadge situation={situation} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Matrícula {item.matricula}{colaborador ? ` · ${colaborador.especialidade}` : ""}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span><strong>Período:</strong> {formatDate(item.inicio)} até {formatDate(item.fim)}</span>
                        <span><strong>Duração:</strong> {days} dia{days === 1 ? "" : "s"}</span>
                        {item.tipo === "ferias" && <span><strong>Retorno:</strong> {formatDate(dataSeguinte(item.fim))}</span>}
                      </div>
                      {item.observacao && <p className="mt-2 text-xs text-muted-foreground">{item.observacao}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => onEdit(item)}><Edit3 className="mr-2 h-4 w-4" /> Editar</Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}><Trash2 className="mr-2 h-4 w-4" /> Remover</Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!registrosFiltrados.length && <div className="py-12 text-center text-sm text-muted-foreground">Nenhum registro encontrado neste filtro.</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">{children}</section>;
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: "slate" | "emerald" | "red" | "amber" | "blue" }) {
  const tones = {
    slate: "border-slate-500/15 bg-slate-500/5 text-slate-600 dark:text-slate-300",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300",
    red: "border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-300",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    blue: "border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-300",
  };
  return <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${tones[tone]}`}><div className="rounded-xl bg-background/70 p-2.5"><Icon className="h-4 w-4" /></div><div><p className="text-xs opacity-80">{label}</p><p className="text-xl font-semibold leading-none">{value}</p></div></div>;
}

function StatusBadge({ status }: { status: StatusPresenca }) {
  if (status === "falta") return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10 dark:text-red-400">Falta</Badge>;
  if (status === "ferias") return <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">Férias</Badge>;
  return <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">Presente</Badge>;
}

function AbsenceTypeBadge({ tipo }: { tipo: TipoAusencia }) {
  return tipo === "ferias"
    ? <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"><Palmtree className="mr-1 h-3 w-3" />Férias</Badge>
    : <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/10 dark:text-red-400"><UserX className="mr-1 h-3 w-3" />Falta</Badge>;
}

function SituationBadge({ situation }: { situation: SituacaoAusencia }) {
  if (situation === "ativa") return <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-300"><CheckCircle2 className="mr-1 h-3 w-3" />Em andamento</Badge>;
  if (situation === "futura") return <Badge variant="outline" className="border-sky-500/30 text-sky-600 dark:text-sky-300"><CalendarClock className="mr-1 h-3 w-3" />Próximo</Badge>;
  return <Badge variant="outline" className="text-muted-foreground"><CalendarDays className="mr-1 h-3 w-3" />Encerrado</Badge>;
}

function parseOsList(value: string) {
  return value.split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean);
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
