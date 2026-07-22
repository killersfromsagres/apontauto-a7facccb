import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useEquipeTecnicos, useEquipes, useTecnicos } from "@/lib/prisma-panel/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function TecnicosTab() {
  const { data: tecnicos = [] } = useTecnicos();
  const { data: equipes = [] } = useEquipes();
  const qc = useQueryClient();

  const [novoNome, setNovoNome] = useState("");
  const [novaMat, setNovaMat] = useState("");

  const addTecnico = async () => {
    if (!novoNome.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("prisma_tecnicos").insert({
      user_id: userData.user!.id,
      nome: novoNome.trim(),
      matricula: novaMat.trim() || null,
    });
    if (error) return toast.error(error.message);
    setNovoNome("");
    setNovaMat("");
    qc.invalidateQueries({ queryKey: ["prisma-tecnicos"] });
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    await supabase.from("prisma_tecnicos").update({ ativo }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["prisma-tecnicos"] });
  };

  const removerTecnico = async (id: string) => {
    if (!confirm("Remover técnico?")) return;
    await supabase.from("prisma_tecnicos").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["prisma-tecnicos"] });
  };

  const [novaEquipeNome, setNovaEquipeNome] = useState("");
  const addEquipe = async () => {
    if (!novaEquipeNome.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("prisma_equipes").insert({
      user_id: userData.user!.id,
      nome: novaEquipeNome.trim(),
    });
    if (error) return toast.error(error.message);
    setNovaEquipeNome("");
    qc.invalidateQueries({ queryKey: ["prisma-equipes"] });
  };

  const removerEquipe = async (id: string) => {
    if (!confirm("Remover equipe?")) return;
    await supabase.from("prisma_equipes").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["prisma-equipes"] });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard className="!rounded-[28px] !p-5">
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold tracking-tight">Técnicos</h3>
          <p className="text-xs text-muted-foreground">Nome + matrícula (opcional). Inativos ficam ocultos ao criar lotes.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome"
            className="rounded-2xl border-white/10 bg-white/[0.04]"
          />
          <Input
            value={novaMat}
            onChange={(e) => setNovaMat(e.target.value)}
            placeholder="Matrícula"
            className="rounded-2xl border-white/10 bg-white/[0.04] sm:w-32"
          />
          <Button onClick={addTecnico} className="rounded-full active:scale-95">
            <UserPlus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>
        <ul className="mt-4 space-y-1.5">
          {tecnicos.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Nenhum técnico cadastrado.</p>
          )}
          {tecnicos.map((t) => (
            <li
              key={t.id}
              className={cn(
                "flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-2.5 pl-3",
                !t.ativo && "opacity-50",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.nome}</div>
                {t.matricula && <div className="font-mono text-[10px] text-muted-foreground">{t.matricula}</div>}
              </div>
              <Switch checked={t.ativo} onCheckedChange={(v) => toggleAtivo(t.id, v)} />
              <Button size="icon" variant="ghost" onClick={() => removerTecnico(t.id)} className="h-8 w-8">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="!rounded-[28px] !p-5">
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold tracking-tight">Equipes</h3>
          <p className="text-xs text-muted-foreground">Agrupe técnicos para adicioná-los a um lote de uma vez.</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={novaEquipeNome}
            onChange={(e) => setNovaEquipeNome(e.target.value)}
            placeholder="Nome da equipe"
            className="rounded-2xl border-white/10 bg-white/[0.04]"
          />
          <Button onClick={addEquipe} className="rounded-full active:scale-95">
            <Plus className="mr-2 h-4 w-4" /> Criar
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {equipes.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma equipe.</p>
          )}
          {equipes.map((e) => (
            <EquipeRow key={e.id} equipe={e} onRemove={() => removerEquipe(e.id)} />
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}

function EquipeRow({ equipe, onRemove }: { equipe: { id: string; nome: string }; onRemove: () => void }) {
  const { data: tecnicos = [] } = useTecnicos();
  const { data: linkedIds = [] } = useEquipeTecnicos(equipe.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const abrir = () => {
    setSelecionados(linkedIds);
    setOpen(true);
  };

  const salvar = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData.user!.id;
    // sync: remove all, insert current
    await supabase.from("prisma_equipe_tecnicos").delete().eq("equipe_id", equipe.id);
    if (selecionados.length > 0) {
      await supabase.from("prisma_equipe_tecnicos").insert(
        selecionados.map((tid) => ({ equipe_id: equipe.id, tecnico_id: tid, user_id })),
      );
    }
    qc.invalidateQueries({ queryKey: ["prisma-equipe-tecnicos", equipe.id] });
    toast.success("Equipe atualizada.");
    setOpen(false);
  };

  return (
    <li className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{equipe.nome}</span>
        <span className="text-[10px] text-muted-foreground">{linkedIds.length} membro(s)</span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={abrir}>
              Editar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Membros de "{equipe.nome}"</DialogTitle>
            </DialogHeader>
            <div className="max-h-[320px] space-y-1 overflow-y-auto">
              {tecnicos.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(t.id)}
                    onChange={(ev) =>
                      setSelecionados((prev) =>
                        ev.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id),
                      )
                    }
                  />
                  <span className="flex-1 text-sm">{t.nome}</span>
                  {t.matricula && <span className="font-mono text-[10px] text-muted-foreground">{t.matricula}</span>}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={salvar} className="rounded-full">Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-7 w-7">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}
