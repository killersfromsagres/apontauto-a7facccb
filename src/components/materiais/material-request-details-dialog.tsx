import {
  Building2,
  CalendarClock,
  Camera,
  ClipboardList,
  Gauge,
  Hash,
  MapPin,
  Package,
  PencilLine,
  UserRound,
  Wrench,
} from "lucide-react";

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

type Props = {
  open: boolean;
  request: any | null;
  os: any | null;
  photos: MaterialEvidencePhoto[];
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
};

function display(value: unknown, fallback = "Não informado") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Não informado";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("pt-BR");
}

function urgencyLabel(value: unknown) {
  const raw = display(value, "Normal").toLowerCase();
  if (raw === "alta") return "Alta";
  if (raw === "baixa") return "Baixa";
  if (raw === "critica" || raw === "crítica") return "Crítica";
  return raw === "media" || raw === "média" ? "Média" : display(value, "Normal");
}

function statusLabel(value: unknown) {
  return display(value, "Não informado").replace(/_/g, " ");
}

function InfoItem({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof Package;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-white/8 bg-white/[0.035] p-3.5", className)}>
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function MaterialRequestDetailsDialog({
  open,
  request,
  os,
  photos,
  onOpenChange,
  onEdit,
}: Props) {
  if (!request) return null;

  const isCorrective = request.origem !== "refrigeracao";
  const location = [os?.predio, os?.andar, os?.local].filter(Boolean).join(" · ");
  const asset = [os?.ativo, os?.equipamento, os?.patrimonio].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden border-white/10 bg-[#080d13]/98 p-0 shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="border-b border-white/10 bg-gradient-to-br from-emerald-500/12 via-cyan-500/5 to-transparent px-5 py-5 text-left sm:px-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-bold uppercase tracking-wide",
                isCorrective
                  ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-300",
              )}
            >
              {isCorrective ? "Corretiva" : "Refrigeração"}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              OS {display(os?.numero_os, "—")}
            </Badge>
            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-300">
              Qtd. {Number(request.quantidade || 1)}
            </Badge>
            {photos.length > 0 && (
              <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-[10px] text-sky-300">
                {photos.length} {photos.length === 1 ? "foto" : "fotos"}
              </Badge>
            )}
          </div>
          <DialogTitle className="pr-8 text-xl sm:text-2xl">
            {isCorrective ? "Detalhes da Corretiva" : "Detalhes da solicitação"}
          </DialogTitle>
          <DialogDescription>
            Informações completas da OS e da solicitação de material vinculada.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90vh-145px)] overflow-y-auto px-4 py-5 sm:px-6">
          <section className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-300/80">Material solicitado</p>
                <h3 className="mt-1 break-words text-lg font-black text-white sm:text-xl">
                  {display(request.descricao)}
                </h3>
              </div>
              {onEdit && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onEdit}
                  className="gap-2 border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:text-white"
                >
                  <PencilLine className="h-4 w-4" />
                  Editar solicitação
                </Button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem icon={Package} label="Quantidade" value={Number(request.quantidade || 1)} />
              <InfoItem icon={Hash} label="Modelo" value={display(request.modelo)} />
              <InfoItem icon={Gauge} label="Urgência" value={urgencyLabel(request.urgencia)} />
              <InfoItem icon={ClipboardList} label="Status material" value={statusLabel(request.material_status || request.status_gestor)} />
            </div>

            {(request.observacao || request.status_gestor || request.material_request_date) && (
              <div className="grid gap-2 sm:grid-cols-2">
                <InfoItem
                  icon={ClipboardList}
                  label="Observação da peça"
                  value={display(request.observacao)}
                  className="sm:col-span-2"
                />
                <InfoItem icon={CalendarClock} label="Solicitado em" value={formatDate(request.material_request_date || request.created_at)} />
                <InfoItem icon={Wrench} label="Status gestor" value={statusLabel(request.status_gestor)} />
              </div>
            )}
          </section>

          <section className="mt-6 space-y-3 border-t border-white/8 pt-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-300/80">Informações da OS</p>
              <h3 className="mt-1 text-base font-bold text-white">{display(os?.nome_os, `OS ${display(os?.numero_os, "—")}`)}</h3>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem icon={Wrench} label="Equipe" value={display(os?.equipe)} />
              <InfoItem icon={ClipboardList} label="Status da OS" value={statusLabel(os?.status)} />
              <InfoItem icon={UserRound} label="Solicitante" value={display(os?.solicitante)} />
              <InfoItem icon={MapPin} label="Localização" value={display(location)} className="lg:col-span-2" />
              <InfoItem icon={Building2} label="Ativo / equipamento" value={display(asset)} />
              <InfoItem icon={CalendarClock} label="Criada em" value={formatDate(os?.data_criacao || os?.created_at)} />
              <InfoItem icon={CalendarClock} label="SLA" value={formatDate(os?.data_sla)} />
              <InfoItem icon={CalendarClock} label="Programada" value={formatDate(os?.data_programada)} />
            </div>

            {os?.pecas_solicitadas && (
              <InfoItem icon={ClipboardList} label="Histórico de materiais da OS" value={display(os.pecas_solicitadas)} />
            )}
          </section>

          <section className="mt-6 border-t border-white/8 pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-sky-300/80">Evidências</p>
                <h3 className="mt-1 text-base font-bold text-white">Fotos vinculadas à OS</h3>
              </div>
              <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-sky-300">
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                {photos.length}
              </Badge>
            </div>

            {photos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-8 text-center">
                <Camera className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground">Nenhuma foto sincronizada para esta OS.</p>
                {isCorrective && (
                  <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground/70">
                    Fotos de solicitações abertas passam a ser sincronizadas junto com o material, sem depender da finalização da corretiva.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo, index) => (
                  <a
                    key={photo.id}
                    href={photo.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-sky-400/35"
                  >
                    <div className="aspect-square overflow-hidden bg-black/30">
                      <img
                        src={photo.image_url}
                        alt={photo.legenda || `Evidência ${index + 1}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="border-t border-white/8 px-2.5 py-2">
                      <p className="truncate text-[10px] font-semibold text-white">{photo.legenda || `Foto ${index + 1}`}</p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground">{formatDate(photo.created_at)}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
