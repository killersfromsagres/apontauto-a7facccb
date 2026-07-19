import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  Package,
  AlertTriangle,
  Download,
  Upload,
  Plus,
  Search,
  Trash2,
  Loader2,
  Snowflake,
  Filter,
  FileSpreadsheet,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { readRefrigOsFile, type RefrigOsImport } from "@/lib/refrigeracao/reader";
import { generateRefrigeracaoExport } from "@/lib/refrigeracao/export";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/refrigeracao-gestor")({
  component: RefrigeracaoGestor,
});

type Os = {
  id: string;
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  tipo: string | null;
  equipe: string | null;
  data_sla: string | null;
  data_programada: string | null;
  ativo: string;
  equipamento: string;
  patrimonio: string | null;
  status: string;
  created_at: string;
};

type Foto = {
  id: string;
  os_id: string;
  storage_path: string;
  legenda: string | null;
  created_at: string;
  enviado_por: string | null;
};

type Peca = {
  id: string;
  os_id: string;
  descricao: string;
  quantidade: number;
  urgencia: string;
  observacao: string | null;
  status_gestor: string;
  created_at: string;
};

type Problema = {
  id: string;
  os_id: string;
  descricao: string;
  gravidade: string;
  status_gestor: string;
  created_at: string;
};

const OS_COLUMNS =
  "id, numero_os, nome_os, predio, andar, local, tipo, equipe, data_sla, data_programada, ativo, equipamento, patrimonio, status, created_at";

function RefrigeracaoGestor() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("os");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("all");
  const [filtroEquipe, setFiltroEquipe] = useState<string>("all");

  const osQuery = useQuery({
    queryKey: ["refrig", "os"],
    queryFn: async (): Promise<Os[]> => {
      const { data, error } = await supabase
        .from("refrigeracao_os")
        .select(OS_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Os[];
    },
  });

  const fotosQuery = useQuery({
    queryKey: ["refrig", "fotos"],
    queryFn: async (): Promise<Foto[]> => {
      const { data, error } = await supabase
        .from("refrigeracao_fotos")
        .select("id, os_id, storage_path, legenda, created_at, enviado_por")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Foto[];
    },
  });

  const pecasQuery = useQuery({
    queryKey: ["refrig", "pecas"],
    queryFn: async (): Promise<Peca[]> => {
      const { data, error } = await supabase
        .from("refrigeracao_pecas")
        .select(
          "id, os_id, descricao, quantidade, urgencia, observacao, status_gestor, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Peca[];
    },
  });

  const problQuery = useQuery({
    queryKey: ["refrig", "problemas"],
    queryFn: async (): Promise<Problema[]> => {
      const { data, error } = await supabase
        .from("refrigeracao_problemas")
        .select("id, os_id, descricao, gravidade, status_gestor, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Problema[];
    },
  });

  const equipes = useMemo(() => {
    const s = new Set<string>();
    (osQuery.data ?? []).forEach((o) => o.equipe && s.add(o.equipe));
    return Array.from(s).sort();
  }, [osQuery.data]);

  const osById = useMemo(() => {
    const m = new Map<string, Os>();
    (osQuery.data ?? []).forEach((o) => m.set(o.id, o));
    return m;
  }, [osQuery.data]);

  const filteredOs = useMemo(() => {
    let list = osQuery.data ?? [];
    if (filtroStatus !== "all") list = list.filter((o) => o.status === filtroStatus);
    if (filtroEquipe !== "all") list = list.filter((o) => o.equipe === filtroEquipe);
    const q = busca.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.numero_os.toLowerCase().includes(q) ||
          o.ativo.toLowerCase().includes(q) ||
          o.equipamento.toLowerCase().includes(q) ||
          (o.patrimonio ?? "").toLowerCase().includes(q) ||
          (o.nome_os ?? "").toLowerCase().includes(q) ||
          (o.predio ?? "").toLowerCase().includes(q) ||
          (o.local ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [osQuery.data, filtroStatus, filtroEquipe, busca]);

  const filterByOs = <T extends { os_id: string }>(rows: T[] | undefined) => {
    const setIds = new Set(filteredOs.map((o) => o.id));
    return (rows ?? []).filter((r) => setIds.has(r.os_id));
  };

  return (
    <PageShell
      title="Refrigeração — Gestão"
      description="Importe OS por planilha, acompanhe fotos, peças e problemas sinalizados pelo campo."
      actions={
        <>
          <ExportXlsxButton
            os={filteredOs}
            pecas={filterByOs(pecasQuery.data)}
            problemas={filterByOs(problQuery.data)}
            fotos={filterByOs(fotosQuery.data)}
          />
          <ImportOsDialog
            onDone={() => qc.invalidateQueries({ queryKey: ["refrig", "os"] })}
          />
          <NewOsDialog onDone={() => qc.invalidateQueries({ queryKey: ["refrig", "os"] })} />
        </>
      }
    >

      <GlassCard className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 min-w-[220px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por OS, nome, ativo, prédio, local, patrimônio…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="aberta">Aberta</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {equipes.length > 0 && (
            <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as equipes</SelectItem>
                {equipes.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </GlassCard>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="os">
            <Snowflake className="mr-1.5 h-4 w-4" /> OS ({filteredOs.length})
          </TabsTrigger>
          <TabsTrigger value="fotos">
            <Camera className="mr-1.5 h-4 w-4" /> Fotos ({filterByOs(fotosQuery.data).length})
          </TabsTrigger>
          <TabsTrigger value="pecas">
            <Package className="mr-1.5 h-4 w-4" /> Peças ({filterByOs(pecasQuery.data).length})
          </TabsTrigger>
          <TabsTrigger value="problemas">
            <AlertTriangle className="mr-1.5 h-4 w-4" /> Problemas (
            {filterByOs(problQuery.data).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="os" className="mt-4">
          <OsTable
            list={filteredOs}
            loading={osQuery.isLoading}
            onChanged={() => qc.invalidateQueries({ queryKey: ["refrig"] })}
          />
        </TabsContent>
        <TabsContent value="fotos" className="mt-4">
          <FotosGrid
            rows={filterByOs(fotosQuery.data)}
            osById={osById}
            loading={fotosQuery.isLoading}
          />
        </TabsContent>
        <TabsContent value="pecas" className="mt-4">
          <PecasTable
            rows={filterByOs(pecasQuery.data)}
            osById={osById}
            loading={pecasQuery.isLoading}
            onChanged={() => qc.invalidateQueries({ queryKey: ["refrig", "pecas"] })}
          />
        </TabsContent>
        <TabsContent value="problemas" className="mt-4">
          <ProblemasTable
            rows={filterByOs(problQuery.data)}
            osById={osById}
            loading={problQuery.isLoading}
            onChanged={() => qc.invalidateQueries({ queryKey: ["refrig", "problemas"] })}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/* ---------------- OS table + import/new ---------------- */

function OsTable({
  list,
  loading,
  onChanged,
}: {
  list: Os[];
  loading: boolean;
  onChanged: () => void;
}) {
  const exportCsv = () => {
    const header = [
      "numero_os",
      "nome_os",
      "predio",
      "andar",
      "local",
      "tipo",
      "equipe",
      "data_sla",
      "data_programada",
      "ativo",
      "equipamento",
      "patrimonio",
      "status",
      "criada_em",
    ];
    const rows = list.map((o) =>
      [
        o.numero_os,
        o.nome_os ?? "",
        o.predio ?? "",
        o.andar ?? "",
        o.local ?? "",
        o.tipo ?? "",
        o.equipe ?? "",
        o.data_sla ?? "",
        o.data_programada ?? "",
        o.ativo,
        o.equipamento,
        o.patrimonio ?? "",
        o.status,
        new Date(o.created_at).toLocaleString("pt-BR"),
      ]
        .map(csvCell)
        .join(","),
    );
    downloadCsv("refrigeracao-os.csv", [header.join(","), ...rows].join("\n"));
  };

  const changeStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("refrigeracao_os")
      .update({ status: status as any })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado.");
    onChanged();
  };

  const removeOs = async (id: string) => {
    if (!confirm("Excluir esta OS? Fotos, peças e problemas vinculados também serão removidos."))
      return;
    const { error } = await supabase.from("refrigeracao_os").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("OS removida.");
    onChanged();
  };

  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b p-3">
        <div className="text-sm text-muted-foreground">
          {loading ? "Carregando…" : `${list.length} OS`}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={list.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>OS</Th>
              <Th>Nome</Th>
              <Th>Local</Th>
              <Th>Tipo</Th>
              <Th>Equipe</Th>
              <Th>Programada</Th>
              <Th>Ativo / Equipamento</Th>
              <Th>Patrimônio</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((o) => (
              <tr key={o.id} className="hover:bg-accent/40">
                <Td className="font-mono font-semibold">{o.numero_os}</Td>
                <Td className="max-w-[220px] truncate" title={o.nome_os ?? ""}>
                  {o.nome_os ?? "—"}
                </Td>
                <Td className="text-muted-foreground">
                  {[o.predio, o.andar, o.local].filter(Boolean).join(" · ") || "—"}
                </Td>
                <Td>{o.tipo ?? "—"}</Td>
                <Td>{o.equipe ?? "—"}</Td>
                <Td className="whitespace-nowrap text-xs">{fmtDate(o.data_programada)}</Td>
                <Td className="max-w-[200px]">
                  <div className="truncate font-medium">{o.ativo}</div>
                  <div className="truncate text-xs text-muted-foreground">{o.equipamento}</div>
                </Td>
                <Td className={o.patrimonio ? "" : "text-muted-foreground"}>
                  {o.patrimonio ?? "—"}
                </Td>
                <Td>
                  <Select value={o.status} onValueChange={(v) => changeStatus(o.id, v)}>
                    <SelectTrigger className="h-8 w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aberta">Aberta</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => removeOs(o.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </Td>
              </tr>
            ))}
            {list.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma OS. Importe uma planilha ou crie uma nova.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function NewOsDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    numero_os: "",
    nome_os: "",
    predio: "",
    andar: "",
    local: "",
    tipo: "",
    equipe: "",
    ativo: "",
    equipamento: "",
    patrimonio: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  const save = async () => {
    if (!f.numero_os || !f.ativo || !f.equipamento)
      return toast.warning("Preencha Nº OS, Ativo e Equipamento.");
    setSaving(true);
    const payload = {
      numero_os: f.numero_os.trim(),
      nome_os: f.nome_os.trim() || null,
      predio: f.predio.trim() || null,
      andar: f.andar.trim() || null,
      local: f.local.trim() || null,
      tipo: f.tipo.trim() || null,
      equipe: f.equipe.trim() || null,
      ativo: f.ativo.trim(),
      equipamento: f.equipamento.trim(),
      patrimonio: f.patrimonio.trim() || null,
    };
    const { error } = await supabase.from("refrigeracao_os").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("OS criada.");
    setOpen(false);
    setF({
      numero_os: "",
      nome_os: "",
      predio: "",
      andar: "",
      local: "",
      tipo: "",
      equipe: "",
      ativo: "",
      equipamento: "",
      patrimonio: "",
    });
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> Nova OS
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova OS de Refrigeração</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldInput label="Nº OS *" value={f.numero_os} onChange={set("numero_os")} />
          <FieldInput label="Nome da OS" value={f.nome_os} onChange={set("nome_os")} />
          <FieldInput label="Ativo *" value={f.ativo} onChange={set("ativo")} />
          <FieldInput label="Equipamento *" value={f.equipamento} onChange={set("equipamento")} />
          <FieldInput label="Prédio" value={f.predio} onChange={set("predio")} />
          <FieldInput label="Andar" value={f.andar} onChange={set("andar")} />
          <FieldInput label="Local" value={f.local} onChange={set("local")} />
          <FieldInput label="Tipo" value={f.tipo} onChange={set("tipo")} />
          <FieldInput label="Equipe" value={f.equipe} onChange={set("equipe")} />
          <FieldInput
            label="Patrimônio (opcional)"
            value={f.patrimonio}
            onChange={set("patrimonio")}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportOsDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RefrigOsImport[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | null) => {
    setFile(f);
    setPreview([]);
    if (!f) return;
    setParsing(true);
    try {
      const rows = await readRefrigOsFile(f);
      setPreview(rows);
      if (rows.length === 0) toast.warning("Nenhuma linha válida encontrada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler planilha");
    } finally {
      setParsing(false);
    }
  };

  const importar = async () => {
    if (preview.length === 0) return toast.warning("Escolha uma planilha válida.");
    setSaving(true);
    const { error, count } = await supabase
      .from("refrigeracao_os")
      .upsert(preview, { onConflict: "numero_os", count: "exact" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${count ?? preview.length} OS importadas/atualizadas.`);
    setOpen(false);
    setFile(null);
    setPreview([]);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Importar planilha
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar OS por planilha (.xlsx)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cabeçalhos esperados (a ordem não importa):{" "}
            <b>
              Ordem de Serviço · Nome OS · Prédio · Andar · Local · Tipo · Equipe · Data SLA · Data
              Programada · Início · Fim · Ativo · Equipamento
            </b>
            . OS já existentes serão atualizadas pelo número. Patrimônio é preenchido pelo
            colaborador no campo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Escolher arquivo
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
            {parsing && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {preview.length > 0 && (
            <div className="rounded-md border">
              <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium">
                Prévia — {preview.length} linhas
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <Th>OS</Th>
                      <Th>Nome</Th>
                      <Th>Local</Th>
                      <Th>Ativo</Th>
                      <Th>Equipamento</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t">
                        <Td className="font-mono">{r.numero_os}</Td>
                        <Td className="max-w-[160px] truncate">{r.nome_os ?? "—"}</Td>
                        <Td className="text-muted-foreground">
                          {[r.predio, r.andar, r.local].filter(Boolean).join(" · ") || "—"}
                        </Td>
                        <Td>{r.ativo}</Td>
                        <Td className="max-w-[180px] truncate">{r.equipamento}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className="border-t p-2 text-center text-[10px] text-muted-foreground">
                    +{preview.length - 50} linhas não exibidas na prévia.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={saving || preview.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Importar{" "}
            {preview.length > 0 && `(${preview.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Fotos ---------------- */

function FotosGrid({
  rows,
  osById,
  loading,
}: {
  rows: Foto[];
  osById: Map<string, Os>;
  loading: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = rows.filter((r) => !urls[r.id]);
      if (missing.length === 0) return;
      const { data, error } = await supabase.storage
        .from("refrigeracao-fotos")
        .createSignedUrls(
          missing.map((m) => m.storage_path),
          60 * 60,
        );
      if (error || cancelled) return;
      const next: Record<string, string> = {};
      missing.forEach((m, i) => {
        const s = data?.[i];
        if (s?.signedUrl) next[m.id] = s.signedUrl;
      });
      setUrls((u) => ({ ...u, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <GlassCard className="p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Carregando fotos…
      </GlassCard>
    );
  }
  if (rows.length === 0) {
    return (
      <GlassCard className="p-8 text-center text-sm text-muted-foreground">
        Nenhuma foto enviada ainda.
      </GlassCard>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {rows.map((f) => {
        const os = osById.get(f.os_id);
        const url = urls[f.id];
        return (
          <GlassCard key={f.id} className="overflow-hidden p-0">
            <div className="aspect-square bg-muted">
              {url ? (
                <a href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </a>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>
            <div className="space-y-1 p-2 text-xs">
              <div className="font-mono font-semibold">OS {os?.numero_os ?? "?"}</div>
              <div className="truncate text-muted-foreground">
                {os?.equipamento ?? "—"} · {os?.patrimonio ?? "sem patrim."}
              </div>
              <div className="text-[10px] text-muted-foreground/80">
                {new Date(f.created_at).toLocaleString("pt-BR")}
              </div>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

/* ---------------- Peças ---------------- */

function PecasTable({
  rows,
  osById,
  loading,
  onChanged,
}: {
  rows: Peca[];
  osById: Map<string, Os>;
  loading: boolean;
  onChanged: () => void;
}) {
  const changeStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("refrigeracao_pecas")
      .update({ status_gestor: status as any })
      .eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };
  const exportCsv = () => {
    const header = [
      "numero_os",
      "descricao",
      "quantidade",
      "urgencia",
      "observacao",
      "status",
      "criada_em",
    ];
    const csv = [
      header.join(","),
      ...rows.map((r) => {
        const os = osById.get(r.os_id);
        return [
          os?.numero_os ?? "",
          r.descricao,
          r.quantidade,
          r.urgencia,
          r.observacao ?? "",
          r.status_gestor,
          new Date(r.created_at).toLocaleString("pt-BR"),
        ]
          .map(csvCell)
          .join(",");
      }),
    ].join("\n");
    downloadCsv("refrigeracao-pecas.csv", csv);
  };

  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b p-3">
        <div className="text-sm text-muted-foreground">
          {loading ? "Carregando…" : `${rows.length} solicitações`}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>OS</Th>
              <Th>Descrição</Th>
              <Th>Qtd</Th>
              <Th>Urgência</Th>
              <Th>Observação</Th>
              <Th>Status</Th>
              <Th>Enviada em</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-accent/40">
                <Td className="font-mono font-semibold">
                  {osById.get(p.os_id)?.numero_os ?? "?"}
                </Td>
                <Td>{p.descricao}</Td>
                <Td>{p.quantidade}</Td>
                <Td>
                  <Badge variant={urgencyVariant(p.urgencia)}>{p.urgencia}</Badge>
                </Td>
                <Td className="text-muted-foreground">{p.observacao ?? "—"}</Td>
                <Td>
                  <Select value={p.status_gestor} onValueChange={(v) => changeStatus(p.id, v)}>
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_analise">Em análise</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="rejeitado">Rejeitado</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString("pt-BR")}
                </Td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma solicitação de peça.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

/* ---------------- Problemas ---------------- */

function ProblemasTable({
  rows,
  osById,
  loading,
  onChanged,
}: {
  rows: Problema[];
  osById: Map<string, Os>;
  loading: boolean;
  onChanged: () => void;
}) {
  const changeStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("refrigeracao_problemas")
      .update({ status_gestor: status as any })
      .eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };
  const exportCsv = () => {
    const header = ["numero_os", "descricao", "gravidade", "status", "criada_em"];
    const csv = [
      header.join(","),
      ...rows.map((r) => {
        const os = osById.get(r.os_id);
        return [
          os?.numero_os ?? "",
          r.descricao,
          r.gravidade,
          r.status_gestor,
          new Date(r.created_at).toLocaleString("pt-BR"),
        ]
          .map(csvCell)
          .join(",");
      }),
    ].join("\n");
    downloadCsv("refrigeracao-problemas.csv", csv);
  };

  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b p-3">
        <div className="text-sm text-muted-foreground">
          {loading ? "Carregando…" : `${rows.length} problemas`}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th>OS</Th>
              <Th>Descrição</Th>
              <Th>Gravidade</Th>
              <Th>Status</Th>
              <Th>Enviada em</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-accent/40">
                <Td className="font-mono font-semibold">
                  {osById.get(p.os_id)?.numero_os ?? "?"}
                </Td>
                <Td>{p.descricao}</Td>
                <Td>
                  <Badge variant={gravityVariant(p.gravidade)}>{gravityLabel(p.gravidade)}</Badge>
                </Td>
                <Td>
                  <Select value={p.status_gestor} onValueChange={(v) => changeStatus(p.id, v)}>
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_analise">Em análise</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="rejeitado">Rejeitado</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleString("pt-BR")}
                </Td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum problema sinalizado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

/* ---------------- helpers ---------------- */

function Th({ children, className = "" }: { children: any; className?: string }) {
  return <th className={`px-3 py-2 text-left ${className}`}>{children}</th>;
}
function Td({
  children,
  className = "",
  title,
}: {
  children: any;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`px-3 py-2 align-middle ${className}`} title={title}>
      {children}
    </td>
  );
}
function FieldInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function csvCell(v: any): string {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCsv(name: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function urgencyVariant(u: string): any {
  if (u === "alta") return "destructive";
  if (u === "media") return "default";
  return "secondary";
}
function gravityVariant(g: string): any {
  if (g === "critico") return "destructive";
  if (g === "falha") return "default";
  return "secondary";
}
function gravityLabel(g: string) {
  if (g === "critico") return "Crítico";
  if (g === "falha") return "Funcionando com falha";
  return "Observação";
}
function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}
