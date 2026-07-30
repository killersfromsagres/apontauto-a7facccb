import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Clock, Plus, Save } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type Reservation = {
  id: string;
  modalidade: string;
  numero_os: string;
  descricao: string;
  codigo: string | null;
  unidade: string;
  qtd_solicitada: number;
  qtd_separada: number;
  qtd_entregue: number;
  qtd_consumida: number;
  estoque_minimo: number | null;
  critico: boolean;
  lead_time_dias: number | null;
  afeta_sla: boolean;
  status: string;
  centro_custo: string | null;
  observacao: string | null;
  created_at: string;
};

const STATUS = ["solicitado", "reservado", "separado", "entregue", "consumido", "cancelado"];

const empty: Partial<Reservation> = {
  modalidade: "corretiva",
  unidade: "un",
  status: "solicitado",
  qtd_solicitada: 1,
  qtd_separada: 0,
  qtd_entregue: 0,
  qtd_consumida: 0,
  critico: false,
  afeta_sla: false,
};

async function fetchReservations(): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from("material_reservations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Reservation[];
}

export function MaterialsOsView() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Reservation> | null>(null);
  const [filtro, setFiltro] = useState("");

  const q = useQuery({ queryKey: ["material-reservations"], queryFn: fetchReservations });
  const rows = useMemo(() => {
    const term = filtro.trim().toLowerCase();
    const all = q.data ?? [];
    return term
      ? all.filter((r) =>
          `${r.numero_os} ${r.descricao} ${r.codigo ?? ""}`.toLowerCase().includes(term),
        )
      : all;
  }, [q.data, filtro]);

  const pendentesSla = rows.filter((r) => r.afeta_sla && r.status !== "consumido").length;
  const criticos = rows.filter((r) => r.critico && r.qtd_entregue < r.qtd_solicitada).length;
  const abaixoMin = rows.filter(
    (r) => r.estoque_minimo != null && r.qtd_entregue < r.estoque_minimo,
  ).length;

  async function save() {
    if (!edit?.numero_os?.trim() || !edit?.descricao?.trim()) {
      return toast.error("Informe a OS e a descrição do material.");
    }
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      modalidade: edit.modalidade ?? "corretiva",
      numero_os: edit.numero_os.trim(),
      descricao: edit.descricao.trim(),
      codigo: edit.codigo ?? null,
      unidade: edit.unidade ?? "un",
      qtd_solicitada: Number(edit.qtd_solicitada ?? 0),
      qtd_separada: Number(edit.qtd_separada ?? 0),
      qtd_entregue: Number(edit.qtd_entregue ?? 0),
      qtd_consumida: Number(edit.qtd_consumida ?? 0),
      estoque_minimo: edit.estoque_minimo ?? null,
      critico: edit.critico ?? false,
      lead_time_dias: edit.lead_time_dias ?? null,
      afeta_sla: edit.afeta_sla ?? false,
      status: edit.status ?? "solicitado",
      centro_custo: edit.centro_custo ?? null,
      observacao: edit.observacao ?? null,
    };
    const previous = edit.id ? (q.data ?? []).find((r) => r.id === edit.id) : null;
    const res = edit.id
      ? await supabase
          .from("material_reservations")
          .update(payload)
          .eq("id", edit.id)
          .select("id")
          .single()
      : await supabase
          .from("material_reservations")
          .insert({ ...payload, created_by: u.user?.id })
          .select("id")
          .single();
    if (res.error) return toast.error(res.error.message);

    await supabase.from("material_movements").insert({
      reservation_id: res.data.id,
      tipo: edit.id ? "atualizacao" : "criacao",
      quantidade: payload.qtd_solicitada,
      de_status: previous?.status ?? null,
      para_status: payload.status,
      user_id: u.user?.id,
    });

    toast.success("Reserva de material salva.");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["material-reservations"] });
  }

  return (
    <PageShell
      eyebrow="Materiais e Serviços"
      title="Materiais integrados à OS"
      description="Reserva por ordem de serviço com quantidades solicitada, separada, entregue e consumida, estoque mínimo, material crítico, lead time, impacto no SLA e histórico de movimentação."
      actions={
        <Button onClick={() => setEdit({ ...empty })}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova reserva
        </Button>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <GlassCard variant="block">
          <div className="text-eyebrow">Reservas</div>
          <div className="mt-1 text-2xl font-bold">{rows.length}</div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow">Pendências que afetam SLA</div>
          <div className="mt-1 text-2xl font-bold text-destructive">{pendentesSla}</div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow">Materiais críticos em falta</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">{criticos}</div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow">Abaixo do estoque mínimo</div>
          <div className="mt-1 text-2xl font-bold">{abaixoMin}</div>
        </GlassCard>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Buscar por OS, material ou código…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <GlassCard>
            <p className="text-sm text-muted-foreground">Nenhuma reserva registrada.</p>
          </GlassCard>
        )}
        {rows.map((r) => {
          const pct = r.qtd_solicitada ? (r.qtd_entregue / r.qtd_solicitada) * 100 : 0;
          return (
            <GlassCard key={r.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Boxes className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{r.descricao}</span>
                    <Badge variant="outline">OS {r.numero_os}</Badge>
                    <Badge variant="outline">{r.modalidade}</Badge>
                    {r.critico && (
                      <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                        crítico
                      </Badge>
                    )}
                    {r.afeta_sla && (
                      <Badge className="border-destructive/40 bg-destructive/10 text-destructive">
                        <AlertTriangle className="mr-1 h-3 w-3" /> afeta SLA
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Solicitado {r.qtd_solicitada} · Separado {r.qtd_separada} · Entregue{" "}
                    {r.qtd_entregue} · Consumido {r.qtd_consumida} {r.unidade}
                    {r.lead_time_dias != null && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> lead time {r.lead_time_dias}d
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>
                    Editar
                  </Button>
                </div>
              </div>
              <Progress value={Math.min(100, pct)} className="h-1.5" />
            </GlassCard>
          );
        })}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reserva de material</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Número da OS</Label>
              <Input
                value={edit?.numero_os ?? ""}
                onChange={(e) => setEdit({ ...edit, numero_os: e.target.value })}
              />
            </div>
            <div>
              <Label>Modalidade</Label>
              <Select
                value={edit?.modalidade ?? "corretiva"}
                onValueChange={(v) => setEdit({ ...edit, modalidade: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corretiva">Corretiva</SelectItem>
                  <SelectItem value="refrigeracao">Refrigeração</SelectItem>
                  <SelectItem value="preventiva">Preventiva</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Material</Label>
              <Input
                value={edit?.descricao ?? ""}
                onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
              />
            </div>
            {(
              [
                ["qtd_solicitada", "Solicitada"],
                ["qtd_separada", "Separada"],
                ["qtd_entregue", "Entregue"],
                ["qtd_consumida", "Consumida"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <Label>{label}</Label>
                <Input
                  type="number"
                  min={0}
                  value={String(edit?.[k] ?? 0)}
                  onChange={(e) => setEdit({ ...edit, [k]: Number(e.target.value) })}
                />
              </div>
            ))}
            <div>
              <Label>Estoque mínimo</Label>
              <Input
                type="number"
                value={String(edit?.estoque_minimo ?? "")}
                onChange={(e) =>
                  setEdit({ ...edit, estoque_minimo: Number(e.target.value) || null })
                }
              />
            </div>
            <div>
              <Label>Lead time (dias)</Label>
              <Input
                type="number"
                value={String(edit?.lead_time_dias ?? "")}
                onChange={(e) =>
                  setEdit({ ...edit, lead_time_dias: Number(e.target.value) || null })
                }
              />
            </div>
            <div>
              <Label>Centro de custo</Label>
              <Input
                value={edit?.centro_custo ?? ""}
                onChange={(e) => setEdit({ ...edit, centro_custo: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={edit?.status ?? "solicitado"}
                onValueChange={(v) => setEdit({ ...edit, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={edit?.critico ?? false}
                onCheckedChange={(v) => setEdit({ ...edit, critico: v })}
              />
              <Label>Material crítico</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={edit?.afeta_sla ?? false}
                onCheckedChange={(v) => setEdit({ ...edit, afeta_sla: v })}
              />
              <Label>Pendência afeta o SLA</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save}>
              <Save className="mr-1.5 h-4 w-4" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
