import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  HardHat,
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  CalendarClock,
  CheckCircle2,
  Pencil,
  Trash2,
  AlertTriangle,
  Filter,
  X,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import {
  computeStatus,
  computeVencimento,
  computeDataSugerida,
  computeDiasAVencer,
  fmtBr,
  todayIso,
  STATUS_COLOR,
  STATUS_LABEL,
  type AsoStatus,
} from "@/lib/sst/aso";
import { readSstXlsx, type SstImportRow } from "@/lib/sst/reader";
import { exportSstXlsx, exportSstPdf } from "@/lib/sst/export";

export const Route = createFileRoute("/_authenticated/seguranca-trabalho")({
  component: SegurancaTrabalhoPage,
});

// ---------- Tipos ----------
type Colaborador = {
  id: string;
  empresa: string | null;
  filial: string | null;
  descricao_filial: string | null;
  cliente: string | null;
  matricula: string | null;
  cpf: string | null;
  nome: string;
  funcao: string | null;
  cod_funcao: string | null;
  descricao_funcao: string | null;
  situacao: string | null;
  supervisor: string | null;
  gerente: string | null;
  gerente_regional: string | null;
  diretor: string | null;
  diretor_executivo: string | null;
  regional: string | null;
  negocio: string | null;
  tipo_contrato: string | null;
  escala: string | null;
  horario_trabalho: string | null;
  sexo: string | null;
  rg: string | null;
  data_nascimento: string | null;
  municipio: string | null;
  estado: string | null;
  pis: string | null;
  ctps: string | null;
  serie_ctps: string | null;
  cc: string | null;
  cr: string | null;
  data_admissao: string | null;
  data_demissao: string | null;
  data_exame_realizado: string | null;
  tipo_exame: string | null;
  data_vencimento: string | null;
  data_sugerida_agendamento: string | null;
  agendamento_confirmado: boolean;
  exame_realizado: boolean;
  observacao: string | null;
  ativo: boolean;
  dados_extras: Record<string, string> | null;
};

type SortKey = "nome" | "data_vencimento" | "dias" | "status" | "filial" | "funcao";

// ---------- Utilitário ----------
function uniqueSorted(items: (string | null | undefined)[]): string[] {
  return Array.from(new Set(items.filter((s): s is string => !!s && s.trim() !== ""))).sort();
}

function StatusBadge({ status }: { status: AsoStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", c.bg, c.fg)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---------- Componente principal ----------
function SegurancaTrabalhoPage() {
  const [rows, setRows] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"painel" | "controle" | "pendencias">("painel");

  // Filtros
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState<"todos" | AsoStatus>("todos");
  const [fFilial, setFFilial] = useState<string>("todos");
  const [fCliente, setFCliente] = useState<string>("todos");
  const [fFuncao, setFFuncao] = useState<string>("todos");
  const [fSupervisor, setFSupervisor] = useState<string>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("dias");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Diálogos
  const [importOpen, setImportOpen] = useState(false);
  const [importCadastroOpen, setImportCadastroOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editing, setEditing] = useState<Colaborador | null>(null);
  const [creating, setCreating] = useState(false);
  const [agendar, setAgendar] = useState<Colaborador | null>(null);
  const [realizar, setRealizar] = useState<Colaborador | null>(null);
  const [excluir, setExcluir] = useState<Colaborador | null>(null);
  const [historico, setHistorico] = useState<Colaborador | null>(null);

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from("sst_colaboradores")
      .select("*")
      .eq("ativo", true)
      .order("nome");
    if (error) toast.error("Erro ao carregar colaboradores: " + error.message);
    setRows((data as Colaborador[]) ?? []);
    setLoading(false);
  }

  // ---------- Derivados ----------
  const enriched = useMemo(
    () =>
      rows.map((r) => ({
        row: r,
        status: computeStatus(r.data_vencimento),
        dias: computeDiasAVencer(r.data_vencimento),
      })),
    [rows],
  );

  const filiais = useMemo(() => uniqueSorted(rows.map((r) => r.filial)), [rows]);
  const clientes = useMemo(() => uniqueSorted(rows.map((r) => r.cliente)), [rows]);
  const funcoes = useMemo(() => uniqueSorted(rows.map((r) => r.funcao)), [rows]);
  const supervisores = useMemo(() => uniqueSorted(rows.map((r) => r.supervisor)), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = enriched.filter(({ row: r, status }) => {
      if (fStatus !== "todos" && status !== fStatus) return false;
      if (fFilial !== "todos" && r.filial !== fFilial) return false;
      if (fCliente !== "todos" && r.cliente !== fCliente) return false;
      if (fFuncao !== "todos" && r.funcao !== fFuncao) return false;
      if (fSupervisor !== "todos" && r.supervisor !== fSupervisor) return false;
      if (q) {
        const hay = [r.nome, r.cpf, r.matricula, r.funcao, r.supervisor].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "nome":
          return a.row.nome.localeCompare(b.row.nome) * dir;
        case "filial":
          return (a.row.filial ?? "").localeCompare(b.row.filial ?? "") * dir;
        case "funcao":
          return (a.row.funcao ?? "").localeCompare(b.row.funcao ?? "") * dir;
        case "data_vencimento":
          return ((a.row.data_vencimento ?? "9999") > (b.row.data_vencimento ?? "9999") ? 1 : -1) * dir;
        case "status":
          return STATUS_LABEL[a.status].localeCompare(STATUS_LABEL[b.status]) * dir;
        case "dias":
        default: {
          const A = a.dias ?? Number.MAX_SAFE_INTEGER;
          const B = b.dias ?? Number.MAX_SAFE_INTEGER;
          return (A - B) * dir;
        }
      }
    });
    return list;
  }, [enriched, search, fStatus, fFilial, fCliente, fFuncao, fSupervisor, sortKey, sortDir]);

  const totals: Record<AsoStatus, number> = useMemo(() => {
    const t: Record<AsoStatus, number> = { vencido: 0, critico: 0, atencao: 0, em_dia: 0, sem_registro: 0 };
    enriched.forEach((e) => t[e.status]++);
    return t;
  }, [enriched]);

  const pendencias = useMemo(() => enriched.filter((e) => e.status === "sem_registro"), [enriched]);

  const alertaBanner = totals.vencido + totals.critico;

  function clearFilters() {
    setSearch("");
    setFStatus("todos");
    setFFilial("todos");
    setFCliente("todos");
    setFFuncao("todos");
    setFSupervisor("todos");
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  const toExport = (r: Colaborador): import("@/lib/sst/export").SstExportRow => ({
    nome: r.nome,
    cpf: r.cpf,
    matricula: r.matricula,
    empresa: r.empresa,
    filial: r.filial,
    descricao_filial: r.descricao_filial,
    cliente: r.cliente,
    regional: r.regional,
    negocio: r.negocio,
    funcao: r.funcao,
    descricao_funcao: r.descricao_funcao,
    cod_funcao: r.cod_funcao,
    situacao: r.situacao,
    supervisor: r.supervisor,
    gerente: r.gerente,
    gerente_regional: r.gerente_regional,
    diretor: r.diretor,
    diretor_executivo: r.diretor_executivo,
    tipo_contrato: r.tipo_contrato,
    escala: r.escala,
    horario_trabalho: r.horario_trabalho,
    sexo: r.sexo,
    rg: r.rg,
    data_nascimento: r.data_nascimento,
    municipio: r.municipio,
    estado: r.estado,
    pis: r.pis,
    ctps: r.ctps,
    serie_ctps: r.serie_ctps,
    cc: r.cc,
    cr: r.cr,
    data_admissao: r.data_admissao,
    data_demissao: r.data_demissao,
    tipo_exame: r.tipo_exame,
    data_exame_realizado: r.data_exame_realizado,
    data_vencimento: r.data_vencimento,
    data_sugerida_agendamento: r.data_sugerida_agendamento,
    agendamento_confirmado: r.agendamento_confirmado,
    observacao: r.observacao,
    dados_extras: r.dados_extras,
  });
  const exportRows = () => filtered.map(({ row }) => toExport(row));

  return (
    <div className="sst-theme">
      <PageShell
        title="Segurança do Trabalho"
        description="Controle de ASO — status automático, agendamentos e histórico por colaborador"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Importar ASO
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportCadastroOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Importar Cadastro
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              Novo Colaborador
            </Button>
          </>
        }
      >
        {alertaBanner > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <strong className="font-semibold text-red-600 dark:text-red-400">
                {totals.vencido} ASO vencido(s) e {totals.critico} vencendo em ≤7 dias.
              </strong>{" "}
              <span className="text-muted-foreground">Priorize os agendamentos abaixo.</span>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="painel">Painel</TabsTrigger>
            <TabsTrigger value="controle">Controle de ASO ({rows.length})</TabsTrigger>
            <TabsTrigger value="pendencias">Pendências ({pendencias.length})</TabsTrigger>
          </TabsList>

          {/* Painel */}
          <TabsContent value="painel" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(Object.keys(STATUS_LABEL) as AsoStatus[]).map((k) => {
                const c = STATUS_COLOR[k];
                return (
                  <button
                    key={k}
                    onClick={() => {
                      setFStatus(k);
                      setTab("controle");
                    }}
                    className="text-left"
                  >
                    <GlassCard className="transition-transform hover:-translate-y-0.5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {STATUS_LABEL[k]}
                          </p>
                          <p className="mt-2 text-3xl font-semibold tabular-nums">{totals[k]}</p>
                        </div>
                        <span className={cn("h-3 w-3 rounded-full", c.bg)} />
                      </div>
                    </GlassCard>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <GlassCard>
                <h3 className="mb-3 text-base font-semibold">Próximos 30 dias</h3>
                <div className="space-y-2 text-sm">
                  {enriched
                    .filter((e) => e.dias != null && e.dias >= 0 && e.dias <= 30)
                    .sort((a, b) => (a.dias! - b.dias!))
                    .slice(0, 10)
                    .map(({ row: r, status, dias }) => (
                      <div key={r.id} className="flex items-center justify-between border-b border-border/40 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.funcao ?? "—"} · Venc. {fmtBr(r.data_vencimento)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs tabular-nums text-muted-foreground">{dias}d</span>
                          <StatusBadge status={status} />
                        </div>
                      </div>
                    ))}
                  {enriched.filter((e) => e.dias != null && e.dias >= 0 && e.dias <= 30).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum vencimento nos próximos 30 dias.</p>
                  )}
                </div>
              </GlassCard>
              <GlassCard>
                <h3 className="mb-3 text-base font-semibold">Vencidos</h3>
                <div className="space-y-2 text-sm">
                  {enriched
                    .filter((e) => e.status === "vencido")
                    .sort((a, b) => (a.dias! - b.dias!))
                    .slice(0, 10)
                    .map(({ row: r, dias }) => (
                      <div key={r.id} className="flex items-center justify-between border-b border-border/40 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.funcao ?? "—"} · Venc. {fmtBr(r.data_vencimento)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-red-600 tabular-nums">{dias}d</span>
                      </div>
                    ))}
                  {totals.vencido === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum ASO vencido. 👏</p>
                  )}
                </div>
              </GlassCard>
            </div>
          </TabsContent>

          {/* Controle */}
          <TabsContent value="controle" className="mt-4">
            <GlassCard>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Buscar por nome, CPF, matrícula…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 max-w-xs"
                />
                <Select value={fStatus} onValueChange={(v) => setFStatus(v as typeof fStatus)}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    {(Object.keys(STATUS_LABEL) as AsoStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FilterSelect value={fFilial} onChange={setFFilial} options={filiais} label="Filial" />
                <FilterSelect value={fCliente} onChange={setFCliente} options={clientes} label="Cliente" />
                <FilterSelect value={fFuncao} onChange={setFFuncao} options={funcoes} label="Função" />
                <FilterSelect value={fSupervisor} onChange={setFSupervisor} options={supervisores} label="Supervisor" />
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-3.5 w-3.5" /> Limpar
                </Button>
                <div className="ml-auto text-xs text-muted-foreground">
                  <Filter className="mr-1 inline h-3 w-3" />
                  {filtered.length} de {rows.length}
                </div>
              </div>

              <div className="max-h-[65vh] overflow-auto rounded-lg border border-border/40" style={{ overscrollBehavior: "auto" }}>
                <Table>
                  <TableHeader className="sticky top-0 bg-background/95 backdrop-blur">
                    <TableRow>
                      <ThSort label="Nome" k="nome" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <TableHead>Função</TableHead>
                      <ThSort label="Filial" k="filial" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Último Exame</TableHead>
                      <ThSort label="Vencimento" k="data_vencimento" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <ThSort label="Dias" k="dias" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <ThSort label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                          Carregando…
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                          Nenhum colaborador para os filtros atuais.
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map(({ row: r, status, dias }) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.matricula ?? "—"} · {r.cpf ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{r.funcao ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.filial ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.supervisor ?? "—"}</TableCell>
                        <TableCell className="text-sm tabular-nums">{fmtBr(r.data_exame_realizado)}</TableCell>
                        <TableCell className="text-sm tabular-nums">{fmtBr(r.data_vencimento)}</TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {dias == null ? "—" : dias < 0 ? <span className="text-red-600 font-semibold">{dias}</span> : dias}
                        </TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <IconBtn title="Agendar" onClick={() => setAgendar(r)}><CalendarClock className="h-4 w-4" /></IconBtn>
                            <IconBtn title="Marcar Realizado" onClick={() => setRealizar(r)}><CheckCircle2 className="h-4 w-4" /></IconBtn>
                            <IconBtn title="Histórico" onClick={() => setHistorico(r)}><History className="h-4 w-4" /></IconBtn>
                            <IconBtn title="Editar" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></IconBtn>
                            <IconBtn title="Excluir" onClick={() => setExcluir(r)}><Trash2 className="h-4 w-4" /></IconBtn>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </GlassCard>
          </TabsContent>

          {/* Pendências */}
          <TabsContent value="pendencias" className="mt-4">
            <GlassCard>
              <h3 className="mb-3 text-base font-semibold">
                Colaboradores sem registro de ASO ({pendencias.length})
              </h3>
              <div className="max-h-[65vh] overflow-auto rounded-lg border border-border/40" style={{ overscrollBehavior: "auto" }}>
                <Table>
                  <TableHeader className="sticky top-0 bg-background/95 backdrop-blur">
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead>Admissão</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendencias.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          Todos os colaboradores possuem ASO registrado.
                        </TableCell>
                      </TableRow>
                    )}
                    {pendencias.map(({ row: r }) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell>{r.matricula ?? "—"}</TableCell>
                        <TableCell>{r.funcao ?? "—"}</TableCell>
                        <TableCell>{r.filial ?? "—"}</TableCell>
                        <TableCell>{fmtBr(r.data_admissao)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setRealizar(r)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Registrar ASO
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>
      </PageShell>

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onDone={reload} />}
      {importCadastroOpen && (
        <ImportCadastroDialog onClose={() => setImportCadastroOpen(false)} onDone={reload} />
      )}
      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          rows={exportRows()}
          totalAll={rows.length}
          allRows={() => rows.map(toExport)}
        />
      )}
      {(editing || creating) && (
        <EditDialog
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onDone={reload}
        />
      )}
      {agendar && <AgendarDialog row={agendar} onClose={() => setAgendar(null)} onDone={reload} />}
      {realizar && <RealizarDialog row={realizar} onClose={() => setRealizar(null)} onDone={reload} />}
      {excluir && <ExcluirDialog row={excluir} onClose={() => setExcluir(null)} onDone={reload} />}
      {historico && <HistoricoDialog row={historico} onClose={() => setHistorico(null)} />}
    </div>
  );
}

// ---------- Sub-componentes ----------
function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function ThSort({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <TableHead>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onClick(k)}>
        {label}
        {active && <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </TableHead>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">Todos — {label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------- Diálogo Importar ----------
function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof readSstXlsx>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [subst, setSubst] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleParse(f: File) {
    setParsing(true);
    try {
      const res = await readSstXlsx(f);
      setPreview(res);
    } catch (e) {
      toast.error("Falha ao ler planilha: " + (e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      let inseridos = 0;
      let atualizados = 0;
      const falhas: string[] = [];

      // 1) Rows com CPF: upsert em lote com onConflict=cpf (não trava por duplicidade)
      const comCpf = preview.rows.filter((r) => !!r.cpf);
      const semCpf = preview.rows.filter((r) => !r.cpf);
      const importedIds = new Set<string>();

      // pré-mapeia ids existentes por CPF para contar novos vs atualizados
      const cpfs = comCpf.map((r) => r.cpf as string);
      const idByCpfPre = new Map<string, string>();
      if (cpfs.length) {
        const CHUNK_LOOKUP = 500;
        for (let i = 0; i < cpfs.length; i += CHUNK_LOOKUP) {
          const slice = cpfs.slice(i, i + CHUNK_LOOKUP);
          const { data } = await supabase.from("sst_colaboradores").select("id,cpf").in("cpf", slice);
          (data ?? []).forEach((r) => { if (r.cpf) idByCpfPre.set(r.cpf, r.id); });
        }
      }

      const CHUNK = 100;
      for (let i = 0; i < comCpf.length; i += CHUNK) {
        const batch = comCpf.slice(i, i + CHUNK).map((r) => ({ ...r, ativo: true }));
        const { data, error } = await supabase
          .from("sst_colaboradores")
          .upsert(batch, { onConflict: "cpf" })
          .select("id,cpf");
        if (error) {
          // fallback linha a linha
          for (const row of batch) {
            const { data: one, error: e2 } = await supabase
              .from("sst_colaboradores")
              .upsert(row, { onConflict: "cpf" })
              .select("id,cpf")
              .single();
            if (e2) { falhas.push(`${row.nome} (${row.cpf}): ${e2.message}`); continue; }
            if (one?.id) importedIds.add(one.id);
            if (row.cpf && idByCpfPre.has(row.cpf)) atualizados++; else inseridos++;
          }
        } else {
          (data ?? []).forEach((r) => r.id && importedIds.add(r.id));
          for (const row of batch) {
            if (row.cpf && idByCpfPre.has(row.cpf)) atualizados++; else inseridos++;
          }
        }
      }

      // 2) Rows sem CPF: fallback por matrícula
      if (semCpf.length) {
        const mats = semCpf.map((r) => r.matricula).filter((m): m is string => !!m);
        const idByMat = new Map<string, string>();
        if (mats.length) {
          const { data } = await supabase.from("sst_colaboradores").select("id,matricula").in("matricula", mats);
          (data ?? []).forEach((r) => { if (r.matricula) idByMat.set(r.matricula, r.id); });
        }
        for (const r of semCpf) {
          const id = r.matricula ? idByMat.get(r.matricula) : undefined;
          const payload = { ...r, ativo: true };
          if (id) {
            const { error } = await supabase.from("sst_colaboradores").update(payload).eq("id", id);
            if (error) { falhas.push(`${r.nome}: ${error.message}`); continue; }
            atualizados++;
            importedIds.add(id);
          } else {
            const { data, error } = await supabase.from("sst_colaboradores").insert(payload).select("id").single();
            if (error) { falhas.push(`${r.nome}: ${error.message}`); continue; }
            inseridos++;
            if (data?.id) importedIds.add(data.id);
          }
        }
      }

      let inativados = 0;
      if (subst) {
        const { data: allActive } = await supabase.from("sst_colaboradores").select("id").eq("ativo", true);
        const toInactive = (allActive ?? []).filter((r) => !importedIds.has(r.id)).map((r) => r.id);
        if (toInactive.length) {
          const { error } = await supabase.from("sst_colaboradores").update({ ativo: false }).in("id", toInactive);
          if (!error) inativados = toInactive.length;
        }
      }

      const msg =
        `Importação: ${inseridos} novo(s), ${atualizados} atualizado(s)` +
        (subst ? `, ${inativados} inativado(s)` : "") +
        (preview.errors.length ? ` · ${preview.errors.length} aviso(s) da planilha` : "") +
        (falhas.length ? ` · ${falhas.length} linha(s) com erro` : "");
      if (falhas.length) {
        toast.warning(msg, { description: falhas.slice(0, 5).join(" | ") + (falhas.length > 5 ? " …" : "") });
      } else {
        toast.success(msg);
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar planilha de ASO</DialogTitle>
          <DialogDescription>
            Aceita <code>.xlsx</code>. Merge incremental por CPF (fallback matrícula). Datas em DD/MM/AAAA ou ISO.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                handleParse(f);
              }
            }}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {file ? file.name : "Escolher arquivo"}
            </Button>
            {parsing && <span className="text-sm text-muted-foreground">Analisando…</span>}
          </div>

          {preview && (
            <div className="space-y-2 rounded-lg border border-border/40 p-3">
              <p className="text-sm">
                <strong>{preview.rows.length}</strong> linha(s) válida(s).{" "}
                {preview.errors.length > 0 && (
                  <span className="text-amber-600">
                    {preview.errors.length} aviso(s).
                  </span>
                )}
              </p>
              {preview.errors.length > 0 && (
                <div className="max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">
                  {preview.errors.slice(0, 30).map((e, i) => (
                    <div key={i}>
                      <span className="text-muted-foreground">[{e.sheet} L{e.row}]</span> {e.message}
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={subst} onChange={(e) => setSubst(e.target.checked)} />
                <span>Substituição completa (inativar colaboradores fora da planilha)</span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!preview || saving}>
            {saving ? "Salvando…" : "Confirmar importação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Diálogo Importar Cadastro de Funcionários ----------
function ImportCadastroDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof readSstXlsx>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [insertMissing, setInsertMissing] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleParse(f: File) {
    setParsing(true);
    try {
      setPreview(await readSstXlsx(f));
    } catch (e) {
      toast.error("Falha ao ler planilha: " + (e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      const cpfs = preview.rows.map((r) => r.cpf).filter((c): c is string => !!c);
      const { data: existing } = cpfs.length
        ? await supabase.from("sst_colaboradores").select("id,cpf").in("cpf", cpfs)
        : { data: [] as { id: string; cpf: string | null }[] };
      const idByCpf = new Map((existing ?? []).map((r) => [r.cpf, r.id]));

      let unificados = 0;
      let novos = 0;
      let semCpf = 0;

      for (const r of preview.rows) {
        if (!r.cpf) { semCpf++; continue; }
        const id = idByCpf.get(r.cpf);
        // Somente campos cadastrais — nunca toca em datas de exame/vencimento/tipo.
        const cadastral = {
          empresa: r.empresa,
          filial: r.filial,
          cliente: r.cliente,
          matricula: r.matricula,
          nome: r.nome,
          funcao: r.funcao,
          situacao: r.situacao,
          supervisor: r.supervisor,
          data_admissao: r.data_admissao,
        };
        if (id) {
          const { error } = await supabase.from("sst_colaboradores").update(cadastral).eq("id", id);
          if (error) throw error;
          unificados++;
        } else if (insertMissing) {
          const { error } = await supabase
            .from("sst_colaboradores")
            .insert({ ...cadastral, cpf: r.cpf, ativo: true });
          if (error) throw error;
          novos++;
        }
      }

      toast.success(
        `Cadastro unificado: ${unificados} vinculado(s) por CPF, ${novos} novo(s)` +
          (semCpf ? `, ${semCpf} linha(s) sem CPF ignorada(s)` : "") +
          (preview.errors.length ? ` — ${preview.errors.length} aviso(s)` : ""),
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Cadastro de Funcionários</DialogTitle>
          <DialogDescription>
            Atualiza <strong>somente dados cadastrais</strong> (empresa, filial, função, supervisor, matrícula, admissão)
            usando o <strong>CPF</strong> como chave. Datas e histórico de ASO permanecem intactos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); handleParse(f); }
            }}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {file ? file.name : "Escolher arquivo"}
            </Button>
            {parsing && <span className="text-sm text-muted-foreground">Analisando…</span>}
          </div>

          {preview && (
            <div className="space-y-2 rounded-lg border border-border/40 p-3">
              <p className="text-sm">
                <strong>{preview.rows.length}</strong> linha(s) válida(s).{" "}
                {preview.errors.length > 0 && (
                  <span className="text-amber-600">{preview.errors.length} aviso(s).</span>
                )}
              </p>
              {preview.errors.length > 0 && (
                <div className="max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">
                  {preview.errors.slice(0, 30).map((e, i) => (
                    <div key={i}>
                      <span className="text-muted-foreground">[{e.sheet} L{e.row}]</span> {e.message}
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={insertMissing} onChange={(e) => setInsertMissing(e.target.checked)} />
                <span>Inserir novos funcionários (sem ASO ainda) quando não houver correspondência por CPF</span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!preview || saving}>
            {saving ? "Salvando…" : "Confirmar unificação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Diálogo Exportar ----------
function ExportDialog({
  onClose,
  rows,
  allRows,
  totalAll,
}: {
  onClose: () => void;
  rows: ReturnType<typeof exportSstXlsx> extends Promise<void> ? Parameters<typeof exportSstXlsx>[0] : never;
  allRows: () => Parameters<typeof exportSstXlsx>[0];
  totalAll: number;
}) {
  const [scope, setScope] = useState<"filtered" | "all">("filtered");
  const [busy, setBusy] = useState(false);

  async function run(fmt: "xlsx" | "pdf") {
    setBusy(true);
    try {
      const data = scope === "filtered" ? rows : allRows();
      const stamp = new Date().toISOString().slice(0, 10);
      if (fmt === "xlsx") await exportSstXlsx(data, `controle-aso-${stamp}.xlsx`);
      else await exportSstPdf(data, `controle-aso-${stamp}.pdf`);
      onClose();
    } catch (e) {
      toast.error("Erro ao exportar: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar Controle de ASO</DialogTitle>
          <DialogDescription>Escolha escopo e formato.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="filtered">Somente filtrados ({rows.length})</SelectItem>
              <SelectItem value="all">Todos ({totalAll})</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => run("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => run("pdf")}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Diálogo Editar/Criar ----------
function EditDialog({
  initial,
  onClose,
  onDone,
}: {
  initial: Colaborador | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const isNew = !initial;
  const [f, setF] = useState<Partial<Colaborador>>(
    initial ?? {
      nome: "",
      empresa: null,
      filial: null,
      cliente: null,
      matricula: null,
      cpf: null,
      funcao: null,
      situacao: "Ativo",
      supervisor: null,
      data_admissao: null,
      data_exame_realizado: null,
      tipo_exame: null,
      data_vencimento: null,
      data_sugerida_agendamento: null,
      agendamento_confirmado: false,
      exame_realizado: false,
      observacao: null,
      ativo: true,
    },
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Colaborador>(k: K, v: Colaborador[K] | null) {
    setF((s) => {
      const next = { ...s, [k]: v };
      if (k === "data_exame_realizado" && typeof v === "string") {
        next.data_vencimento = computeVencimento(v);
        next.data_sugerida_agendamento = computeDataSugerida(next.data_vencimento);
        next.exame_realizado = true;
      }
      if (k === "data_vencimento" && typeof v === "string") {
        next.data_sugerida_agendamento = computeDataSugerida(v);
      }
      return next;
    });
  }

  async function save() {
    if (!f.nome?.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...f, ativo: true };
      if (isNew) {
        const { error } = await supabase.from("sst_colaboradores").insert(payload as never);
        if (error) throw error;
        toast.success("Colaborador cadastrado.");
      } else {
        const { error } = await supabase.from("sst_colaboradores").update(payload).eq("id", initial!.id);
        if (error) throw error;
        toast.success("Colaborador atualizado.");
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Novo colaborador" : `Editar — ${initial!.nome}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 max-h-[70vh] overflow-auto pr-1" style={{ overscrollBehavior: "auto" }}>
          <Field label="Nome*"><Input value={f.nome ?? ""} onChange={(e) => set("nome", e.target.value)} /></Field>
          <Field label="CPF"><Input value={f.cpf ?? ""} onChange={(e) => set("cpf", e.target.value || null)} /></Field>
          <Field label="Matrícula"><Input value={f.matricula ?? ""} onChange={(e) => set("matricula", e.target.value || null)} /></Field>
          <Field label="Função"><Input value={f.funcao ?? ""} onChange={(e) => set("funcao", e.target.value || null)} /></Field>
          <Field label="Empresa"><Input value={f.empresa ?? ""} onChange={(e) => set("empresa", e.target.value || null)} /></Field>
          <Field label="Filial"><Input value={f.filial ?? ""} onChange={(e) => set("filial", e.target.value || null)} /></Field>
          <Field label="Cliente"><Input value={f.cliente ?? ""} onChange={(e) => set("cliente", e.target.value || null)} /></Field>
          <Field label="Supervisor"><Input value={f.supervisor ?? ""} onChange={(e) => set("supervisor", e.target.value || null)} /></Field>
          <Field label="Situação"><Input value={f.situacao ?? ""} onChange={(e) => set("situacao", e.target.value || null)} /></Field>
          <Field label="Data de admissão"><Input type="date" value={f.data_admissao ?? ""} onChange={(e) => set("data_admissao", e.target.value || null)} /></Field>
          <Field label="Último exame"><Input type="date" value={f.data_exame_realizado ?? ""} onChange={(e) => set("data_exame_realizado", e.target.value || null)} /></Field>
          <Field label="Tipo de exame"><Input value={f.tipo_exame ?? ""} onChange={(e) => set("tipo_exame", e.target.value || null)} /></Field>
          <Field label="Vencimento"><Input type="date" value={f.data_vencimento ?? ""} onChange={(e) => set("data_vencimento", e.target.value || null)} /></Field>
          <Field label="Sugestão de agendamento"><Input type="date" value={f.data_sugerida_agendamento ?? ""} onChange={(e) => set("data_sugerida_agendamento", e.target.value || null)} /></Field>
          <Field label="Observação" className="sm:col-span-2">
            <Textarea rows={3} value={f.observacao ?? ""} onChange={(e) => set("observacao", e.target.value || null)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ---------- Agendar ----------
function AgendarDialog({ row, onClose, onDone }: { row: Colaborador; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(row.data_sugerida_agendamento ?? todayIso());
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("sst_colaboradores")
      .update({ data_sugerida_agendamento: date, agendamento_confirmado: true })
      .eq("id", row.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Agendamento confirmado.");
    onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar ASO — {row.nome}</DialogTitle>
          <DialogDescription>Data prevista do próximo exame.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Data do agendamento</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="text-xs text-muted-foreground">Vencimento atual: {fmtBr(row.data_vencimento)}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Marcar realizado ----------
function RealizarDialog({ row, onClose, onDone }: { row: Colaborador; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [tipo, setTipo] = useState(row.tipo_exame ?? "Periódico");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const venc = computeVencimento(date);

  async function save() {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { error: upErr } = await supabase
        .from("sst_colaboradores")
        .update({
          data_exame_realizado: date,
          tipo_exame: tipo,
          data_vencimento: venc,
          data_sugerida_agendamento: venc ? computeDataSugerida(venc) : null,
          exame_realizado: true,
          agendamento_confirmado: false,
          observacao: obs || row.observacao,
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
      const { error: histErr } = await supabase.from("sst_aso_historico").insert({
        colaborador_id: row.id,
        data_exame: date,
        tipo_exame: tipo,
        data_vencimento: venc,
        observacao: obs || null,
        criado_por: user.user?.id ?? null,
      });
      if (histErr) throw histErr;
      toast.success("Exame registrado e histórico atualizado.");
      onDone();
      onClose();
    } catch (e) {
      toast.error("Erro: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar ASO como realizado — {row.nome}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data do exame"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Tipo"><Input value={tipo} onChange={(e) => setTipo(e.target.value)} /></Field>
          <Field label="Novo vencimento (auto)" className="sm:col-span-2">
            <Input readOnly value={fmtBr(venc)} />
          </Field>
          <Field label="Observação" className="sm:col-span-2">
            <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Registrar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Excluir ----------
function ExcluirDialog({ row, onClose, onDone }: { row: Colaborador; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function inactivate() {
    setBusy(true);
    const { error } = await supabase.from("sst_colaboradores").update({ ativo: false }).eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Colaborador inativado.");
    onDone();
    onClose();
  }
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Inativar {row.nome}?</AlertDialogTitle>
          <AlertDialogDescription>
            O colaborador deixará de aparecer nas listas. O histórico de exames e auditoria é preservado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={inactivate} disabled={busy}>
            {busy ? "Inativando…" : "Inativar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Histórico ----------
type HistoricoItem = {
  id: string;
  data_exame: string;
  tipo_exame: string | null;
  data_vencimento: string | null;
  observacao: string | null;
  created_at: string;
};

function HistoricoDialog({ row, onClose }: { row: Colaborador; onClose: () => void }) {
  const [items, setItems] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("sst_aso_historico")
        .select("id,data_exame,tipo_exame,data_vencimento,observacao,created_at")
        .eq("colaborador_id", row.id)
        .order("data_exame", { ascending: false });
      if (error) toast.error(error.message);
      setItems((data as HistoricoItem[]) ?? []);
      setLoading(false);
    })();
  }, [row.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de exames — {row.nome}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border/40">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!loading && items.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Nenhum exame registrado ainda.</TableCell></TableRow>
              )}
              {items.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{fmtBr(h.data_exame)}</TableCell>
                  <TableCell>{h.tipo_exame ?? "—"}</TableCell>
                  <TableCell>{fmtBr(h.data_vencimento)}</TableCell>
                  <TableCell className="text-xs">{h.observacao ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
