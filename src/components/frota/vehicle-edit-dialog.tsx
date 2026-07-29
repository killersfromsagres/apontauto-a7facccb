import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateVehicle,
  VEHICLE_STATUS_LABEL,
  type Vehicle,
  type VehicleStatus,
} from "@/lib/frota/api";
import { isValidPlate, maskPlateInput, normalizePlate } from "@/lib/frota/plate";

/** Edição do cadastro do veículo — placa, cor, ano, combustível e status. */
export function VehicleEditDialog({ vehicle }: { vehicle: Vehicle }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    plate: vehicle.plate ?? "",
    brand: vehicle.brand ?? "",
    model: vehicle.model ?? "",
    version: vehicle.version ?? "",
    color: vehicle.color ?? "",
    fuel_type: vehicle.fuel_type ?? "",
    year_manufacture: vehicle.year_manufacture?.toString() ?? "",
    year_model: vehicle.year_model?.toString() ?? "",
    chassis_last6: vehicle.chassis_last6 ?? "",
    status: vehicle.status as VehicleStatus,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      plate: vehicle.plate ?? "",
      brand: vehicle.brand ?? "",
      model: vehicle.model ?? "",
      version: vehicle.version ?? "",
      color: vehicle.color ?? "",
      fuel_type: vehicle.fuel_type ?? "",
      year_manufacture: vehicle.year_manufacture?.toString() ?? "",
      year_model: vehicle.year_model?.toString() ?? "",
      chassis_last6: vehicle.chassis_last6 ?? "",
      status: vehicle.status,
    });
  }, [open, vehicle]);

  const plateOk = form.plate.trim() === "" || isValidPlate(form.plate);

  const save = useMutation({
    mutationFn: () =>
      updateVehicle(vehicle.id, {
        plate: form.plate.trim() ? normalizePlate(form.plate) : null,
        brand: form.brand.trim(),
        model: form.model.trim(),
        version: form.version.trim() || null,
        color: form.color.trim() || null,
        fuel_type: form.fuel_type.trim() || vehicle.fuel_type,
        year_manufacture: form.year_manufacture ? Number(form.year_manufacture) : null,
        year_model: form.year_model ? Number(form.year_model) : null,
        chassis_last6: form.chassis_last6.trim() || null,
        status: form.status,
      }),
    onSuccess: () => {
      toast.success("Veículo atualizado");
      qc.invalidateQueries({ queryKey: ["frota", "vehicles"] });
      setOpen(false);
    },
    onError: (e: any) =>
      toast.error(
        e?.code === "23505"
          ? "Já existe um veículo com essa placa ou prefixo."
          : "Não foi possível salvar. Verifique sua permissão no módulo de frota.",
      ),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Pencil className="size-4" /> Editar veículo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {vehicle.prefix}</DialogTitle>
          <DialogDescription>
            Placa aceita o formato antigo (ABC-1234) e Mercosul (ABC1D23).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="veic-placa">Placa</Label>
            <Input
              id="veic-placa"
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: maskPlateInput(e.target.value) }))}
              placeholder="ABC-1234 ou ABC1D23"
              className="font-mono uppercase tracking-widest"
              autoComplete="off"
            />
            {!plateOk && (
              <p className="mt-1 text-xs text-rose-400">
                Placa inválida. Use ABC-1234 ou ABC1D23.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="veic-marca">Marca</Label>
            <Input
              id="veic-marca"
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="veic-modelo">Modelo</Label>
            <Input
              id="veic-modelo"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="veic-versao">Versão</Label>
            <Input
              id="veic-versao"
              value={form.version}
              onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="veic-cor">Cor</Label>
            <Input
              id="veic-cor"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              placeholder="Branco, prata, azul…"
            />
          </div>
          <div>
            <Label htmlFor="veic-comb">Combustível</Label>
            <Input
              id="veic-comb"
              value={form.fuel_type}
              onChange={(e) => setForm((f) => ({ ...f, fuel_type: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="veic-chassi">Chassi (6 finais)</Label>
            <Input
              id="veic-chassi"
              value={form.chassis_last6}
              maxLength={6}
              onChange={(e) =>
                setForm((f) => ({ ...f, chassis_last6: e.target.value.toUpperCase() }))
              }
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="veic-anofab">Ano fabricação</Label>
            <Input
              id="veic-anofab"
              inputMode="numeric"
              value={form.year_manufacture}
              onChange={(e) =>
                setForm((f) => ({ ...f, year_manufacture: e.target.value.replace(/\D/g, "").slice(0, 4) }))
              }
            />
          </div>
          <div>
            <Label htmlFor="veic-anomod">Ano modelo</Label>
            <Input
              id="veic-anomod"
              inputMode="numeric"
              value={form.year_model}
              onChange={(e) =>
                setForm((f) => ({ ...f, year_model: e.target.value.replace(/\D/g, "").slice(0, 4) }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as VehicleStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VEHICLE_STATUS_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!plateOk || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
