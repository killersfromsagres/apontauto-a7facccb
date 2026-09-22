import { useMemo, useState } from "react";
import { Camera, ImageIcon, ZoomIn } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MaterialEvidencePhoto } from "@/lib/materiais/material-request-photos";
import { cn } from "@/lib/utils";

function formatPhotoDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString("pt-BR");
}

type Props = {
  photos: MaterialEvidencePhoto[];
  osNumber?: string | null;
  materialDescription?: string | null;
  variant?: "default" | "compact";
};

export function MaterialRequestPhotoGallery({
  photos,
  osNumber,
  materialDescription,
  variant = "default",
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  const visiblePhotos = useMemo(() => photos.filter((photo) => !failed.has(photo.id)), [failed, photos]);
  const selectedPhoto = visiblePhotos.find((photo) => photo.id === selectedId) || null;

  if (!visiblePhotos.length) return null;

  const markFailed = (id: string) => {
    setFailed((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const compact = variant === "compact";

  return (
    <>
      <div
        className={cn(
          "mt-3",
          compact
            ? "flex items-center gap-2"
            : "rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3",
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {!compact && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-1.5 text-muted-foreground">
                <Camera className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Evidências vinculadas</p>
                <p className="text-[10px] text-muted-foreground">Fotos registradas na mesma OS</p>
              </div>
            </div>
            <Badge variant="outline" className="border-white/[0.08] bg-white/[0.025] text-[10px] text-muted-foreground">
              {visiblePhotos.length} {visiblePhotos.length === 1 ? "foto" : "fotos"}
            </Badge>
          </div>
        )}

        {compact && (
          <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 text-[10px] font-semibold text-muted-foreground">
            <Camera className="h-3.5 w-3.5" />
            {visiblePhotos.length}
          </div>
        )}

        <div className={cn("flex overflow-x-auto [scrollbar-width:thin]", compact ? "gap-1.5 pb-0" : "gap-2 pb-1")}>
          {visiblePhotos.map((photo, index) => (
            <Button
              key={photo.id}
              type="button"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedId(photo.id);
              }}
              className={cn(
                "group/photo relative shrink-0 overflow-hidden border border-white/[0.08] bg-black/20 p-0 hover:border-white/25",
                compact ? "h-14 w-16 rounded-lg" : "h-24 w-28 rounded-xl",
              )}
              title={`Abrir foto ${index + 1}`}
            >
              <img
                src={photo.image_url}
                alt={photo.legenda || `Foto ${index + 1} da OS ${osNumber || ""}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => markFailed(photo.id)}
                className="h-full w-full object-cover transition duration-300 group-hover/photo:scale-105"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover/photo:bg-black/35 group-hover/photo:opacity-100">
                <ZoomIn className="h-4 w-4" />
              </span>
              <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm">
                {index + 1}/{visiblePhotos.length}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(selectedPhoto)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent
          className="max-w-5xl overflow-hidden border-white/10 bg-[#070b10]/98 p-0 shadow-2xl backdrop-blur-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader className="border-b border-white/10 px-5 py-4 text-left">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <DialogTitle className="text-base">Evidência do material · OS {osNumber || "—"}</DialogTitle>
            </div>
            <DialogDescription className="line-clamp-2">
              {selectedPhoto?.legenda || materialDescription || "Foto anexada durante o atendimento da OS."}
            </DialogDescription>
          </DialogHeader>

          {selectedPhoto && (
            <div className="bg-black/40 p-3 sm:p-5">
              <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40 sm:min-h-[480px]">
                <img
                  src={selectedPhoto.image_url}
                  alt={selectedPhoto.legenda || materialDescription || "Evidência do material"}
                  referrerPolicy="no-referrer"
                  onError={() => markFailed(selectedPhoto.id)}
                  className="max-h-[72vh] max-w-full object-contain"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>{selectedPhoto.legenda || "Sem legenda"}</span>
                {formatPhotoDate(selectedPhoto.created_at) && <span>{formatPhotoDate(selectedPhoto.created_at)}</span>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
