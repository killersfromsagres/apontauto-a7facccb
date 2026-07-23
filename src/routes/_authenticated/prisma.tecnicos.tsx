import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Users, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prisma/tecnicos")({
  component: TecnicosPage,
});

type Tecnico = { id: string; nome: string; codigo_prisma: string | null; ativo: boolean };
type Equipe = { id: string; nome: string };
type EqTec = { equipe_id: string; tecnico_id: string };

function TecnicosPage() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nomeEq, setNomeEq] = useState("");
  const [savingTec, setSavingTec] = useState(false);
  const [savingEq, setSavingEq] = useState(false);

  const { data: tecs = [] } = useQuery({
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

  const { data: eqs = [] } = useQuery({
    queryKey: ["prisma", "equipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prisma_equipes").select("id,nome").order("nome");
      if (error) throw error;
      return data as Equipe[];
    },
  });

  const { data: eqtecs = [] } = useQuery({
    queryKey: ["prisma", "equipe_tecnicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_equipe_tecnicos")
        .select("equipe_id,tecnico_id");
      if (error) throw error;
      return data as EqTec[];
    },
  });

  const getCurrentUserId = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("Sessão expirada. Saia e entre novamente.");
    return data.user.id;
  };

  const addTec = async () => {
    const cleanNome = nome.trim();
    const cleanCodigo = codigo.trim();
    if (!cleanNome) return toast.error("Informe o nome do técnico.");
    if (savingTec) return;
    setSavingTec(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("prisma_tecnicos").insert({
        user_id: userId,
        nome: cleanNome,
        codigo_prisma: cleanCodigo || null,
        ativo: true,
      });
      if (error) throw error;
      setNome("");
      setCodigo("");
      await qc.invalidateQueries({ queryKey: ["prisma", "tecnicos"] });
      toast.success("Técnico adicionado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar o técnico.");
    } finally {
      setSavingTec(false);
    }
  };

  const toggleAtivo = async (t: Tecnico) => {
    await supabase.from("prisma_tecnicos").update({ ativo: !t.ativo }).eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["prisma", "tecnicos"] });
  };

  const delTec = async (id: string) => {
    if (!confirm("Excluir este técnico?")) return;
    await supabase.from("prisma_tecnicos").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["prisma"] });
  };

  const addEq = async () => {
    const cleanNome = nomeEq.trim();
    if (!cleanNome) return toast.error("Informe o nome da equipe.");
    if (savingEq) return;
    setSavingEq(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase
        .from("prisma_equipes")
        .insert({ user_id: userId, nome: cleanNome });
      if (error) throw error;
      setNomeEq("");
      await qc.invalidateQueries({ queryKey: ["prisma", "equipes"] });
      toast.success("Equipe adicionada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar a equipe.");
    } finally {
      setSavingEq(false);
    }
  };

  const delEq = async (id: string) => {
    if (!confirm("Excluir esta equipe?")) return;
    await supabase.from("prisma_equipes").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["prisma"] });
  };

  const toggleEqTec = async (equipe_id: string, tecnico_id: string) => {
    const exists = eqtecs.some((r) => r.equipe_id === equipe_id && r.tecnico_id === tecnico_id);
    if (exists) {
      await supabase
        .from("prisma_equipe_tecnicos")
        .delete()
        .eq("equipe_id", equipe_id)
        .eq("tecnico_id", tecnico_id);
    } else {
      const { data: u } = await supabase.auth.getUser();
      await supabase
        .from("prisma_equipe_tecnicos")
        .insert({ user_id: u.user!.id, equipe_id, tecnico_id });
    }
    qc.invalidateQueries({ queryKey: ["prisma", "equipe_tecnicos"] });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Técnicos */}
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-blue-300" />
          <h2 className="font-display text-lg font-semibold tracking-tight">Técnicos</h2>
        </div>
        <div className="mb-4 grid grid-cols-[1fr_140px_auto] gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do técnico"
            className={inputCls}
          />
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código Prisma"
            className={inputCls}
          />
          <button
            type="button"
            onClick={addTec}
            disabled={savingTec}
            className={btnPrimary}
            aria-label="Adicionar técnico"
            title="Adicionar técnico"
          >
            {savingTec ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
        <ul className="max-h-[480px] space-y-1.5 overflow-y-auto">
          {tecs.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{t.nome}</p>
                <p className="text-xs text-white/50">Código: {t.codigo_prisma || "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleAtivo(t)}
                  className={`h-6 w-11 rounded-full transition ${
                    t.ativo ? "bg-gradient-to-r from-blue-500 to-purple-500" : "bg-white/10"
                  }`}
                  aria-label="Ativo"
                >
                  <span
                    className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${
                      t.ativo ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <button
                  onClick={() => delTec(t.id)}
                  className="rounded-md p-1.5 text-white/40 transition hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
          {tecs.length === 0 && (
            <p className="py-6 text-center text-sm text-white/50">Nenhum técnico ainda.</p>
          )}
        </ul>
      </section>

      {/* Equipes */}
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-300" />
          <h2 className="font-display text-lg font-semibold tracking-tight">Equipes</h2>
        </div>
        <div className="mb-4 flex gap-2">
          <input
            value={nomeEq}
            onChange={(e) => setNomeEq(e.target.value)}
            placeholder="Nome da equipe"
            className={inputCls}
          />
          <button
            type="button"
            onClick={addEq}
            disabled={savingEq}
            className={btnPrimary}
            aria-label="Adicionar equipe"
            title="Adicionar equipe"
          >
            {savingEq ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
        <div className="space-y-3">
          {eqs.map((eq) => (
            <div key={eq.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">{eq.nome}</p>
                <button
                  onClick={() => delEq(eq.id)}
                  className="rounded-md p-1.5 text-white/40 transition hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tecs.map((t) => {
                  const on = eqtecs.some((r) => r.equipe_id === eq.id && r.tecnico_id === t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleEqTec(eq.id, t.id)}
                      className={`rounded-full px-2.5 py-1 text-xs transition ${
                        on
                          ? "bg-gradient-to-r from-blue-500/70 to-purple-500/70 text-white"
                          : "bg-white/[0.06] text-white/60 hover:bg-white/[0.1]"
                      }`}
                    >
                      {t.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {eqs.length === 0 && (
            <p className="py-6 text-center text-sm text-white/50">Nenhuma equipe ainda.</p>
          )}
        </div>
      </section>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none transition placeholder:text-white/30 focus:border-white/30";
const btnPrimary =
  "grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg shadow-purple-500/20 transition hover:shadow-purple-500/40 active:scale-95 disabled:pointer-events-none disabled:opacity-60";
