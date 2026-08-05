import { createFileRoute, Link } from "@tanstack/react-router";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { toast } from "sonner";
import {
  Upload,
  Download,
  RefreshCw,
  PackageX,
  Database,
  ArrowUpDown,
  BarChart3,
  Search,
  AlertTriangle,
  Flame,
  Settings2,
  Printer,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Trash2,
  Plus,
  ArrowUp,
  Save,
  ClipboardList,
  User,
  Eraser,
  Sparkles,
  BrainCircuit,
  ChevronDown,
  Calendar,
  Filter,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import priorityEngineIcon from "@/assets/priority-engine-icon.png";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

import { supabase } from "@/integrations/supabase/client";
import {
  readAssetsFile,
  readBackorderFile,
  readBackorderWorkbook,
  type BackorderRow,
} from "@/lib/backorder/reader";
import {
  assetsIndexFromGraph,
  describeAtivo,
  makeAssetsMap,
  resolveAtivo,
  resolveAtivoTree,
  type AssetsMap,
} from "@/lib/backorder/assets";
import {
  invalidateAssetGraphCache,
  loadActiveAssetGraph,
} from "@/features/assets/services/asset-graph-loader";

// Motor de ativos único: usa o catálogo ativo (PCM) e cai na base legada
// `assets_ref` automaticamente quando ainda não há catálogo importado.
async function loadAssetsIndex(force = false): Promise<AssetsMap> {
  const { graph } = await loadActiveAssetGraph(force);
  return assetsIndexFromGraph(graph);
}
import {
  buildLearnedIndex,
  applyLearnedToResolved,
  learnedLocation,
  learnedTeam,
  type LearnedIndex,
  type LearnedLocation,
  type LearnedTeam,
} from "@/lib/backorder/learned";
import {
  CATEGORIAS,
  CATEGORIA_COLOR,
  CATEGORIA_TO_EQUIPE,
  setDynamicRules,
  type Categoria,
  type DynamicRule,
} from "@/lib/backorder/classify";
import { distributeBackorderToField } from "@/lib/backorder-distribution.functions";
import { AvaliacaoEmailCard } from "@/components/backorder/avaliacao-email-card";
import { StatusBoard } from "@/components/backorder/status-board";
import {
  STATUS_CATS,
  STATUS_LABEL,
  STATUS_COLOR,
  toStatusCat,
  isAberto as isStatusAberto,
  type StatusCat,
} from "@/lib/backorder/status";

import {
  classifyTeamByText,
  EQUIPE_COR,
  EQUIPES,
  type Equipe,
} from "@/lib/backorder/team-classifier";
import { generateBackorderExport } from "@/lib/backorder/export";
import { downloadBlob } from "@/lib/download";
import {
  DEFAULT_CONFIG,
  scanAll,
  type PriorityConfig,
  type KeywordRule,
  type PredioSensivel,
} from "@/lib/backorder/priority";
import { generatePriorityExport, openPriorityPrintView } from "@/lib/backorder/priority-export";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/backorder")({
  component: BackorderPage,
});

interface BOSRow {
  os: string;
  nome: string;
  ativo: string;
  predio: string;
  andar: string;
  espaco: string;
  centro_custo?: string;
  data_solicitacao: string;
  atividade: string;
  atividade_manual: boolean;
  equipe: string;
  termino_sla: string | null;
  data_solicitacao: string;
  outros: string;
  criticidade?: string;
  finalizado: boolean;
  cancelado?: boolean;
  status_origem?: string;
  status_cat?: StatusCat;
  data_conclusao?: string | null;
  data_finalizacao: string | null;

  is_prioridade?: boolean;
  motivo_prioridade?: string | null;
  prioridade_nivel?: number;
  revisao_manual?: boolean;
}

const TARGET_PCT_DEFAULT = 5;

interface RuleRow {
  id: string;
  equipe: string;
  palavra_chave: string;
  fonte: "descricao" | "categoria";
  prioridade: number;
  ativo: boolean;
}

function daysBetween(iso: string): number {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}

function BackorderPage() {
  const [rows, setRows] = useState<BOSRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tabela");
  // Exibe a planilha inteira por padrão; o ano continua disponível como filtro.
  const now = new Date();
  const anoAtual = now.getFullYear();
  const mesAtual = (now.getMonth() + 1).toString().padStart(2, "0");
  const [ano, setAno] = useState<string>("todos");
  const [mes, setMes] = useState<string>("todos");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [solicitanteFilter, setSolicitanteFilter] = useState<string>("");
  const [mesFiltro, setMesFiltro] = useState<string>("todos");
  const [filterCat, setFilterCat] = useState<string>("__all__");
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [config, setConfig] = useState<PriorityConfig>(DEFAULT_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [aiReclassifying, setAiReclassifying] = useState(false);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [reclassifyAll, setReclassifyAll] = useState(false);
  const backorderInputRef = useRef<HTMLInputElement>(null);
  const assetsInputRef = useRef<HTMLInputElement>(null);
  const instrucaoInputRef = useRef<HTMLInputElement>(null);
  const targetPct = TARGET_PCT_DEFAULT;

  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from("backorder_prioridade_config" as never)
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (data) {
      const d = data as {
        predios_sensiveis: PredioSensivel[];
        keyword_rules: KeywordRule[];
        dias_forca_prioridade: number;
        familias_habilitadas: Record<string, boolean>;
        last_scan_at: string | null;
      };
      setConfig({
        predios_sensiveis: d.predios_sensiveis ?? DEFAULT_CONFIG.predios_sensiveis,
        keyword_rules: d.keyword_rules ?? DEFAULT_CONFIG.keyword_rules,
        dias_forca_prioridade: d.dias_forca_prioridade ?? DEFAULT_CONFIG.dias_forca_prioridade,
        familias_habilitadas: d.familias_habilitadas ?? DEFAULT_CONFIG.familias_habilitadas,
        last_scan_at: d.last_scan_at ?? null,
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    // Paginação por chave (keyset) na PK `os`: usa o índice único e evita o
    // custo de ORDER BY + OFFSET no Postgres (a consulta anterior custava
    // ~850ms por página). A ordenação de exibição é feita em memória.
    const PAGE = 1000;
    const MAX = 1_000_000;
    // Colunas explícitas: reduz o payload de rede (~20% menor que `select *`).
    const COLS =
      "os,nome,ativo,predio,andar,espaco,atividade,atividade_manual,equipe,termino_sla," +
      "data_solicitacao,outros,centro_custo,criticidade,finalizado,cancelado,status_origem,status_cat," +
      "data_conclusao,data_finalizacao,is_prioridade,motivo_prioridade,prioridade_nivel,revisao_manual";

    const fetchAfter = async (cursor: string | null) => {
      let q = supabase.from("backorder_os").select(COLS).order("os", { ascending: true }).limit(PAGE);
      if (cursor) q = q.gt("os", cursor);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as BOSRow[]) ?? [];
    };

    const sortForView = (list: BOSRow[]) =>
      [...list].sort(
        (a, b) =>
          Number(a.finalizado) - Number(b.finalizado) ||
          +new Date(a.data_solicitacao) - +new Date(b.data_solicitacao) ||
          a.os.localeCompare(b.os),
      );

    const all: BOSRow[] = [];
    try {
      let cursor: string | null = null;
      while (all.length < MAX) {
        const page: BOSRow[] = await fetchAfter(cursor);
        all.push(...page);
        // Primeira página já pinta a tela; as demais entram sem bloquear.
        if (!cursor) {
          setRows(sortForView(all));
          setLoading(false);
        }
        if (page.length < PAGE) break;
        cursor = page[page.length - 1]!.os;
      }
      setRows(sortForView(all));
    } catch {
      toast.error("Falha ao carregar backorder");
      setRows(sortForView(all));
    } finally {
      setLoading(false);
    }
  }, []);

  const [assetsMap, setAssetsMap] = useState<AssetsMap>(() => makeAssetsMap([]));
  const loadAssets = useCallback(async () => {
    setAssetsMap(await loadAssetsIndex());
  }, []);

  const [rulesDB, setRulesDB] = useState<RuleRow[]>([]);
  const [learnedLoc, setLearnedLoc] = useState<LearnedLocation[]>([]);
  const [learnedTeamRules, setLearnedTeamRules] = useState<LearnedTeam[]>([]);
  const learnedIndex = useMemo<LearnedIndex>(
    () => buildLearnedIndex(learnedLoc, learnedTeamRules),
    [learnedLoc, learnedTeamRules],
  );

  const loadLearnedRules = useCallback(async () => {
    const [loc, tm] = await Promise.all([
      supabase
        .from("regras_aprendidas_localizacao")
        .select("*")
        .order("criado_em", { ascending: false }),
      supabase
        .from("regras_aprendidas_equipe")
        .select("*")
        .order("criado_em", { ascending: false }),
    ]);
    setLearnedLoc((loc.data ?? []) as LearnedLocation[]);
    setLearnedTeamRules((tm.data ?? []) as LearnedTeam[]);
  }, []);

  const loadClassifierRules = useCallback(async () => {
    const { data } = await supabase
      .from("regras_classificacao_equipe")
      .select("id, equipe, palavra_chave, fonte, prioridade, ativo")
      .order("prioridade", { ascending: true });
    const rows = (data ?? []) as RuleRow[];
    setRulesDB(rows);
    const active = rows.filter((r) => r.ativo);
    if (active.length > 0) {
      setDynamicRules(
        active.map((r) => ({
          equipe: r.equipe as Categoria,
          palavra_chave: r.palavra_chave,
          fonte: (r.fonte === "categoria" ? "categoria" : "descricao") as "descricao" | "categoria",
          prioridade: r.prioridade,
        })),
      );
    } else {
      setDynamicRules(null);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadAssets();
    void loadClassifierRules();
    void loadLearnedRules();
    void refresh();
  }, [loadConfig, loadAssets, loadClassifierRules, loadLearnedRules, refresh]);

  const catOf = useCallback(
    (r: BOSRow): StatusCat => (r.status_cat as StatusCat) ?? toStatusCat(r.status_origem ?? ""),
    [],
  );

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      const y = new Date(r.data_solicitacao).getFullYear();
      if (!Number.isNaN(y)) set.add(y);
    }
    set.add(anoAtual);
    return Array.from(set).sort((a, b) => b - a);
  }, [rows, anoAtual]);

  const solicitantesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.outros) set.add(r.outros.trim());
    }
    return Array.from(set).sort();
  }, [rows]);

  /** Base do módulo: filtragem por ano, mês e solicitante. */
  const rowsFiltradas = useMemo(() => {
    return rows.filter((r) => {
      if (!r.data_solicitacao) return false;
      const d = new Date(r.data_solicitacao);
      if (isNaN(d.getTime())) return false;
      
      const matchesMes = mesFiltro === "todos" || String(d.getMonth() + 1).padStart(2, "0") === mesFiltro;
      const matchesSolicitante =
        !solicitanteFilter || (r.outros ?? "").toLowerCase().includes(solicitanteFilter.toLowerCase());
      
      // Filtro de ano atual conforme solicitado anteriormente
      const matchesAno = String(d.getFullYear()) === String(new Date().getFullYear());
      
      return matchesMes && matchesSolicitante && matchesAno;
    });
  }, [rows, mesFiltro, solicitanteFilter]);

  const statusRows = useMemo(
    () =>
      rowsFiltradas.map((r) => ({
        os: r.os,
        nome: r.nome,
        equipe: r.equipe,
        predio: r.predio,
        andar: r.andar,
        espaco: r.espaco,
        outros: r.outros,
        data_solicitacao: r.data_solicitacao,
        status_origem: r.status_origem,
        statusCat: catOf(r),
      })),
    [rowsFiltradas, catOf],
  );

  const abertas = useMemo(
    () => rowsFiltradas.filter((r) => isStatusAberto(catOf(r)) && !r.finalizado && !r.cancelado),
    [rowsFiltradas, catOf],
  );
  const finalizadas = useMemo(
    () => rowsFiltradas.filter((r) => ["concluido", "fechado", "validado", "aguardando_aprovacao"].includes(catOf(r))),
    [rowsFiltradas, catOf],
  );
  const cancelados = useMemo(
    () => rowsFiltradas.filter((r) => ["cancelado", "nao_executada"].includes(catOf(r))),
    [rowsFiltradas, catOf],
  );
  const reabertas = useMemo(
    () => rowsFiltradas.filter((r) => r.status_origem?.toLowerCase().includes("reaberta")),
    [rowsFiltradas],
  );
  const aguardandoAprovacao = useMemo(
    () => rowsFiltradas.filter((r) => catOf(r) === "aguardando_aprovacao"),
    [rowsFiltradas, catOf],
  );
  const avaliacaoRows = useMemo(
    () =>
      [...finalizadas, ...aguardandoAprovacao].map((r) => ({
        os: r.os,
        solicitante: r.outros,
        statusCat: catOf(r) as string,
      })),
    [finalizadas, aguardandoAprovacao, catOf],
  );

  const revisaoRows = useMemo(() => abertas.filter((r) => r.revisao_manual), [abertas]);

  async function saveRule(
    rule: Partial<RuleRow> & {
      equipe: string;
      palavra_chave: string;
      fonte: "descricao" | "categoria";
    },
  ) {
    const payload = {
      id: rule.id,
      equipe: rule.equipe,
      palavra_chave: rule.palavra_chave.trim(),
      fonte: rule.fonte,
      prioridade: rule.prioridade ?? 100,
      ativo: rule.ativo ?? true,
    };
    if (!payload.palavra_chave) {
      toast.error("Palavra-chave obrigatória");
      return;
    }
    const { error } = await supabase
      .from("regras_classificacao_equipe")
      .upsert(payload, { onConflict: "equipe,palavra_chave,fonte" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Regra salva");
    await loadClassifierRules();
  }

  async function deleteRule(id: string) {
    const { error } = await supabase.from("regras_classificacao_equipe").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Regra removida");
    await loadClassifierRules();
  }

  // Backorder = abertas com mais de 30 dias corridos
  const backorderAbertas = useMemo(
    () => abertas.filter((r) => daysBetween(r.data_solicitacao) > 30),
    [abertas],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = abertas.filter((r) => {
      if (filterCat !== "__all__" && r.atividade !== filterCat) return false;
      if (!q) return true;
      return (
        r.os.toLowerCase().includes(q) ||
        r.nome.toLowerCase().includes(q) ||
        r.ativo.toLowerCase().includes(q) ||
        r.predio.toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      const da = new Date(a.data_solicitacao).getTime();
      const db = new Date(b.data_solicitacao).getTime();
      return order === "asc" ? da - db : db - da;
    });
    return list;
  }, [abertas, search, filterCat, order]);

  // ----- Importação -----

  async function handleBackorderImport(file: File) {
    setImporting(true);
    const tid = toast.loading("Preparando importação…");
    try {
      // 1) carrega o grafo de ativos vigente (catálogo ativo ou base legada)
      const assetsMap = await loadAssetsIndex(true);
      // Mesmo catálogo usado em "Inteligência de Ativos → Preencher localização".
      const loadedGraph = await loadActiveAssetGraph(true);
      const assetRecords = Array.from(loadedGraph.graph.byCode.values()).map((n) => ({
        code: n.code,
        name: n.name,
        level: n.rawLevel,
        parentCode: n.parentCode,
        parentName: n.parentName,
        businessUnit: n.businessUnit,
      }));

      const [ovRes, locRes, teamRes] = await Promise.all([
        supabase.from("backorder_atividade_override").select("os, atividade"),
        supabase.from("regras_aprendidas_localizacao").select("*"),
        supabase.from("regras_aprendidas_equipe").select("*"),
      ]);

      const overrides: Array<[string, string]> = (ovRes.data ?? []).map((o: any) => [
        o.os,
        o.atividade,
      ]);

      toast.loading("Lendo planilha (isso roda em segundo plano)…", { id: tid });

      // 2) parsing + resolução de ativos em Web Worker (não trava a UI)
      const worker = new Worker(new URL("@/lib/backorder/import.worker.ts", import.meta.url), {
        type: "module",
      });
      const result = await new Promise<any>((resolve, reject) => {
        worker.onmessage = (ev: MessageEvent<any>) => {
          const m = ev.data;
          if (m.type === "progress") {
            if (m.phase === "processando") {
              toast.loading(`Processando OS… ${m.done.toLocaleString("pt-BR")}`, { id: tid });
            }
          } else if (m.type === "result") {
            resolve(m);
            worker.terminate();
          } else if (m.type === "error") {
            reject(new Error(m.message));
            worker.terminate();
          }
        };
        worker.onerror = (e) => {
          reject(new Error(e.message || "Falha no processamento da planilha"));
          worker.terminate();
        };
        worker.postMessage({
          type: "run",
          file,
          assetsMap,
          assetRecords,

          dynamicRules: rulesDB
            .filter((r) => r.ativo)
            .map((r) => ({
              equipe: r.equipe as Categoria,
              palavra_chave: r.palavra_chave,
              fonte: (r.fonte === "categoria" ? "categoria" : "descricao") as
                | "descricao"
                | "categoria",
              prioridade: r.prioridade,
            })),

          learnedLoc: locRes.data ?? [],
          learnedTeam: teamRes.data ?? [],
          overrides,
        });
      });

      const rows: any[] = result.rows ?? [];
      const embeddedAssets: any[] = result.embeddedAssets ?? [];
      if (rows.length === 0) {
        toast.warning("Nenhuma OS reconhecida na planilha.", { id: tid });
        return;
      }

      // 3) hidrata a base de ativos embutida no próprio arquivo
      if (embeddedAssets.length > 0) {
        for (let i = 0; i < embeddedAssets.length; i += 1000) {
          const chunk = embeddedAssets.slice(i, i + 1000);
          const { error } = await supabase
            .from("assets_ref")
            .upsert(chunk, { onConflict: "ativo" });
          if (error) throw error;
        }
      }

      // 4) grava em lotes via RPC (upsert em massa no servidor)
      const overrideSet = new Set(overrides.map(([os]) => os));
      const CHUNK = 1000;
      let novas = 0;
      let atualizadas = 0;
      let processadas = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc("backorder_bulk_upsert", {
          p_rows: chunk as any,
        });
        if (error) throw error;
        const res = data as any;
        const totalLote = Number(res?.total ?? 0);
        if (totalLote !== chunk.length) {
          throw new Error(
            `Importação interrompida no lote ${Math.floor(i / CHUNK) + 1}: ` +
              `${chunk.length.toLocaleString("pt-BR")} OS enviadas e ` +
              `${totalLote.toLocaleString("pt-BR")} processadas. Verifique números de OS vazios ou repetidos.`,
          );
        }
        processadas += totalLote;
        novas += Number(res?.novas ?? 0);
        atualizadas += Number(res?.atualizadas ?? 0);
        toast.loading(
          `Enviando… ${Math.min(i + CHUNK, rows.length).toLocaleString("pt-BR")} de ${rows.length.toLocaleString("pt-BR")}`,
          { id: tid },
        );
      }

      if (processadas !== rows.length) {
        throw new Error(
          `Importação incompleta: ${rows.length.toLocaleString("pt-BR")} OS lidas e ` +
            `${processadas.toLocaleString("pt-BR")} gravadas.`,
        );
      }

      // mantém a marcação de classificação manual das OS com override
      if (overrideSet.size > 0) {
        const marcar = rows.filter((r) => overrideSet.has(r.os)).map((r) => r.os);
        for (let i = 0; i < marcar.length; i += 500) {
          const chunk = marcar.slice(i, i + 500);
          if (chunk.length > 0) {
            await supabase
              .from("backorder_os")
              .update({ atividade_manual: true } as never)
              .in("os", chunk);
          }
        }
      }

      toast.success(
        `Importação conferida: ${processadas.toLocaleString("pt-BR")} OS gravadas ` +
          `(${novas.toLocaleString("pt-BR")} novas e ${atualizadas.toLocaleString("pt-BR")} atualizadas). ` +
          `${result.abertas} em aberto, ${result.concluidas} concluída(s) e ${result.canceladas} cancelada(s) separadas automaticamente.`,
        { id: tid, duration: 8000 },
      );
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao importar planilha", { id: tid });
    } finally {
      setImporting(false);
    }
  }

  async function handleAssetsImport(file: File) {
    setImporting(true);
    try {
      const parsed = await readAssetsFile(file);
      if (parsed.length === 0) {
        toast.warning("Nenhum ativo reconhecido na planilha.");
        return;
      }

      // Base existente para calcular quantos são novos vs. atualizados
      const { data: existingAssets } = await supabase
        .from("assets_ref")
        .select("ativo, denominacao");
      const existMap = new Map<string, string>();
      (existingAssets ?? []).forEach((a: any) =>
        existMap.set(String(a.ativo).toUpperCase(), String(a.denominacao ?? "")),
      );
      let novos = 0;
      let atualizados = 0;
      for (const a of parsed) {
        const prev = existMap.get(a.ativo);
        if (prev === undefined) novos++;
        else if (prev !== a.denominacao) atualizados++;
      }

      // Upsert em lotes
      for (let i = 0; i < parsed.length; i += 1000) {
        const chunk = parsed.slice(i, i + 1000);
        const { error } = await supabase.from("assets_ref").upsert(chunk, { onConflict: "ativo" });
        if (error) throw error;
      }

      // Base legada mudou: descarta o cache do grafo compartilhado.
      invalidateAssetGraphCache();

      // Recalcula Prédio/Andar/Espaço de todos os chamados usando a base atualizada
      const nextMap = makeAssetsMap([
        ...parsed,
        // preserva ativos que estavam no banco e não vieram no novo arquivo
        ...Array.from(existMap.entries())
          .filter(([k]) => !parsed.some((p) => p.ativo === k))
          .map(([ativo, denominacao]) => ({
            ativo,
            denominacao,
            nivel: "",
            codigo_pai: null,
            descricao_pai: "",
            unidade_negocio: "",
          })),
      ]);
      setAssetsMap(nextMap);

      const { data: allRows } = await supabase
        .from("backorder_os")
        .select("os, ativo, predio, andar, espaco");
      let recalculados = 0;
      const patches: Array<{ os: string; predio: string; andar: string; espaco: string }> = [];
      for (const r of (allRows ?? []) as Array<{
        os: string;
        ativo: string;
        predio: string;
        andar: string;
        espaco: string;
      }>) {
        if (!r.ativo) continue;
        const res = resolveAtivo(nextMap, r.ativo);
        if (res.predio !== r.predio || res.andar !== r.andar || res.espaco !== r.espaco) {
          patches.push({ os: r.os, ...res });
          recalculados++;
        }
      }
      for (let i = 0; i < patches.length; i += 50) {
        const slice = patches.slice(i, i + 50);
        await Promise.all(
          slice.map((p) =>
            supabase
              .from("backorder_os")
              .update({ predio: p.predio, andar: p.andar, espaco: p.espaco })
              .eq("os", p.os),
          ),
        );
      }

      toast.success(
        `Base de Ativos: ${novos} novo(s), ${atualizados} atualizado(s). ${recalculados} chamado(s) recalculado(s).`,
      );
      if (recalculados > 0) await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao importar Ativos");
    } finally {
      setImporting(false);
    }
  }

  async function handleReprocessarChamados() {
    setImporting(true);
    const t = toast.loading("Reprocessando chamados com a base inteligente…");
    try {
      const map = await loadAssetsIndex(true);
      setAssetsMap(map);

      await loadLearnedRules();
      const [locRes, teamRes] = await Promise.all([
        supabase.from("regras_aprendidas_localizacao").select("*"),
        supabase.from("regras_aprendidas_equipe").select("*"),
      ]);
      const learnedIdx = buildLearnedIndex(
        (locRes.data ?? []) as LearnedLocation[],
        (teamRes.data ?? []) as LearnedTeam[],
      );

      const { data: allRows } = await supabase
        .from("backorder_os")
        .select(
          "os, ativo, predio, andar, espaco, atividade, atividade_manual, revisao_manual, origem_predio_andar_espaco, origem_equipe",
        );
      type Row = {
        os: string;
        ativo: string;
        predio: string;
        andar: string;
        espaco: string;
        atividade: string;
        atividade_manual: boolean;
        revisao_manual: boolean;
        origem_predio_andar_espaco: string;
        origem_equipe: string;
      };
      const patches: Array<{
        os: string;
        predio: string;
        andar: string;
        espaco: string;
        atividade?: string;
        equipe?: string;
        revisao_manual: boolean;
        origem_predio_andar_espaco: string;
        origem_equipe: string;
      }> = [];
      for (const r of (allRows ?? []) as Row[]) {
        if (!r.ativo) continue;
        const tree = resolveAtivoTree(map, r.ativo);
        const applied = applyLearnedToResolved(
          learnedIdx,
          r.ativo,
          tree,
          (r.atividade as Categoria) || "Outros",
        );

        // Não sobrescreve equipe se atividade_manual = true
        const nextAtiv = r.atividade_manual ? (r.atividade as Categoria) : applied.atividade;
        const nextEquipe = r.atividade_manual ? undefined : CATEGORIA_TO_EQUIPE[applied.atividade];

        // Preserva prédio/andar/ambiente já salvos. Só sobrescreve quando:
        //  - existe regra aprendida para o ativo (fonte confiável), ou
        //  - o campo salvo está vazio e a árvore/regra devolve algo.
        // Assim reprocessar nunca destrói uma localização que o usuário
        // preencheu manualmente sem ter virado regra aprendida.
        const hasLearnedLoc = applied.origem_predio_andar_espaco === "regra_aprendida";
        const pickLoc = (prev: string, next: string) => {
          if (hasLearnedLoc) return next;
          if (prev) return prev;
          return next;
        };
        const finalPredio = pickLoc(r.predio, applied.predio);
        const finalAndar = pickLoc(r.andar, applied.andar);
        const finalEspaco = pickLoc(r.espaco, applied.espaco);
        const finalOrigemLoc = hasLearnedLoc
          ? "regra_aprendida"
          : r.predio || r.andar || r.espaco
            ? r.origem_predio_andar_espaco || "planilha"
            : applied.origem_predio_andar_espaco;

        const revisao =
          finalOrigemLoc === "pendente" ||
          (!r.atividade_manual && applied.origem_equipe === "pendente");

        if (
          finalPredio !== r.predio ||
          finalAndar !== r.andar ||
          finalEspaco !== r.espaco ||
          nextAtiv !== r.atividade ||
          revisao !== r.revisao_manual ||
          finalOrigemLoc !== r.origem_predio_andar_espaco ||
          (r.atividade_manual ? "regra_aprendida" : applied.origem_equipe) !== r.origem_equipe
        ) {
          patches.push({
            os: r.os,
            predio: finalPredio,
            andar: finalAndar,
            espaco: finalEspaco,
            atividade: r.atividade_manual ? undefined : nextAtiv,
            equipe: nextEquipe,
            revisao_manual: revisao,
            origem_predio_andar_espaco: finalOrigemLoc,
            origem_equipe: r.atividade_manual ? "regra_aprendida" : applied.origem_equipe,
          });
        }
      }
      for (let i = 0; i < patches.length; i += 50) {
        const slice = patches.slice(i, i + 50);
        await Promise.all(
          slice.map((p) => {
            const upd: Record<string, unknown> = {
              predio: p.predio,
              andar: p.andar,
              espaco: p.espaco,
              revisao_manual: p.revisao_manual,
              origem_predio_andar_espaco: p.origem_predio_andar_espaco,
              origem_equipe: p.origem_equipe,
            };
            if (p.atividade) upd.atividade = p.atividade;
            if (p.equipe) upd.equipe = p.equipe;
            if (p.os) {
              return supabase
                .from("backorder_os")
                .update(upd as never)
                .eq("os", p.os);
            }
            return Promise.resolve();
          }),
        );
      }
      toast.success(`Reprocessado: ${patches.length} chamado(s) atualizado(s).`, { id: t });
      if (patches.length > 0) await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reprocessar", { id: t });
    } finally {
      setImporting(false);
    }
  }

  // Importa arquivo de instrução (JSON) com regras de classificação de equipe.
  // Formato aceito:
  //   { "keywords": [{ "equipe": "Pintura", "palavra_chave": "faixa", "fonte": "descricao", "prioridade": 20 }] }
  async function handleInstrucaoImport(file: File) {
    setImporting(true);
    const t = toast.loading("Importando instrução…");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const keywords: DynamicRule[] = Array.isArray(json?.keywords) ? json.keywords : [];
      if (keywords.length === 0) {
        toast.warning('Nenhuma regra encontrada no arquivo (esperado: chave "keywords").', {
          id: t,
        });
        return;
      }
      const rows = keywords.map((k) => ({
        equipe: k.equipe,
        palavra_chave: k.palavra_chave,
        fonte: k.fonte === "categoria" ? "categoria" : "descricao",
        prioridade: Number.isFinite(k.prioridade) ? k.prioridade : 100,
        ativo: true,
      }));
      const { error } = await supabase
        .from("regras_classificacao_equipe")
        .upsert(rows, { onConflict: "equipe,palavra_chave,fonte" });
      if (error) throw error;
      await loadClassifierRules();
      toast.success(
        `${rows.length} regra(s) importada(s). Rode "Reprocessar Chamados" para aplicar.`,
        { id: t },
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao importar instrução", { id: t });
    } finally {
      setImporting(false);
    }
  }

  // Valida a base: lista quantos chamados não conseguem resolver Prédio.
  async function handleValidarBase() {
    const t = toast.loading("Validando cobertura da base de ativos…");
    try {
      const { data: assetsRaw } = await supabase.from("assets_ref").select("ativo");
      const codes = new Set(
        ((assetsRaw ?? []) as Array<{ ativo: string }>).map((a) => a.ativo.toUpperCase()),
      );
      const { data: allRows } = await supabase
        .from("backorder_os")
        .select("os, ativo")
        .eq("finalizado", false);
      const faltantes = new Set<string>();
      let semAtivo = 0;
      for (const r of (allRows ?? []) as Array<{ os: string; ativo: string }>) {
        if (!r.ativo) {
          semAtivo++;
          continue;
        }
        const p5 = r.ativo.slice(0, 5).toUpperCase();
        if (!codes.has(p5)) faltantes.add(p5);
      }
      const total = (allRows ?? []).length;
      const cobertos = total - semAtivo - faltantes.size;
      toast.success(
        `Base: ${codes.size} códigos • ${total} chamado(s) abertos • ${cobertos} com prédio, ${faltantes.size} prefixo(s) sem correspondência, ${semAtivo} sem ativo.`,
        { id: t, duration: 8000 },
      );
      if (faltantes.size > 0) {
        console.warn("Prefixos de ativo sem correspondência:", Array.from(faltantes));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao validar base", { id: t });
    }
  }

  async function toggleFinalizado(r: BOSRow, next: boolean) {
    const { error } = await supabase
      .from("backorder_os")
      .update({
        finalizado: next,
        data_finalizacao: next ? new Date().toISOString() : null,
        ...(next ? {} : { cancelado: false }),
      })
      .eq("os", r.os);
    if (error) return toast.error("Falha ao atualizar");
    setRows((prev) =>
      prev.map((x) =>
        x.os === r.os
          ? {
              ...x,
              finalizado: next,
              cancelado: next ? x.cancelado : false,
              data_finalizacao: next ? new Date().toISOString() : null,
            }
          : x,
      ),
    );
  }

  async function updateAtividade(r: BOSRow, atividade: Categoria) {
    const equipe = CATEGORIA_TO_EQUIPE[atividade];
    const { error } = await supabase
      .from("backorder_os")
      .update({
        atividade,
        atividade_manual: true,
        equipe,
        origem_equipe: "regra_aprendida",
      } as never)
      .eq("os", r.os);
    if (error) return toast.error("Falha ao atualizar categoria");
    await supabase
      .from("backorder_atividade_override")
      .upsert({ os: r.os, atividade }, { onConflict: "os" });
    // Aprende a equipe por ativo
    if (r.ativo) {
      const { data: user } = await supabase.auth.getUser();
      await supabase.from("regras_aprendidas_equipe").insert({
        codigo_ativo: r.ativo.trim().toUpperCase(),
        equipe: atividade,
        origem_chamado_os: r.os,
        criado_por: user.user?.id ?? null,
        ativo: true,
      });
      void loadLearnedRules();
    }
    setRows((prev) =>
      prev.map((x) => (x.os === r.os ? { ...x, atividade, atividade_manual: true, equipe } : x)),
    );
  }

  async function classificarEquipes(opts: { incluirManual: boolean }) {
    const base = abertas.filter((r) => (opts.incluirManual ? true : !r.atividade_manual));
    if (base.length === 0) {
      toast.info(
        opts.incluirManual
          ? "Sem OS abertas."
          : "Todas as OS abertas já têm equipe definida manualmente.",
      );
      return;
    }
    setAiReclassifying(true);
    const toastId = toast.loading(`Classificando ${base.length} OS…`);
    try {
      const patches: Array<{ os: string; atividade: Categoria; equipe: string; ambiguo: boolean }> =
        [];
      for (const row of base) {
        const result = classifyTeamByText(row.nome ?? "");
        const cat = result.equipe as Categoria;
        const nextEquipe = CATEGORIA_TO_EQUIPE[cat];
        // Só grava se mudou algo (atividade OU flag de revisão)
        if (
          cat === row.atividade &&
          row.equipe === nextEquipe &&
          (row.revisao_manual ?? false) === result.ambiguo
        )
          continue;
        patches.push({ os: row.os, atividade: cat, equipe: nextEquipe, ambiguo: result.ambiguo });
      }
      // Persiste em batches paralelos de 25
      for (let i = 0; i < patches.length; i += 25) {
        const slice = patches.slice(i, i + 25);
        await Promise.all(
          slice.map((p) =>
            supabase
              .from("backorder_os")
              .update({
                atividade: p.atividade,
                equipe: p.equipe,
                atividade_manual: false,
                revisao_manual: p.ambiguo,
                origem_equipe: p.ambiguo ? "pendente" : "regra_local",
              } as never)
              .eq("os", p.os),
          ),
        );
      }
      setRows((prev) =>
        prev.map((x) => {
          const p = patches.find((pp) => pp.os === x.os);
          return p
            ? {
                ...x,
                atividade: p.atividade,
                equipe: p.equipe,
                atividade_manual: false,
                revisao_manual: p.ambiguo,
              }
            : x;
        }),
      );
      const ambiguos = patches.filter((p) => p.ambiguo).length;
      toast.dismiss(toastId);
      toast.success(
        `Classificação concluída: ${patches.length} atualizada(s)${ambiguos > 0 ? ` · ${ambiguos} marcada(s) para revisão` : ""}.`,
      );
    } catch (e) {
      toast.dismiss(toastId);
      toast.error(e instanceof Error ? e.message : "Falha na classificação.");
    } finally {
      setAiReclassifying(false);
      setReclassifyOpen(false);
    }
  }

  async function updateRow(r: BOSRow, patch: Partial<BOSRow>) {
    const next: Partial<BOSRow> = { ...patch };
    if (
      patch.ativo !== undefined &&
      patch.ativo !== r.ativo &&
      patch.predio === undefined &&
      patch.andar === undefined &&
      patch.espaco === undefined
    ) {
      const tree = resolveAtivoTree(assetsMap, patch.ativo);
      const learned = learnedLocation(learnedIndex, patch.ativo);
      next.predio = learned?.predio ?? tree.predio;
      next.andar = learned?.andar ?? tree.andar;
      next.espaco = learned?.espaco ?? tree.espaco;
      (next as Record<string, unknown>).origem_predio_andar_espaco = learned
        ? "regra_aprendida"
        : tree.found
          ? "arvore_ativos"
          : "pendente";
    }
    if (patch.atividade && patch.atividade !== r.atividade) {
      next.atividade_manual = true;
      next.equipe = CATEGORIA_TO_EQUIPE[patch.atividade as Categoria];
    }
    const { error } = await supabase
      .from("backorder_os")
      .update(next as never)
      .eq("os", r.os);
    if (error) {
      toast.error("Falha ao salvar alterações");
      return false;
    }
    if (patch.atividade && patch.atividade !== r.atividade) {
      await supabase
        .from("backorder_atividade_override")
        .upsert({ os: r.os, atividade: patch.atividade }, { onConflict: "os" });
    }

    const ativoKey = (patch.ativo ?? r.ativo)?.trim().toUpperCase() ?? "";
    const locChanged =
      (next.predio !== undefined && next.predio !== r.predio) ||
      (next.andar !== undefined && next.andar !== r.andar) ||
      (next.espaco !== undefined && next.espaco !== r.espaco);
    const willBePredio = next.predio ?? r.predio;
    const willBeAndar = next.andar ?? r.andar;
    const willBeEspaco = next.espaco ?? r.espaco;

    if (ativoKey && locChanged && (willBePredio || willBeAndar || willBeEspaco)) {
      const { data: user } = await supabase.auth.getUser();
      const { error: lerr } = await supabase.from("regras_aprendidas_localizacao").insert({
        codigo_ativo: ativoKey,
        predio: willBePredio ?? "",
        andar: willBeAndar ?? "",
        espaco: willBeEspaco ?? "",
        origem_chamado_os: r.os,
        criado_por: user.user?.id ?? null,
        ativo: true,
      });
      if (!lerr) {
        const { data: siblings } = await supabase
          .from("backorder_os")
          .select("os")
          .eq("ativo", ativoKey)
          .neq("os", r.os)
          .eq("finalizado", false);
        const others = ((siblings ?? []) as Array<{ os: string }>).map((s) => s.os);
        if (others.length > 0) {
          await supabase
            .from("backorder_os")
            .update({
              predio: willBePredio ?? "",
              andar: willBeAndar ?? "",
              espaco: willBeEspaco ?? "",
              revisao_manual: false,
              origem_predio_andar_espaco: "regra_aprendida",
            } as never)
            .in("os", others);
        }
        void loadLearnedRules();
        toast.success(
          `Regra aprendida para ativo ${ativoKey}${others.length ? ` (aplicada a +${others.length} chamado(s))` : ""}`,
        );
      }
    }

    if (patch.atividade && patch.atividade !== r.atividade && ativoKey) {
      const { data: user } = await supabase.auth.getUser();
      await supabase.from("regras_aprendidas_equipe").insert({
        codigo_ativo: ativoKey,
        equipe: patch.atividade,
        origem_chamado_os: r.os,
        criado_por: user.user?.id ?? null,
        ativo: true,
      });
      void loadLearnedRules();
    }

    const nowHasLoc = !!(willBePredio || willBeAndar || willBeEspaco);
    if (r.revisao_manual && nowHasLoc) {
      await supabase
        .from("backorder_os")
        .update({ revisao_manual: false } as never)
        .eq("os", r.os);
    }

    setRows((prev) =>
      prev.map((x) =>
        x.os === r.os
          ? {
              ...x,
              ...next,
              revisao_manual: r.revisao_manual && nowHasLoc ? false : x.revisao_manual,
            }
          : x,
      ),
    );
    toast.success("Chamado atualizado");
    return true;
  }

  async function exportar() {
    const rowsExp: BackorderRow[] = filtered.map((r) => ({
      os: r.os,
      nome: r.nome,
      ativo: r.ativo,
      predio: r.predio,
      andar: r.andar,
      espaco: r.espaco,
      centro_custo: r.centro_custo,
      atividade: r.atividade as Categoria,
      equipe: r.equipe,
      termino_sla: r.termino_sla,
      data_solicitacao: r.data_solicitacao,
      outros: r.outros,
      criticidade: r.criticidade ?? "",
      finalizado: false,
      cancelado: false,
      data_conclusao: null,
      status_origem: r.status_origem ?? "",
      status_cat: toStatusCat(r.status_origem ?? ""),
      equipe_hint: "",
      revisao_manual: false,
    }));

    const blob = await generateBackorderExport({
      titulo: "DEMARCHI",
      rows: rowsExp,
      assetsMap,
    });

    downloadBlob(blob, `PROGRAMACAO_BACKORDER_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ----- Motor de priorização -----

  const runScan = useCallback(
    async (cfg: PriorityConfig, currentRows: BOSRow[], silent = false) => {
      setScanning(true);
      try {
        const abertosScan = currentRows.filter((r) => !r.finalizado);
        const results = scanAll(
          abertosScan.map((r) => ({
            os: r.os,
            nome: r.nome,
            ativo: r.ativo,
            predio: r.predio,
            espaco: r.espaco,
            outros: r.outros,
            atividade: r.atividade,
            data_solicitacao: r.data_solicitacao,
            finalizado: r.finalizado,
          })),
          cfg,
        );
        const byOs = new Map(results.map((r) => [r.os, r]));
        const changed: typeof results = [];
        for (const r of currentRows) {
          const res = byOs.get(r.os) ?? {
            os: r.os,
            is_prioridade: false,
            motivo_prioridade: null,
            prioridade_nivel: 0,
          };
          const prev = {
            is_prioridade: !!r.is_prioridade,
            motivo_prioridade: r.motivo_prioridade ?? null,
            prioridade_nivel: r.prioridade_nivel ?? 0,
          };
          if (
            prev.is_prioridade !== res.is_prioridade ||
            prev.motivo_prioridade !== res.motivo_prioridade ||
            prev.prioridade_nivel !== res.prioridade_nivel
          ) {
            changed.push(res);
          }
        }

        const now = new Date().toISOString();
        // Persistir alterações em paralelo, em lotes
        const BATCH = 25;
        for (let i = 0; i < changed.length; i += BATCH) {
          const slice = changed.slice(i, i + BATCH);
          await Promise.all(
            slice.map((c) =>
              supabase
                .from("backorder_os")
                .update({
                  is_prioridade: c.is_prioridade,
                  motivo_prioridade: c.motivo_prioridade,
                  prioridade_nivel: c.prioridade_nivel,
                  prioridade_scanned_at: now,
                } as never)
                .eq("os", c.os),
            ),
          );
        }
        // Atualiza timestamp global
        await supabase
          .from("backorder_prioridade_config" as never)
          .update({ last_scan_at: now } as never)
          .eq("id", 1);

        setConfig((c) => ({ ...c, last_scan_at: now }));
        setRows((prev) =>
          prev.map((r) => {
            const res = byOs.get(r.os);
            if (!res) return r;
            return {
              ...r,
              is_prioridade: res.is_prioridade,
              motivo_prioridade: res.motivo_prioridade,
              prioridade_nivel: res.prioridade_nivel,
            };
          }),
        );
        if (!silent) {
          const total = results.filter((r) => r.is_prioridade).length;
          toast.success(`Varredura concluída — ${total} chamado(s) prioritário(s).`);
        }
      } catch (e: unknown) {
        console.error(e);
        toast.error("Falha ao executar varredura de prioridades");
      } finally {
        setScanning(false);
      }
    },
    [],
  );

  // Re-scan quando dados mudam (após refresh)
  const lastRowsRef = useRef<string>("");
  useEffect(() => {
    if (loading || rows.length === 0) return;
    const sig = rows.map((r) => `${r.os}:${r.finalizado ? 1 : 0}`).join("|");
    if (sig === lastRowsRef.current) return;
    lastRowsRef.current = sig;
    void runScan(config, rows, true);
  }, [rows, loading, config, runScan]);

  async function saveConfig(next: PriorityConfig) {
    const payload = {
      predios_sensiveis: next.predios_sensiveis,
      keyword_rules: next.keyword_rules,
      dias_forca_prioridade: next.dias_forca_prioridade,
      familias_habilitadas: next.familias_habilitadas,
    };
    const { error } = await supabase
      .from("backorder_prioridade_config" as never)
      .update(payload as never)
      .eq("id", 1);
    if (error) {
      toast.error("Falha ao salvar configuração");
      return;
    }
    setConfig(next);
    toast.success("Configuração salva");
    await runScan(next, rows, false);
  }

  const priorityRows = useMemo(() => rows.filter((r) => !r.finalizado && r.is_prioridade), [rows]);

  async function exportPrioridades() {
    if (priorityRows.length === 0) return toast.warning("Nenhum chamado prioritário no momento.");
    const rowsExp = priorityRows.map((r) => ({
      os: r.os,
      nome: r.nome,
      ativo: r.ativo,
      predio: r.predio,
      andar: r.andar,
      espaco: r.espaco,
      equipe: r.equipe,
      termino_sla: r.termino_sla,
      data_solicitacao: r.data_solicitacao,
      outros: r.outros,
      motivo_prioridade: r.motivo_prioridade ?? "",
      prioridade_nivel: r.prioridade_nivel ?? 0,
    }));
    const blob = await generatePriorityExport({ titulo: "DEMARCHI", rows: rowsExp });
    downloadBlob(blob, `PRIORIDADES_BACKORDER_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function printPrioridades() {
    if (priorityRows.length === 0) return toast.warning("Nenhum chamado prioritário no momento.");
    openPriorityPrintView(
      "DEMARCHI",
      priorityRows.map((r) => ({
        os: r.os,
        nome: r.nome,
        ativo: r.ativo,
        predio: r.predio,
        andar: r.andar,
        espaco: r.espaco,
        equipe: r.equipe,
        termino_sla: r.termino_sla,
        data_solicitacao: r.data_solicitacao,
        outros: r.outros,
        motivo_prioridade: r.motivo_prioridade ?? "",
        prioridade_nivel: r.prioridade_nivel ?? 0,
      })),
    );
  }

  const [selectedBackorder, setSelectedBackorder] = useState<BOSRow | null>(null);
  // Mantém o item aberto sincronizado com o estado global (após salvar/finalizar).
  const selectedBackorderLive = useMemo(
    () => (selectedBackorder ? (rows.find((r) => r.os === selectedBackorder.os) ?? null) : null),
    [selectedBackorder, rows],
  );

  const handleLimparTudo = useCallback(async () => {
    setClearing(true);
    const t = toast.loading("Limpando todos os chamados...");
    try {
      // Deleção em massa no servidor (uma única transação) — evita timeout
      // do PostgREST com dezenas de milhares de linhas.
      const { data, error } = await supabase.rpc("backorder_clear_all");
      if (error) throw error;
      setRows([]);
      setSelectedBackorder(null);
      setSearch("");
      setFilterCat("__all__");
      setOrder("asc");
      setTab("tabela");
      setClearOpen(false);
      toast.success(`${Number(data ?? 0).toLocaleString("pt-BR")} chamados removidos.`, { id: t });
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err?.message ?? "Falha ao limpar chamados", { id: t });
    } finally {
      setClearing(false);
    }
  }, []);

  return (
    <PageShell
      title="# Sistema de Backorders e Gestão de Ordens de Serviço (OS)"
      description="Desenvolver uma seção dedicada a Backorders e um sistema de gestão de Ordens de Serviço (OS) que integre dados de uma planilha histórica (desde o início do ano corrente até a data atual)."
      actions={
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Button
            onClick={() => setReclassifyOpen(true)}
            disabled={aiReclassifying || abertas.length === 0}
            className="w-full sm:w-auto"
          >
            <BrainCircuit className={`mr-2 h-4 w-4 ${aiReclassifying ? "animate-pulse" : ""}`} />
            {aiReclassifying ? "Classificando..." : "Classificar Equipes"}
          </Button>

          <Button onClick={exportar} disabled={filtered.length === 0} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto" disabled={importing}>
                <Settings2 className="mr-2 h-4 w-4" /> Ações
                <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Importação</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => assetsInputRef.current?.click()}
                disabled={importing}
              >
                <Database className="mr-2 h-4 w-4" /> Atualizar Base de Ativos
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => instrucaoInputRef.current?.click()}
                disabled={importing}
              >
                <Upload className="mr-2 h-4 w-4" /> Importar Instrução
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => backorderInputRef.current?.click()}
                disabled={importing}
              >
                <Upload className="mr-2 h-4 w-4" /> Importar Backorder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Processamento</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleReprocessarChamados} disabled={importing}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reprocessar Chamados
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/inteligencia-ativos/preencher">
                  <Database className="mr-2 h-4 w-4" />
                  Preencher Prédio/Andar/Ambiente
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleValidarBase} disabled={importing}>
                <ShieldAlert className="mr-2 h-4 w-4" /> Validar Base
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfigOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" /> Prioridades
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setClearOpen(true)}
                disabled={importing || clearing || rows.length === 0}
                className="text-destructive focus:text-destructive"
              >
                <Eraser className="mr-2 h-4 w-4" /> Limpar Tudo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            ref={backorderInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleBackorderImport(f);
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={assetsInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleAssetsImport(f);
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={instrucaoInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleInstrucaoImport(f);
              e.currentTarget.value = "";
            }}
          />
          <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar todos os chamados?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove permanentemente todos os {rows.length} chamado(s) de backorder e
                  reseta os filtros da tela. Não é possível desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleLimparTudo();
                  }}
                  disabled={clearing}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {clearing ? "Limpando..." : "Sim, limpar tudo"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={reclassifyOpen} onOpenChange={setReclassifyOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Classificar Equipes</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Analisa o texto do <strong>Nome</strong> de cada chamado e atribui a equipe
                  responsável (Chaveiro, Civil, Refrigeração, Hidráulica, Elétrica ou{" "}
                  <strong>Pintura</strong>).
                </p>
                <p className="text-muted-foreground">
                  A análise considera também o critério de <strong>Pintura</strong> (pintura,
                  repintura, tinta, textura, verniz, demarcação e sinalização de piso), que tem
                  prioridade sobre Civil quando ambos se aplicam.
                </p>
                <p className="text-muted-foreground">
                  Chamados ambíguos (várias equipes com peso equivalente) são marcados como
                  <span className="mx-1 inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    Classificação sugerida — revisar
                  </span>
                  para você confirmar.
                </p>
                <label className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-3">
                  <Checkbox
                    checked={reclassifyAll}
                    onCheckedChange={(v) => setReclassifyAll(Boolean(v))}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Reclassificar tudo</span>
                    <span className="block text-xs text-muted-foreground">
                      Inclui chamados que você já ajustou manualmente. Por padrão, o sistema só toca
                      em chamados sem equipe definida.
                    </span>
                  </span>
                </label>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setReclassifyOpen(false)}
                  disabled={aiReclassifying}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => void classificarEquipes({ incluirManual: reclassifyAll })}
                  disabled={aiReclassifying}
                >
                  <BrainCircuit
                    className={`mr-2 h-4 w-4 ${aiReclassifying ? "animate-pulse" : ""}`}
                  />
                  {aiReclassifying ? "Classificando..." : "Classificar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">
            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger className="h-11 w-full sm:w-32">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {anosDisponiveis.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="h-11 w-full sm:w-40">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                <SelectItem value="01">Janeiro</SelectItem>
                <SelectItem value="02">Fevereiro</SelectItem>
                <SelectItem value="03">Março</SelectItem>
                <SelectItem value="04">Abril</SelectItem>
                <SelectItem value="05">Maio</SelectItem>
                <SelectItem value="06">Junho</SelectItem>
                <SelectItem value="07">Julho</SelectItem>
                <SelectItem value="08">Agosto</SelectItem>
                <SelectItem value="09">Setembro</SelectItem>
                <SelectItem value="10">Outubro</SelectItem>
                <SelectItem value="11">Novembro</SelectItem>
                <SelectItem value="12">Dezembro</SelectItem>
              </SelectContent>
            </Select>

            <Select value={solicitanteFilter} onValueChange={setSolicitanteFilter}>
              <SelectTrigger className="h-11 w-full sm:w-64">
                <SelectValue placeholder="Solicitante" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os solicitantes</SelectItem>
                {solicitantesDisponiveis.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Badge variant="outline" className="h-9 px-3">
            {rowsFiltradas.length.toLocaleString("pt-BR")} OS na base
          </Badge>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-md">
          <div className="flex flex-1 flex-col gap-1.5 min-w-[200px]">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Mês de Referência
            </Label>
            <Select value={mesFiltro} onValueChange={setMesFiltro}>
              <SelectTrigger className="h-10 border-white/10 bg-white/5 text-sm">
                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Selecione o mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Meses</SelectItem>
                <SelectItem value="01">Janeiro</SelectItem>
                <SelectItem value="02">Fevereiro</SelectItem>
                <SelectItem value="03">Março</SelectItem>
                <SelectItem value="04">Abril</SelectItem>
                <SelectItem value="05">Maio</SelectItem>
                <SelectItem value="06">Junho</SelectItem>
                <SelectItem value="07">Julho</SelectItem>
                <SelectItem value="08">Agosto</SelectItem>
                <SelectItem value="09">Setembro</SelectItem>
                <SelectItem value="10">Outubro</SelectItem>
                <SelectItem value="11">Novembro</SelectItem>
                <SelectItem value="12">Dezembro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-1 flex-col gap-1.5 min-w-[200px]">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Solicitante
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filtrar por nome..."
                value={solicitanteFilter}
                onChange={(e) => setSolicitanteFilter(e.target.value)}
                className="h-10 border-white/10 bg-white/5 pl-9 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 justify-end">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-transparent select-none">Ações</Label>
            <Button
              variant="outline"
              className="h-10 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-semibold"
              onClick={async () => {
                if (rowsFiltradas.length === 0) {
                  toast.error("Nenhuma OS filtrada para distribuir");
                  return;
                }
                toast.promise(
                  distributeBackorderToField({
                    data: {
                      osList: rowsFiltradas.map((r) => ({
                        os: r.os,
                        nome: r.nome,
                        ativo: r.ativo,
                        predio: r.predio,
                        andar: r.andar,
                        espaco: r.espaco,
                        equipe: r.equipe,
                        data_solicitacao: r.data_solicitacao,
                        outros: r.outros,
                        status_origem: r.status_origem || "",
                      })),
                    },
                  }),
                  {
                    loading: "Distribuindo chamados para as equipes...",
                    success: (res: any) =>
                      `Sucesso! ${res.refrig} OS para Refrigeração e ${res.corretiva} para Corretiva.`,
                    error: "Falha na distribuição",
                  }
                );
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Enviar para Campo
            </Button>
          </div>
        </div>

        <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
          <TabsList className="flex w-max gap-1">
            <TabsTrigger value="tabela" className="min-h-11">
              <PackageX className="mr-1.5 h-3.5 w-3.5" /> Em aberto
              <Badge variant="secondary" className="ml-2">
                {abertas.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="backorder" className="min-h-11">
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Backorder
              <Badge className="ml-2 bg-orange-500 text-white">{backorderAbertas.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="finalizados" className="min-h-11">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Concluídos
              <Badge variant="secondary" className="ml-2">
                {finalizadas.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="aprovacao" className="min-h-11">
              <Filter className="mr-1.5 h-3.5 w-3.5" /> Aguardando aprovação
              <Badge className="ml-2 bg-amber-500 text-white">{aguardandoAprovacao.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="reabertas" className="min-h-11">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reabertas
              <Badge className="ml-2 bg-purple-500 text-white">{reabertas.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="cancelados" className="min-h-11">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Cancelados
              <Badge variant="secondary" className="ml-2">
                {cancelados.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="status" className="min-h-11">
              Todos os status
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="min-h-11">
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="revisao" className="min-h-11">
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Revisão
              {revisaoRows.length > 0 && (
                <Badge className="ml-2 bg-amber-500 text-white">{revisaoRows.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tabela">
          <TableView
            rows={filtered}
            loading={loading}
            search={search}
            setSearch={setSearch}
            filterCat={filterCat}
            setFilterCat={setFilterCat}
            order={order}
            setOrder={setOrder}
            onToggle={toggleFinalizado}
            onCategoria={updateAtividade}
            onSelect={setSelectedBackorder}
            assetsMap={assetsMap}
          />
        </TabsContent>

        <TabsContent value="backorder">
          <div className="max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/20">
            <BackorderPanel
              rows={backorderAbertas}
              onSelect={setSelectedBackorder}
              onFinalizar={(r) => toggleFinalizado(r, true)}
            />
          </div>
        </TabsContent>

        <TabsContent value="finalizados" className="space-y-4">
          <AvaliacaoEmailCard rows={avaliacaoRows} ano={ano === "todos" ? "todos os anos" : ano} />
          <div className="max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/20">
            <FinalizadosView rows={finalizadas} onReabrir={(r) => toggleFinalizado(r, false)} />
          </div>
        </TabsContent>

        <TabsContent value="aprovacao" className="space-y-4">
          <AvaliacaoEmailCard
            rows={avaliacaoRows.filter((r) => r.statusCat === "aguardando_aprovacao")}
            ano={ano === "todos" ? "todos os anos" : ano}
          />
          <div className="max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/20">
            <FinalizadosView
              rows={aguardandoAprovacao}
              onReabrir={(r) => toggleFinalizado(r, false)}
            />
          </div>
        </TabsContent>

        <TabsContent value="reabertas">
          <div className="max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/20">
            <FinalizadosView rows={reabertas} onReabrir={(r) => toggleFinalizado(r, false)} />
          </div>
        </TabsContent>

        <TabsContent value="cancelados">
          <div className="max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/20">
            <FinalizadosView rows={cancelados} onReabrir={(r) => toggleFinalizado(r, false)} />
          </div>
        </TabsContent>

        <TabsContent value="status">
          <StatusBoard
            rows={statusRows}
            onSelect={(os) => setSelectedBackorder(rows.find((r) => r.os === os) ?? null)}
          />
        </TabsContent>

        <TabsContent value="dashboard">
          <Dashboard
            abertas={abertas}
            backorder={backorderAbertas}
            finalizadas={finalizadas}
            targetPct={targetPct}
            priorityRows={priorityRows}
            lastScanAt={config.last_scan_at}
            scanning={scanning}
            onRescan={() => runScan(config, rows, false)}
            onExportPriorities={exportPrioridades}
            onPrintPriorities={printPrioridades}
            onOpenConfig={() => setConfigOpen(true)}
            onFinalizar={(r) => toggleFinalizado(r, true)}
          />
        </TabsContent>

        <TabsContent value="revisao">
          <div className="max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/20">
            <RevisaoPanel
              rows={revisaoRows}
              rules={rulesDB}
              onSelectRow={setSelectedBackorder}
              onSaveRule={saveRule}
              onDeleteRule={deleteRule}
              onReprocessar={handleReprocessarChamados}
              importing={importing}
              learnedLoc={learnedLoc}
              learnedTeam={learnedTeamRules}
              allRows={rows}
              onDeleteLearnedLoc={async (id) => {
                await supabase.from("regras_aprendidas_localizacao").delete().eq("id", id);
                await loadLearnedRules();
                toast.success("Regra aprendida removida");
              }}
              onDeleteLearnedTeam={async (id) => {
                await supabase.from("regras_aprendidas_equipe").delete().eq("id", id);
                await loadLearnedRules();
                toast.success("Regra aprendida removida");
              }}
              onToggleLearnedLoc={async (id, ativo) => {
                await supabase
                  .from("regras_aprendidas_localizacao")
                  .update({ ativo } as never)
                  .eq("id", id);
                await loadLearnedRules();
              }}
              onToggleLearnedTeam={async (id, ativo) => {
                await supabase
                  .from("regras_aprendidas_equipe")
                  .update({ ativo } as never)
                  .eq("id", id);
                await loadLearnedRules();
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
      <PriorityConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSave={saveConfig}
      />
      <BackorderDetailDialog
        row={selectedBackorderLive}
        onClose={() => setSelectedBackorder(null)}
        onSave={updateRow}
        onFinalizar={async (r) => {
          await toggleFinalizado(r, true);
          setSelectedBackorder(null);
        }}
      />
    </PageShell>
  );
}

// ---------- Tabela principal ----------

function LocationCell({
  assetsMap,
  ativo,
  value,
  field,
  className,
  title,
}: {
  assetsMap: AssetsMap;
  ativo: string;
  value: string;
  field: "predio" | "andar" | "espaco";
  className?: string;
  title?: string;
}) {
  if (value)
    return (
      <span className={className} title={title ?? value}>
        {value}
      </span>
    );
  if (!ativo) return <span className="text-muted-foreground">—</span>;
  const info = describeAtivo(assetsMap, ativo);
  if (!info.found) {
    return (
      <span
        className="inline-flex items-center rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400"
        title={`Ativo "${ativo}" não encontrado na base de ativos`}
      >
        Ativo não cadastrado
      </span>
    );
  }
  if (info.naFields[field]) {
    return (
      <span
        className="inline-flex items-center rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
        title={`Não aplicável — o Ativo é do nível ${info.nivelSelf || "raiz"}`}
      >
        —
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function TableView({
  rows,
  loading,
  search,
  setSearch,
  filterCat,
  setFilterCat,
  order,
  setOrder,
  onToggle,
  onCategoria,
  onSelect,
  assetsMap,
}: {
  rows: BOSRow[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  filterCat: string;
  setFilterCat: (v: string) => void;
  order: "asc" | "desc";
  setOrder: (v: "asc" | "desc") => void;
  onToggle: (r: BOSRow, next: boolean) => void;
  onCategoria: (r: BOSRow, c: Categoria) => void;
  onSelect?: (r: BOSRow) => void;
  assetsMap: AssetsMap;
}) {
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [rows.length, search, filterCat, order]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar OS, nome, ativo ou prédio…"
            className="pl-8"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas categorias</SelectItem>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
        >
          <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
          {order === "asc" ? "Mais antigos" : "Mais recentes"}
        </Button>
      </div>

      <TeamSummaryStrip rows={rows} filterCat={filterCat} setFilterCat={setFilterCat} />

      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {rows.length === 0
            ? "0 registros"
            : `Mostrando ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, rows.length)} de ${rows.length}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Anterior
            </Button>
            <span className="font-mono">
              {currentPage}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima →
            </Button>
          </div>
        )}
      </div>

      <div className="max-h-[65vh] overflow-auto rounded-xl border border-border/60">
        <Table className="min-w-[1360px]">
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <TableRow>
              <TableHead className="w-10 whitespace-nowrap">✓</TableHead>
              <TableHead className="w-[90px] whitespace-nowrap">OS</TableHead>
              <TableHead className="min-w-[280px] whitespace-nowrap">Nome</TableHead>
              <TableHead className="w-[110px] whitespace-nowrap">Prédio</TableHead>
              <TableHead className="w-[130px] whitespace-nowrap">Andar</TableHead>
              <TableHead className="min-w-[180px] whitespace-nowrap">Espaço</TableHead>
              <TableHead className="w-[230px] whitespace-nowrap">Atividade</TableHead>
              <TableHead className="w-[110px] whitespace-nowrap">Data Abertura</TableHead>
              <TableHead className="w-[150px] whitespace-nowrap">Equipe</TableHead>
              <TableHead className="min-w-[190px] whitespace-nowrap">Solicitante</TableHead>
              <TableHead className="w-[150px] whitespace-nowrap">Centro Custo</TableHead>
              <TableHead className="w-[80px] whitespace-nowrap">Dias</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma OS.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => {
                const dias = daysBetween(r.data_solicitacao);
                const isBackorder = dias > 30;
                return (
                  <TableRow
                    key={r.os}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('button, input, [role="combobox"], [role="checkbox"], a'))
                        return;
                      onSelect?.(r);
                    }}
                    className={
                      (onSelect ? "cursor-pointer " : "") +
                      (r.atividade === "Outros"
                        ? "bg-amber-400/15 hover:bg-amber-400/20"
                        : isBackorder
                          ? "bg-red-500/5 hover:bg-red-500/10"
                          : "hover:bg-muted/40")
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={r.finalizado}
                        onCheckedChange={(v) => onToggle(r, Boolean(v))}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{r.os}</TableCell>
                    <TableCell className="max-w-[360px] truncate" title={r.nome}>
                      {r.nome}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <LocationCell
                        assetsMap={assetsMap}
                        ativo={r.ativo}
                        value={r.predio}
                        field="predio"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <LocationCell
                        assetsMap={assetsMap}
                        ativo={r.ativo}
                        value={r.andar}
                        field="andar"
                      />
                    </TableCell>
                    <TableCell
                      className="max-w-[240px] truncate text-xs"
                      title={r.espaco || r.ativo}
                    >
                      <LocationCell
                        assetsMap={assetsMap}
                        ativo={r.ativo}
                        value={r.espaco}
                        field="espaco"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={r.atividade}
                          onValueChange={(v) => onCategoria(r, v as Categoria)}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIAS.map((c) => (
                              <SelectItem key={c} value={c}>
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ background: CATEGORIA_COLOR[c] }}
                                  />
                                  {c}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {r.atividade_manual ? (
                          <span
                            className="inline-flex h-5 items-center rounded bg-emerald-500/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                            title="Equipe definida manualmente por você"
                          >
                            Manual
                          </span>
                        ) : (
                          <span
                            className="inline-flex h-5 items-center rounded bg-sky-500/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400"
                            title="Classificação automática — clique para ajustar"
                          >
                            Auto
                          </span>
                        )}
                        {r.revisao_manual && !r.atividade_manual && (
                          <span
                            className="inline-flex h-5 items-center rounded bg-amber-500/20 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400"
                            title="Classificação sugerida — várias equipes têm evidência semelhante. Revisar."
                          >
                            Revisar
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.termino_sla ? new Date(r.termino_sla).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <span
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                        style={{
                          background: `${(EQUIPE_COR as Record<string, string>)[r.atividade] ?? "#94a3b8"}22`,
                          color: (EQUIPE_COR as Record<string, string>)[r.atividade] ?? undefined,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background:
                              (EQUIPE_COR as Record<string, string>)[r.atividade] ?? "#94a3b8",
                          }}
                        />
                        {r.equipe || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs" title={r.outros}>
                      {r.outros}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-xs" title={r.centro_custo}>
                      {r.centro_custo}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          dias > 90
                            ? "bg-red-500/20 text-red-600"
                            : dias > 60
                              ? "bg-orange-500/20 text-orange-600"
                              : dias > 30
                                ? "bg-amber-500/20 text-amber-600"
                                : "bg-emerald-500/20 text-emerald-600"
                        }
                      >
                        {dias}d
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

function TeamSummaryStrip({
  rows,
  filterCat,
  setFilterCat,
}: {
  rows: BOSRow[];
  filterCat: string;
  setFilterCat: (v: string) => void;
}) {
  const counts = useMemo(() => {
    const map = new Map<Equipe, number>();
    for (const e of EQUIPES) map.set(e, 0);
    for (const r of rows) {
      if (EQUIPES.includes(r.atividade as Equipe)) {
        map.set(r.atividade as Equipe, (map.get(r.atividade as Equipe) ?? 0) + 1);
      }
    }
    return map;
  }, [rows]);
  const revisao = useMemo(
    () => rows.filter((r) => r.revisao_manual && !r.atividade_manual).length,
    [rows],
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setFilterCat("__all__")}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
          filterCat === "__all__"
            ? "border-primary/60 bg-primary/10 text-primary"
            : "border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted"
        }`}
      >
        Todas · {rows.length}
      </button>
      {EQUIPES.map((e) => {
        const active = filterCat === e;
        const color = EQUIPE_COR[e];
        return (
          <button
            key={e}
            type="button"
            onClick={() => setFilterCat(active ? "__all__" : e)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              active ? "border-primary/60" : "border-border/60 hover:bg-muted"
            }`}
            style={active ? { background: `${color}22`, color } : undefined}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            {e} · {counts.get(e) ?? 0}
          </button>
        );
      })}
      {revisao > 0 && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-3 w-3" /> {revisao} para revisar
        </span>
      )}
    </div>
  );
}

const FinalizadosView = memo(function FinalizadosView({
  rows,
  onReabrir,
}: {
  rows: BOSRow[];
  onReabrir: (r: BOSRow) => void;
}) {
  const { visible, hasMore, sentinelRef, shown, total } = useIncrementalList(rows, 60);
  return (
    <GlassCard>
      <div className="mb-2 text-xs text-muted-foreground">
        Mostrando {shown} de {total} OS
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-xl border border-border/60">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <TableRow>
              <TableHead>OS</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Prédio</TableHead>
              <TableHead>Atividade</TableHead>
              <TableHead>Concluído em</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma OS finalizada.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => (
                <TableRow key={r.os}>
                  <TableCell className="font-mono text-xs">{r.os}</TableCell>
                  <TableCell className="max-w-[360px] truncate">{r.nome}</TableCell>
                  <TableCell className="text-xs">{r.predio}</TableCell>
                  <TableCell className="text-xs">{r.atividade}</TableCell>
                  <TableCell className="text-xs">
                    {r.data_finalizacao
                      ? new Date(r.data_finalizacao).toLocaleString("pt-BR")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => onReabrir(r)}>
                      <RefreshCw className="mr-1 h-3 w-3" /> Reabrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {hasMore && <div ref={sentinelRef} className="h-8" aria-hidden />}
      </div>
    </GlassCard>
  );
});

// ---------- Dashboard ----------

function Dashboard({
  abertas,
  backorder,
  finalizadas,
  targetPct,
  priorityRows,
  lastScanAt,
  scanning,
  onRescan,
  onExportPriorities,
  onPrintPriorities,
  onOpenConfig,
  onFinalizar,
}: {
  abertas: BOSRow[];
  backorder: BOSRow[];
  finalizadas: BOSRow[];
  targetPct: number;
  priorityRows: BOSRow[];
  lastScanAt: string | null;
  scanning: boolean;
  onRescan: () => void;
  onExportPriorities: () => void;
  onPrintPriorities: () => void;
  onOpenConfig: () => void;
  onFinalizar: (r: BOSRow) => void;
}) {
  const totalCorretivas = abertas.length + finalizadas.length;
  const pct = totalCorretivas === 0 ? 0 : (backorder.length / totalCorretivas) * 100;
  const dentroMeta = pct <= targetPct;
  const proximoLimite = pct > targetPct - 1 && pct <= targetPct;
  const statusColor = dentroMeta ? (proximoLimite ? "#F59E0B" : "#10B981") : "#EF4444";

  // Comparativo período anterior (últimos 30 dias vs 30 anteriores) — baseia-se
  // em backorders "criadas" (data_solicitacao > 30d atrás quando aberta).
  const now = Date.now();
  const ms30 = 30 * 86400 * 1000;
  const backAtual = backorder.length;
  const backAnterior = useMemo(
    () =>
      abertas.filter((r) => {
        const t = new Date(r.data_solicitacao).getTime();
        return now - t > 60 * 86400 * 1000 && now - t <= 90 * 86400 * 1000;
      }).length +
      finalizadas.filter((r) => {
        const t = new Date(r.data_solicitacao).getTime();
        return now - t > 60 * 86400 * 1000 && now - t <= 90 * 86400 * 1000;
      }).length,
    [abertas, finalizadas, now],
  );
  const delta = backAtual - backAnterior;

  const priorityOrdered = useMemo(
    () =>
      [...priorityRows].sort((a, b) => {
        const ta = new Date(a.data_solicitacao).getTime();
        const tb = new Date(b.data_solicitacao).getTime();
        if (ta !== tb) return ta - tb;
        return (b.prioridade_nivel ?? 0) - (a.prioridade_nivel ?? 0);
      }),
    [priorityRows],
  );

  const [selectedPriority, setSelectedPriority] = useState<BOSRow | null>(null);

  const porCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of backorder) map.set(r.atividade, (map.get(r.atividade) ?? 0) + 1);
    return CATEGORIAS.map((c) => ({ name: c, value: map.get(c) ?? 0, color: CATEGORIA_COLOR[c] }));
  }, [backorder]);

  const aging = useMemo(() => {
    const b = { "31-45": 0, "46-60": 0, "61-90": 0, "90+": 0 };
    for (const r of backorder) {
      const d = daysBetween(r.data_solicitacao);
      if (d <= 45) b["31-45"]++;
      else if (d <= 60) b["46-60"]++;
      else if (d <= 90) b["61-90"]++;
      else b["90+"]++;
    }
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [backorder]);

  const evolucao = useMemo(() => {
    // Últimos 6 meses: quantas OS eram backorder ativas naquele mês (data_solicitacao > 30d)
    const buckets: Array<{ name: string; value: number }> = [];
    const nowD = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const label = d.toLocaleDateString("pt-BR", { month: "short" });
      const count = [...abertas, ...finalizadas].filter((r) => {
        const t = new Date(r.data_solicitacao).getTime();
        return t + 30 * 86400 * 1000 <= end && t < end && (r.finalizado ? true : t < end);
      }).length;
      buckets.push({ name: label, value: count });
    }
    return buckets;
  }, [abertas, finalizadas]);

  const porPredio = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of backorder) {
      const k = r.predio || "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [backorder]);

  const propPrio = useMemo(() => {
    const p = priorityRows.length;
    const np = Math.max(0, abertas.length - p);
    return [
      { name: "Prioritários", value: p },
      { name: "Regulares", value: np },
    ];
  }, [priorityRows, abertas]);

  const gaugeData = [{ name: "pct", value: Math.min(pct, 100), fill: statusColor }];

  return (
    <div className="space-y-4">
      {/* 2.1 Cabeçalho de status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            % de Backorder
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">Meta: até {targetPct}%</div>
          <div className="relative mt-3 h-[200px]">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={gaugeData}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={16} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold" style={{ color: statusColor }}>
                {pct.toFixed(1)}%
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {backorder.length} de {totalCorretivas} OS
              </div>
            </div>
          </div>
          <div className="mt-2 flex justify-center">
            <Badge style={{ backgroundColor: `${statusColor}22`, color: statusColor }}>
              {dentroMeta
                ? proximoLimite
                  ? "Próximo do limite"
                  : "Dentro da meta"
                : "Acima da meta"}
            </Badge>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Comparativo mensal
          </div>
          <div className="mt-4 flex items-center gap-3">
            {delta > 0 ? (
              <TrendingUp className="h-10 w-10 text-red-500" />
            ) : delta < 0 ? (
              <TrendingDown className="h-10 w-10 text-emerald-500" />
            ) : (
              <ArrowUpDown className="h-10 w-10 text-muted-foreground" />
            )}
            <div>
              <div className="text-3xl font-bold">
                {delta >= 0 ? "+" : ""}
                {delta}
              </div>
              <div className="text-xs text-muted-foreground">
                vs. período anterior ({backAnterior} → {backAtual})
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-2xl font-bold text-red-500">{abertas.length}</div>
              <div className="text-[10px] text-muted-foreground">Aberto</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-500">{finalizadas.length}</div>
              <div className="text-[10px] text-muted-foreground">Finalizado</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-500">{priorityRows.length}</div>
              <div className="text-[10px] text-muted-foreground">Prioridades</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Motor de Priorização
          </div>
          <div className="mt-3 flex items-center gap-2">
            <img
              src={priorityEngineIcon}
              alt=""
              aria-hidden
              width={20}
              height={20}
              loading="lazy"
              className="h-5 w-5 drop-shadow-[0_0_6px_rgba(249,115,22,0.45)]"
            />
            <div className="text-sm">
              Última verificação:{" "}
              <span className="font-medium">
                {lastScanAt ? new Date(lastScanAt).toLocaleString("pt-BR") : "—"}
              </span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={onRescan} disabled={scanning}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
              Atualizar varredura
            </Button>
            <Button size="sm" variant="outline" onClick={onOpenConfig}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Configurar
            </Button>
          </div>
        </GlassCard>
      </div>

      {/* 2.2 Chamados Prioritários */}
      <GlassCard className="border-2 border-red-500/40 bg-red-500/5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Chamados Prioritários</h3>
            <Badge className="bg-red-500 text-white">{priorityOrdered.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onPrintPriorities}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir
            </Button>
            <Button size="sm" onClick={onExportPriorities}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar .xlsx
            </Button>
          </div>
        </div>
        {priorityOrdered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
            <p className="text-sm text-muted-foreground">Nenhum chamado prioritário no momento.</p>
          </div>
        ) : (
          <PriorityScroller total={priorityOrdered.length}>
            <div className="grid gap-2 md:grid-cols-2">
              {priorityOrdered.map((r) => {
                const dias = daysBetween(r.data_solicitacao);
                const nivel = r.prioridade_nivel ?? 0;
                const nivelColor =
                  nivel >= 3
                    ? "bg-red-500 text-white"
                    : nivel === 2
                      ? "bg-orange-500 text-white"
                      : "bg-amber-500 text-white";
                const alertaClass = nivel >= 2 ? "alerta-alto" : nivel === 1 ? "alerta-medio" : "";
                return (
                  <div
                    key={r.os}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPriority(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedPriority(r);
                      }
                    }}
                    className={`priority-card group animate-fade-in flex max-h-[220px] flex-col rounded-xl border border-red-500/30 bg-background/60 p-3 focus:outline-none focus:ring-2 focus:ring-red-500/60 ${
                      nivel >= 2 ? "priority-card-alto" : nivel === 1 ? "priority-card-medio" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{r.os}</span>
                          <Badge className={`${nivelColor} ${alertaClass}`}>
                            <Flame className="mr-0.5 h-3 w-3" />
                            {(r.prioridade_nivel ?? 0) >= 3
                              ? "Crítico"
                              : (r.prioridade_nivel ?? 0) === 2
                                ? "Alto"
                                : "Médio"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {dias}d
                          </Badge>
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm font-medium" title={r.nome}>
                          {r.nome}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {r.predio} · {r.andar} · {r.espaco}
                        </div>
                        <div className="mt-1 flex items-start gap-1 text-xs text-red-600">
                          <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" />
                          <span className="line-clamp-2 break-words">{r.motivo_prioridade}</span>
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          Clique para ver detalhes
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="relative z-10 h-7 flex-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFinalizar(r);
                        }}
                        title="Marcar como finalizado"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </PriorityScroller>
        )}
      </GlassCard>

      <PriorityDetailDialog
        row={selectedPriority}
        onClose={() => setSelectedPriority(null)}
        onFinalizar={(r) => {
          onFinalizar(r);
          setSelectedPriority(null);
        }}
      />

      {/* 2.3 Gráficos analíticos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Distribuição por categoria
          </h3>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={porCategoria}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {porCategoria.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Prioritários vs. Regulares
          </h3>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={propPrio}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  label
                >
                  <Cell fill="#EF4444" />
                  <Cell fill="#3B82F6" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Aging (dias em aberto)
          </h3>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#F59E0B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Evolução mensal do backorder
          </h3>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Top 10 prédios/andares com mais backorder
          </h3>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={porPredio} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" fontSize={11} width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="#06B6D4" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* 2.4 Rodapé de ações */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onRescan} disabled={scanning}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
          Atualizar varredura de prioridades
        </Button>
        <Button variant="outline" onClick={onPrintPriorities}>
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir Programação de Prioridades
        </Button>
        <Button onClick={onExportPriorities}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar Prioridades .xlsx
        </Button>
      </div>
    </div>
  );
}

// ---------- Config Dialog ----------

function PriorityConfigDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: PriorityConfig;
  onSave: (c: PriorityConfig) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<PriorityConfig>(config);
  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  function updateFamilia(k: string, v: boolean) {
    setDraft((d) => ({ ...d, familias_habilitadas: { ...d.familias_habilitadas, [k]: v } }));
  }
  function updatePredio(i: number, patch: Partial<PredioSensivel>) {
    setDraft((d) => ({
      ...d,
      predios_sensiveis: d.predios_sensiveis.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    }));
  }
  function addPredio() {
    setDraft((d) => ({
      ...d,
      predios_sensiveis: [...d.predios_sensiveis, { predio: "", motivo: "", nivel: 2 }],
    }));
  }
  function removePredio(i: number) {
    setDraft((d) => ({
      ...d,
      predios_sensiveis: d.predios_sensiveis.filter((_, idx) => idx !== i),
    }));
  }
  function updateRule(i: number, patch: Partial<KeywordRule>) {
    setDraft((d) => ({
      ...d,
      keyword_rules: d.keyword_rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  }
  function addRule() {
    setDraft((d) => ({
      ...d,
      keyword_rules: [
        ...d.keyword_rules,
        { familia: "custom", label: "Nova regra", nivel: 2, keywords: [] },
      ],
    }));
  }
  function removeRule(i: number) {
    setDraft((d) => ({ ...d, keyword_rules: d.keyword_rules.filter((_, idx) => idx !== i) }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img
              src={priorityEngineIcon}
              alt=""
              aria-hidden
              width={16}
              height={16}
              loading="lazy"
              className="h-4 w-4"
            />
            Motor de Priorização — Configuração
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-6">
            {/* Famílias */}
            <section>
              <h4 className="mb-2 text-sm font-semibold">Famílias de critério</h4>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {(
                  [
                    ["higiene", "Higiene/Saúde"],
                    ["cozinha", "Áreas sensíveis"],
                    ["seguranca", "Segurança/Risco"],
                    ["criticidade", "Criticidade original"],
                    ["tempo", "Tempo em aberto"],
                  ] as const
                ).map(([k, label]) => (
                  <label
                    key={k}
                    className="flex items-center justify-between rounded-lg border border-border/60 p-2 text-xs"
                  >
                    <span>{label}</span>
                    <Switch
                      checked={draft.familias_habilitadas[k] !== false}
                      onCheckedChange={(v) => updateFamilia(k, Boolean(v))}
                    />
                  </label>
                ))}
              </div>
            </section>

            {/* Dias */}
            <section>
              <h4 className="mb-2 text-sm font-semibold">Tempo que força priorização</h4>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-24"
                  value={draft.dias_forca_prioridade}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      dias_forca_prioridade: Math.max(1, Number(e.target.value) || 60),
                    }))
                  }
                />
                <span className="text-xs text-muted-foreground">dias em aberto</span>
              </div>
            </section>

            {/* Prédios sensíveis */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Prédios/locais sensíveis</h4>
                <Button size="sm" variant="outline" onClick={addPredio}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {draft.predios_sensiveis.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum prédio cadastrado.</p>
                )}
                {draft.predios_sensiveis.map((p, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 items-center gap-2 rounded-lg border border-border/60 p-2"
                  >
                    <Input
                      className="col-span-3"
                      placeholder="Prédio (ex.: C70)"
                      value={p.predio}
                      onChange={(e) => updatePredio(i, { predio: e.target.value })}
                    />
                    <Input
                      className="col-span-6"
                      placeholder="Motivo (ex.: Cozinha)"
                      value={p.motivo}
                      onChange={(e) => updatePredio(i, { motivo: e.target.value })}
                    />
                    <Select
                      value={String(p.nivel)}
                      onValueChange={(v) => updatePredio(i, { nivel: Number(v) })}
                    >
                      <SelectTrigger className="col-span-2 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Médio</SelectItem>
                        <SelectItem value="2">Alto</SelectItem>
                        <SelectItem value="3">Crítico</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="col-span-1"
                      onClick={() => removePredio(i)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            {/* Palavras-gatilho */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Palavras/expressões-gatilho</h4>
                <Button size="sm" variant="outline" onClick={addRule}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar regra
                </Button>
              </div>
              <div className="space-y-3">
                {draft.keyword_rules.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-3">
                    <div className="grid grid-cols-12 items-center gap-2">
                      <Input
                        className="col-span-4"
                        placeholder="Família (higiene, seguranca...)"
                        value={r.familia}
                        onChange={(e) => updateRule(i, { familia: e.target.value })}
                      />
                      <Input
                        className="col-span-5"
                        placeholder="Rótulo (Higiene/Saúde)"
                        value={r.label}
                        onChange={(e) => updateRule(i, { label: e.target.value })}
                      />
                      <Select
                        value={String(r.nivel)}
                        onValueChange={(v) => updateRule(i, { nivel: Number(v) })}
                      >
                        <SelectTrigger className="col-span-2 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Médio</SelectItem>
                          <SelectItem value="2">Alto</SelectItem>
                          <SelectItem value="3">Crítico</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="col-span-1"
                        onClick={() => removeRule(i)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                    <div className="mt-2">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Palavras (separadas por vírgula)
                      </Label>
                      <Input
                        value={r.keywords.join(", ")}
                        onChange={(e) =>
                          updateRule(i, {
                            keywords: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="entupimento, vazamento de esgoto..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              await onSave(draft);
              onOpenChange(false);
            }}
          >
            Salvar e re-executar varredura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Modal de detalhes de chamado prioritário ----------

function PriorityDetailDialog({
  row,
  onClose,
  onFinalizar,
}: {
  row: BOSRow | null;
  onClose: () => void;
  onFinalizar: (r: BOSRow) => void;
}) {
  const open = row !== null;
  const nivel = row?.prioridade_nivel ?? 0;
  const nivelLabel = nivel >= 3 ? "Crítico" : nivel === 2 ? "Alto" : nivel === 1 ? "Médio" : "—";
  const nivelBg =
    nivel >= 3
      ? "from-red-600 via-red-500 to-orange-500"
      : nivel === 2
        ? "from-orange-500 via-amber-500 to-yellow-500"
        : "from-amber-400 via-yellow-400 to-amber-300";
  const dias = row
    ? Math.max(0, Math.floor((Date.now() - new Date(row.data_solicitacao).getTime()) / 86400000))
    : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        {row && (
          <>
            <div className={`relative bg-gradient-to-br ${nivelBg} px-6 py-5 text-white`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_60%)]" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest opacity-90">
                    <Flame className="h-3.5 w-3.5" /> Prioridade {nivelLabel}
                  </div>
                  <DialogHeader className="space-y-1 text-left">
                    <DialogTitle className="text-lg font-semibold leading-tight text-white">
                      OS {row.os}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="mt-1 text-sm opacity-95">{row.equipe || "Sem equipe"}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className="bg-white/20 text-white backdrop-blur">
                    {dias} dias em aberto
                  </Badge>
                  {row.termino_sla && (
                    <Badge className="bg-white/15 text-white backdrop-blur">
                      SLA: {new Date(row.termino_sla).toLocaleDateString("pt-BR")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="max-h-[60vh] scroll-smooth">
              <div className="space-y-4 px-6 py-5">
                <section>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Descrição do chamado
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {row.nome || "—"}
                  </p>
                </section>

                {row.motivo_prioridade && (
                  <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-red-600">
                      <AlertTriangle className="h-3 w-3" /> Motivo da prioridade
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-red-700 dark:text-red-300">
                      {row.motivo_prioridade}
                    </p>
                  </section>
                )}

                <section className="grid gap-3 sm:grid-cols-2">
                  <InfoField label="Prédio" value={row.predio} />
                  <InfoField label="Andar" value={row.andar} />
                  <InfoField label="Espaço" value={row.espaco} />
                  <InfoField label="Ativo" value={row.ativo} />
                  <InfoField label="Atividade" value={row.atividade} />
                  <InfoField
                    label="Solicitado em"
                    value={new Date(row.data_solicitacao).toLocaleDateString("pt-BR")}
                  />
                </section>

                {row.outros && (
                  <section>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Outras informações
                    </div>
                    <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm">
                      {row.outros}
                    </p>
                  </section>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="gap-2 border-t bg-muted/30 px-6 py-3">
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
              <Button onClick={() => onFinalizar(row)}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Marcar como finalizado
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 break-words text-sm">{value || "—"}</div>
    </div>
  );
}

// ---------- Scroller custom para o painel de chamados prioritários ----------

function PriorityScroller({ total, children }: { total: number; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0); // 0..1
  const [visibleIndex, setVisibleIndex] = useState(1);
  const [showTop, setShowTop] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max <= 0 ? 0 : Math.min(1, Math.max(0, el.scrollTop / max));
    setProgress(p);
    setShowTop(el.scrollTop > 160);
    const approx = Math.min(
      total,
      Math.max(
        1,
        Math.ceil(
          ((el.scrollTop + el.clientHeight * 0.5) / (el.clientHeight || 1)) *
            (total / Math.max(1, el.scrollHeight / (el.clientHeight || 1))),
        ),
      ),
    );
    setVisibleIndex(Number.isFinite(approx) ? approx : 1);
  }, [total]);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [update]);

  const thumbHeight = `${Math.max(12, progress * 100)}%`;
  // Barra fina: usamos transform para posicionar
  const trackHeight = 100;
  const barSize = 18; // % altura do polegar
  const barPos = progress * (trackHeight - barSize);

  return (
    <div className="priority-scroll-wrap">
      {/* Barra fina de progresso à direita */}
      <div className="priority-scroll-progress" aria-hidden>
        <span
          style={{
            height: `${barSize}%`,
            transform: `translateY(${(barPos / barSize) * 100}%)`,
          }}
        />
      </div>

      {/* Contador flutuante no topo */}
      <div className="pointer-events-none absolute right-4 top-1 z-10 rounded-full border border-red-500/30 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-red-600 backdrop-blur">
        {Math.min(total, visibleIndex)} / {total}
      </div>

      <div
        ref={scrollRef}
        className="priority-scroll max-h-[75vh] md:max-h-[620px]"
        tabIndex={0}
        style={{ height: undefined }}
      >
        {/* Elemento invisível apenas para satisfazer o linter sobre thumbHeight */}
        <span className="sr-only" data-thumb={thumbHeight} />
        {children}
      </div>

      <button
        type="button"
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
        className="priority-scroll-top"
        data-visible={showTop ? "true" : "false"}
        aria-label="Voltar ao topo da lista"
      >
        <ArrowUp className="h-3.5 w-3.5" /> Topo
      </button>
    </div>
  );
}

// ---------- Painel de Backorder (cards clicáveis, mesmo estilo dos prioritários) ----------

const BackorderPanel = memo(function BackorderPanel({
  rows,
  onSelect,
  onFinalizar,
}: {
  rows: BOSRow[];
  onSelect: (r: BOSRow) => void;
  onFinalizar: (r: BOSRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    // Debounce da busca: evita refiltrar milhares de OS a cada tecla.
    const t = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(t);
  }, [query]);
  const ordered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const list = q
      ? rows.filter(
          (r) =>
            r.os.toLowerCase().includes(q) ||
            r.nome.toLowerCase().includes(q) ||
            (r.predio ?? "").toLowerCase().includes(q) ||
            (r.outros ?? "").toLowerCase().includes(q),
        )
      : rows;
    return [...list].sort(
      (a, b) => new Date(a.data_solicitacao).getTime() - new Date(b.data_solicitacao).getTime(),
    );
  }, [rows, debounced]);
  const {
    visible: visibleCards,
    hasMore: hasMoreCards,
    sentinelRef: cardsSentinel,
  } = useIncrementalList(ordered, 60);

  return (
    <GlassCard className="border-2 border-orange-500/40 bg-orange-500/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-orange-500" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            # Sistema de Backorders e Gestão de Ordens de Serviço (OS)
          </h3>
          <Badge className="bg-orange-500 text-white">{ordered.length}</Badge>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar OS, prédio, solicitante…"
            className="pl-8"
          />
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
          <p className="text-sm text-muted-foreground">Nenhum backorder no momento.</p>
        </div>
      ) : (
        <PriorityScroller total={ordered.length}>
          <div className="grid gap-2 md:grid-cols-2">
            {visibleCards.map((r) => {
              const dias = daysBetween(r.data_solicitacao);
              const nivelClass =
                dias > 90
                  ? "border-red-500/40 bg-red-500/5"
                  : dias > 60
                    ? "border-orange-500/40 bg-orange-500/5"
                    : "border-amber-500/40 bg-amber-500/5";
              const diasBadge =
                dias > 90
                  ? "bg-red-500 text-white"
                  : dias > 60
                    ? "bg-orange-500 text-white"
                    : "bg-amber-500 text-white";
              return (
                <div
                  key={r.os}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(r);
                    }
                  }}
                  className={`priority-card group animate-fade-in flex max-h-[220px] flex-col rounded-xl border p-3 focus:outline-none focus:ring-2 focus:ring-orange-500/60 ${nivelClass}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{r.os}</span>
                        <Badge className={diasBadge}>
                          <Flame className="mr-0.5 h-3 w-3" />
                          {dias}d
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          style={{
                            borderColor: `${CATEGORIA_COLOR[r.atividade as Categoria] ?? "#64748B"}55`,
                            color: CATEGORIA_COLOR[r.atividade as Categoria] ?? "#64748B",
                          }}
                        >
                          {r.atividade}
                        </Badge>
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm font-medium" title={r.nome}>
                        {r.nome || "—"}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {r.predio || "—"} · {r.andar || "—"} · {r.espaco || "—"}
                      </div>
                      <div className="mt-1 flex flex-col gap-1">
                        {r.outros && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span className="line-clamp-1">{r.outros}</span>
                          </div>
                        )}
                        {r.centro_custo && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground opacity-80">
                            <Database className="h-3 w-3" />
                            <span className="line-clamp-1">{r.centro_custo}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Clique para editar
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="relative z-10 h-7 flex-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFinalizar(r);
                      }}
                      title="Marcar como finalizado"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMoreCards && <div ref={cardsSentinel} className="h-8" aria-hidden />}
        </PriorityScroller>
      )}
    </GlassCard>
  );
});

// ---------- Modal de edição/detalhes de Backorder ----------

function BackorderDetailDialog({
  row,
  onClose,
  onSave,
  onFinalizar,
}: {
  row: BOSRow | null;
  onClose: () => void;
  onSave: (r: BOSRow, patch: Partial<BOSRow>) => Promise<boolean>;
  onFinalizar: (r: BOSRow) => void | Promise<void>;
}) {
  const open = row !== null;
  const [draft, setDraft] = useState<Partial<BOSRow>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) setDraft({});
  }, [row?.os]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl" />
      </Dialog>
    );
  }

  const merged: BOSRow = { ...row, ...draft } as BOSRow;
  const dias = Math.max(
    0,
    Math.floor((Date.now() - new Date(row.data_solicitacao).getTime()) / 86400000),
  );
  const dirty = Object.keys(draft).length > 0;

  const bg =
    dias > 90
      ? "from-red-600 via-red-500 to-orange-500"
      : dias > 60
        ? "from-orange-500 via-amber-500 to-yellow-500"
        : "from-amber-400 via-yellow-400 to-amber-300";

  function patch<K extends keyof BOSRow>(k: K, v: BOSRow[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    const ok = await onSave(row!, draft);
    setSaving(false);
    if (ok) setDraft({});
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <div className={`relative bg-gradient-to-br ${bg} px-6 py-5 text-white`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_60%)]" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest opacity-90">
                <ClipboardList className="h-3.5 w-3.5" /> Ordem de Serviço · {row.atividade}
              </div>
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-lg font-semibold leading-tight text-white">
                  OS {row.os}
                </DialogTitle>
              </DialogHeader>
              <div className="mt-1 text-sm opacity-95">{row.equipe || "Sem equipe"}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className="bg-white/20 text-white backdrop-blur">{dias} dias em aberto</Badge>
              {row.termino_sla && (
                <Badge className="bg-white/15 text-white backdrop-blur">
                  SLA: {new Date(row.termino_sla).toLocaleDateString("pt-BR")}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <ScrollArea className="max-h-[62vh]">
          <div className="space-y-4 px-6 py-5">
            <FieldBlock label="Descrição do chamado">
              <Input
                value={merged.nome ?? ""}
                onChange={(e) => patch("nome", e.target.value)}
                placeholder="Descrição da OS"
              />
            </FieldBlock>

            <div className="grid gap-3 sm:grid-cols-2">
              <FieldBlock label="Ativo (aplica fórmula ao mudar)">
                <Input
                  value={merged.ativo ?? ""}
                  onChange={(e) => patch("ativo", e.target.value.toUpperCase())}
                  placeholder="Ex.: C70A0203"
                />
              </FieldBlock>
              <FieldBlock label="Atividade">
                <Select
                  value={merged.atividade as string}
                  onValueChange={(v) => patch("atividade", v as Categoria)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: CATEGORIA_COLOR[c] }}
                          />
                          {c}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock label="Prédio">
                <Input
                  value={merged.predio ?? ""}
                  onChange={(e) => patch("predio", e.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="Andar">
                <Input
                  value={merged.andar ?? ""}
                  onChange={(e) => patch("andar", e.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="Espaço" className="sm:col-span-2">
                <Input
                  value={merged.espaco ?? ""}
                  onChange={(e) => patch("espaco", e.target.value)}
                />
              </FieldBlock>
              <FieldBlock label="Data de Abertura" className="sm:col-span-2">
                <Input
                  type="date"
                  value={merged.data_solicitacao ? new Date(merged.data_solicitacao).toISOString().split('T')[0] : ""}
                  onChange={(e) => patch("data_solicitacao", new Date(e.target.value).toISOString())}
                />
              </FieldBlock>
              <FieldBlock label="Nome do Solicitante" className="sm:col-span-1">
                <Input
                  value={merged.outros ?? ""}
                  onChange={(e) => patch("outros", e.target.value)}
                  placeholder="Nome de quem abriu o chamado"
                />
              </FieldBlock>
              <FieldBlock label="Centro de Custo" className="sm:col-span-1">
                <Input
                  value={merged.centro_custo ?? ""}
                  onChange={(e) => patch("centro_custo", e.target.value)}
                  placeholder="Centro de Custo"
                />
              </FieldBlock>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              Solicitado em{" "}
              <span className="font-medium text-foreground">
                {new Date(row.data_solicitacao).toLocaleDateString("pt-BR")}
              </span>
              . As edições aqui atualizam a base e são refletidas ao exportar a planilha corrigida.
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 border-t bg-muted/30 px-6 py-3">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="outline" onClick={() => onFinalizar(row)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Finalizar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldBlock({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

const EQUIPES_OPCOES: Categoria[] = [
  "Civil",
  "Chaveiro",
  "Refrigeração",
  "Elétrica",
  "Hidráulica",
  "Pintura",
  "Outros",
];

function RevisaoPanel({
  rows,
  rules,
  onSelectRow,
  onSaveRule,
  onDeleteRule,
  onReprocessar,
  importing,
  learnedLoc,
  learnedTeam,
  allRows,
  onDeleteLearnedLoc,
  onDeleteLearnedTeam,
  onToggleLearnedLoc,
  onToggleLearnedTeam,
}: {
  rows: BOSRow[];
  rules: RuleRow[];
  onSelectRow: (r: BOSRow) => void;
  onSaveRule: (
    r: Partial<RuleRow> & {
      equipe: string;
      palavra_chave: string;
      fonte: "descricao" | "categoria";
    },
  ) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onReprocessar: () => Promise<void>;
  importing: boolean;
  learnedLoc: LearnedLocation[];
  learnedTeam: LearnedTeam[];
  allRows: BOSRow[];
  onDeleteLearnedLoc: (id: string) => Promise<void>;
  onDeleteLearnedTeam: (id: string) => Promise<void>;
  onToggleLearnedLoc: (id: string, ativo: boolean) => Promise<void>;
  onToggleLearnedTeam: (id: string, ativo: boolean) => Promise<void>;
}) {
  // Contagem de chamados por ativo aprendido (para "quantos essa regra resolveu")
  const countByAtivo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows) {
      const k = r.ativo?.trim().toUpperCase();
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [allRows]);
  const [novo, setNovo] = useState<{
    equipe: Categoria;
    palavra_chave: string;
    fonte: "descricao" | "categoria";
    prioridade: number;
  }>({
    equipe: "Civil",
    palavra_chave: "",
    fonte: "descricao",
    prioridade: 100,
  });

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Chamados em revisão manual</h3>
            <p className="text-sm text-muted-foreground">
              OS sem ativo reconhecido na árvore ou com classificação em fallback (Outros).
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onReprocessar} disabled={importing}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reprocessar
          </Button>
        </div>
        {rows.length === 0 ? (
          <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum chamado pendente de revisão.
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Equipe</TableHead>
                  <TableHead>Prédio/Andar/Espaço</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.os}>
                    <TableCell className="font-mono text-xs">{r.os}</TableCell>
                    <TableCell className="font-mono text-xs">{r.ativo}</TableCell>
                    <TableCell className="max-w-[420px] truncate text-sm" title={r.nome}>
                      {r.nome}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.atividade}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[r.predio, r.andar, r.espaco].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => onSelectRow(r)}>
                        Abrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Regras de classificação de equipe</h3>
          <p className="text-sm text-muted-foreground">
            Palavras-chave avaliadas em ordem de prioridade (menor número = maior prioridade). A
            primeira regra que casar define a equipe do chamado.
          </p>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 rounded border bg-muted/30 p-3 md:grid-cols-[1fr_1.5fr_1fr_100px_auto]">
          <Select
            value={novo.equipe}
            onValueChange={(v) => setNovo({ ...novo, equipe: v as Categoria })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EQUIPES_OPCOES.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="palavra-chave (ex: fechadura)"
            value={novo.palavra_chave}
            onChange={(e) => setNovo({ ...novo, palavra_chave: e.target.value })}
          />
          <Select
            value={novo.fonte}
            onValueChange={(v) => setNovo({ ...novo, fonte: v as "descricao" | "categoria" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="descricao">Descrição</SelectItem>
              <SelectItem value="categoria">Categoria</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={novo.prioridade}
            onChange={(e) => setNovo({ ...novo, prioridade: Number(e.target.value) || 100 })}
          />
          <Button
            size="sm"
            onClick={async () => {
              await onSaveRule({ ...novo, ativo: true });
              setNovo({ ...novo, palavra_chave: "" });
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Prio</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Palavra-chave</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead className="w-24">Ativa</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma regra cadastrada — o motor cai no set padrão hardcoded.
                  </TableCell>
                </TableRow>
              )}
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.prioridade}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.equipe}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{r.palavra_chave}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.fonte}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={r.ativo}
                      onCheckedChange={(v) => onSaveRule({ ...r, ativo: !!v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteRule(r.id)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Regras aprendidas por Ativo</h3>
          <p className="text-sm text-muted-foreground">
            Correções manuais de Prédio/Andar/Espaço e Equipe viram regras permanentes, aplicadas
            automaticamente aos próximos chamados do mesmo ativo.
          </p>
        </div>

        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Localização ({learnedLoc.length})
        </div>
        <div className="mb-6 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ativo</TableHead>
                <TableHead>Prédio · Andar · Espaço</TableHead>
                <TableHead>OS origem</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-24 text-center">Chamados</TableHead>
                <TableHead className="w-20">Ativa</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {learnedLoc.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma regra aprendida ainda — corrija um chamado em revisão para criar.
                  </TableCell>
                </TableRow>
              )}
              {learnedLoc.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.codigo_ativo}</TableCell>
                  <TableCell className="text-sm">
                    {[r.predio, r.andar, r.espaco].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.origem_chamado_os ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.criado_em).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{countByAtivo.get(r.codigo_ativo) ?? 0}</Badge>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={r.ativo}
                      onCheckedChange={(v) => onToggleLearnedLoc(r.id, !!v)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteLearnedLoc(r.id)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Equipe ({learnedTeam.length})
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ativo</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>OS origem</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-24 text-center">Chamados</TableHead>
                <TableHead className="w-20">Ativa</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {learnedTeam.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma regra aprendida ainda.
                  </TableCell>
                </TableRow>
              )}
              {learnedTeam.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.codigo_ativo ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.equipe}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.origem_chamado_os ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.criado_em).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">
                      {r.codigo_ativo ? (countByAtivo.get(r.codigo_ativo) ?? 0) : 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={r.ativo}
                      onCheckedChange={(v) => onToggleLearnedTeam(r.id, !!v)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteLearnedTeam(r.id)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
    </div>
  );
}
