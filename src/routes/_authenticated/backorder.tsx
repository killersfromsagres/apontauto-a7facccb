import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Upload,
  Download,
  RefreshCw,
  ExternalLink,
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
} from "lucide-react";
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
import { readAssetsFile, readBackorderFile, type BackorderRow } from "@/lib/backorder/reader";
import { makeAssetsMap, resolveAtivo, type AssetsMap } from "@/lib/backorder/assets";
import {
  CATEGORIAS,
  CATEGORIA_COLOR,
  CATEGORIA_TO_EQUIPE,
  setDynamicRules,
  type Categoria,
  type DynamicRule,
} from "@/lib/backorder/classify";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  atividade: string;
  atividade_manual: boolean;
  equipe: string;
  termino_sla: string | null;
  data_solicitacao: string;
  outros: string;
  criticidade?: string;
  finalizado: boolean;
  data_finalizacao: string | null;
  is_prioridade?: boolean;
  motivo_prioridade?: string | null;
  prioridade_nivel?: number;
  revisao_manual?: boolean;
}

const POWERBI_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiNDhjOGJiZjMtYWM0YS00MGUyLTkyYzItMDgyMzM5OTMxNThmIiwidCI6IjQyODUyNWQ5LTIzYmQtNGY4Yy1hZmEyLTU2MDBmNDAxZjMyNiJ9";

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
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("__all__");
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [config, setConfig] = useState<PriorityConfig>(DEFAULT_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);
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
    const { data, error } = await supabase
      .from("backorder_os")
      .select("*")
      .order("data_solicitacao", { ascending: true });
    if (error) toast.error("Falha ao carregar backorder");
    setRows((data as BOSRow[]) ?? []);
    setLoading(false);
  }, []);

  const [assetsMap, setAssetsMap] = useState<AssetsMap>(() => makeAssetsMap([]));
  const loadAssets = useCallback(async () => {
    const { data } = await supabase
      .from("assets_ref")
      .select("ativo, denominacao, nivel, codigo_pai");
    setAssetsMap(makeAssetsMap((data as Array<{ ativo: string; denominacao: string; nivel?: string; codigo_pai?: string | null }>) ?? []));
  }, []);

  const [rulesDB, setRulesDB] = useState<RuleRow[]>([]);

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
    void refresh();
  }, [loadConfig, loadAssets, loadClassifierRules, refresh]);

  const abertas = useMemo(() => rows.filter((r) => !r.finalizado), [rows]);
  const finalizadas = useMemo(() => rows.filter((r) => r.finalizado), [rows]);
  const revisaoRows = useMemo(() => abertas.filter((r) => r.revisao_manual), [abertas]);

  async function saveRule(rule: Partial<RuleRow> & { equipe: string; palavra_chave: string; fonte: "descricao" | "categoria" }) {
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
    try {
      // 1) carrega assets_ref inteiro em memória (com hierarquia)
      const { data: assetsRaw, error: assetsErr } = await supabase
        .from("assets_ref")
        .select("ativo, denominacao, nivel, codigo_pai");
      if (assetsErr) throw assetsErr;
      const assetsMap = makeAssetsMap(
        (assetsRaw as Array<{ ativo: string; denominacao: string; nivel?: string; codigo_pai?: string | null }>) ?? [],
      );

      const parsed = await readBackorderFile(file, assetsMap);
      if (parsed.length === 0) {
        toast.warning("Nenhuma OS reconhecida na planilha.");
        return;
      }

      // Overrides manuais persistidos (Atividade corrigida à mão)
      const { data: overrides } = await supabase
        .from("backorder_atividade_override")
        .select("os, atividade");
      const overrideMap = new Map<string, string>();
      (overrides ?? []).forEach((o: any) => overrideMap.set(o.os, o.atividade));

      // Preserva "finalizado" local (nunca reabrir automaticamente por reimport)
      const { data: existing } = await supabase
        .from("backorder_os")
        .select("os, finalizado, atividade_manual, atividade, equipe, data_finalizacao, nome, ativo, predio, andar, espaco, data_solicitacao, termino_sla, outros, criticidade");
      const existMap = new Map<string, any>();
      (existing ?? []).forEach((e: any) => existMap.set(e.os, e));

      let novas = 0;
      let atualizadas = 0;
      let ignoradas = 0;

      const toUpsert: BackorderRow[] = [];
      for (const r of parsed) {
        const prev = existMap.get(r.os);
        // Se já está finalizado localmente, ignora reimport (mas garante upsert com finalizado=true)
        if (prev?.finalizado) {
          ignoradas++;
          continue;
        }
        const override = overrideMap.get(r.os);
        const atividade = (override as Categoria | undefined) ?? (prev?.atividade_manual ? prev.atividade : r.atividade);
        const equipe = override
          ? CATEGORIA_TO_EQUIPE[override as Categoria]
          : prev?.atividade_manual
            ? prev.equipe
            : r.equipe;
        const next = { ...r, atividade: atividade as Categoria, equipe };
        if (prev) {
          const sameISO = (a?: string | null, b?: string | null) =>
            (a ? new Date(a).toISOString() : "") === (b ? new Date(b).toISOString() : "");
          const identical =
            prev.nome === next.nome &&
            prev.ativo === next.ativo &&
            prev.predio === next.predio &&
            prev.andar === next.andar &&
            prev.espaco === next.espaco &&
            prev.atividade === next.atividade &&
            prev.equipe === next.equipe &&
            prev.outros === next.outros &&
            (prev.criticidade ?? "") === (next.criticidade ?? "") &&
            sameISO(prev.data_solicitacao, next.data_solicitacao) &&
            sameISO(prev.termino_sla, next.termino_sla);
          if (identical) {
            ignoradas++;
            continue;
          }
          atualizadas++;
        } else {
          novas++;
        }
        toUpsert.push(next);
      }

      // Upsert em lotes de 500
      for (let i = 0; i < toUpsert.length; i += 500) {
        const chunk = toUpsert.slice(i, i + 500).map((r) => ({
          os: r.os,
          nome: r.nome,
          ativo: r.ativo,
          predio: r.predio,
          andar: r.andar,
          espaco: r.espaco,
          atividade: r.atividade,
          atividade_manual: !!overrideMap.get(r.os),
          equipe: r.equipe,
          termino_sla: r.termino_sla,
          data_solicitacao: r.data_solicitacao,
          outros: r.outros,
          criticidade: r.criticidade ?? "",
          revisao_manual: r.revisao_manual,
        }));
        const { error } = await supabase.from("backorder_os").upsert(chunk, { onConflict: "os" });
        if (error) throw error;
      }

      toast.success(
        `Importado: ${novas} nova(s), ${atualizadas} atualizada(s), ${ignoradas} ignorada(s).`,
      );
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao importar planilha");
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
      const { data: existingAssets } = await supabase.from("assets_ref").select("ativo, denominacao");
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

      const { data: allRows } = await supabase.from("backorder_os").select("os, ativo, predio, andar, espaco");
      let recalculados = 0;
      const patches: Array<{ os: string; predio: string; andar: string; espaco: string }> = [];
      for (const r of (allRows ?? []) as Array<{ os: string; ativo: string; predio: string; andar: string; espaco: string }>) {
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

  // Reprocessa Prédio/Andar/Espaço de todos os chamados usando a base atual.
  async function handleReprocessarChamados() {
    setImporting(true);
    const t = toast.loading("Reprocessando chamados com a base inteligente…");
    try {
      const { data: assetsRaw } = await supabase
        .from("assets_ref")
        .select("ativo, denominacao, nivel, codigo_pai");
      const map = makeAssetsMap(
        (assetsRaw ?? []) as Array<{ ativo: string; denominacao: string; nivel?: string; codigo_pai?: string | null }>,
      );
      setAssetsMap(map);
      const { data: allRows } = await supabase
        .from("backorder_os")
        .select("os, ativo, predio, andar, espaco, revisao_manual");
      const patches: Array<{ os: string; predio: string; andar: string; espaco: string; revisao_manual: boolean }> = [];
      for (const r of (allRows ?? []) as Array<{ os: string; ativo: string; predio: string; andar: string; espaco: string; revisao_manual: boolean }>) {
        if (!r.ativo) continue;
        const res = resolveAtivo(map, r.ativo);
        const found = !!(res.predio || res.andar || res.espaco);
        const revisao = !found;
        if (
          res.predio !== r.predio ||
          res.andar !== r.andar ||
          res.espaco !== r.espaco ||
          revisao !== r.revisao_manual
        ) {
          patches.push({ os: r.os, ...res, revisao_manual: revisao });
        }
      }
      for (let i = 0; i < patches.length; i += 50) {
        const slice = patches.slice(i, i + 50);
        await Promise.all(
          slice.map((p) =>
            supabase
              .from("backorder_os")
              .update({ predio: p.predio, andar: p.andar, espaco: p.espaco, revisao_manual: p.revisao_manual })
              .eq("os", p.os),
          ),
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
        toast.warning("Nenhuma regra encontrada no arquivo (esperado: chave \"keywords\").", { id: t });
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
      toast.success(`${rows.length} regra(s) importada(s). Rode "Reprocessar Chamados" para aplicar.`, { id: t });
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
        if (!r.ativo) { semAtivo++; continue; }
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
      })
      .eq("os", r.os);
    if (error) return toast.error("Falha ao atualizar");
    setRows((prev) =>
      prev.map((x) =>
        x.os === r.os
          ? { ...x, finalizado: next, data_finalizacao: next ? new Date().toISOString() : null }
          : x,
      ),
    );
  }

  async function updateAtividade(r: BOSRow, atividade: Categoria) {
    const equipe = CATEGORIA_TO_EQUIPE[atividade];
    const { error } = await supabase
      .from("backorder_os")
      .update({ atividade, atividade_manual: true, equipe })
      .eq("os", r.os);
    if (error) return toast.error("Falha ao atualizar categoria");
    await supabase
      .from("backorder_atividade_override")
      .upsert({ os: r.os, atividade }, { onConflict: "os" });
    setRows((prev) =>
      prev.map((x) => (x.os === r.os ? { ...x, atividade, atividade_manual: true, equipe } : x)),
    );
  }

  async function updateRow(r: BOSRow, patch: Partial<BOSRow>) {
    // Se o "ativo" mudar e nenhum override manual for enviado para
    // predio/andar/espaço, aplicamos a fórmula (assets_ref).
    const next: Partial<BOSRow> = { ...patch };
    if (
      patch.ativo !== undefined &&
      patch.ativo !== r.ativo &&
      patch.predio === undefined &&
      patch.andar === undefined &&
      patch.espaco === undefined
    ) {
      const resolved = resolveAtivo(assetsMap, patch.ativo);
      next.predio = resolved.predio;
      next.andar = resolved.andar;
      next.espaco = resolved.espaco;
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
    setRows((prev) => prev.map((x) => (x.os === r.os ? { ...x, ...next } : x)));
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
      atividade: r.atividade as Categoria,
      equipe: r.equipe,
      termino_sla: r.termino_sla,
      data_solicitacao: r.data_solicitacao,
      outros: r.outros,
      criticidade: r.criticidade ?? "",
      finalizado: false,
      status_origem: "",
      revisao_manual: false,
    }));
    const { data: assetsRaw } = await supabase.from("assets_ref").select("ativo, denominacao");
    const blob = await generateBackorderExport({
      titulo: "DEMARCHI",
      rows: rowsExp,
      assets: (assetsRaw as Array<{ ativo: string; denominacao: string }>) ?? [],
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
    () => (selectedBackorder ? rows.find((r) => r.os === selectedBackorder.os) ?? null : null),
    [selectedBackorder, rows],
  );

  return (
    <PageShell
      title="Backorder de Corretivas"
      description="OS corretivas em aberto há mais de 30 dias. Importe a planilha para sincronizar a base e acompanhe o fechamento das pendências."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => assetsInputRef.current?.click()} disabled={importing}>
            <Database className="mr-2 h-4 w-4" /> Atualizar Base de Ativos
          </Button>
          <Button variant="outline" onClick={() => instrucaoInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-2 h-4 w-4" /> Importar Instrução
          </Button>
          <Button variant="outline" onClick={() => backorderInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-2 h-4 w-4" /> Importar Backorder
          </Button>
          <Button variant="outline" onClick={handleReprocessarChamados} disabled={importing}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reprocessar Chamados
          </Button>
          <Button variant="outline" onClick={handleValidarBase} disabled={importing}>
            <ShieldAlert className="mr-2 h-4 w-4" /> Validar Base
          </Button>
          <Button variant="outline" onClick={() => setConfigOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" /> Prioridades
          </Button>


          <Button onClick={exportar} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
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
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="tabela">
            <PackageX className="mr-1.5 h-3.5 w-3.5" /> Em aberto
            <Badge variant="secondary" className="ml-2">{abertas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="backorder">
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Backorder
            <Badge className="ml-2 bg-orange-500 text-white">{backorderAbertas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="finalizados">
            Finalizados <Badge variant="secondary" className="ml-2">{finalizadas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="revisao">
            <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Revisão
            {revisaoRows.length > 0 && (
              <Badge className="ml-2 bg-amber-500 text-white">{revisaoRows.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="powerbi">Power BI</TabsTrigger>
        </TabsList>

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
          />
        </TabsContent>

        <TabsContent value="backorder">
          <BackorderPanel
            rows={backorderAbertas}
            onSelect={setSelectedBackorder}
            onFinalizar={(r) => toggleFinalizado(r, true)}
          />
        </TabsContent>

        <TabsContent value="finalizados">
          <FinalizadosView rows={finalizadas} onReabrir={(r) => toggleFinalizado(r, false)} />
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

        <TabsContent value="powerbi">
          <PowerBIView />
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
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <TableRow>
              <TableHead className="w-10">✓</TableHead>
              <TableHead>OS</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Prédio</TableHead>
              <TableHead>Andar</TableHead>
              <TableHead>Espaço</TableHead>
              <TableHead>Atividade</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Equipe</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Dias</TableHead>
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
                    className={
                      r.atividade === "Outros"
                        ? "bg-amber-400/15 hover:bg-amber-400/20"
                        : isBackorder
                          ? "bg-red-500/5"
                          : ""
                    }
                  >

                    <TableCell>
                      <Checkbox
                        checked={r.finalizado}
                        onCheckedChange={(v) => onToggle(r, Boolean(v))}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.os}</TableCell>
                    <TableCell className="max-w-[320px] truncate" title={r.nome}>
                      {r.nome}
                    </TableCell>
                    <TableCell className="text-xs">{r.predio}</TableCell>
                    <TableCell className="text-xs">{r.andar}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs" title={r.espaco}>
                      {r.espaco}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.termino_sla ? new Date(r.termino_sla).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.equipe}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs" title={r.outros}>
                      {r.outros}
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

function FinalizadosView({
  rows,
  onReabrir,
}: {
  rows: BOSRow[];
  onReabrir: (r: BOSRow) => void;
}) {
  return (
    <GlassCard>
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <Table>
          <TableHeader>
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
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma OS finalizada.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
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
      </div>
    </GlassCard>
  );
}

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
  const statusColor = dentroMeta
    ? proximoLimite
      ? "#F59E0B"
      : "#10B981"
    : "#EF4444";

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
              {dentroMeta ? (proximoLimite ? "Próximo do limite" : "Dentro da meta") : "Acima da meta"}
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
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Chamados Prioritários
            </h3>
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
            <p className="text-sm text-muted-foreground">
              Nenhum chamado prioritário no momento.
            </p>
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
                const alertaClass =
                  nivel >= 2 ? "alerta-alto" : nivel === 1 ? "alerta-medio" : "";
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
                          <span className="line-clamp-2 break-words">
                            {r.motivo_prioridade}
                          </span>
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
                <Pie data={propPrio} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
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
                  <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-lg border border-border/60 p-2">
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

function PowerBIView() {
  const [key, setKey] = useState(0);
  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Painel Power BI — Demarchi</h3>
          <p className="text-xs text-muted-foreground">
            Se o relatório mostrar múltiplas unidades, aplique manualmente o filtro para
            "Demarchi" no próprio Power BI.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setKey((k) => k + 1)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Recarregar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={POWERBI_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Tela cheia
            </a>
          </Button>
        </div>
      </div>
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/60 bg-black/40">
        <iframe
          key={key}
          title="Power BI — Demarchi"
          src={POWERBI_URL}
          className="h-full w-full"
          allowFullScreen
        />
      </div>
    </GlassCard>
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
  const dias = row ? Math.max(0, Math.floor((Date.now() - new Date(row.data_solicitacao).getTime()) / 86400000)) : 0;

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
                  <Badge className="bg-white/20 text-white backdrop-blur">{dias} dias em aberto</Badge>
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
    const approx = Math.min(total, Math.max(1, Math.ceil((el.scrollTop + el.clientHeight * 0.5) / (el.clientHeight || 1) * (total / Math.max(1, el.scrollHeight / (el.clientHeight || 1))))));
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
        onClick={() =>
          scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }
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

function BackorderPanel({
  rows,
  onSelect,
  onFinalizar,
}: {
  rows: BOSRow[];
  onSelect: (r: BOSRow) => void;
  onFinalizar: (r: BOSRow) => void;
}) {
  const [query, setQuery] = useState("");
  const ordered = useMemo(() => {
    const q = query.trim().toLowerCase();
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
  }, [rows, query]);

  return (
    <GlassCard className="border-2 border-orange-500/40 bg-orange-500/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-orange-500" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Backorder — OS em aberto há mais de 30 dias
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
            {ordered.map((r) => {
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
                      {r.outros && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span className="line-clamp-1">{r.outros}</span>
                        </div>
                      )}
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
        </PriorityScroller>
      )}
    </GlassCard>
  );
}

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
  const dias = Math.max(0, Math.floor((Date.now() - new Date(row.data_solicitacao).getTime()) / 86400000));
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
                <ClipboardList className="h-3.5 w-3.5" /> Backorder · {row.atividade}
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
              <FieldBlock label="Solicitante" className="sm:col-span-2">
                <Input
                  value={merged.outros ?? ""}
                  onChange={(e) => patch("outros", e.target.value)}
                  placeholder="Nome de quem abriu o chamado"
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



