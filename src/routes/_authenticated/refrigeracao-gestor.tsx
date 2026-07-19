import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/refrigeracao-gestor")({
  component: RefrigeracaoGestor,
});

type Os = {
  id: string;
  numero_os: string;
  ativo: string;
  equipamento: string;
  patrimonio: string;
  localizacao: string | null;
  status: string;
  created_at: string;
};

type Foto = {
  id: string;
  os_id: string;
  storage_path: string;
  legenda: string | null;
  created_at: string;
  enviado_por: string;
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

function RefrigeracaoGestor() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("os");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("all");

  const osQuery = useQuery({
    queryKey: ["refrig", "os"],
    queryFn: async (): Promise<Os[]> => {
      const { data, error } = await supabase
        .from("refrigeracao_os")
        .select("id, numero_os, ativo, equipamento, patrimonio, localizacao, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Os[];
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
        .select("id, os_id, descricao, quantidade, urgencia, observacao, status_gestor, created_at")
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

  const osById = useMemo(() => {
    const m = new Map<string, Os>();
    (osQuery.data ?? []).forEach((o) => m.set(o.id, o));
    return m;
  }, [osQuery.data]);

  const filteredOs = useMemo(() => {
    let list = osQuery.data ?? [];
    if (filtroStatus !== "all") list = list.filter((o) => o.status === filtroStatus);
    const q = busca.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.numero_os.toLowerCase().includes(q) ||
          o.ativo.toLowerCase().includes(q) ||
          o.equipamento.toLowerCase().includes(q) ||
          o.patrimonio.toLowerCase().includes(q) ||
          (o.localizacao ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [osQuery.data, filtroStatus, busca]);

  const filterByOs = <T extends { os_id: string }>(rows: T[] | undefined) => {
    const setIds = new Set(filteredOs.map((o) => o.id));
    return (rows ?? []).filter((r) => setIds.has(r.os_id));
  };

  return (
    <PageShell
      title="Refrigeração — Gestão"
      description="Visualize OS, fotos enviadas pelo campo, solicitações de peças e problemas sinalizados."
      actions={
        <>
          <ImportOsDialog
            onDone={() => qc.invalidateQueries({ queryKey: ["refrig", "os"] })}
          />
          <NewOsDialog
            onDone={() => qc.invalidateQueries({ queryKey: ["refrig", "os"] })}
          />
        </>
      }
    >
      <GlassCard className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 min-w-[220px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por OS, ativo, equipamento, patrimônio…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-9 w-[180px]">
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
          <FotosGrid rows={filterByOs(fotosQuery.data)} osById={osById} loading={fotosQuery.isLoading} />
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
    const header = ["numero_os", "ativo", "equipamento", "patrimonio", "localizacao", "status", "criada_em"];
    const rows = list.map((o) =>
      [o.numero_os, o.ativo, o.equipamento, o.patrimonio, o.localizacao ?? "", o.status, new Date(o.created_at).toLocaleString("pt-BR")].map(
        csvCell,
      ).join(","),
    );
    downloadCsv("refrigeracao-os.csv", [header.join(","), ...rows].join("\n"));
  };

  const changeStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("refrigeracao_os").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado.");
    onChanged();
  };

  const removeOs = async (id: string) => {
    if (!confirm("Excluir esta OS? Fotos, peças e problemas vinculados também serão removidos.")) return;
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
              <Th>Ativo</Th>
              <Th>Equipamento</Th>
              <Th>Patrimônio</Th>
              <Th>Localização</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {list.map((o) => (
              <tr key={o.id} className="hover:bg-accent/40">
                <Td className="font-mono font-semibold">{o.numero_os}</Td>
                <Td>{o.ativo}</Td>
                <Td>{o.equipamento}</Td>
                <Td>{o.patrimonio}</Td>
                <Td className="text-muted-foreground">{o.localizacao ?? "—"}</Td>
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
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma OS. Importe ou crie uma nova.
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
  const [numero, setNumero] = useState("");
  const [ativo, setAtivo] = useState("");
  const [equip, setEquip] = useState("");
  const [patrim, setPatrim] = useState("");
  const [local, setLocal] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!numero || !ativo || !equip || !patrim) return toast.warning("Preencha os campos obrigatórios.");
    setSaving(true);
    const { error } = await supabase.from("refrigeracao_os").insert({
      numero_os: numero.trim(),
      ativo: ativo.trim(),
      equipamento: equip.trim(),
      patrimonio: patrim.trim(),
      localizacao: local.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("OS criada.");
    setOpen(false);
    setNumero("");
    setAtivo("");
    setEquip("");
    setPatrim("");
    setLocal("");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> Nova OS
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova OS de Refrigeração</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FieldInput label="Número da OS *" value={numero} onChange={setNumero} />
          <FieldInput label="Ativo *" value={ativo} onChange={setAtivo} />
          <FieldInput label="Equipamento *" value={equip} onChange={setEquip} />
          <FieldInput label="Patrimônio *" value={patrim} onChange={setPatrim} />
          <FieldInput label="Localização" value={local} onChange={setLocal} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
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
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const importar = async () => {
    const linhas = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (linhas.length === 0) return toast.warning("Cole ao menos uma linha.");
    const rows: {
      numero_os: string;
      ativo: string;
      equipamento: string;
      patrimonio: string;
      localizacao: string | null;
    }[] = [];
    for (const l of linhas) {
      const cols = l.split(/\t|;|,/).map((c) => c.trim());
      if (cols.length < 4) continue;
      rows.push({
        numero_os: cols[0],
        ativo: cols[1],
        equipamento: cols[2],
        patrimonio: cols[3],
        localizacao: cols[4] || null,
      });
    }
    if (rows.length === 0) return toast.warning("Formato inválido. Use: OS<TAB>Ativo<TAB>Equipamento<TAB>Patrimônio[<TAB>Localização]");
    setSaving(true);
    const { error, count } = await supabase
      .from("refrigeracao_os")
      .upsert(rows, { onConflict: "numero_os", count: "exact" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${count ?? rows.length} OS importadas/atualizadas.`);
    setOpen(false);
    setText("");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Importar OS
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar OS</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Cole colunas separadas por TAB, ponto-e-vírgula ou vírgula. Ordem:
            <b> Nº OS · Ativo · Equipamento · Patrimônio · Localização (opcional)</b>. OS já
            existentes serão atualizadas.
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder={"12345\tAC-01\tSplit 24k\tPAT-001\tSala Servidores\n12346\tAC-02\tSplit 12k\tPAT-002\tRefeitório"}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={importar} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Importar
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
        .createSignedUrls(missing.map((m) => m.storage_path), 60 * 60);
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
                {os?.equipamento ?? "—"} · {os?.patrimonio ?? "—"}
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
    const { error } = await supabase.from("refrigeracao_pecas").update({ status_gestor: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };
  const exportCsv = () => {
    const header = ["numero_os", "descricao", "quantidade", "urgencia", "observacao", "status", "criada_em"];
    const csv = [
      header.join(","),
      ...rows.map((r) => {
        const os = osById.get(r.os_id);
        return [os?.numero_os ?? "", r.descricao, r.quantidade, r.urgencia, r.observacao ?? "", r.status_gestor, new Date(r.created_at).toLocaleString("pt-BR")]
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
                <Td className="font-mono font-semibold">{osById.get(p.os_id)?.numero_os ?? "?"}</Td>
                <Td>{p.descricao}</Td>
                <Td>{p.quantidade}</Td>
                <Td>
                  <Badge variant={urgencyVariant(p.urgencia)}>{p.urgencia}</Badge>
                </Td>
                <Td className="text-muted-foreground">{p.observacao ?? "—"}</Td>
                <Td>
                  <Select value={p.status_gestor} onValueChange={(v) => changeStatus(p.id, v)}>
                    <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="novo">Novo</SelectItem>
                      <SelectItem value="em_analise">Em análise</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="resolvido">Resolvido</SelectItem>
                      <SelectItem value="rejeitado">Rejeitado</SelectItem>
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
    const { error } = await supabase.from("refrigeracao_problemas").update({ status_gestor: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };
  const exportCsv = () => {
    const header = ["numero_os", "descricao", "gravidade", "status", "criada_em"];
    const csv = [
      header.join(","),
      ...rows.map((r) => {
        const os = osById.get(r.os_id);
        return [os?.numero_os ?? "", r.descricao, r.gravidade, r.status_gestor, new Date(r.created_at).toLocaleString("pt-BR")]
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
                <Td className="font-mono font-semibold">{osById.get(p.os_id)?.numero_os ?? "?"}</Td>
                <Td>{p.descricao}</Td>
                <Td>
                  <Badge variant={gravityVariant(p.gravidade)}>{gravityLabel(p.gravidade)}</Badge>
                </Td>
                <Td>
                  <Select value={p.status_gestor} onValueChange={(v) => changeStatus(p.id, v)}>
                    <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="novo">Novo</SelectItem>
                      <SelectItem value="em_analise">Em análise</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="resolvido">Resolvido</SelectItem>
                      <SelectItem value="rejeitado">Rejeitado</SelectItem>
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
function Td({ children, className = "" }: { children: any; className?: string }) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}
function FieldInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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
  if (u === "urgente") return "destructive";
  if (u === "alta") return "default";
  return "secondary";
}
function gravityVariant(g: string): any {
  if (g === "parado") return "destructive";
  if (g === "parcial") return "default";
  return "secondary";
}
function gravityLabel(g: string) {
  if (g === "parado") return "Totalmente parado";
  if (g === "parcial") return "Parcialmente parado";
  return "Funcionando com falha";
}
