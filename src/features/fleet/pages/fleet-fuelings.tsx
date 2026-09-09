import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock3,
  FileDown,
  Fuel,
  Gauge,
  Loader2,
  Paperclip,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  type Fueling,
  type FuelingInput,
} from "@/features/fleet/api";
import {
  buildFuelingNotes,
  fuelingDateTimeLabel,
  parseFuelingNotes,
} from "@/features/fleet/fueling-meta";
import { removePhoto, signPhotoUrls, uploadChecklistPhoto } from "@/features/fleet/photos";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function localDateISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function localMonthISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function localTimeHHmm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function parseLocaleDecimal(value: string): number {
  const clean = value.trim().replace(/\s+/g, "");
  if (!clean) return Number.NaN;

  let normalized = clean;
  if (clean.includes(",")) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  }
  normalized = normalized.replace(/[^0-9.-]/g, "");
  return Number(normalized);
}

function decimalInput(value: string) {
  return value.replace(/[^0-9.,]/g, "").slice(0, 18);
}

const EMPTY = (): FuelingInput => ({
  vehicle_id: "",
  fueled_at: localDateISO(),
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
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const vehiclesQ = useQuery({ queryKey: ["fleet", "vehicles"], queryFn: listFleetVehicles });
  const fuelingsQ = useQuery({ queryKey: ["fleet", "fuelings"], queryFn: () => listFuelings() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FuelingInput>(EMPTY());
  const [fuelTime, setFuelTime] = useState(localTimeHHmm());
  const [litersInput, setLitersInput] = useState("");
  const [costInput, setCostInput] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  const vehicles = vehiclesQ.data ?? [];
  const rows = fuelingsQ.data ?? [];
  const vehicleById = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v])), [vehicles]);
  const visibleRows = useMemo(
    () => (vehicleFilter ? rows.filter((row) => row.vehicle_id === vehicleFilter) : rows),
    [rows, vehicleFilter],
  );
  const selectedVehicle = vehicleFilter ? vehicleById[vehicleFilter] : undefined;

  const month = localMonthISO();
  const kpis = useMemo(() => {
    const inMonth = visibleRows.filter((r) => r.fueled_at.slice(0, 7) === month);
    const cost = inMonth.reduce((s, r) => s + r.total_cost, 0);
    const liters = inMonth.reduce((s, r) => s + r.liters, 0);
    return {
      cost,
      liters,
      avg: liters > 0 ? cost / liters : 0,
      count: inMonth.length,
    };
  }, [visibleRows, month]);

  const receiptPaths = useMemo(
    () =>
      Array.from(
        new Set(
          visibleRows
            .map((row) => parseFuelingNotes(row.notes).meta.receiptPath)
            .filter((path): path is string => Boolean(path)),
        ),
      ),
    [visibleRows],
  );

  const receiptUrlsQ = useQuery({
    queryKey: ["fleet", "fueling-receipt-urls", receiptPaths],
    queryFn: () => signPhotoUrls(receiptPaths),
    enabled: receiptPaths.length > 0,
    staleTime: 45 * 60 * 1000,
  });
  const receiptUrls = receiptUrlsQ.data ?? {};

  function resetForm() {
    setForm(EMPTY());
    setFuelTime(localTimeHHmm());
    setLitersInput("");
    setCostInput("");
    setReceiptFile(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
  }

  const save = useMutation({
    mutationFn: async ({
      input,
      time,
      file,
    }: {
      input: FuelingInput;
      time: string;
      file: File | null;
    }) => {
      let receiptPath: string | undefined;

      try {
        if (file) {
          const safeTime = time.replace(":", "");
          receiptPath = await uploadChecklistPhoto(
            file,
            `comprovante-${input.vehicle_id}-${input.fueled_at}-${safeTime}-${file.name}`,
          );
        }

        await createFueling({
          ...input,
          notes: buildFuelingNotes(
            {
              time,
              receiptPath,
              receiptName: file?.name,
            },
            input.notes,
          ),
        });
      } catch (error) {
        if (receiptPath) await removePhoto(receiptPath).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Abastecimento registrado com sucesso.");
      setOpen(false);
      resetForm();
      void qc.invalidateQueries({ queryKey: ["fleet", "fuelings"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Não foi possível registrar o abastecimento."),
  });

  const remove = useMutation({
    mutationFn: async (row: Fueling) => {
      await deleteFueling(row.id);
      const receiptPath = parseFuelingNotes(row.notes).meta.receiptPath;
      if (receiptPath) await removePhoto(receiptPath).catch(() => undefined);
    },
    onSuccess: () => {
      toast.success("Registro excluído.");
      void qc.invalidateQueries({ queryKey: ["fleet", "fuelings"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Sem permissão para excluir."),
  });

  function submit() {
    const liters = parseLocaleDecimal(litersInput);
    const totalCost = parseLocaleDecimal(costInput);

    if (!form.vehicle_id) return toast.warning("Selecione o veículo.");
    if (!form.fueled_at) return toast.warning("Informe a data do abastecimento.");
    if (!fuelTime) return toast.warning("Informe o horário do abastecimento.");
    if (!Number.isFinite(liters) || liters <= 0) return toast.warning("Informe os litros corretamente.");
    if (!Number.isFinite(totalCost) || totalCost <= 0)
      return toast.warning("Informe o valor total corretamente.");

    save.mutate({
      time: fuelTime,
      file: receiptFile,
      input: {
        ...form,
        liters,
        total_cost: totalCost,
        driver_name: form.driver_name?.trim() || null,
        station: form.station?.trim() || null,
        invoice_number: form.invoice_number?.trim() || null,
        payment_method: form.payment_method?.trim() || null,
        notes: form.notes?.trim() || null,
      },
    });
  }

  async function exportPdf() {
    if (visibleRows.length === 0) return toast.info("Não há abastecimentos para exportar.");
    setExporting(true);
    try {
      const { exportFuelingsPdf } = await import("@/features/fleet/fuelings-export");
      exportFuelingsPdf({
        rows: visibleRows,
        vehicles,
        filterLabel: selectedVehicle
          ? `${selectedVehicle.prefix} · ${selectedVehicle.plate ?? "sem placa"} · ${vehicleTitle(selectedVehicle)}`
          : "Toda a frota",
      });
      toast.success("Relatório PDF gerado.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o relatório PDF.");
    } finally {
      setExporting(false);
    }
  }

  function openReceipt(url: string) {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) popup.opener = null;
  }

  return (
    <div className="fleet-fuelings space-y-4">
      <div className="fleet-fuelings-toolbar">
        <div className="fleet-filter-control space-y-1.5">
          <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Veículo no painel e no relatório
          </Label>
          <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}>
            <option value="">Toda a frota</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.prefix} · {vehicle.plate ?? "sem placa"} · {vehicleTitle(vehicle)}
              </option>
            ))}
          </select>
        </div>

        <div className="fleet-toolbar-actions">
          <Button
            type="button"
            variant="outline"
            className="fleet-action-secondary"
            disabled={exporting || visibleRows.length === 0}
            onClick={() => void exportPdf()}
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Exportar PDF
          </Button>

          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next && !save.isPending) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="fleet-action-primary">
                <Plus className="mr-2 h-4 w-4" /> Registrar abastecimento
              </Button>
            </DialogTrigger>

            <DialogContent className="fleet-fueling-dialog max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo abastecimento</DialogTitle>
                <p className="text-xs leading-relaxed text-slate-400">
                  Registre os dados financeiros, horário e comprovante do abastecimento.
                </p>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Veículo *</Label>
                  <select
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

                <Field
                  label="Data do abastecimento *"
                  type="date"
                  value={form.fueled_at}
                  onChange={(value) => setForm({ ...form, fueled_at: value })}
                />
                <Field
                  label="Horário *"
                  type="time"
                  value={fuelTime}
                  onChange={setFuelTime}
                />

                <Field
                  label="Litros *"
                  value={litersInput}
                  inputMode="decimal"
                  placeholder="Ex.: 42,750"
                  onChange={(value) => setLitersInput(decimalInput(value))}
                />
                <Field
                  label="Valor total (R$) *"
                  value={costInput}
                  inputMode="decimal"
                  placeholder="Ex.: 257,90"
                  onChange={(value) => setCostInput(decimalInput(value))}
                />

                <Field
                  label="Hodômetro (km)"
                  value={String(form.odometer_km || "")}
                  inputMode="numeric"
                  placeholder="Ex.: 48520"
                  onChange={(value) =>
                    setForm({ ...form, odometer_km: Number(value.replace(/\D/g, "")) || 0 })
                  }
                />
                <Field
                  label="Condutor"
                  value={form.driver_name ?? ""}
                  placeholder="Nome do condutor"
                  onChange={(value) => setForm({ ...form, driver_name: value })}
                />

                <div className="space-y-1.5">
                  <Label className="text-xs">Combustível</Label>
                  <select
                    value={form.fuel_type}
                    onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
                  >
                    {[
                      ["gasolina", "Gasolina"],
                      ["etanol", "Etanol"],
                      ["diesel", "Diesel"],
                      ["gnv", "GNV"],
                      ["arla", "ARLA"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Pagamento</Label>
                  <select
                    value={form.payment_method ?? "cartao"}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  >
                    {[
                      ["cartao", "Cartão"],
                      ["vale", "Vale"],
                      ["dinheiro", "Dinheiro"],
                      ["pix", "PIX"],
                      ["faturado", "Faturado"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <Field
                  label="Posto"
                  value={form.station ?? ""}
                  placeholder="Nome do posto"
                  onChange={(value) => setForm({ ...form, station: value })}
                />
                <Field
                  label="Nota fiscal / cupom"
                  value={form.invoice_number ?? ""}
                  placeholder="Número do documento"
                  onChange={(value) => setForm({ ...form, invoice_number: value })}
                />

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Comprovante do abastecimento</Label>
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                  />
                  <div className="fleet-receipt-upload">
                    <div className="fleet-receipt-upload-icon" aria-hidden>
                      <ReceiptText />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {receiptFile ? receiptFile.name : "Nenhuma foto anexada"}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                        Foto do cupom, nota ou comprovante. O arquivo fica vinculado a este abastecimento.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {receiptFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                          aria-label="Remover comprovante selecionado"
                          onClick={() => {
                            setReceiptFile(null);
                            if (receiptInputRef.current) receiptInputRef.current.value = "";
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="fleet-receipt-upload-button"
                        onClick={() => receiptInputRef.current?.click()}
                      >
                        <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                        {receiptFile ? "Trocar" : "Anexar foto"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Observações</Label>
                  <Textarea
                    rows={3}
                    value={form.notes ?? ""}
                    placeholder="Informações complementares sobre o abastecimento"
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button className="fleet-dialog-save h-11 w-full" disabled={save.isPending} onClick={submit}>
                  {save.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {save.isPending ? "Salvando…" : "Salvar abastecimento"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="fleet-fueling-kpis">
        <Kpi index={0} label="Gasto no mês" value={brl(kpis.cost)} />
        <Kpi index={1} label="Litros no mês" value={`${kpis.liters.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L`} />
        <Kpi index={2} label="Preço médio" value={kpis.avg ? `${brl(kpis.avg)}/L` : "—"} />
        <Kpi index={3} label="Abastecimentos" value={String(kpis.count)} />
      </div>

      {fuelingsQ.isLoading ? (
        <GlassCard className="border-slate-800/70 bg-slate-950/30 p-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando abastecimentos…
          </div>
        </GlassCard>
      ) : visibleRows.length === 0 ? (
        <GlassCard className="border-slate-800/70 bg-slate-950/30">
          <p className="text-sm text-muted-foreground">
            {vehicleFilter ? "Nenhum abastecimento encontrado para este veículo." : "Nenhum abastecimento registrado ainda."}
          </p>
        </GlassCard>
      ) : (
        <div className="fleet-fueling-list">
          {visibleRows.map((row, index) => {
            const vehicle = vehicleById[row.vehicle_id];
            const { meta, notes } = parseFuelingNotes(row.notes);
            const receiptUrl = meta.receiptPath ? receiptUrls[meta.receiptPath] : undefined;

            return (
              <GlassCard
                key={row.id}
                style={{ ["--i" as string]: Math.min(index, 8) } as CSSProperties}
                className="fleet-fueling-row fleet-in flex flex-col gap-3 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <PlateBadge plate={vehicle?.plate} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {vehicle ? `${vehicle.prefix} · ${vehicleTitle(vehicle)}` : "Veículo removido"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {fuelingDateTimeLabel(row.fueled_at, meta.time)} · {row.station || "posto não informado"}
                        {row.driver_name ? ` · ${row.driver_name}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className="fleet-fueling-meta-chip">
                      <Fuel /> {row.liters.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L
                    </span>
                    <span className="fleet-fueling-meta-chip">
                      <Gauge /> {Math.round(row.odometer_km).toLocaleString("pt-BR")} km
                    </span>
                    {meta.time && (
                      <span className="fleet-fueling-meta-chip">
                        <Clock3 /> {meta.time}
                      </span>
                    )}
                    {meta.receiptPath && (
                      <Button
                        type="button"
                        variant="outline"
                        className="fleet-receipt-link"
                        disabled={!receiptUrl}
                        onClick={() => receiptUrl && openReceipt(receiptUrl)}
                      >
                        <ReceiptText className="h-3.5 w-3.5" />
                        {receiptUrl ? "Comprovante" : "Carregando…"}
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 lg:ml-2">
                    <div className="min-w-[8.5rem] text-right">
                      <p className="text-base font-semibold tabular-nums text-slate-100">{brl(row.total_cost)}</p>
                      <p className="text-[11px] tabular-nums text-slate-500">
                        {row.liters ? `${brl(row.total_cost / row.liters)}/L` : ""}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="fleet-delete-action h-9 w-9 text-slate-500 hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Excluir abastecimento"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm("Excluir este abastecimento? Esta ação também removerá o comprovante anexado.")) {
                          remove.mutate(row);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {(row.invoice_number || row.payment_method || notes) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800/70 pt-2.5 text-[11px] text-slate-500">
                    {row.payment_method && <span>Pagamento: {row.payment_method}</span>}
                    {row.invoice_number && <span>Documento: {row.invoice_number}</span>}
                    {notes && <span className="min-w-0 flex-1 truncate">Observação: {notes}</span>}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, index = 0 }: { label: string; value: string; index?: number }) {
  return (
    <GlassCard
      variant="block"
      className="fleet-fueling-kpi fleet-in space-y-1 p-3.5 sm:p-4"
      style={{ ["--i" as string]: index } as CSSProperties}
    >
      <p className="fleet-fueling-kpi-label text-[10px] font-semibold uppercase">{label}</p>
      <p className="fleet-fueling-kpi-value text-lg tabular-nums sm:text-xl">{value}</p>
    </GlassCard>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "text" | "decimal" | "numeric";
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-11"
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
