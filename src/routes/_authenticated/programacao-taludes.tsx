import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cloud,
  CloudRain,
  CloudLightning,
  Sun,
  RefreshCw,
  Plus,
  Trash2,
  Pencil,
  Download,
  Image as ImageIcon,
  Settings2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  loadClima,
  statusClimatico,
  proximaDataFavoravel,
  wmoIcone,
  salvarConfig,
  type ClimaBundle,
  type ClimaConfig,
} from "@/lib/taludes-programacao/clima";
import { exportProgramacaoXLSX, type ProgRow } from "@/lib/taludes-programacao/export";
import {
  listarEvidencias,
  registrarEvidencia,
  removerEvidencia,
  type ChuvaEvidencia,
} from "@/lib/taludes-programacao/evidencias";

export const Route = createFileRoute("/_authenticated/programacao-taludes")({
  head: () => ({
    meta: [
      { title: "Programação de Taludes — Apont Auto" },
      {
        name: "description",
        content:
          "Programe serviços em taludes integrado ao monitoramento climático de São Bernardo do Campo.",
      },
    ],
  }),
  component: ProgramacaoTaludesPage,
});

const TIPO_OPTS = [
  { v: "rocada", l: "Roçada" },
  { v: "contencao", l: "Contenção" },
  { v: "drenagem", l: "Drenagem" },
  { v: "inspecao", l: "Inspeção" },
  { v: "plantio", l: "Plantio" },
  { v: "outro", l: "Outro" },
];
const SIT_OPTS = [
  { v: "programado", l: "Programado" },
  { v: "realizado", l: "Realizado" },
  { v: "adiado_chuva", l: "Adiado por chuva" },
  { v: "cancelado", l: "Cancelado" },
];

function fmtBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ClimaIcon({ code, className }: { code: "sun" | "cloud" | "rain" | "storm"; className?: string }) {
  const c = cn("h-5 w-5", className);
  if (code === "sun") return <Sun className={cn(c, "text-amber-500")} />;
  if (code === "rain") return <CloudRain className={cn(c, "text-blue-500")} />;
  if (code === "storm") return <CloudLightning className={cn(c, "text-purple-500")} />;
  return <Cloud className={cn(c, "text-slate-400")} />;
}

function ProgramacaoTaludesPage() {
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();

  const climaQ = useQuery({
    queryKey: ["taludes-clima"],
    queryFn: loadClima,
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });

  const progQ = useQuery({
    queryKey: ["taludes-programacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("taludes_programacao" as never)
        .select("*")
        .order("data_programada", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProgRow[];
    },
  });

  const clima = climaQ.data;
  const rows = progQ.data ?? [];

  // Auto-marcar adiado_chuva ao carregar
  useMemo(() => {
    if (!clima || !rows.length) return;
    const hoje = todayISO();
    const paraAdiar = rows.filter(
      (r) =>
        r.data_programada < hoje &&
        r.situacao === "programado" &&
        clima.dias.find((d) => d.data === r.data_programada)?.choveu,
    );
    if (paraAdiar.length) {
      supabase
        .from("taludes_programacao" as never)
        .update({ situacao: "adiado_chuva" } as never)
        .in(
          "id",
          paraAdiar.map((r) => r.id),
        )
        .then(() => qc.invalidateQueries({ queryKey: ["taludes-programacao"] }));
    }
  }, [clima, rows, qc]);

  const saveMut = useMutation({
    mutationFn: async (row: Partial<ProgRow> & { id?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const user_id = u.user?.id;
      if (!user_id) throw new Error("Não autenticado");
      if (row.id) {
        const { id, ...rest } = row;
        const { error } = await supabase
          .from("taludes_programacao" as never)
          .update(rest as never)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("taludes_programacao" as never)
          .insert({ ...row, user_id } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taludes-programacao"] });
      toast.success("Atividade salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("taludes_programacao" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taludes-programacao"] });
      toast.success("Atividade removida");
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProgRow | null>(null);

  const openNew = () => {
    setEditing({
      id: "",
      os_atividade: "",
      talude: "",
      tipo_servico: "inspecao",
      data_programada: todayISO(),
      equipe: "",
      situacao: "programado",
      observacoes: "",
    });
    setDialogOpen(true);
  };
  const openEdit = (r: ProgRow) => {
    setEditing(r);
    setDialogOpen(true);
  };

  const handleExport = async () => {
    if (!clima) return;
    const blob = await exportProgramacaoXLSX(rows, clima);
    downloadBlob(blob, `programacao-taludes-${todayISO()}.xlsx`);
  };

  const printableRef = useRef<HTMLDivElement>(null);
  const climaPanelRef = useRef<HTMLDivElement>(null);
  const handleExportImage = async () => {
    if (!printableRef.current) return;
    const { toPng } = await import("html-to-image");
    try {
      const dataUrl = await toPng(printableRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `programacao-taludes-${todayISO()}.png`;
      a.click();
    } catch (e) {
      toast.error("Falha ao gerar imagem");
      console.error(e);
    }
  };

  // Evidência de chuva: captura print do painel do clima + salva no histórico.
  const evidenciasQ = useQuery({
    queryKey: ["taludes-chuva-evidencias"],
    queryFn: () => listarEvidencias(50),
    staleTime: 60_000,
  });
  const [registrandoEvid, setRegistrandoEvid] = useState(false);
  const handleRegistrarEvidencia = async () => {
    if (!clima || !climaPanelRef.current) return;
    setRegistrandoEvid(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(climaPanelRef.current, {
        pixelRatio: 2,
        backgroundColor: "#0b1220",
      });
      const hoje = todayISO();
      const diaHoje = clima.dias.find((d) => d.data === hoje);
      const mm = diaHoje?.precipitacao_mm_real ?? diaHoje?.precipitacao_mm_prev ?? clima.agora.prob_chuva;
      await registrarEvidencia({
        data: hoje,
        mensagem:
          "Atividades de talude interrompidas devido a chuva — condição climática desfavorável registrada como evidência.",
        imagem_data_url: dataUrl,
        temperatura: clima.agora.temperatura,
        condicao: clima.agora.condicao,
        precipitacao_mm: typeof mm === "number" ? mm : null,
        prob_chuva: clima.agora.prob_chuva,
      });
      // Também baixa a imagem para o operador
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `evidencia-chuva-taludes-${hoje}.png`;
      a.click();
      toast.success("Evidência de chuva registrada");
      qc.invalidateQueries({ queryKey: ["taludes-chuva-evidencias"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRegistrandoEvid(false);
    }
  };

  const hojeStatus = clima
    ? statusClimatico(todayISO(), clima.dias, clima.config)
    : null;
  const diasChuvaPeriodo = useMemo(() => {
    if (!clima) return [];
    const setD = new Set<string>();
    for (const r of rows) {
      const st = statusClimatico(r.data_programada, clima.dias, clima.config);
      if (st.nivel === "chuva") setD.add(r.data_programada);
    }
    return Array.from(setD).sort();
  }, [rows, clima]);

  return (
    <PageShell
      title="Programação de Taludes"
      description="Programação de serviços em taludes integrada ao monitoramento climático de São Bernardo do Campo — SP."
      actions={
        <>
          <Button variant="outline" onClick={() => climaQ.refetch()} disabled={climaQ.isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", climaQ.isFetching && "animate-spin")} />
            Atualizar clima
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={!clima}>
            <Download className="mr-2 h-4 w-4" />
            Planilha
          </Button>
          <Button variant="outline" onClick={handleExportImage} disabled={!clima}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Imagem
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nova atividade
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {clima?.stale && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            Não foi possível obter dados climáticos agora — exibindo último snapshot salvo.
          </div>
        )}

        {/* Alerta explícito de chuva HOJE — interrupção de atividades */}
        {hojeStatus?.nivel === "chuva" && (
          <div className="rounded-xl border-2 border-red-500/60 bg-gradient-to-r from-red-500/20 to-red-600/10 px-4 py-3 shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CloudRain className="mt-0.5 h-6 w-6 shrink-0 text-red-500 animate-pulse" />
                <div>
                  <p className="font-display text-base font-bold text-red-700 dark:text-red-300">
                    Atividades de talude interrompidas por chuva
                  </p>
                  <p className="text-xs text-red-800/90 dark:text-red-200/90">
                    {hojeStatus.motivo} — registre a evidência para o histórico do dia.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRegistrarEvidencia}
                disabled={registrandoEvid}
                className="shrink-0"
              >
                {registrandoEvid ? "Registrando…" : "Registrar evidência de chuva"}
              </Button>
            </div>
          </div>
        )}

        {/* Painel climático */}
        <GlassCard className="space-y-4" ref={climaPanelRef}>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {clima && <ClimaIcon code={wmoIcone(0)} className="h-10 w-10" />}
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Agora em São Bernardo do Campo — SP
                </div>
                <div className="font-display text-2xl font-bold">
                  {clima?.agora.temperatura != null
                    ? `${Math.round(clima.agora.temperatura)}°C`
                    : "—"}
                  <span className="ml-3 text-base font-normal text-muted-foreground">
                    {clima?.agora.condicao ?? "Carregando…"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Prob. de chuva hoje: {clima?.agora.prob_chuva ?? 0}%
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {hojeStatus && (
                <Badge
                  className={cn(
                    "px-3 py-1.5 text-sm",
                    hojeStatus.nivel === "favoravel" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                    hojeStatus.nivel === "atencao" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                    hojeStatus.nivel === "chuva" && "bg-red-500/15 text-red-700 dark:text-red-300",
                  )}
                >
                  {hojeStatus.nivel === "favoravel" && <CheckCircle2 className="mr-1 h-4 w-4 inline" />}
                  {hojeStatus.nivel !== "favoravel" && <AlertTriangle className="mr-1 h-4 w-4 inline" />}
                  Hoje seguro para talude?{" "}
                  {hojeStatus.nivel === "favoravel"
                    ? "Sim"
                    : hojeStatus.nivel === "atencao"
                      ? "Atenção"
                      : "Não"}
                </Badge>
              )}
            </div>
          </div>

          {/* Timeline 14 dias */}
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-2">
              {clima?.dias
                .filter((d) => d.data >= todayISO())
                .slice(0, 14)
                .map((d) => {
                  const st = statusClimatico(d.data, clima.dias, clima.config);
                  return (
                    <div
                      key={d.data}
                      className={cn(
                        "min-w-[92px] rounded-xl border p-2 text-center",
                        st.nivel === "chuva" && "border-red-500/50 bg-red-500/5",
                        st.nivel === "atencao" && "border-amber-500/40 bg-amber-500/5",
                        st.nivel === "favoravel" && "border-emerald-500/30 bg-emerald-500/5",
                      )}
                    >
                      <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                        {fmtBR(d.data).slice(0, 5)}
                      </div>
                      <div className="my-1 flex justify-center">
                        <ClimaIcon
                          code={
                            (d.precipitacao_mm_prev ?? 0) > 5
                              ? "rain"
                              : (d.prob_chuva_prev ?? 0) > 40
                                ? "cloud"
                                : "sun"
                          }
                        />
                      </div>
                      <div className="text-xs font-bold">{Math.round(d.prob_chuva_prev ?? 0)}%</div>
                      <div className="text-[10px] text-muted-foreground">
                        {(d.precipitacao_mm_prev ?? 0).toFixed(1)} mm
                      </div>
                    </div>
                  );
                })}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Última atualização:{" "}
              {clima ? new Date(clima.atualizado_em).toLocaleString("pt-BR") : "—"}
            </span>
            <span>Fonte: Open-Meteo</span>
          </div>
        </GlassCard>

        {/* Tabela */}
        <GlassCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Atividades programadas</h3>
            <span className="text-xs text-muted-foreground">{rows.length} atividade(s)</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS/Atividade</TableHead>
                  <TableHead>Talude</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Equipe</TableHead>
                  <TableHead>Status Climático</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      Nenhuma atividade programada.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const st = clima
                    ? statusClimatico(r.data_programada, clima.dias, clima.config)
                    : null;
                  const proxima = clima
                    ? proximaDataFavoravel(r.data_programada, clima.dias, clima.config)
                    : null;
                  return (
                    <TableRow
                      key={r.id}
                      className={cn(
                        st?.nivel === "chuva" && "border-l-4 border-l-red-500 bg-red-500/5",
                        st?.nivel === "atencao" && "border-l-4 border-l-amber-500 bg-amber-500/5",
                      )}
                    >
                      <TableCell className="font-medium">{r.os_atividade}</TableCell>
                      <TableCell>{r.talude}</TableCell>
                      <TableCell>{TIPO_OPTS.find((t) => t.v === r.tipo_servico)?.l}</TableCell>
                      <TableCell>{fmtBR(r.data_programada)}</TableCell>
                      <TableCell>{r.equipe}</TableCell>
                      <TableCell>
                        {st && (
                          <div className="space-y-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                st.nivel === "chuva" && "border-red-500/60 text-red-700 dark:text-red-300",
                                st.nivel === "atencao" && "border-amber-500/60 text-amber-700 dark:text-amber-300",
                                st.nivel === "favoravel" && "border-emerald-500/60 text-emerald-700 dark:text-emerald-300",
                              )}
                            >
                              {st.nivel === "chuva" && "🌧️ "}
                              {st.nivel === "favoravel" && "☀️ "}
                              {st.nivel === "atencao" && "⚠️ "}
                              {st.motivo}
                            </Badge>
                            {st.nivel === "chuva" && proxima && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() =>
                                  saveMut.mutate({ id: r.id, data_programada: proxima })
                                }
                              >
                                Reagendar → {fmtBR(proxima)}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={r.situacao}
                          onValueChange={(v) => saveMut.mutate({ id: r.id, situacao: v })}
                        >
                          <SelectTrigger className="h-8 w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SIT_OPTS.map((s) => (
                              <SelectItem key={s.v} value={s.v}>
                                {s.l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Remover atividade?")) delMut.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </GlassCard>

        {/* Histórico */}
        <HistoricoClima clima={clima} rows={rows} />

        {/* Config admin */}
        {isAdmin && clima && <ConfigCard config={clima.config} onSaved={() => climaQ.refetch()} />}
      </div>

      {/* Printable oculto */}
      <div style={{ position: "absolute", left: "-10000px", top: 0 }}>
        <PrintableProgramacao ref={printableRef} rows={rows} clima={clima ?? null} diasChuvaPeriodo={diasChuvaPeriodo} />
      </div>

      {/* Dialog CRUD */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar atividade" : "Nova atividade"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div>
                <Label>OS / Atividade</Label>
                <Input
                  value={editing.os_atividade}
                  onChange={(e) => setEditing({ ...editing, os_atividade: e.target.value })}
                />
              </div>
              <div>
                <Label>Talude</Label>
                <Input
                  value={editing.talude}
                  onChange={(e) => setEditing({ ...editing, talude: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={editing.tipo_servico}
                    onValueChange={(v) => setEditing({ ...editing, tipo_servico: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPO_OPTS.map((t) => (
                        <SelectItem key={t.v} value={t.v}>
                          {t.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data programada</Label>
                  <Input
                    type="date"
                    value={editing.data_programada}
                    onChange={(e) => setEditing({ ...editing, data_programada: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Equipe</Label>
                <Input
                  value={editing.equipe}
                  onChange={(e) => setEditing({ ...editing, equipe: e.target.value })}
                />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={editing.observacoes}
                  onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editing) return;
                const payload = editing.id
                  ? editing
                  : {
                      os_atividade: editing.os_atividade,
                      talude: editing.talude,
                      tipo_servico: editing.tipo_servico,
                      data_programada: editing.data_programada,
                      equipe: editing.equipe,
                      situacao: editing.situacao,
                      observacoes: editing.observacoes,
                    };
                saveMut.mutate(payload as never, {
                  onSuccess: () => setDialogOpen(false),
                });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function HistoricoClima({ clima, rows }: { clima: ClimaBundle | undefined; rows: ProgRow[] }) {
  const [periodo, setPeriodo] = useState<"30" | "60" | "90">("30");
  const dias = useMemo(() => {
    if (!clima) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(periodo));
    const cutIso = cutoff.toISOString().slice(0, 10);
    return clima.dias.filter((d) => d.data >= cutIso && d.data <= todayISO() && d.choveu);
  }, [clima, periodo]);

  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">Histórico climático (dias com chuva)</h3>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as "30" | "60" | "90")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Volume (mm)</TableHead>
              <TableHead>Condição</TableHead>
              <TableHead>Atividades impactadas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dias.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Nenhum dia com chuva confirmada no período.
                </TableCell>
              </TableRow>
            )}
            {dias.map((d) => {
              const impact = rows.filter((r) => r.data_programada === d.data);
              return (
                <TableRow key={d.data}>
                  <TableCell>{fmtBR(d.data)}</TableCell>
                  <TableCell>{(d.precipitacao_mm_real ?? 0).toFixed(1)}</TableCell>
                  <TableCell>{d.condicao}</TableCell>
                  <TableCell>
                    {impact.length
                      ? impact.map((r) => `${r.os_atividade} (${r.talude})`).join(", ")
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

function ConfigCard({ config, onSaved }: { config: ClimaConfig; onSaved: () => void }) {
  const [cfg, setCfg] = useState<ClimaConfig>(config);
  const [saving, setSaving] = useState(false);
  return (
    <GlassCard>
      <details>
        <summary className="flex cursor-pointer items-center gap-2 font-display text-lg font-semibold">
          <Settings2 className="h-5 w-5" />
          Configurações climáticas (admin)
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Latitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={cfg.latitude}
              onChange={(e) => setCfg({ ...cfg, latitude: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Longitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={cfg.longitude}
              onChange={(e) => setCfg({ ...cfg, longitude: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Limite prob. chuva (%)</Label>
            <Input
              type="number"
              value={cfg.limite_prob_chuva}
              onChange={(e) => setCfg({ ...cfg, limite_prob_chuva: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Limite mm chuva</Label>
            <Input
              type="number"
              step="0.1"
              value={cfg.limite_mm_chuva}
              onChange={(e) => setCfg({ ...cfg, limite_mm_chuva: Number(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await salvarConfig(cfg);
                  toast.success("Configurações salvas");
                  onSaved();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      </details>
    </GlassCard>
  );
}

// eslint-disable-next-line react/display-name
const PrintableProgramacao = ({
  rows,
  clima,
  diasChuvaPeriodo,
  ref,
}: {
  rows: ProgRow[];
  clima: ClimaBundle | null;
  diasChuvaPeriodo: string[];
  ref?: React.Ref<HTMLDivElement>;
}) => (
  <div
    ref={ref}
    style={{
      width: "1200px",
      background: "#fff",
      color: "#111",
      padding: "32px",
      fontFamily: "Inter, system-ui, sans-serif",
    }}
  >
    <div
      style={{
        background: "linear-gradient(90deg,#166534,#15803d)",
        color: "#fff",
        padding: "16px 20px",
        borderRadius: "12px",
        fontWeight: 700,
        fontSize: "24px",
      }}
    >
      Programação de Taludes — Apont Auto
    </div>

    {diasChuvaPeriodo.length > 0 && (
      <div
        style={{
          marginTop: "12px",
          background: "#FEE2E2",
          border: "1px solid #FCA5A5",
          color: "#991B1B",
          padding: "10px 14px",
          borderRadius: "10px",
          fontWeight: 600,
        }}
      >
        ⚠️ Atenção: previsão/confirmação de chuva em{" "}
        {diasChuvaPeriodo.map(fmtBR).join(", ")} — atividades sujeitas a adiamento.
      </div>
    )}

    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        marginTop: "16px",
        fontSize: "13px",
      }}
    >
      <thead>
        <tr style={{ background: "#15803d", color: "#fff" }}>
          {["OS/Atividade", "Talude", "Tipo", "Data", "Equipe", "Status Climático", "Situação"].map(
            (h) => (
              <th key={h} style={{ padding: "8px", border: "1px solid #ddd", textAlign: "left" }}>
                {h}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const st = clima ? statusClimatico(r.data_programada, clima.dias, clima.config) : null;
          const chuva = st?.nivel === "chuva";
          return (
            <tr
              key={r.id}
              style={{
                background: chuva ? "#FEE2E2" : "#fff",
                color: chuva ? "#991B1B" : "#111",
              }}
            >
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{r.os_atividade}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{r.talude}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                {TIPO_OPTS.find((t) => t.v === r.tipo_servico)?.l}
              </td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{fmtBR(r.data_programada)}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{r.equipe}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>{st?.motivo}</td>
              <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                {SIT_OPTS.find((s) => s.v === r.situacao)?.l}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>

    <div
      style={{
        marginTop: "16px",
        padding: "10px 14px",
        background: "#F1F5F9",
        borderRadius: "8px",
        fontSize: "12px",
        color: "#334155",
      }}
    >
      {diasChuvaPeriodo.length
        ? `Dias com chuva no período: ${diasChuvaPeriodo.map(fmtBR).join(", ")}`
        : "Nenhum dia com chuva no período exibido."}
      <div style={{ marginTop: "6px", opacity: 0.7 }}>
        Gerado em {new Date().toLocaleString("pt-BR")} — fonte climática: Open-Meteo (São Bernardo do Campo/SP).
      </div>
    </div>
  </div>
);
