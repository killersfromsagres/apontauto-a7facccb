import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fuel, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlateBadge } from "@/components/frota/plate-badge";
import {
  createFueling,
  deleteFueling,
  listFuelings,
  listFleetVehicles,
  vehicleTitle,
  type FuelingInput,
} from "@/features/fleet/api";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const todayISO = () => new Date().toISOString().slice(0, 10);

const EMPTY = (): FuelingInput => ({
  vehicle_id: "",
  fueled_at: todayISO(),
  driver_name: "",
  station: "",
  fuel_type: "gasolina",
  liters: 0,
  total_cost: 0,
  odometer_km: 0,
  invoice_number: "",
  payment_method: "cartao",
  notes: "",
});

export function FleetFuelings() {
  const qc = useQueryClient();
  const vehiclesQ = useQuery({ queryKey: ["fleet", "vehicles"], queryFn: listFleetVehicles });
  const fuelingsQ = useQuery({ queryKey: ["fleet", "fuelings"], queryFn: () => listFuelings() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FuelingInput>(EMPTY());

  const vehicles = vehiclesQ.data ?? [];
  const rows = fuelingsQ.data ?? [];
  const vehicleById = useMemo(
    () => Object.fromEntries(vehicles.map((v) => [v.id, v])),
    [vehicles],
  );

  const month = new Date().toISOString().slice(0, 7);
  const kpis = useMemo(() => {
    const inMonth = rows.filter((r) => r.fueled_at.slice(0, 7) === month);
    const cost = inMonth.reduce((s, r) => s + r.total_cost, 0);
    const liters = inMonth.reduce((s, r) => s + r.liters, 0);
    return {
      cost,
      liters,
      avg: liters > 0 ? cost / liters : 0,
      count: inMonth.length,
    };
  }, [rows, month]);

  const save = useMutation({
    mutationFn: () =>
      createFueling({
        ...form,
        driver_name: form.driver_name?.trim() || null,
        station: form.station?.trim() || null,
        invoice_number: form.invoice_number?.trim() || null,
        notes: form.notes?.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Abastecimento registrado.");
      setOpen(false);
      setForm(EMPTY());
      void qc.invalidateQueries({ queryKey: ["fleet", "fuelings"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Não foi possível registrar."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFueling(id),
    onSuccess: () => {
      toast.success("Registro excluído.");
      void qc.invalidateQueries({ queryKey: ["fleet", "fuelings"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Sem permissão para excluir."),
  });

  function submit() {
    if (!form.vehicle_id) return toast.warning("Selecione o veículo.");
    if (!(form.liters > 0)) return toast.warning("Informe os litros.");
    if (!(form.total_cost > 0)) return toast.warning("Informe o valor total.");
    save.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Gasto no mês" value={brl(kpis.cost)} />
        <Kpi label="Litros no mês" value={`${kpis.liters.toLocaleString("pt-BR")} L`} />
        <Kpi label="Preço médio" value={kpis.avg ? `${brl(kpis.avg)}/L` : "—"} />
        <Kpi label="Abastecimentos" value={String(kpis.count)} />
      </div>

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Registrar abastecimento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo abastecimento</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Veículo *</Label>
                <select
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.vehicle_id}
                  onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                >
                  <option value="">Selecione…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.prefix} · {v.plate ?? "sem placa"} · {vehicleTitle(v)}
                    </option>
                  ))}
                </select>
              </div>
              <NumField
                label="Data"
                type="date"
                value={form.fueled_at}
                onChange={(v) => setForm({ ...form, fueled_at: v })}
              />
              <NumField
                label="Hodômetro (km)"
                value={String(form.odometer_km || "")}
                onChange={(v) => setForm({ ...form, odometer_km: Number(v.replace(/\D/g, "")) })}
              />
              <NumField
                label="Litros *"
                value={String(form.liters || "")}
                onChange={(v) => setForm({ ...form, liters: Number(v.replace(",", ".")) || 0 })}
              />
              <NumField
                label="Valor total (R$) *"
                value={String(form.total_cost || "")}
                onChange={(v) => setForm({ ...form, total_cost: Number(v.replace(",", ".")) || 0 })}
              />
              <NumField
                label="Condutor"
                value={form.driver_name ?? ""}
                onChange={(v) => setForm({ ...form, driver_name: v })}
              />
              <NumField
                label="Posto"
                value={form.station ?? ""}
                onChange={(v) => setForm({ ...form, station: v })}
              />
              <div className="space-y-1.5">
                <Label className="text-xs">Combustível</Label>
                <select
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.fuel_type}
                  onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
                >
                  {["gasolina", "etanol", "diesel", "gnv", "arla"].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pagamento</Label>
                <select
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.payment_method ?? "cartao"}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                >
                  {["cartao", "vale", "dinheiro", "pix", "faturado"].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <NumField
                label="Nota fiscal / cupom"
                value={form.invoice_number ?? ""}
                onChange={(v) => setForm({ ...form, invoice_number: v })}
              />
            </div>
            <DialogFooter>
              <Button className="h-11 w-full" disabled={save.isPending} onClick={submit}>
                <Save className="mr-2 h-4 w-4" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {fuelingsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-muted-foreground">
            Nenhum abastecimento registrado ainda.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const v = vehicleById[r.vehicle_id];
            return (
              <GlassCard key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <PlateBadge plate={v?.plate} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {v ? `${v.prefix} · ${vehicleTitle(v)}` : "Veículo removido"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(`${r.fueled_at}T12:00:00`).toLocaleDateString("pt-BR")} ·{" "}
                      {r.station || "posto não informado"} · {r.driver_name || "sem condutor"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm sm:ml-auto">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Fuel className="h-4 w-4" />
                    {r.liters.toLocaleString("pt-BR")} L
                  </span>
                  <span className="font-semibold">{brl(r.total_cost)}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.liters ? `${brl(r.total_cost / r.liters)}/L` : ""}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    aria-label="Excluir"
                    onClick={() => remove.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="space-y-1 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </GlassCard>
  );
}

function NumField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input className="h-11" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
