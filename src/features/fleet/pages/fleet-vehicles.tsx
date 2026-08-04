import { useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";


import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlateBadge } from "@/components/frota/plate-badge";
import { BrandMark, inferBrand } from "@/components/frota/brand-mark";
import {
  createFleetVehicle,
  listFleetVehicles,
  updateFleetVehicle,
  vehicleTitle,
  VEHICLE_STATUS,
  type FleetVehicle,
  type VehicleInput,
} from "@/features/fleet/api";

const FUEL_TYPES = ["flex", "gasolina", "etanol", "diesel", "gnv", "eletrico"];

const EMPTY: VehicleInput = {
  prefix: "",
  plate: "",
  brand: "",
  model: "",
  version: "",
  year_model: null,
  color: "",
  fuel_type: "flex",
  current_odometer_km: 0,
  status: "disponivel",
  notes: "",
};

export function FleetVehicles() {
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();
  const { data, isLoading } = useQuery({
    queryKey: ["fleet", "vehicles"],
    queryFn: listFleetVehicles,
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FleetVehicle | null>(null);
  const [form, setForm] = useState<VehicleInput>(EMPTY);
  const [search, setSearch] = useState("");

  const vehicles = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) =>
      `${v.prefix} ${v.plate ?? ""} ${v.brand} ${v.model}`.toLowerCase().includes(q),
    );
  }, [vehicles, search]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: VehicleInput = {
        ...form,
        prefix: form.prefix.trim(),
        plate: form.plate?.trim().toUpperCase() || null,
        brand: form.brand.trim(),
        model: form.model.trim(),
        version: form.version?.trim() || null,
        color: form.color?.trim() || null,
        notes: form.notes?.trim() || null,
        current_odometer_km: Number(form.current_odometer_km) || 0,
      };
      if (editing) await updateFleetVehicle(editing.id, payload);
      else await createFleetVehicle(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Veículo atualizado." : "Veículo cadastrado.");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      void qc.invalidateQueries({ queryKey: ["fleet", "vehicles"] });
    },
    onError: (err: any) =>
      toast.error(err?.message ?? "Não foi possível salvar. Verifique suas permissões."),
  });

  function startNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function startEdit(v: FleetVehicle) {
    setEditing(v);
    setForm({
      prefix: v.prefix,
      plate: v.plate ?? "",
      brand: v.brand,
      model: v.model,
      version: v.version ?? "",
      year_model: v.year_model,
      color: v.color ?? "",
      fuel_type: v.fuel_type,
      current_odometer_km: Number(v.current_odometer_km) || 0,
      status: v.status,
      notes: v.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          className="h-11 sm:max-w-xs"
          placeholder="Buscar por prefixo, placa ou modelo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>

          <DialogTrigger asChild>
            <Button
              className="tap-press h-11 shadow-elegant hover:shadow-glow sm:ml-auto"
              onClick={startNew}
            >
              <Plus className="mr-2 h-4 w-4" /> Novo veículo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar veículo" : "Novo veículo"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Prefixo *">
                <Input
                  value={form.prefix}
                  onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                />
              </Field>
              <Field label="Placa">
                <Input
                  value={form.plate ?? ""}
                  onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="Marca *">
                <Input
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
              </Field>
              <Field label="Modelo *">
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </Field>
              <Field label="Versão">
                <Input
                  value={form.version ?? ""}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                />
              </Field>
              <Field label="Ano/modelo">
                <Input
                  inputMode="numeric"
                  value={form.year_model ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, year_model: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label="Cor">
                <Input
                  value={form.color ?? ""}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                />
              </Field>
              <Field label="Combustível">
                <select
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.fuel_type}
                  onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
                >
                  {FUEL_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Hodômetro (km)">
                <Input
                  inputMode="numeric"
                  value={String(form.current_odometer_km)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      current_odometer_km: Number(e.target.value.replace(/\D/g, "")),
                    })
                  }
                />
              </Field>
              <Field label="Situação">
                <select
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {Object.entries(VEHICLE_STATUS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <DialogFooter>
              <Button
                className="h-11 w-full"
                disabled={save.isPending || !form.prefix || !form.brand || !form.model}
                onClick={() => save.mutate()}
              >
                <Save className="mr-2 h-4 w-4" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        )}

      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-muted-foreground">Nenhum veículo encontrado.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((v, i) => (
            <GlassCard
              key={v.id}
              style={{ ["--i" as string]: Math.min(i, 8) } as CSSProperties}
              className="fleet-in space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-display text-base font-semibold">
                    <BrandMark brand={inferBrand(`${v.brand} ${v.model}`)} className="h-4 w-4" />
                    {v.prefix}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{vehicleTitle(v)}</p>
                </div>
                <PlateBadge plate={v.plate} size="sm" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{VEHICLE_STATUS[v.status] ?? v.status}</Badge>
                <span>{Number(v.current_odometer_km).toLocaleString("pt-BR")} km</span>
                <span className="capitalize">{v.fuel_type}</span>
              </div>
              {isAdmin && (
                <Button variant="outline" className="h-10 w-full" onClick={() => startEdit(v)}>
                  Editar
                </Button>
              )}

            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
