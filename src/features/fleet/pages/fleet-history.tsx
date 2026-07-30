import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ImageOff } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlateBadge } from "@/components/frota/plate-badge";
import { BrandMark, inferBrand } from "@/components/frota/brand-mark";
import { cn } from "@/lib/utils";
import {
  listChecklistPhotos,
  listFleetChecklists,
  listFleetVehicles,
  vehicleTitle,
} from "@/features/fleet/api";
import { PHOTO_CATEGORIES, STATUS_LABEL, STATUS_TONE } from "@/features/fleet/checklist-items";
import { signPhotoUrls } from "@/features/fleet/photos";

export function FleetHistory() {
  const vehiclesQ = useQuery({ queryKey: ["fleet", "vehicles"], queryFn: listFleetVehicles });
  const checklistsQ = useQuery({
    queryKey: ["fleet", "checklists"],
    queryFn: () => listFleetChecklists(),
  });

  const checklists = checklistsQ.data ?? [];
  const ids = useMemo(() => checklists.map((c) => c.id), [checklists]);

  const photosQ = useQuery({
    queryKey: ["fleet", "checklist-photos", ids.length, ids[0] ?? ""],
    queryFn: () => listChecklistPhotos(ids),
    enabled: ids.length > 0,
  });

  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = (photosQ.data ?? []).map((p) => p.storage_path);
    if (paths.length === 0) return;
    let alive = true;
    void signPhotoUrls(paths).then((map) => {
      if (alive) setUrls(map);
    });
    return () => {
      alive = false;
    };
  }, [photosQ.data]);

  const vehicleById = useMemo(
    () => Object.fromEntries((vehiclesQ.data ?? []).map((v) => [v.id, v])),
    [vehiclesQ.data],
  );
  const photosByChecklist = useMemo(() => {
    const map: Record<string, { category: string; storage_path: string }[]> = {};
    for (const p of photosQ.data ?? []) {
      (map[p.checklist_id] ??= []).push(p);
    }
    return map;
  }, [photosQ.data]);

  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return checklists;
    return checklists.filter((c) => {
      const v = vehicleById[c.vehicle_id];
      return `${v?.prefix ?? ""} ${v?.plate ?? ""} ${c.driver_name}`.toLowerCase().includes(q);
    });
  }, [checklists, search, vehicleById]);

  return (
    <div className="space-y-4">
      <Input
        className="h-11 sm:max-w-xs"
        placeholder="Buscar por veículo ou condutor"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {checklistsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando histórico…</p>
      ) : filtered.length === 0 ? (
        <GlassCard>
          <p className="text-sm text-muted-foreground">Nenhum checklist registrado ainda.</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const v = vehicleById[c.vehicle_id];
            const open = openId === c.id;
            const photos = photosByChecklist[c.id] ?? [];
            return (
              <GlassCard key={c.id} className="space-y-3">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => setOpenId(open ? null : c.id)}
                >
                  <PlateBadge plate={v?.plate} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      <BrandMark brand={inferBrand(`${v?.brand ?? ""} ${v?.model ?? ""}`)} />
                      {v ? `${v.prefix} · ${vehicleTitle(v)}` : "Veículo removido"}
                    </p>
                    <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {new Date(c.created_at).toLocaleString("pt-BR")} ·{" "}
                      {c.kind === "saida" ? "Saída" : "Retorno"} · {c.driver_name} ·{" "}
                      {Number(c.odometer_km).toLocaleString("pt-BR")} km
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className={cn(STATUS_TONE[c.overall_status])}>
                      {STATUS_LABEL[c.overall_status] ?? c.overall_status}
                    </Badge>
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
                    />
                  </div>
                </button>

                {open && (
                  <div className="space-y-3 border-t border-border/60 pt-3">
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {(c.items ?? []).map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-2 rounded-lg bg-background/40 px-2.5 py-1.5 text-xs"
                        >
                          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                            {item.label}
                          </span>
                          <Badge variant="outline" className={cn("shrink-0", STATUS_TONE[item.status])}>
                            {STATUS_LABEL[item.status]}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    {c.notes && (
                      <p className="rounded-lg bg-background/40 p-2.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {c.notes}
                      </p>
                    )}

                    {photos.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {photos.map((p) => {
                          const url = urls[p.storage_path];
                          const label =
                            PHOTO_CATEGORIES.find((x) => x.key === p.category)?.label ?? p.category;
                          return (
                            <div
                              key={p.storage_path}
                              className="overflow-hidden rounded-xl border border-border/60 bg-muted/30"
                            >
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer">
                                  <img
                                    src={url}
                                    alt={label}
                                    loading="lazy"
                                    className="h-28 w-full object-cover"
                                  />
                                </a>
                              ) : (
                                <div className="flex h-28 w-full items-center justify-center text-muted-foreground">
                                  <ImageOff className="h-5 w-5" />
                                </div>
                              )}
                              <p className="truncate px-2 py-1 text-[11px] text-muted-foreground">
                                {label}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem fotos neste checklist.</p>
                    )}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={() => void checklistsQ.refetch()}>
          Atualizar histórico
        </Button>
      </div>
    </div>
  );
}
