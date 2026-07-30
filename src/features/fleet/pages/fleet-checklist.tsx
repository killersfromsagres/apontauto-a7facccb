import { useMemo, useRef, useState } from "react";
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
  attachChecklistPhotos,
  createFleetChecklist,
  listFleetVehicles,
  vehicleTitle,
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

const STATUSES: ("ok" | "atencao" | "critico")[] = ["ok", "atencao", "critico"];

export function FleetChecklist() {
  const qc = useQueryClient();
  const vehiclesQ = useQuery({ queryKey: ["fleet", "vehicles"], queryFn: listFleetVehicles });

  const [vehicleId, setVehicleId] = useState<string>("");
  const [kind, setKind] = useState<"saida" | "retorno">("saida");
  const [driver, setDriver] = useState("");
  const [odometer, setOdometer] = useState("");
  const [fuel, setFuel] = useState(50);
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, "ok" | "atencao" | "critico">>({});
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCategory = useRef<string>("frente");

  const vehicles = vehiclesQ.data ?? [];
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  const allItems = useMemo(() => CHECKLIST_GROUPS.flatMap((g) => g.items), []);
  const answered = allItems.filter((i) => answers[i.key]).length;
  const progress = Math.round((answered / allItems.length) * 100);
  const uploading = photos.some((p) => p.state === "enviando");

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
      setPhotos((prev) => prev.map((p) => (p.id === local.id ? { ...p, path, state: "pronto" } : p)));
    } catch (err: any) {
      setPhotos((prev) => prev.map((p) => (p.id === local.id ? { ...p, state: "erro" } : p)));
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
      const items: ChecklistItemResult[] = allItems.map((i) => ({
        key: i.key,
        label: i.label,
        status: answers[i.key] ?? "ok",
      }));
      const id = await createFleetChecklist({
        vehicle_id: vehicleId,
        kind,
        driver_name: driver.trim(),
        odometer_km: Number(odometer),
        fuel_level_pct: fuel,
        items,
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
      toast.success("Checklist registrado com as fotos no histórico.");
      setAnswers({});
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setNotes("");
      setOdometer("");
      void qc.invalidateQueries({ queryKey: ["fleet", "checklists"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Não foi possível salvar o checklist."),
  });

  function submit() {
    if (!vehicleId) return toast.warning("Selecione o veículo.");
    if (!driver.trim()) return toast.warning("Informe o condutor.");
    if (!odometer || Number(odometer) <= 0) return toast.warning("Informe a quilometragem.");
    if (answered < allItems.length) return toast.warning("Responda todos os itens do checklist.");
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

      {/* Barra de progresso fixa */}
      <div className="sticky top-2 z-20 rounded-2xl border border-border/60 bg-background/80 px-3 py-2 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 text-xs font-medium">
          <span className="truncate">
            {vehicle ? `${vehicle.prefix} · ${vehicle.plate}` : "Selecione o veículo"}
          </span>
          <span className="shrink-0 text-muted-foreground">
            {answered}/{allItems.length} itens · {photos.filter((p) => p.path).length} fotos
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>



      {/* 1. Veículo */}
      <GlassCard className="space-y-3">
        <SectionTitle step={1} title="Veículo" />
        {vehiclesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando veículos…</p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum veículo cadastrado. Cadastre na aba “Veículos”.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <VehicleOption
                key={v.id}
                vehicle={v}
                selected={v.id === vehicleId}
                onSelect={() => {
                  setVehicleId(v.id);
                  if (!odometer) setOdometer(String(Math.round(Number(v.current_odometer_km) || 0)));
                }}
              />
            ))}
          </div>
        )}
      </GlassCard>

      {/* 2. Dados */}
      <GlassCard className="space-y-4">
        <SectionTitle step={2} title="Dados da vistoria" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["saida", "retorno"] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant={kind === k ? "default" : "outline"}
                  className="h-11"
                  onClick={() => setKind(k)}
                >
                  {k === "saida" ? "Saída" : "Retorno"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="driver">Condutor</Label>
            <Input
              id="driver"
              className="h-11"
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              placeholder="Nome do condutor"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="odo">Quilometragem (km)</Label>
            <Input
              id="odo"
              className="h-11"
              inputMode="numeric"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))}
              placeholder="Ex.: 84520"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fuel">Nível de combustível: {fuel}%</Label>
            <input
              id="fuel"
              type="range"
              min={0}
              max={100}
              step={5}
              value={fuel}
              onChange={(e) => setFuel(Number(e.target.value))}
              className="h-11 w-full accent-primary"
            />
          </div>
        </div>
      </GlassCard>

      {/* 3. Itens */}
      <GlassCard className="space-y-4">
        <SectionTitle step={3} title="Itens verificados" hint={`${answered}/${allItems.length}`} />
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        {CHECKLIST_GROUPS.map((group) => (
          <div key={group.key} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            {group.items.map((item) => (
              <div
                key={item.key}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-background/40 p-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 break-words text-sm">
                  {item.label}
                  {item.critical && <span className="ml-1 text-xs text-rose-500">•</span>}
                </span>
                <div className="grid grid-cols-3 gap-1.5 sm:w-[280px]">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAnswers((a) => ({ ...a, [item.key]: s }))}
                      className={cn(
                        "tap-press h-10 rounded-lg border text-xs font-medium",
                        answers[item.key] === s
                          ? cn(STATUS_TONE[s], "shadow-elegant ring-1 ring-primary/20")
                          : "border-border/60 text-muted-foreground hover:border-primary/30 hover:bg-muted/50",
                      )}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>

              </div>
            ))}
          </div>
        ))}
      </GlassCard>

      {/* 4. Fotos */}
      <GlassCard className="space-y-4">
        <SectionTitle
          step={4}
          title="Fotos"
          hint={`${photos.filter((p) => p.path).length}/${photos.length || 0} enviadas`}
        />
        <p className="text-xs text-muted-foreground">
          Toque no quadrado da área desejada para fotografar. A imagem aparece na hora e sobe em
          segundo plano, sem sair da sua conta.
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {PHOTO_CATEGORIES.map((c) => {
            const shots = photos.filter((p) => p.category === c.key);
            const cover = shots[shots.length - 1];
            const pending = shots.some((p) => p.state === "enviando");
            const failed = shots.some((p) => p.state === "erro");
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => openPicker(c.key)}
                aria-label={`Adicionar foto: ${c.label}`}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-2xl border text-left transition active:scale-[0.97]",
                  shots.length
                    ? "border-primary/50 shadow-elegant"
                    : "border-dashed border-border/70 bg-background/40 hover:bg-muted/40",
                )}
              >
                {cover ? (
                  <img
                    src={cover.preview}
                    alt={c.label}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Camera className="h-6 w-6 text-muted-foreground/70 transition group-hover:text-primary" />
                  </span>
                )}
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px] font-medium leading-tight",
                    cover ? "bg-black/55 text-white" : "text-muted-foreground",
                  )}
                >
                  {c.label}
                </span>
                {shots.length > 0 && (
                  <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {shots.length}
                  </span>
                )}
                {pending && (
                  <span className="absolute left-1 top-1 rounded-full bg-black/55 p-1">
                    <Loader2 className="h-3 w-3 animate-spin text-white" />
                  </span>
                )}
                {failed && !pending && (
                  <span className="absolute left-1 top-1 rounded-full bg-rose-500 p-1">
                    <RefreshCw className="h-3 w-3 text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {photos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evidências anexadas
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/30"
                >
                  <img src={p.preview} alt={p.category} className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 bg-black/45 px-1.5 py-1 text-[10px] text-white">
                    <span className="truncate">
                      {PHOTO_CATEGORIES.find((c) => c.key === p.category)?.label ?? p.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => dropPhoto(p)}
                      aria-label="Remover foto"
                      className="shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/45 py-1 text-[10px] text-white">
                    {p.state === "enviando" && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> enviando
                      </>
                    )}
                    {p.state === "pronto" && (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" /> pronta
                      </>
                    )}
                    {p.state === "erro" && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-amber-300"
                        onClick={() => void startUpload(p)}
                      >
                        <RefreshCw className="h-3 w-3" /> tentar novamente
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>


      {/* 5. Observações e envio */}
      <GlassCard className="space-y-3">
        <SectionTitle step={5} title="Observações" />
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Avarias, ruídos, pendências…"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {vehicle && (
              <Badge variant="outline" className="gap-1">
                <BrandMark brand={inferBrand(`${vehicle.brand} ${vehicle.model}`)} />
                {vehicle.prefix} · {vehicleTitle(vehicle)}
              </Badge>
            )}
            {uploading && <span>Enviando fotos…</span>}
          </div>
          <Button className="h-12 w-full sm:w-auto" onClick={submit} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Salvar checklist
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

function SectionTitle({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {step}
        </span>
        <h3 className="font-display text-base font-semibold">{title}</h3>
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function VehicleOption({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: FleetVehicle;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition",
        selected
          ? "border-primary/60 bg-primary/10"
          : "border-border/60 bg-background/40 hover:bg-muted/40",
      )}
    >
      <PlateBadge plate={vehicle.plate} size="sm" />
      <div className="min-w-0">
        <p className="flex items-center gap-1 truncate text-sm font-semibold">
          <BrandMark brand={inferBrand(`${vehicle.brand} ${vehicle.model}`)} />
          {vehicle.prefix}
        </p>
        <p className="truncate text-xs text-muted-foreground">{vehicleTitle(vehicle)}</p>
      </div>
      {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

