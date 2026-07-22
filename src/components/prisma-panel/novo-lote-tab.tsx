import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, Send, X, Users, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { parseOsNumbers, formatOsList } from "@/lib/prisma-panel/parse-os";
import { useTecnicos, useEquipes, useEquipeTecnicos, type LoteCategoria } from "@/lib/prisma-panel/hooks";
import { cn } from "@/lib/utils";

type Props = { onSaved: () => void };

export function NovoLoteTab({ onSaved }: Props) {
  const { data: tecnicos = [] } = useTecnicos();
  const { data: equipes = [] } = useEquipes();

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<LoteCategoria>("geral");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [horaLimite, setHoraLimite] = useState("17:00");
  const [duracao, setDuracao] = useState<number>(1);
  const [tecnicoIds, setTecnicoIds] = useState<string[]>([]);
  const [equipeSelId, setEquipeSelId] = useState<string>("");
  const { data: equipeTecs = [] } = useEquipeTecnicos(equipeSelId || null);
  const [rawOs, setRawOs] = useState("");
  const [salvando, setSalvando] = useState<null | "rascunho" | "pendente">(null);

  // Aplica seleção de equipe uma vez quando ela muda.
  const lastEquipeRef = useRef<string>("");
  useEffect(() => {
    if (!equipeSelId || lastEquipeRef.current === equipeSelId) return;
    if (equipeTecs.length === 0) return;
    lastEquipeRef.current = equipeSelId;
    setTecnicoIds((prev) => Array.from(new Set([...prev, ...equipeTecs])));
  }, [equipeSelId, equipeTecs]);

  const osList = useMemo(() => parseOsNumbers(rawOs), [rawOs]);

  const normalizarCampo = () => {
    const formatted = formatOsList(osList);
    if (formatted !== rawOs) setRawOs(formatted);
  };

  const removerOs = (n: string) => {
    setRawOs(formatOsList(osList.filter((x) => x !== n)));
  };

  const salvar = async (statusFinal: "rascunho" | "pendente") => {
    if (osList.length === 0) return toast.error("Cole pelo menos uma OS.");
    if (tecnicoIds.length === 0) return toast.error("Selecione ao menos um técnico.");
    setSalvando(statusFinal);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sessão expirada");

      const { data: lote, error: err1 } = await supabase
        .from("prisma_lotes")
        .insert({
          user_id,
          nome: nome.trim() || null,
          categoria,
          data_inicio: new Date(dataInicio).toISOString(),
          hora_limite_jornada: horaLimite,
          duracao_padrao_horas: duracao,
          status: statusFinal,
        })
        .select()
        .single();
      if (err1) throw err1;

      const itens = osList.map((n, i) => ({
        lote_id: lote.id,
        user_id,
        numero_os: n,
        ordem: i,
      }));
      const { error: err2 } = await supabase.from("prisma_os_itens").insert(itens);
      if (err2) throw err2;

      const links = tecnicoIds.map((tid) => ({ lote_id: lote.id, tecnico_id: tid, user_id }));
      const { error: err3 } = await supabase.from("prisma_lote_tecnicos").insert(links);
      if (err3) throw err3;

      toast.success(statusFinal === "rascunho" ? "Rascunho salvo." : "Lote enviado! A extensão vai capturá-lo.");
      // reset
      setNome("");
      setRawOs("");
      setTecnicoIds([]);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(null);
    }
  };

  const toggleTecnico = (id: string) => {
    setTecnicoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <GlassCard className="!rounded-[28px] !p-5 sm:!p-6">
      <div className="mb-5">
        <h3 className="font-display text-lg font-semibold tracking-tight">Novo lote</h3>
        <p className="text-xs text-muted-foreground">Cadastre as OS e envie para a extensão executar no Prisma.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Nome do lote (opcional)</Label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Segunda-feira · Refrigeração"
            className="mt-1.5 rounded-2xl border-white/10 bg-white/[0.04]"
          />
        </div>
        <div>
          <Label className="text-xs">Categoria</Label>
          <Select value={categoria} onValueChange={(v) => setCategoria(v as LoteCategoria)}>
            <SelectTrigger className="mt-1.5 rounded-2xl border-white/10 bg-white/[0.04]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="geral">Geral</SelectItem>
              <SelectItem value="refrigeracao">Refrigeração (preenche Medição = 0)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Data e hora de início</Label>
          <Input
            type="datetime-local"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="mt-1.5 rounded-2xl border-white/10 bg-white/[0.04]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Hora limite jornada</Label>
            <Input
              type="time"
              value={horaLimite}
              onChange={(e) => setHoraLimite(e.target.value)}
              className="mt-1.5 rounded-2xl border-white/10 bg-white/[0.04]"
            />
          </div>
          <div>
            <Label className="text-xs">Duração / OS (h)</Label>
            <Input
              type="number"
              step="0.25"
              min="0.25"
              value={duracao}
              onChange={(e) => setDuracao(parseFloat(e.target.value) || 1)}
              className="mt-1.5 rounded-2xl border-white/10 bg-white/[0.04]"
            />
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs">Técnicos</Label>
          {equipes.length > 0 && (
            <Select value={equipeSelId} onValueChange={setEquipeSelId}>
              <SelectTrigger className="h-8 w-auto rounded-full border-white/10 bg-white/[0.04] text-xs">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue placeholder="Adicionar equipe" />
              </SelectTrigger>
              <SelectContent>
                {equipes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex min-h-[46px] w-full flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-left transition hover:border-white/20">
              {tecnicoIds.length === 0 ? (
                <span className="px-2 text-sm text-muted-foreground">Clique para selecionar técnicos...</span>
              ) : (
                tecnicoIds.map((id) => {
                  const t = tecnicos.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-2.5 py-1 text-[11px] font-medium text-blue-200 ring-1 ring-blue-400/30"
                    >
                      {t?.nome ?? id.slice(0, 8)}
                      <X
                        className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          toggleTecnico(id);
                        }}
                      />
                    </span>
                  );
                })
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-2" align="start">
            <div className="max-h-[280px] space-y-1 overflow-y-auto">
              {tecnicos.filter((t) => t.ativo).map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTecnico(t.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition",
                    tecnicoIds.includes(t.id) ? "bg-blue-500/15 text-blue-200" : "hover:bg-white/5",
                  )}
                >
                  <span className="truncate">{t.nome}</span>
                  {t.matricula && <span className="text-[10px] font-mono text-muted-foreground">{t.matricula}</span>}
                </button>
              ))}
              {tecnicos.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">Cadastre técnicos na aba "Técnicos & Equipes".</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-5">
        <Label className="text-xs">Números de OS</Label>
        <Textarea
          value={rawOs}
          onChange={(e) => setRawOs(e.target.value)}
          onBlur={normalizarCampo}
          placeholder="Cole as OS separadas por vírgula, espaço ou quebra de linha..."
          className="mt-1.5 min-h-[100px] rounded-2xl border-white/10 bg-white/[0.04] font-mono text-sm"
        />
        {osList.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
              <span className="text-emerald-300">{osList.length}</span> OS detectada{osList.length > 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {osList.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] ring-1 ring-white/10"
                >
                  {n}
                  <X
                    className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100"
                    onClick={() => removerOs(n)}
                  />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          onClick={() => salvar("rascunho")}
          disabled={!!salvando}
          variant="outline"
          className="rounded-full active:scale-95"
        >
          {salvando === "rascunho" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar rascunho
        </Button>
        <Button
          onClick={() => salvar("pendente")}
          disabled={!!salvando}
          className="rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white active:scale-95"
        >
          {salvando === "pendente" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Enviar para execução
        </Button>
      </div>
    </GlassCard>
  );
}
