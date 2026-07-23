import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { computeSchedule, parseOsInput, type ScheduleItem } from "@/lib/prisma/scheduler";
import { Save, Send, X, Loader2, Sparkles } from "lucide-react";

const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_authenticated/prisma/novo")({
  validateSearch: (s) => searchSchema.parse(s),
  component: NovoLote,
});

type Tecnico = { id: string; nome: string; codigo_prisma: string | null; ativo: boolean };
type Equipe = { id: string; nome: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): Date {
  return new Date(v);
}
function fmtDT(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NovoLote() {
  const { id } = Route.useSearch();
  const nav = useNavigate();
  const qc = useQueryClient();
  const editing = Boolean(id);

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<"refrigeracao" | "geral">("geral");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 1);
    return toLocalInput(d);
  });
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaLimite, setHoraLimite] = useState("17:00");
  const [duracao, setDuracao] = useState(1);
  const [osRaw, setOsRaw] = useState("");
  const [osList, setOsList] = useState<string[]>([]);
  const [selTecnicos, setSelTecnicos] = useState<string[]>([]);
  const [manualSched, setManualSched] = useState<ScheduleItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: tecnicos = [] } = useQuery({
    queryKey: ["prisma", "tecnicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_tecnicos")
        .select("id,nome,codigo_prisma,ativo")
        .order("nome");
      if (error) throw error;
      return data as Tecnico[];
    },
  });

  const { data: equipes = [] } = useQuery({
    queryKey: ["prisma", "equipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prisma_equipes").select("id,nome").order("nome");
      if (error) throw error;
      return data as Equipe[];
    },
  });

  // Carrega lote existente
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: lote } = await supabase
        .from("prisma_lotes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!lote) return;
      setNome(lote.nome ?? "");
      setCategoria(lote.categoria);
      setDataInicio(toLocalInput(new Date(lote.data_inicio)));
      setHoraInicio(String(lote.hora_inicio_jornada ?? "08:00").slice(0, 5));
      setHoraLimite(String(lote.hora_limite_jornada ?? "17:00").slice(0, 5));
      setDuracao(Number(lote.duracao_padrao_horas ?? 1));
      const { data: itens } = await supabase
        .from("prisma_os_itens")
        .select("numero_os,data_hora_inicio,data_hora_fim,ordem")
        .eq("lote_id", id)
        .order("ordem");
      if (itens?.length) {
        const numeros = itens.map((i) => i.numero_os);
        setOsList(numeros);
        setOsRaw(numeros.join(", "));
        setManualSched(
          itens.map((i) => ({
            numero_os: i.numero_os,
            data_hora_inicio: i.data_hora_inicio ?? new Date().toISOString(),
            data_hora_fim: i.data_hora_fim ?? new Date().toISOString(),
          })),
        );
      }
      const { data: tecs } = await supabase
        .from("prisma_lote_tecnicos")
        .select("tecnico_id")
        .eq("lote_id", id);
      setSelTecnicos((tecs ?? []).map((t) => t.tecnico_id));
    })();
  }, [id]);

  // Normaliza OS ao perder foco
  const normalizeOs = () => {
    const list = parseOsInput(osRaw);
    setOsList(list);
    setOsRaw(list.join(", "));
    setManualSched(null); // recalcula abaixo
  };

  // Preview automática (quando não há edição manual)
  const previewSched = useMemo<ScheduleItem[]>(() => {
    if (manualSched) return manualSched;
    if (osList.length === 0) return [];
    try {
      return computeSchedule({
        dataInicio: fromLocalInput(dataInicio),
        horaInicioJornada: horaInicio,
        horaLimiteJornada: horaLimite,
        duracaoHoras: duracao,
        osList,
      });
    } catch {
      return [];
    }
  }, [manualSched, osList, dataInicio, horaInicio, horaLimite, duracao]);

  const applyEquipe = async (equipeId: string) => {
    const { data } = await supabase
      .from("prisma_equipe_tecnicos")
      .select("tecnico_id")
      .eq("equipe_id", equipeId);
    const ids = new Set([...selTecnicos, ...(data ?? []).map((r) => r.tecnico_id)]);
    setSelTecnicos([...ids]);
  };

  const toggleTecnico = (tid: string) => {
    setSelTecnicos((cur) => (cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid]));
  };

  const removeOs = (num: string) => {
    const next = osList.filter((n) => n !== num);
    setOsList(next);
    setOsRaw(next.join(", "));
    setManualSched(null);
  };

  const editSchedCell = (i: number, field: "data_hora_inicio" | "data_hora_fim", value: string) => {
    const base = manualSched ?? previewSched;
    const copy = base.map((r) => ({ ...r }));
    copy[i] = { ...copy[i], [field]: new Date(value).toISOString() };
    setManualSched(copy);
  };

  const save = async (status: "rascunho" | "pendente") => {
    if (osList.length === 0) {
      toast.error("Adicione ao menos uma OS.");
      return;
    }
    if (selTecnicos.length === 0) {
      toast.error("Selecione ao menos um técnico.");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada.");

      const sched = manualSched ?? previewSched;
      const payload = {
        user_id: uid,
        nome: nome || null,
        categoria,
        data_inicio: fromLocalInput(dataInicio).toISOString(),
        hora_inicio_jornada: horaInicio,
        hora_limite_jornada: horaLimite,
        duracao_padrao_horas: duracao,
        status,
        total_os: osList.length,
      };

      let loteId = id;
      if (loteId) {
        const { error } = await supabase.from("prisma_lotes").update(payload).eq("id", loteId);
        if (error) throw error;
        await supabase.from("prisma_os_itens").delete().eq("lote_id", loteId);
        await supabase.from("prisma_lote_tecnicos").delete().eq("lote_id", loteId);
      } else {
        const { data: novo, error } = await supabase
          .from("prisma_lotes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        loteId = novo.id;
      }

      const itens = sched.map((s, i) => ({
        lote_id: loteId!,
        user_id: uid,
        numero_os: s.numero_os,
        ordem: i + 1,
        status: "pendente" as const,
        data_hora_inicio: s.data_hora_inicio,
        data_hora_fim: s.data_hora_fim,
      }));
      const { error: e2 } = await supabase.from("prisma_os_itens").insert(itens);
      if (e2) throw e2;

      const tecRows = selTecnicos.map((tid) => ({ lote_id: loteId!, user_id: uid, tecnico_id: tid }));
      const { error: e3 } = await supabase.from("prisma_lote_tecnicos").insert(tecRows);
      if (e3) throw e3;

      toast.success(status === "pendente" ? "Lote enviado para execução." : "Rascunho salvo.");
      qc.invalidateQueries({ queryKey: ["prisma"] });
      nav({ to: "/prisma" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar lote.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Informações do lote">
          <Field label="Nome (opcional)">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Refrigeração — semana 30"
              className={inputCls}
            />
          </Field>
          <Field label="Categoria">
            <div className="flex gap-2">
              {(["refrigeracao", "geral"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoria(c)}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${
                    categoria === c
                      ? "bg-gradient-to-r from-blue-500/80 to-purple-500/80 text-white shadow-lg shadow-blue-500/20"
                      : "bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
                  }`}
                >
                  {c === "refrigeracao" ? "Refrigeração" : "Geral"}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data/hora início">
              <input
                type="datetime-local"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setManualSched(null);
                }}
                className={inputCls}
              />
            </Field>
            <Field label="Duração / OS (h)">
              <input
                type="number"
                step="0.25"
                min={0.25}
                value={duracao}
                onChange={(e) => {
                  setDuracao(Number(e.target.value));
                  setManualSched(null);
                }}
                className={inputCls}
              />
            </Field>
            <Field label="Início jornada">
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => {
                  setHoraInicio(e.target.value);
                  setManualSched(null);
                }}
                className={inputCls}
              />
            </Field>
            <Field label="Limite jornada">
              <input
                type="time"
                value={horaLimite}
                onChange={(e) => {
                  setHoraLimite(e.target.value);
                  setManualSched(null);
                }}
                className={inputCls}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Técnicos">
          {equipes.length > 0 && (
            <Field label="Aplicar equipe">
              <select
                onChange={(e) => e.target.value && applyEquipe(e.target.value)}
                defaultValue=""
                className={inputCls}
              >
                <option value="">Selecione uma equipe...</option>
                {equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
            {tecnicos.length === 0 ? (
              <p className="p-4 text-center text-sm text-white/50">
                Nenhum técnico cadastrado. Vá em Técnicos & Equipes.
              </p>
            ) : (
              tecnicos.map((t) => {
                const on = selTecnicos.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTecnico(t.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      on ? "bg-white/10" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span>
                      {t.nome}{" "}
                      <span className="text-xs text-white/50">
                        ({t.codigo_prisma || "sem código"})
                      </span>
                    </span>
                    <span
                      className={`h-4 w-4 rounded-full border transition ${
                        on
                          ? "border-blue-400 bg-gradient-to-br from-blue-400 to-purple-500"
                          : "border-white/20"
                      }`}
                    />
                  </button>
                );
              })
            )}
          </div>
          <p className="text-xs text-white/50">{selTecnicos.length} selecionado(s)</p>
        </Panel>
      </div>

      <Panel title="OS do lote">
        <textarea
          value={osRaw}
          onChange={(e) => setOsRaw(e.target.value)}
          onBlur={normalizeOs}
          placeholder="Cole as OS aqui — separadas por vírgula, espaço ou quebra de linha. Ex.: 1538379, 1538347 1538346"
          rows={4}
          className={`${inputCls} font-mono text-xs leading-relaxed`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold">
            <Sparkles className="mr-1 inline h-3 w-3 text-purple-300" />
            {osList.length} OS detectadas
          </span>
          {osList.slice(0, 40).map((n) => (
            <span
              key={n}
              className="group inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-mono"
            >
              {n}
              <button
                type="button"
                onClick={() => removeOs(n)}
                className="opacity-40 transition hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {osList.length > 40 && (
            <span className="text-xs text-white/40">+ {osList.length - 40} restantes</span>
          )}
        </div>
      </Panel>

      {previewSched.length > 0 && (
        <Panel title="Prévia do agendamento" subtitle="Você pode ajustar cada horário manualmente">
          <div className="max-h-[420px] overflow-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-black/60 backdrop-blur-xl">
                <tr className="text-left text-xs uppercase tracking-wider text-white/50">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">OS</th>
                  <th className="px-3 py-2">Início</th>
                  <th className="px-3 py-2">Fim</th>
                </tr>
              </thead>
              <tbody>
                {previewSched.map((s, i) => (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 text-white/40 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono">{s.numero_os}</td>
                    <td className="px-3 py-1.5">
                      <input
                        type="datetime-local"
                        value={toLocalInput(new Date(s.data_hora_inicio))}
                        onChange={(e) => editSchedCell(i, "data_hora_inicio", e.target.value)}
                        className="rounded-md bg-white/[0.04] px-2 py-1 text-xs outline-none transition focus:bg-white/10"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="datetime-local"
                        value={toLocalInput(new Date(s.data_hora_fim))}
                        onChange={(e) => editSchedCell(i, "data_hora_fim", e.target.value)}
                        className="rounded-md bg-white/[0.04] px-2 py-1 text-xs outline-none transition focus:bg-white/10"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-white/40">
            Primeira: {fmtDT(previewSched[0].data_hora_inicio)} · Última:{" "}
            {fmtDT(previewSched[previewSched.length - 1].data_hora_fim)}
          </p>
        </Panel>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => save("rascunho")}
          className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-6 py-2.5 text-sm font-medium transition hover:bg-white/[0.08] active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar rascunho
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save("pendente")}
          className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition hover:shadow-purple-500/40 active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {editing ? "Salvar & enviar" : "Enviar para execução"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none transition placeholder:text-white/30 focus:border-white/30 focus:bg-black/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl sm:p-6">
      <div>
        <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
