import { useMemo, useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Plus, Pencil, Trash2, Users, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useMaintenanceTeams } from "../hooks/useMaintenanceTeams";
import { formatDuration } from "../utils/buildPointingSchedule";
import type { MaintenanceTeam } from "../types/pointing";

type Draft = {
  id?: string;
  name: string;
  category: string;
  duration_minutes: number;
  technicians: string;
  active: boolean;
};

const EMPTY: Draft = { name: "", category: "", duration_minutes: 30, technicians: "", active: true };

export const SUGGESTED_TEAMS: { name: string; minutes: number }[] = [
  { name: "Chaveiro", minutes: 30 },
  { name: "Civil", minutes: 30 },
  { name: "Elétrica", minutes: 30 },
  { name: "Refrigeração 1", minutes: 60 },
  { name: "Refrigeração 2", minutes: 60 },
  { name: "Refrigeração 3", minutes: 60 },
  { name: "Hidráulica", minutes: 120 },
];

function parseTechnicians(raw: string) {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (!/^\d{6}$/.test(t)) invalid.push(t);
    else if (!seen.has(t)) {
      seen.add(t);
      valid.push(t);
    }
  }
  return { valid, invalid };
}

export function TeamsManager({ onUseInBatch }: { onUseInBatch: (teamId: string) => void }) {
  const { data, isLoading, error, refetch, create, update, remove } = useMaintenanceTeams();
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MaintenanceTeam | null>(null);

  const teams = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((team) => {
      if (onlyActive && !team.active) return false;
      if (!term) return true;
      return (
        team.name.toLowerCase().includes(term) ||
        team.category.toLowerCase().includes(term) ||
        team.technicians.some((t) => t.includes(term))
      );
    });
  }, [data, search, onlyActive]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (name.length < 2 || name.length > 80) {
      toast.error("O nome da equipe deve ter entre 2 e 80 caracteres.");
      return;
    }
    const { valid, invalid } = parseTechnicians(draft.technicians);
    if (invalid.length > 0) {
      toast.error("Cada matrícula deve ter exatamente 6 dígitos.");
      return;
    }
    if (valid.length === 0) {
      toast.error("Informe ao menos uma matrícula.");
      return;
    }
    if (draft.duration_minutes < 1 || draft.duration_minutes > 540) {
      toast.error("A duração deve estar entre 1 e 540 minutos.");
      return;
    }
    const payload = {
      name,
      category: draft.category.trim(),
      duration_minutes: draft.duration_minutes,
      duration_text: formatDuration(draft.duration_minutes),
      technicians: valid,
      active: draft.active,
    };
    try {
      if (draft.id) await update.mutateAsync({ id: draft.id, input: payload });
      else await create.mutateAsync(payload);
      toast.success(draft.id ? "Equipe atualizada." : "Equipe criada.");
      setDraft(null);
    } catch {
      toast.error("Não foi possível salvar a equipe.");
    }
  };

  if (error) {
    return (
      <GlassCard className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar as equipes.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, categoria ou matrícula"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={onlyActive} onCheckedChange={setOnlyActive} /> somente ativas
          </label>
          <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova equipe
          </Button>
        </div>
      </GlassCard>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <GlassCard className="space-y-3 text-center">
          <Users className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhuma equipe cadastrada. Sugestões: {SUGGESTED_TEAMS.map((t) => t.name).join(", ")}.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTED_TEAMS.map((t) => (
              <Button
                key={t.name}
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({ ...EMPTY, name: t.name, category: t.name, duration_minutes: t.minutes })
                }
              >
                <Wand2 className="mr-1.5 h-3.5 w-3.5" /> {t.name} · {formatDuration(t.minutes)}
              </Button>
            ))}
          </div>
        </GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team, index) => (
            <GlassCard key={team.id} delay={index * 0.02} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold">{team.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">{team.category || "sem categoria"}</p>
                </div>
                <Badge variant="outline" className={team.active ? "border-emerald-400/40 text-emerald-200" : ""}>
                  {team.active ? "Ativa" : "Inativa"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className="font-mono">{team.duration_text}</Badge>
                <Badge variant="outline">{team.technicians.length} técnico(s)</Badge>
              </div>
              <p className="break-words font-mono text-[11px] text-muted-foreground">
                {team.technicians.join(" · ")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => onUseInBatch(team.id)}>
                  Usar em novo lote
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      id: team.id,
                      name: team.name,
                      category: team.category,
                      duration_minutes: team.duration_minutes,
                      technicians: team.technicians.join(", "),
                      active: team.active,
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(team)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar equipe" : "Nova equipe"}</DialogTitle>
            <DialogDescription>Matrículas com exatamente 6 dígitos, separadas por vírgula.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Duração (minutos)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={540}
                    value={draft.duration_minutes}
                    onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Duração formatada</Label>
                  <Input readOnly value={formatDuration(draft.duration_minutes || 0)} className="font-mono" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Matrículas dos técnicos</Label>
                <Input
                  value={draft.technicians}
                  onChange={(e) => setDraft({ ...draft, technicians: e.target.value })}
                  placeholder="123456, 654321"
                  className="font-mono"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
                Equipe ativa
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a equipe {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se a equipe já possui histórico de lotes, prefira desativá-la em vez de excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await remove.mutateAsync(confirmDelete.id);
                  toast.success("Equipe excluída.");
                } catch {
                  toast.error("Não foi possível excluir. Tente desativar a equipe.");
                }
                setConfirmDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
