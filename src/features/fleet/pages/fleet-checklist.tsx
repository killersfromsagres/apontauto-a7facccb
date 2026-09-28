import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlateBadge } from "@/components/frota/plate-badge";
import { BrandMark, inferBrand } from "@/components/frota/brand-mark";
import { cn } from "@/lib/utils";
import {
  CHECKLIST_TEMPLATES,
  attachChecklistPhotos,
  createFleetChecklist,
  listFleetVehicles,
  vehicleTitle,
  type ChecklistDamage,
  type ChecklistItemResult,
  type FleetVehicle,
} from "@/features/fleet/api";
import {
  CHECKLIST_GROUPS,
  PHOTO_CATEGORIES,
  STATUS_LABEL,
  STATUS_TONE,
  overallFrom,
} from "@/features/fleet/checklist-items";
import { removePhoto, uploadChecklistPhoto } from "@/features/fleet/photos";

type LocalPhoto = {
  id: string;
  category: string;
  preview: string;
  file: Blob;
  filename: string;
  path: string | null;
  state: "enviando" | "pronto" | "erro";
};

const STATUSES = ["ok", "nok"] as const;
const DAMAGE_OPTIONS: Array<{ type: ChecklistDamage["type"]; symbol: string; label: string }> = [
  { type: "batido", symbol: "[X]", label: "Batido" },
  { type: "riscado", symbol: "[ ]", label: "Riscado" },
  { type: "amassado", symbol: "[O]", label: "Amassado" },
  { type: "quebrado", symbol: "[*]", label: "Quebrado" },
  { type: "barulho", symbol: "[B]", label: "Barulho" },
];

function todayInput() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function FleetChecklist() {
  const qc = useQueryClient();
  const vehiclesQ = useQuery({ queryKey: ["fleet", "vehicles"], queryFn: listFleetVehicles });

  const [vehicleId, setVehicleId] = useState("");
  const [inspectionDate, setInspectionDate] = useState(todayInput());
  const [driver, setDriver] = useState("");
  const [sector, setSector] = useState("");
  const [unit, setUnit] = useState("");
  const [kmInitial, setKmInitial] = useState("");
  const [kmFinal, setKmFinal] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [inspector, setInspector] = useState("");
  const [fuel, setFuel] = useState(50);
  const [notes, setNotes] = useState("");
  const [damageDescription, setDamageDescription] = useState("");
  const [damageTypes, setDamageTypes] = useState<ChecklistDamage["type"][]>([]);
  const [answers, setAnswers] = useState<Record<string, "ok" | "nok">>({});
  const [itemObservations, setItemObservations] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCategory = useRef("frente");

  const vehicles = vehiclesQ.data ?? [];
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const allItems = useMemo(() => CHECKLIST_GROUPS.flatMap((g) => g.items), []);
  const answered = allItems.filter((i) => answers[i.key]).length;
  const progress = Math.round((answered / allItems.length) * 100);
  const uploading = photos.some((p) => p.state === "enviando");

  useEffect(() => {
    if (!vehicle) return;
    setSector(vehicle.sector_default ?? "");
    setUnit(vehicle.unit ?? "");
    setKmInitial(String(Math.round(Number(vehicle.current_odometer_km) || 0)));
  }, [vehicleId]);

  function openPicker(category: string) {
    pendingCategory.current = category;
    inputRef.current?.click();
  }

  async function startUpload(local: LocalPhoto) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === local.id ? { ...p, state: "enviando", path: null } : p)),
    );
    try {
      const path = await uploadChecklistPhoto(local.file, local.filename);
      setPhotos((prev) =>
        prev.map((p) => (p.id === local.id ? { ...p, path, state: "pronto" } : p)),
      );
    } catch (err: any) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === local.id ? { ...p, state: "erro" } : p)),
      );
      toast.error(err?.message ?? "Falha ao enviar a foto. Toque em tentar novamente.");
    }
  }

  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const category = pendingCategory.current;
    const added: LocalPhoto[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      preview: URL.createObjectURL(file),
      file,
      filename: file.name || "foto",
      path: null,
      state: "enviando",
    }));
    setPhotos((prev) => [...prev, ...added]);
    added.forEach((p) => void startUpload(p));
    if (inputRef.current) inputRef.current.value = "";
  }

  function dropPhoto(photo: LocalPhoto) {
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    URL.revokeObjectURL(photo.preview);
    if (photo.path) void removePhoto(photo.path);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!vehicle) throw new Error("Selecione o veículo.");

      const items: ChecklistItemResult[] = allItems.map((item) => ({
        key: item.key,
        label: item.label,
        status: answers[item.key] ?? "ok",
        observation: itemObservations[item.key]?.trim() || null,
      }));
      const damages: ChecklistDamage[] = damageTypes.map((type) => ({
        type,
        description: damageDescription.trim() || null,
      }));

      const initial = Number(kmInitial);
      const final = kmFinal ? Number(kmFinal) : null;
      const odometer = final && final > 0 ? final : initial;

      const id = await createFleetChecklist({
        vehicle_id: vehicle.id,
        template_code: vehicle.checklist_template_code,
        kind: arrivalTime || final ? "retorno" : "saida",
        inspection_date: inspectionDate,
        driver_name: driver.trim(),
        sector: sector.trim() || null,
        unit: unit.trim() || null,
        odometer_km: odometer,
        odometer_initial_km: initial || null,
        odometer_final_km: final,
        fuel_level_pct: fuel,
        itinerary_destination: itinerary.trim() || null,
        departure_time: departureTime || null,
        arrival_time: arrivalTime || null,
        inspector_name: inspector.trim() || null,
        items,
        damages,
        overall_status: overallFrom(items.map((i) => i.status)),
        notes: notes.trim() || null,
      });

      await attachChecklistPhotos(
        id,
        photos
          .filter((p) => p.path)
          .map((p) => ({ category: p.category, storage_path: p.path as string })),
      );
    },
    onSuccess: () => {
      toast.success("Checklist registrado. O certificado selecionado do veículo está pronto no histórico.");
      setAnswers({});
      setItemObservations({});
      setDamageTypes([]);
      setDamageDescription("");
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setNotes("");
      setKmFinal("");
      setItinerary("");
      setDepartureTime("");
      setArrivalTime("");
      setInspector("");
      void qc.invalidateQueries({ queryKey: ["fleet", "checklists"] });
      void qc.invalidateQueries({ queryKey: ["fleet", "vehicles"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Não foi possível salvar o checklist."),
  });

  function submit() {
    if (!vehicle) return toast.warning("Selecione o veículo.");
    if (!driver.trim()) return toast.warning("Informe o motorista.");
    if (!inspectionDate) return toast.warning("Informe a data.");
    if (!kmInitial || Number(kmInitial) < 0) return toast.warning("Informe o KM inicial.");
    if (kmFinal && Number(kmFinal) < Number(kmInitial)) {
      return toast.warning("O KM final não pode ser menor que o KM inicial.");
    }
    if (!inspector.trim()) return toast.warning("Informe o responsável pela inspeção.");
    if (answered < allItems.length) return toast.warning("Responda todos os 12 itens do checklist.");
    if (uploading) return toast.warning("Aguarde o envio das fotos terminar.");
    save.mutate();
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      <div className="sticky top-2 z-20 rounded-2xl border border-border/60 bg-background/90 px-3 py-2 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 text-xs font-medium">
          <span className="truncate">
            {vehicle ? `${vehicle.prefix} · ${vehicle.plate ?? "sem placa"}` : "Selecione o veículo"}
          </span>
          <span className="shrink-0 text-muted-foreground">{answered}/12 itens</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/60">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <GlassCard className="space-y-3">
        <SectionTitle step={1} title="Veículo e certificado" />
        {vehiclesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando veículos…</p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado. Cadastre na aba “Veículos”.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleOption key={v.id} vehicle={v} selected={v.id === vehicleId} onSelect={() => setVehicleId(v.id)} />
            ))}
          </div>
        )}
        {vehicle && (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-xs">
            <span className="font-semibold">Certificado:</span>{" "}
            {CHECKLIST_TEMPLATES[vehicle.checklist_template_code]}
          </div>
        )}
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionTitle step={2} title="Dados da inspeção" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Data *"><Input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} /></Field>
          <Field label="Motorista *"><Input value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Nome do motorista" /></Field>
          <Field label="Setor"><Input value={sector} onChange={(e) => setSector(e.target.value)} /></Field>
          <Field label="Unidade"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
          <Field label="Placa do veículo"><Input value={vehicle?.plate ?? ""} disabled /></Field>
          <Field label="Marca / Modelo"><Input value={vehicle ? vehicleTitle(vehicle) : ""} disabled /></Field>
          <Field label="KM Inicial *"><Input inputMode="numeric" value={kmInitial} onChange={(e) => setKmInitial(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="KM Final"><Input inputMode="numeric" value={kmFinal} onChange={(e) => setKmFinal(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Horário de Saída"><Input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} /></Field>
          <Field label="Horário de Chegada"><Input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} /></Field>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Itinerário / Destino</Label>
            <Input value={itinerary} onChange={(e) => setItinerary(e.target.value)} placeholder="Informe o itinerário ou destino" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Responsável pela Inspeção *</Label>
            <Input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="Nome do responsável" />
          </div>
          <Field label={`Nível de combustível: ${fuel}%`}>
            <input type="range" min={0} max={100} step={5} value={fuel} onChange={(e) => setFuel(Number(e.target.value))} className="h-11 w-full accent-primary" />
          </Field>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionTitle step={3} title="Avarias / Inspeção Visual" />
        <p className="text-xs text-muted-foreground">
          Assinale os tipos identificados. O certificado manterá a legenda oficial da imagem de referência.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {DAMAGE_OPTIONS.map((option) => {
            const selected = damageTypes.includes(option.type);
            return (
              <button
                key={option.type}
                type="button"
                onClick={() =>
                  setDamageTypes((current) =>
                    selected ? current.filter((x) => x !== option.type) : [...current, option.type],
                  )
                }
                className={cn(
                  "rounded-xl border px-3 py-3 text-left text-sm",
                  selected ? "border-primary/60 bg-primary/10" : "border-border/60 bg-background/40",
                )}
              >
                <span className="font-mono font-bold">{option.symbol}</span>{" "}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        <Textarea
          rows={2}
          value={damageDescription}
          onChange={(e) => setDamageDescription(e.target.value)}
          placeholder="Descreva os locais e detalhes das avarias, quando houver."
        />
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionTitle step={4} title="Check List de Itens" hint={`${answered}/12`} />
        {allItems.map((item, index) => (
          <div key={item.key} className="rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1 text-sm">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                {item.label}
              </span>
              <div className="grid grid-cols-2 gap-1.5 sm:w-[210px]">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [item.key]: status }))}
                    className={cn(
                      "h-10 rounded-lg border text-xs font-semibold",
                      answers[item.key] === status
                        ? cn(STATUS_TONE[status], "shadow-elegant ring-1 ring-primary/20")
                        : "border-border/60 text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>
            <Input
              className="mt-2 h-9 text-xs"
              value={itemObservations[item.key] ?? ""}
              onChange={(e) => setItemObservations((current) => ({ ...current, [item.key]: e.target.value }))}
              placeholder="Observação deste item (opcional)"
            />
          </div>
        ))}
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionTitle step={5} title="Fotos" hint={`${photos.filter((p) => p.path).length} enviadas`} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {PHOTO_CATEGORIES.map((category) => {
            const shots = photos.filter((p) => p.category === category.key);
            const cover = shots[shots.length - 1];
            const pending = shots.some((p) => p.state === "enviando");
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => openPicker(category.key)}
                className="photo-tile group relative aspect-square overflow-hidden rounded-2xl border border-dashed border-border/70 bg-background/40"
              >
                {cover ? (
                  <img src={cover.preview} alt={category.label} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center"><Camera className="h-6 w-6 text-muted-foreground/70" /></span>
                )}
                <span className={cn("absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px]", cover ? "bg-black/55 text-white" : "text-muted-foreground")}>{category.label}</span>
                {pending && <Loader2 className="absolute left-1 top-1 h-4 w-4 animate-spin text-white" />}
              </button>
            );
          })}
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((photo) => (
              <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl border">
                <img src={photo.preview} alt={photo.category} className="h-full w-full object-cover" />
                <button type="button" onClick={() => dropPhoto(photo)} className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white"><X className="h-3.5 w-3.5" /></button>
                {photo.state === "erro" && (
                  <button type="button" onClick={() => void startUpload(photo)} className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded bg-black/60 py-1 text-[10px] text-amber-300"><RefreshCw className="h-3 w-3" /> reenviar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="space-y-3">
        <SectionTitle step={6} title="Observações" />
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações gerais do certificado." />
        <Button className="h-12 w-full shadow-elegant sm:w-auto" onClick={submit} loading={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Salvar checklist
        </Button>
      </GlassCard>
    </div>
  );
}

function SectionTitle({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{step}</span>
        <h3 className="font-display text-base font-semibold">{title}</h3>
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function VehicleOption({ vehicle, selected, onSelect }: { vehicle: FleetVehicle; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left",
        selected ? "border-primary/60 bg-primary/10 shadow-elegant" : "border-border/60 bg-background/40 hover:border-primary/30",
      )}
    >
      <PlateBadge plate={vehicle.plate} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-sm font-semibold"><BrandMark brand={inferBrand(`${vehicle.brand} ${vehicle.model}`)} />{vehicle.prefix}</p>
        <p className="truncate text-xs text-muted-foreground">{vehicleTitle(vehicle)}</p>
        <p className="mt-1 truncate text-[10px] text-muted-foreground">{CHECKLIST_TEMPLATES[vehicle.checklist_template_code]}</p>
      </div>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
