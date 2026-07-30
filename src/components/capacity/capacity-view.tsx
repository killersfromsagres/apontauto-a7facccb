import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  TriangleAlert,
  Users,
  Save,
  UserMinus,
  Play,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL } from "@/modules/work-orders";
import {
  applySchedule,
  buildWeek,
  detectConflicts,
  DEFAULT_SETTING,
  fetchAbsences,
  fetchCapacitySettings,
  fetchPlannedOS,
  fmtHours,
  mondayOf,
  parseYmd,
  suggestSchedule,
  ymd,
  type PlannedOS,
} from "@/features/capacity/data";

const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function CapacityView() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => mondayOf(new Date()));
  const [dragging, setDragging] = useState<PlannedOS | null>(null);
  const [sim, setSim] = useState<Record<string, string> | null>(null);
  const [editEquipe, setEditEquipe] = useState<string | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_SETTING });
  const [absence, setAbsence] = useState({
    equipe: "",
    tecnico: "",
    inicio: "",
    fim: "",
    motivo: "ferias",
  });

  const sunday = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 6);
    return d;
  }, [anchor]);

  const settingsQ = useQuery({ queryKey: ["capacity-settings"], queryFn: fetchCapacitySettings });
  const absencesQ = useQuery({
    queryKey: ["team-absences", ymd(anchor)],
    queryFn: () => fetchAbsences(anchor, sunday),
  });
  const osQ = useQuery({
    queryKey: ["capacity-os", ymd(anchor)],
    queryFn: () => {
      const from = new Date(anchor);
      from.setDate(from.getDate() - 120);
      const to = new Date(sunday);
      to.setDate(to.getDate() + 120);
      return fetchPlannedOS(from, to);
    },
  });

  const teams = useMemo(
    () => buildWeek(anchor, osQ.data ?? [], settingsQ.data ?? [], absencesQ.data ?? []),
    [anchor, osQ.data, settingsQ.data, absencesQ.data],
  );
  const conflicts = useMemo(() => detectConflicts(teams), [teams]);

  const totalCap = teams.reduce((s, t) => s + t.capacidadeMin, 0);
  const totalPlan = teams.reduce((s, t) => s + t.planejadoMin, 0);
  const totalExec = teams.reduce((s, t) => s + t.executadoMin, 0);

  function shift(weeks: number) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + weeks * 7);
    setAnchor(mondayOf(d));
    setSim(null);
  }

  async function move(os: PlannedOS, day: string | null) {
    try {
      await applySchedule([{ id: os.id, modalidade: os.modalidade, data: day }]);
      toast.success(
        day ? `OS ${os.numeroOs} programada para ${day}` : `OS ${os.numeroOs} desprogramada`,
      );
      qc.invalidateQueries({ queryKey: ["capacity-os"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function publishSim() {
    if (!sim) return;
    const all = osQ.data ?? [];
    const changes = Object.entries(sim)
      .map(([id, data]) => {
        const os = all.find((o) => o.id === id);
        return os ? { id, modalidade: os.modalidade, data } : null;
      })
      .filter(Boolean) as { id: string; modalidade: PlannedOS["modalidade"]; data: string }[];
    try {
      await applySchedule(changes);
      toast.success(`${changes.length} OS publicadas na programação.`);
      setSim(null);
      qc.invalidateQueries({ queryKey: ["capacity-os"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveSetting() {
    if (!editEquipe) return;
    const { error } = await supabase
      .from("capacity_settings")
      .upsert({ equipe: editEquipe, ...form }, { onConflict: "equipe" });
    if (error) return toast.error(error.message);
    toast.success("Jornada atualizada.");
    setEditEquipe(null);
    qc.invalidateQueries({ queryKey: ["capacity-settings"] });
  }

  async function saveAbsence() {
    if (!absence.equipe || !absence.tecnico || !absence.inicio || !absence.fim) {
      return toast.error("Preencha equipe, técnico e o período.");
    }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("team_absences")
      .insert({ ...absence, created_by: u.user?.id });
    if (error) return toast.error(error.message);
    toast.success("Ausência registrada.");
    setAbsence({ equipe: "", tecnico: "", inicio: "", fim: "", motivo: "ferias" });
    qc.invalidateQueries({ queryKey: ["team-absences"] });
  }

  return (
    <PageShell
      eyebrow="Planejamento PCM"
      title="Planejamento de Capacidade"
      description="Capacidade por equipe e técnico, jornada configurável, feriados, ausências, carga planejada x executada, gargalos, simulação e sugestão automática."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => shift(-1)}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Badge variant="outline" className="whitespace-nowrap px-3 py-2">
            <CalendarRange className="mr-2 h-3.5 w-3.5" />
            {anchor.toLocaleDateString("pt-BR")} — {sunday.toLocaleDateString("pt-BR")}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            onClick={() => shift(1)}
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="semana" className="space-y-5">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="conflitos">
            Conflitos{" "}
            {conflicts.length > 0 && (
              <span className="ml-1 text-destructive">({conflicts.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="jornada">Jornada e ausências</TabsTrigger>
        </TabsList>

        <TabsContent value="semana" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <GlassCard variant="block">
              <div className="text-eyebrow">Capacidade</div>
              <div className="mt-1 text-2xl font-bold">{fmtHours(totalCap)}</div>
            </GlassCard>
            <GlassCard variant="block">
              <div className="text-eyebrow">Carga planejada</div>
              <div className="mt-1 text-2xl font-bold">{fmtHours(totalPlan)}</div>
              <Progress
                value={totalCap ? Math.min(100, (totalPlan / totalCap) * 100) : 0}
                className="mt-2 h-1.5"
              />
            </GlassCard>
            <GlassCard variant="block">
              <div className="text-eyebrow">Carga executada</div>
              <div className="mt-1 text-2xl font-bold">{fmtHours(totalExec)}</div>
            </GlassCard>
          </div>

          {teams.length === 0 && (
            <GlassCard>
              <p className="text-sm text-muted-foreground">
                Nenhuma equipe encontrada nas ordens desta janela.
              </p>
            </GlassCard>
          )}

          {teams.map((t) => (
            <GlassCard key={t.equipe} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{t.equipe}</span>
                  <Badge variant="outline">{t.tecnicos} técnico(s)</Badge>
                  {t.gargalo && (
                    <Badge className="border-destructive/40 bg-destructive/15 text-destructive">
                      <TriangleAlert className="mr-1 h-3 w-3" /> Gargalo
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {fmtHours(t.planejadoMin)} / {fmtHours(t.capacidadeMin)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setSim(suggestSchedule(t))}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Sugerir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditEquipe(t.equipe);
                      setForm({
                        tecnicos: t.setting?.tecnicos ?? DEFAULT_SETTING.tecnicos,
                        minutos_dia: t.setting?.minutos_dia ?? DEFAULT_SETTING.minutos_dia,
                        dias_semana: t.setting?.dias_semana ?? DEFAULT_SETTING.dias_semana,
                        eficiencia: t.setting?.eficiencia ?? DEFAULT_SETTING.eficiencia,
                        minutos_por_os: t.setting?.minutos_por_os ?? DEFAULT_SETTING.minutos_por_os,
                        observacao: t.setting?.observacao ?? null,
                      });
                    }}
                  >
                    Jornada
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-7">
                {t.dias.map((d, i) => {
                  const uso = d.capacidadeMin
                    ? (d.planejadoMin / d.capacidadeMin) * 100
                    : d.planejadoMin
                      ? 999
                      : 0;
                  return (
                    <div
                      key={d.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => dragging && move(dragging, d.key)}
                      className={`min-h-28 rounded-xl border p-2 text-xs transition-colors ${
                        !d.businessDay
                          ? "border-border/40 bg-muted/20 opacity-60"
                          : uso > 100
                            ? "border-destructive/40 bg-destructive/10"
                            : "border-border/60 bg-card/40"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">
                          {WD[i]} {d.date.getDate()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {fmtHours(d.planejadoMin)}/{fmtHours(d.capacidadeMin)}
                        </span>
                      </div>
                      {d.ausentes > 0 && (
                        <div className="mb-1 text-[10px] text-amber-400">
                          {d.ausentes} ausente(s)
                        </div>
                      )}
                      <div className="space-y-1">
                        {d.os.map((o) => (
                          <div
                            key={o.id}
                            draggable
                            onDragStart={() => setDragging(o)}
                            onDragEnd={() => setDragging(null)}
                            title={`${o.titulo} — ${STATUS_LABEL[o.status]}`}
                            className="cursor-grab truncate rounded-md border border-primary/25 bg-primary/10 px-1.5 py-1"
                          >
                            {o.numeroOs}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {t.naoProgramadas.length > 0 && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dragging && move(dragging, null)}
                  className="rounded-xl border border-dashed border-border/60 p-2"
                >
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Não programadas ({t.naoProgramadas.length}) — arraste para um dia
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.naoProgramadas.slice(0, 40).map((o) => (
                      <span
                        key={o.id}
                        draggable
                        onDragStart={() => setDragging(o)}
                        onDragEnd={() => setDragging(null)}
                        className={`cursor-grab rounded-md border px-1.5 py-1 text-xs ${
                          sim?.[o.id]
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-border/60 bg-card/40"
                        }`}
                      >
                        {o.numeroOs}
                        {sim?.[o.id] ? ` → ${sim[o.id].slice(5)}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          ))}

          {sim && Object.keys(sim).length > 0 && (
            <GlassCard
              variant="block"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="text-sm">
                Simulação com <strong>{Object.keys(sim).length}</strong> OS sugeridas por SLA, local
                e capacidade disponível.
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSim(null)}>
                  Descartar
                </Button>
                <Button onClick={publishSim}>
                  <Play className="mr-1.5 h-4 w-4" /> Publicar programação
                </Button>
              </div>
            </GlassCard>
          )}
        </TabsContent>

        <TabsContent value="conflitos">
          <GlassCard className="space-y-2">
            {conflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum conflito nesta semana.</p>
            ) : (
              conflicts.map((c) => (
                <div
                  key={c.key}
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3"
                >
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
              ))
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="jornada" className="space-y-4">
          <GlassCard className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <UserMinus className="h-4 w-4 text-primary" /> Registrar ausência
            </div>
            <div className="grid gap-3 sm:grid-cols-5">
              <div>
                <Label>Equipe</Label>
                <Input
                  value={absence.equipe}
                  onChange={(e) => setAbsence({ ...absence, equipe: e.target.value })}
                />
              </div>
              <div>
                <Label>Técnico</Label>
                <Input
                  value={absence.tecnico}
                  onChange={(e) => setAbsence({ ...absence, tecnico: e.target.value })}
                />
              </div>
              <div>
                <Label>Início</Label>
                <Input
                  type="date"
                  value={absence.inicio}
                  onChange={(e) => setAbsence({ ...absence, inicio: e.target.value })}
                />
              </div>
              <div>
                <Label>Fim</Label>
                <Input
                  type="date"
                  value={absence.fim}
                  onChange={(e) => setAbsence({ ...absence, fim: e.target.value })}
                />
              </div>
              <div>
                <Label>Motivo</Label>
                <Input
                  value={absence.motivo}
                  onChange={(e) => setAbsence({ ...absence, motivo: e.target.value })}
                />
              </div>
            </div>
            <Button onClick={saveAbsence}>
              <Save className="mr-1.5 h-4 w-4" /> Salvar ausência
            </Button>
          </GlassCard>

          <GlassCard className="space-y-2">
            <div className="font-semibold">Ausências na semana</div>
            {(absencesQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ausência registrada.</p>
            ) : (
              (absencesQ.data ?? []).map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 p-2 text-sm"
                >
                  <span>
                    <strong>{a.tecnico}</strong> — {a.equipe}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {parseYmd(a.inicio).toLocaleDateString("pt-BR")} a{" "}
                    {parseYmd(a.fim).toLocaleDateString("pt-BR")} · {a.motivo}
                  </span>
                </div>
              ))
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editEquipe} onOpenChange={(o) => !o && setEditEquipe(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jornada — {editEquipe}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Técnicos</Label>
              <Input
                type="number"
                min={0}
                value={form.tecnicos}
                onChange={(e) => setForm({ ...form, tecnicos: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Minutos por dia</Label>
              <Input
                type="number"
                min={60}
                value={form.minutos_dia}
                onChange={(e) => setForm({ ...form, minutos_dia: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Eficiência (0-1)</Label>
              <Input
                type="number"
                step="0.05"
                min={0.1}
                max={1}
                value={form.eficiencia}
                onChange={(e) => setForm({ ...form, eficiencia: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Minutos por OS</Label>
              <Input
                type="number"
                min={10}
                value={form.minutos_por_os}
                onChange={(e) => setForm({ ...form, minutos_por_os: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Dias trabalhados</Label>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d, i) => {
                const on = form.dias_semana.includes(d);
                return (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() =>
                      setForm({
                        ...form,
                        dias_semana: on
                          ? form.dias_semana.filter((x) => x !== d)
                          : [...form.dias_semana, d],
                      })
                    }
                  >
                    {WD[i]}
                  </Button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveSetting}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
