import React, { useEffect, useMemo, useState } from "react";
import {
  Play,
  Users,
  History as HistoryIcon,
  Save,
  Trash2,
  Radio,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------- Tipos ----------
type Equipe = { id: string; nome: string; ids: string };
type HistoricoItem = {
  id: string;
  timestamp: number;
  qtdOS: number;
  qtdTecnicos: number;
  status: "enviado" | "erro";
  detalhe?: string;
};

// ---------- Storage helpers ----------
const LS_EQUIPES = "apontauto.equipes";
const LS_HISTORICO = "apontauto.historico";

const loadLS = <T,>(key: string, fallback: T): T => {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const saveLS = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
};

const hoje = () => new Date().toISOString().split("T")[0];
const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

// ---------- Componente ----------
export const ApontAuto: React.FC = () => {
  // Execução
  const [equipeSelecionada, setEquipeSelecionada] = useState<string>("");
  const [equipeIds, setEquipeIds] = useState("436057, 123456");
  const [ordensServico, setOrdensServico] = useState("1533199\n1533200");
  const [dataInicio, setDataInicio] = useState(hoje());
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [dataFim, setDataFim] = useState(hoje());
  const [horaFim, setHoraFim] = useState("17:00");
  const [status, setStatus] = useState<{ msg: string; tipo: "ok" | "erro" | "info" } | null>(
    null,
  );

  // Equipes
  const [equipes, setEquipes] = useState<Equipe[]>(() => loadLS<Equipe[]>(LS_EQUIPES, []));
  const [novaEquipeNome, setNovaEquipeNome] = useState("");
  const [novaEquipeIds, setNovaEquipeIds] = useState("");

  // Histórico
  const [historico, setHistorico] = useState<HistoricoItem[]>(() =>
    loadLS<HistoricoItem[]>(LS_HISTORICO, []),
  );

  // Persistência
  useEffect(() => saveLS(LS_EQUIPES, equipes), [equipes]);
  useEffect(() => saveLS(LS_HISTORICO, historico), [historico]);

  // Status timeout
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const equipesOrdenadas = useMemo(
    () => [...equipes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [equipes],
  );

  const handleSelectEquipe = (id: string) => {
    setEquipeSelecionada(id);
    const eq = equipes.find((e) => e.id === id);
    if (eq) setEquipeIds(eq.ids);
  };

  const salvarEquipe = () => {
    const nome = novaEquipeNome.trim();
    const ids = novaEquipeIds.trim();
    if (!nome || !ids) {
      setStatus({ msg: "⚠️ Informe o nome e os IDs da equipe.", tipo: "erro" });
      return;
    }
    setEquipes((prev) => [...prev, { id: uid(), nome, ids }]);
    setNovaEquipeNome("");
    setNovaEquipeIds("");
    setStatus({ msg: `✅ Equipe "${nome}" salva.`, tipo: "ok" });
  };

  const excluirEquipe = (id: string) => {
    setEquipes((prev) => prev.filter((e) => e.id !== id));
    if (equipeSelecionada === id) setEquipeSelecionada("");
  };

  const limparHistorico = () => setHistorico([]);

  const transmitir = () => {
    const tecnicos = equipeIds.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const osList = ordensServico.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

    if (!tecnicos.length || !osList.length) {
      setStatus({ msg: "⚠️ Preencha os IDs e as Ordens de Serviço.", tipo: "erro" });
      return;
    }

    const dataInicioFormatada = dataInicio.split("-").reverse().join("/");
    const dataFimFormatada = dataFim.split("-").reverse().join("/");

    const payload = {
      tecnicos,
      osList,
      dataInicio: dataInicioFormatada,
      horaInicio,
      dataFim: dataFimFormatada,
      horaFim,
    };

    try {
      window.postMessage(
        { source: "LOVABLE_PRISMA_APP", action: "ENVIAR_OS", payload },
        "*",
      );
      setHistorico((prev) =>
        [
          {
            id: uid(),
            timestamp: Date.now(),
            qtdOS: osList.length,
            qtdTecnicos: tecnicos.length,
            status: "enviado" as const,
            detalhe: `${dataInicioFormatada} ${horaInicio} → ${dataFimFormatada} ${horaFim}`,
          },
          ...prev,
        ].slice(0, 100),
      );
      setStatus({
        msg: `🚀 ${osList.length} OS enviada(s) para ${tecnicos.length} colaborador(es).`,
        tipo: "ok",
      });
    } catch (e) {
      setHistorico((prev) => [
        {
          id: uid(),
          timestamp: Date.now(),
          qtdOS: osList.length,
          qtdTecnicos: tecnicos.length,
          status: "erro" as const,
          detalhe: (e as Error)?.message ?? "Falha ao transmitir",
        },
        ...prev,
      ]);
      setStatus({ msg: "❌ Falha ao transmitir para a extensão.", tipo: "erro" });
    }
  };

  return (
    <div className="min-h-dvh w-full bg-[#07070a] text-slate-100">
      {/* Aurora sutil ao fundo (Frutiger Aero) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        {/* Header */}
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] shadow-inner backdrop-blur-xl">
            <Sparkles className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Central de Apontamento PRISMA
            </h1>
            <p className="text-xs text-slate-400">
              Painel client-side · dados salvos localmente no navegador
            </p>
          </div>
        </header>

        <Tabs defaultValue="execucao" className="w-full">
          <TabsList className="mb-5 grid w-full grid-cols-3 rounded-2xl border border-white/10 bg-slate-900/60 p-1 backdrop-blur-xl">
            <TabsTrigger
              value="execucao"
              className="rounded-xl data-[state=active]:bg-gradient-to-b data-[state=active]:from-white/10 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-inner"
            >
              <Play className="mr-1.5 h-3.5 w-3.5" /> Execução
            </TabsTrigger>
            <TabsTrigger
              value="equipes"
              className="rounded-xl data-[state=active]:bg-gradient-to-b data-[state=active]:from-white/10 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-inner"
            >
              <Users className="mr-1.5 h-3.5 w-3.5" /> Equipes
            </TabsTrigger>
            <TabsTrigger
              value="historico"
              className="rounded-xl data-[state=active]:bg-gradient-to-b data-[state=active]:from-white/10 data-[state=active]:to-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-inner"
            >
              <HistoryIcon className="mr-1.5 h-3.5 w-3.5" /> Histórico
            </TabsTrigger>
          </TabsList>

          {/* ---------- Execução ---------- */}
          <TabsContent value="execucao">
            <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
              <div className="space-y-4">
                {equipesOrdenadas.length > 0 && (
                  <Field label="Selecionar Equipe Salva">
                    <Select value={equipeSelecionada} onValueChange={handleSelectEquipe}>
                      <SelectTrigger className="h-11 rounded-xl border-white/10 bg-black/40 text-sm text-slate-100 backdrop-blur focus:border-emerald-400/60 focus:ring-emerald-400/20">
                        <SelectValue placeholder="— nenhuma —" />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-slate-900/95 text-slate-100 backdrop-blur-xl">
                        {equipesOrdenadas.map((e) => (
                          <SelectItem key={e.id} value={e.id} className="focus:bg-white/[0.06]">
                            {e.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                <Field label="IDs dos Colaboradores">
                  <input
                    type="text"
                    value={equipeIds}
                    onChange={(e) => setEquipeIds(e.target.value)}
                    placeholder="436057, 123456"
                    className={inputClass}
                  />
                </Field>

                <Field label="Ordens de Serviço">
                  <textarea
                    rows={3}
                    value={ordensServico}
                    onChange={(e) => setOrdensServico(e.target.value)}
                    placeholder="Uma OS por linha"
                    className={`${inputClass} resize-none`}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Data Início">
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Hora Início">
                    <input
                      type="time"
                      value={horaInicio}
                      onChange={(e) => setHoraInicio(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Data Fim">
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Hora Fim">
                    <input
                      type="time"
                      value={horaFim}
                      onChange={(e) => setHoraFim(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <button
                  onClick={transmitir}
                  className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 py-3.5 text-sm font-semibold text-emerald-950 shadow-[0_10px_40px_-10px_rgba(16,185,129,0.6)] transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/40 blur-md transition-transform duration-700 ease-out group-hover:translate-x-[300%]"
                  />
                  <Play className="h-4 w-4" strokeWidth={2.5} />
                  Transmitir para Extensão
                </button>

                {status && (
                  <div
                    className={`rounded-xl border p-2.5 text-center text-xs backdrop-blur-xl ${
                      status.tipo === "ok"
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                        : status.tipo === "erro"
                          ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                          : "border-sky-400/30 bg-sky-500/10 text-sky-200"
                    }`}
                  >
                    {status.msg}
                  </div>
                )}
              </div>
            </section>
          </TabsContent>

          {/* ---------- Equipes ---------- */}
          <TabsContent value="equipes">
            <section className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
              <div className="space-y-3">
                <Field label="Nome da Equipe">
                  <input
                    type="text"
                    value={novaEquipeNome}
                    onChange={(e) => setNovaEquipeNome(e.target.value)}
                    placeholder="Ex.: Mecânica Preventiva"
                    className={inputClass}
                  />
                </Field>
                <Field label="IDs dos Membros">
                  <input
                    type="text"
                    value={novaEquipeIds}
                    onChange={(e) => setNovaEquipeIds(e.target.value)}
                    placeholder="436057, 123456"
                    className={inputClass}
                  />
                </Field>
                <button
                  onClick={salvarEquipe}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-medium text-slate-100 transition hover:bg-white/[0.1] active:scale-[0.98]"
                >
                  <Save className="h-4 w-4" /> Salvar Equipe
                </button>
              </div>

              <div className="mt-2 border-t border-white/10 pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Equipes salvas ({equipes.length})
                </p>
                {equipesOrdenadas.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-slate-500">
                    Nenhuma equipe salva ainda.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {equipesOrdenadas.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">{e.nome}</p>
                          <p className="truncate font-mono text-[11px] text-slate-400">{e.ids}</p>
                        </div>
                        <button
                          onClick={() => excluirEquipe(e.id)}
                          aria-label="Excluir equipe"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-200 active:scale-95"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </TabsContent>

          {/* ---------- Histórico ---------- */}
          <TabsContent value="historico">
            <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  Últimas transmissões ({historico.length})
                </div>
                <button
                  onClick={limparHistorico}
                  disabled={!historico.length}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Limpar histórico
                </button>
              </div>

              {historico.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-xs text-slate-500">
                  Nenhuma transmissão registrada ainda.
                </p>
              ) : (
                <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {historico.map((h) => {
                    const ok = h.status === "enviado";
                    return (
                      <li
                        key={h.id}
                        className="rounded-2xl border border-white/10 bg-black/30 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              ok
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            <Radio className="h-3 w-3" />
                            {ok ? "Enviado" : "Erro"}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(h.timestamp).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                          <span>
                            <b className="text-slate-100">{h.qtdOS}</b> OS
                          </span>
                          <span>
                            <b className="text-slate-100">{h.qtdTecnicos}</b> colaborador(es)
                          </span>
                          {h.detalhe && (
                            <span className="text-slate-500">· {h.detalhe}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ---------- Subcomponentes ----------
const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-slate-100 outline-none backdrop-blur transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 [color-scheme:dark]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

export default ApontAuto;
