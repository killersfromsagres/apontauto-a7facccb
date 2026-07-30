import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { VehicleCard3D } from "@/components/frota/vehicle-card-3d";
import { uploadFrotaPhoto } from "@/lib/frota/photo";
import { formatCpf, isValidCpf, normalizeCpf } from "@/lib/frota/cpf";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_TYPES,
  PHOTO_SLOTS,
  computeIntegrityScore,
  hasCriticalBlock,
  type ItemStatus,
  type Severity,
} from "@/lib/frota/checklist-catalog";
import { submitChecklist, vehicleLabel, type Vehicle } from "@/lib/frota/api";

/** Uma evidência fotográfica: preview local imediato + envio resiliente. */
type Photo = {
  id: string;
  file: File;
  preview: string;
  url: string | null;
  hash: string | null;
  status: "uploading" | "ok" | "error";
  error?: string;
};

type ItemState = {
  status: ItemStatus;
  severity: Severity;
  notes: string;
  photo: Photo | null;
};

const STEPS = ["Veículo", "Colaboradores", "Contexto", "Checklist", "Fotos", "Revisão"] as const;

const emptyItem = (): ItemState => ({
  status: "conforme",
  severity: "media",
  notes: "",
  photo: null,
});

const newId = () => Math.random().toString(36).slice(2);

/**
 * Miniatura tolerante à latência da CDN: mostra o arquivo local até a imagem
 * remota responder e volta para o local caso a remota falhe.
 */
function ResilientPhoto({ photo, className }: { photo: Photo; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState(false);
  const remote = photo.status === "ok" ? photo.url : null;
  const shown =
    !remote || broken
      ? photo.preview
      : attempt === 0
        ? remote
        : `${remote}${remote.includes("?") ? "&" : "?"}r=${attempt}`;
  return (
    <img
      src={shown}
      alt="Evidência do checklist"
      loading="lazy"
      className={className}
      onError={() => {
        if (remote && attempt < 3) {
          window.setTimeout(() => setAttempt((a) => a + 1), 600 * (attempt + 1));
        } else {
          setBroken(true);
        }
      }}
    />
  );
}



export function ChecklistWizard({ vehicles }: { vehicles: Vehicle[] }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);

  const [mainName, setMainName] = useState("");
  const [mainCpf, setMainCpf] = useState("");
  const [mainEmployeeId, setMainEmployeeId] = useState<string | null>(null);
  const [secondName, setSecondName] = useState("");
  const [secondCpf, setSecondCpf] = useState("");
  const [secondEmployeeId, setSecondEmployeeId] = useState<string | null>(null);

  const [checklistType, setChecklistType] = useState("pre_uso");
  const [odometer, setOdometer] = useState("");
  const [fuelLevel, setFuelLevel] = useState("50");
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [os, setOs] = useState("");
  const [notes, setNotes] = useState("");
  const [declaration, setDeclaration] = useState(false);

  const [items, setItems] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, emptyItem()])),
  );
  const [slotPhotos, setSlotPhotos] = useState<Record<string, Photo[]>>({});

  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const filled = useMemo(
    () =>
      CHECKLIST_ITEMS.map((def) => ({
        key: def.key,
        status: items[def.key].status,
        severity: items[def.key].severity,
      })),
    [items],
  );
  const score = computeIntegrityScore(filled);
  const critical = hasCriticalBlock(filled);
  const nonConform = CHECKLIST_ITEMS.filter((d) => items[d.key].status === "nao_conforme");

  const makePhoto = (file: File): Photo => ({
    id: newId(),
    file,
    preview: URL.createObjectURL(file),
    url: null,
    hash: null,
    status: "uploading",
  });

  /** Envia uma foto e reflete o resultado no estado, sem perder o preview. */
  async function runUpload(photo: Photo, apply: (patch: Partial<Photo>) => void) {
    apply({ status: "uploading", error: undefined });
    try {
      const { url, hash } = await uploadFrotaPhoto(photo.file, photo.file.name || "checklist.jpg", {
        module: "frota-checklist",
        entityType: "vehicle_checklist",
        entityId: vehicleId ?? undefined,
      });
      apply({ url, hash, status: "ok" });
    } catch (e: any) {
      apply({ status: "error", error: e?.message ?? "Falha ao enviar a foto" });
      toast.error(e?.message ?? "Falha ao enviar a foto");
    }
  }

  const patchSlotPhoto = (slot: string, id: string, patch: Partial<Photo>) =>
    setSlotPhotos((prev) => ({
      ...prev,
      [slot]: (prev[slot] ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  /** Aceita várias fotos de uma vez e envia em fila (mais estável no 4G). */
  function addSlotFiles(slot: string, files: File[]) {
    if (!files.length) return;
    const photos = files.map(makePhoto);
    setSlotPhotos((prev) => ({ ...prev, [slot]: [...(prev[slot] ?? []), ...photos] }));
    void (async () => {
      for (const p of photos) {
        await runUpload(p, (patch) => patchSlotPhoto(slot, p.id, patch));
      }
    })();
  }

  function retrySlotPhoto(slot: string, id: string) {
    const photo = (slotPhotos[slot] ?? []).find((p) => p.id === id);
    if (photo) void runUpload(photo, (patch) => patchSlotPhoto(slot, id, patch));
  }

  const patchItemPhoto = (key: string, id: string, patch: Partial<Photo>) =>
    setItems((prev) => {
      const current = prev[key].photo;
      if (!current || current.id !== id) return prev;
      return { ...prev, [key]: { ...prev[key], photo: { ...current, ...patch } } };
    });

  function setItemPhoto(key: string, file: File | null) {
    if (!file) {
      setItems((prev) => ({ ...prev, [key]: { ...prev[key], photo: null } }));
      return;
    }
    const photo = makePhoto(file);
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], photo } }));
    void runUpload(photo, (patch) => patchItemPhoto(key, photo.id, patch));
  }

  function retryItemPhoto(key: string) {
    const photo = items[key].photo;
    if (photo) void runUpload(photo, (patch) => patchItemPhoto(key, photo.id, patch));
  }

  const okPhotos = (key: string) => (slotPhotos[key] ?? []).filter((p) => p.status === "ok");
  const slotCount = (key: string) => okPhotos(key).length;
  const missingSlots = PHOTO_SLOTS.filter((s) => slotCount(s.key) === 0);
  const totalSlotPhotos = PHOTO_SLOTS.reduce((acc, s) => acc + slotCount(s.key), 0);
  const missingNcPhotos = nonConform.filter((d) => items[d.key].photo?.status !== "ok");
  const uploadingCount =
    PHOTO_SLOTS.reduce(
      (acc, s) => acc + (slotPhotos[s.key] ?? []).filter((p) => p.status === "uploading").length,
      0,
    ) + CHECKLIST_ITEMS.filter((d) => items[d.key].photo?.status === "uploading").length;


  const canAdvance = (() => {
    if (step === 0) return !!vehicleId;
    if (step === 1) return mainName.trim().length > 2 && isValidCpf(mainCpf);
    if (step === 2) return Number(odometer) > 0;
    if (step === 3) return missingNcPhotos.length === 0;
    if (step === 4) return missingSlots.length === 0;
    return declaration;
  })();

  const submit = useMutation({
    mutationFn: async () => {
      if (!vehicleId) throw new Error("Selecione o veículo.");
      const collaborators = [
        {
          fullName: mainName,
          cpf: mainCpf,
          role: "principal" as const,
          employeeId: mainEmployeeId,
        },
        ...(secondName.trim() && isValidCpf(secondCpf)
          ? [
              {
                fullName: secondName,
                cpf: secondCpf,
                role: "acompanhante" as const,
                employeeId: secondEmployeeId,
              },
            ]
          : []),
      ];
      const photos = [
        ...PHOTO_SLOTS.flatMap((s) =>
          okPhotos(s.key).map((p) => ({ slot: s.key as string, url: p.url!, hash: p.hash })),
        ),
        ...nonConform
          .filter((d) => items[d.key].photo?.status === "ok")
          .map((d) => ({
            slot: `nc_${d.key}`,
            url: items[d.key].photo!.url!,
            itemKey: d.key,
            hash: items[d.key].photo!.hash ?? null,
          })),
      ];

      return submitChecklist({
        vehicleId,
        checklistType,
        odometerKm: Number(odometer),
        fuelLevelPct: Number(fuelLevel),
        location,
        purpose,
        workOrderNumber: os,
        notes,
        declarationAccepted: declaration,
        collaborators,
        items: CHECKLIST_ITEMS.map((d) => ({
          key: d.key,
          label: d.label,
          category: d.category,
          status: items[d.key].status,
          severity: items[d.key].status === "nao_conforme" ? items[d.key].severity : null,
          notes: items[d.key].notes,
        })),
        photos,
      });
    },
    onSuccess: (res) => {
      setProtocol(res.protocol);
      qc.invalidateQueries({ queryKey: ["frota"] });
      toast.success(`Checklist enviado — protocolo ${res.protocol}`);
      if (res.critical) {
        toast.warning("Não conformidade crítica: veículo bloqueado aguardando avaliação.");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar o checklist"),
  });

  if (protocol) {
    return (
      <GlassCard className="space-y-4 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-emerald-400" />
        <h3 className="font-display text-xl font-bold">Checklist registrado</h3>
        <p className="text-sm text-muted-foreground">
          Protocolo <span className="font-mono text-primary">{protocol}</span> · score de
          integridade {score}/100
        </p>
        <Button
          className="min-h-[44px]"
          onClick={() => {
            setProtocol(null);
            setStep(0);
            setItems(Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, emptyItem()])));
            setSlotPhotos({});
            setDeclaration(false);
            setOdometer("");
          }}
        >
          Novo checklist
        </Button>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-widest text-primary">
            Etapa {step + 1}/{STEPS.length}
          </span>
          <span>{STEPS[step]}</span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
      </GlassCard>

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <VehicleCard3D
              key={v.id}
              vehicle={v}
              active={v.id === vehicleId}
              onSelect={(sel) => setVehicleId(sel.id)}
            />
          ))}
        </div>
      )}

      {step === 1 && (
        <GlassCard className="space-y-5">
          <CollaboratorFields
            title="Colaborador principal (obrigatório)"
            name={mainName}
            cpf={mainCpf}
            onName={setMainName}
            onCpf={setMainCpf}
            onEmployee={setMainEmployeeId}
          />
          <CollaboratorFields
            title="Segundo colaborador (opcional)"
            name={secondName}
            cpf={secondCpf}
            onName={setSecondName}
            onCpf={setSecondCpf}
            onEmployee={setSecondEmployeeId}
          />
        </GlassCard>
      )}

      {step === 2 && (
        <GlassCard className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo de checklist</Label>
            <Select value={checklistType} onValueChange={setChecklistType}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHECKLIST_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quilometragem (km)</Label>
            <Input
              inputMode="numeric"
              className="min-h-[44px] text-base"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))}
              placeholder={vehicle ? String(vehicle.current_odometer_km) : "0"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nível de combustível: {fuelLevel}%</Label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={fuelLevel}
              onChange={(e) => setFuelLevel(e.target.value)}
              className="h-2 w-full accent-primary"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input
              className="min-h-[44px] text-base"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Pátio, obra, cliente…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Finalidade / atividade</Label>
            <Input
              className="min-h-[44px] text-base"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>OS relacionada (opcional)</Label>
            <Input
              className="min-h-[44px] text-base"
              value={os}
              onChange={(e) => setOs(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observação geral</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </GlassCard>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map((def) => {
            const st = items[def.key];
            const set = (patch: Partial<ItemState>) =>
              setItems((prev) => ({ ...prev, [def.key]: { ...prev[def.key], ...patch } }));
            return (
              <GlassCard key={def.key} className="space-y-3 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{def.label}</p>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      {def.category}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {(
                      [
                        ["conforme", "OK"],
                        ["nao_conforme", "NC"],
                        ["nao_se_aplica", "N/A"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => set({ status: value })}
                        className={cn(
                          "min-h-[40px] min-w-[52px] rounded-xl border px-3 text-xs font-bold transition",
                          st.status === value
                            ? value === "conforme"
                              ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-200"
                              : value === "nao_conforme"
                                ? "border-rose-400/60 bg-rose-400/20 text-rose-200"
                                : "border-border bg-muted/40 text-muted-foreground"
                            : "border-border/50 text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {st.status === "nao_conforme" && (
                  <div className="space-y-2 rounded-2xl border border-rose-400/30 bg-rose-500/5 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(["baixa", "media", "alta", "critica"] as Severity[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set({ severity: s })}
                          className={cn(
                            "min-h-[36px] rounded-lg border px-3 text-xs capitalize",
                            st.severity === s
                              ? "border-primary/60 bg-primary/20 text-foreground"
                              : "border-border/50 text-muted-foreground",
                          )}
                        >
                          {s === "media" ? "média" : s === "critica" ? "crítica" : s}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="Descreva a não conformidade"
                      value={st.notes}
                      onChange={(e) => set({ notes: e.target.value })}
                    />
                    <PhotoField
                      label="Foto da não conformidade (obrigatória)"
                      photos={st.photo ? [st.photo] : []}
                      onFiles={(files) => setItemPhoto(def.key, files[0] ?? null)}
                      onRetry={() => retryItemPhoto(def.key)}
                      onRemove={() => setItemPhoto(def.key, null)}
                    />

                  </div>
                )}
              </GlassCard>
            );
          })}
          {missingNcPhotos.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-rose-300">
              <AlertTriangle className="h-4 w-4" /> Faltam fotos em {missingNcPhotos.length} não
              conformidade(s).
            </p>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <GlassCard className="flex flex-wrap items-center justify-between gap-2 p-3">
            <p className="text-sm font-semibold">
              Categorias com foto: {PHOTO_SLOTS.length - missingSlots.length}/{PHOTO_SLOTS.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalSlotPhotos} foto(s) capturada(s) no total
            </p>
          </GlassCard>
          {missingSlots.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-amber-300">
              <AlertTriangle className="h-4 w-4" /> Faltam fotos em:{" "}
              {missingSlots.map((s) => s.label).join(", ")}.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PHOTO_SLOTS.map((slot) => (
              <GlassCard key={slot.key} className="space-y-2 p-3">
                <PhotoField
                  label={`${slot.label} (${slotCount(slot.key)})`}
                  multiple
                  photos={slotPhotos[slot.key] ?? []}
                  onFiles={(files) => addSlotFiles(slot.key, files)}
                  onRetry={(id) => retrySlotPhoto(slot.key, id)}
                  onRemove={(id) =>
                    setSlotPhotos((prev) => ({
                      ...prev,
                      [slot.key]: (prev[slot.key] ?? []).filter((p) => p.id !== id),
                    }))
                  }
                />

              </GlassCard>
            ))}
          </div>
        </div>
      )}


      {step === 5 && (
        <GlassCard className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary
              label="Veículo"
              value={vehicle ? `${vehicle.prefix} · ${vehicleLabel(vehicle)}` : "—"}
            />
            <Summary label="Quilometragem" value={`${odometer || 0} km`} />
            <Summary label="Score de integridade" value={`${score}/100`} />
            <Summary label="Não conformidades" value={String(nonConform.length)} />
            <Summary
              label="Fotos obrigatórias"
              value={`${PHOTO_SLOTS.length - missingSlots.length}/${PHOTO_SLOTS.length} · ${totalSlotPhotos} foto(s)`}
            />
            <Summary label="Colaborador" value={mainName || "—"} />
          </div>

          {critical && (
            <div className="flex items-start gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Há não conformidade crítica: ao enviar, o veículo será bloqueado como “aguardando
              avaliação” até liberação do gestor de frota.
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/50 p-3">
            <Checkbox
              checked={declaration}
              onCheckedChange={(v) => setDeclaration(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground">
              Declaro que as informações e evidências deste checklist são verdadeiras e foram
              coletadas no momento da inspeção.
            </span>
          </label>

          <Button
            className="min-h-[48px] w-full"
            disabled={!declaration || submit.isPending || uploadingCount > 0}
            onClick={() => submit.mutate()}
          >
            {submit.isPending || uploadingCount > 0 ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {uploadingCount > 0
              ? `Enviando ${uploadingCount} foto(s)…`
              : "Enviar checklist e gerar protocolo"}
          </Button>

        </GlassCard>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="min-h-[44px] flex-1"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <Button
          className="min-h-[44px] flex-1"
          disabled={step === STEPS.length - 1 || !canAdvance}
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
        >
          Avançar <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 p-3">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function PhotoField({
  label,
  photos,
  multiple,
  onFiles,
  onRemove,
  onRetry,
}: {
  label: string;
  photos: Photo[];
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const busy = photos.some((p) => p.status === "uploading");
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {photos.length > 0 ? (
        <div className={cn("grid gap-1.5", photos.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {photos.map((p) => (
            <div key={p.id} className="relative">
              <ResilientPhoto
                photo={p}
                className={cn(
                  "w-full rounded-xl object-cover",
                  photos.length > 1 ? "h-20" : "h-32",
                  p.status !== "ok" && "opacity-60",
                )}
              />

              {p.status === "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/35">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </span>
              )}

              {p.status === "error" && (
                <button
                  type="button"
                  onClick={() => onRetry?.(p.id)}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-rose-950/70 px-2 text-center text-[11px] font-semibold text-rose-100"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Tentar novamente
                </button>
              )}

              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white"
                >
                  remover
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-border/60 text-muted-foreground">
          <Camera className="h-5 w-5" />
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple={multiple}
        capture={multiple ? undefined : "environment"}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(multiple ? files : files.slice(0, 1));
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-[44px] w-full"
        onClick={() => ref.current?.click()}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…
          </>
        ) : multiple ? (
          "Adicionar fotos"
        ) : photos.length > 0 ? (
          "Substituir foto"
        ) : (
          "Capturar / escolher"
        )}
      </Button>
    </div>
  );
}



function CollaboratorFields({
  title,
  name,
  cpf,
  onName,
  onCpf,
  onEmployee,
}: {
  title: string;
  name: string;
  cpf: string;
  onName: (v: string) => void;
  onCpf: (v: string) => void;
  onEmployee: (id: string | null) => void;
}) {
  const [term, setTerm] = useState("");
  const suggestions = useQuery({
    queryKey: ["frota", "colaboradores", term],
    enabled: term.trim().length >= 3,
    queryFn: async () => {
      const { data } = await supabase
        .from("sst_colaboradores")
        .select("id, nome, cpf")
        .ilike("nome", `%${term.trim()}%`)
        .limit(6);
      return data ?? [];
    },
  });

  const cpfOk = cpf.length === 0 || isValidCpf(cpf);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-primary">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nome completo</Label>
          <Input
            className="min-h-[44px] text-base"
            value={name}
            onChange={(e) => {
              onName(e.target.value);
              setTerm(e.target.value);
              onEmployee(null);
            }}
            placeholder="Buscar na base de colaboradores"
          />
          {(suggestions.data?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border/50 bg-card/70 p-1">
              {suggestions.data!.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-primary/10"
                  onClick={() => {
                    onName(c.nome);
                    onEmployee(c.id);
                    if (c.cpf) onCpf(normalizeCpf(c.cpf));
                    setTerm("");
                  }}
                >
                  {c.nome}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>CPF</Label>
          <Input
            inputMode="numeric"
            className={cn("min-h-[44px] text-base", !cpfOk && "border-rose-400/60")}
            value={cpf ? formatCpf(cpf) : ""}
            onChange={(e) => onCpf(normalizeCpf(e.target.value))}
            placeholder="000.000.000-00"
          />
          {!cpfOk && <p className="text-xs text-rose-300">CPF inválido.</p>}
        </div>
      </div>
    </div>
  );
}
