import {
  Building2,
  CalendarClock,
  Camera,
  ClipboardList,
  Gauge,
  Hash,
  Landmark,
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
  costCenter?: string | null;
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
  emphasis = false,
}: {
  icon: typeof Package;
  label: string;
  value: React.ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        emphasis
          ? "border-emerald-400/15 bg-emerald-400/[0.055]"
          : "border-white/[0.07] bg-white/[0.025]",
        className,
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
  costCenter,
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
        <DialogHeader className="border-b border-white/[0.07] bg-white/[0.02] px-5 py-5 text-left sm:px-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-white/[0.09] bg-white/[0.03] text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            >
              {isCorrective ? "Corretiva" : "Refrigeração"}
            </Badge>
            <span className="rounded-md bg-foreground px-2 py-1 font-mono text-[10px] font-bold text-background">
              OS {display(os?.numero_os, "—")}
            </span>
            <Badge variant="outline" className="border-white/[0.08] bg-white/[0.025] text-[10px] text-muted-foreground">
              Qtd. {Number(request.quantidade || 1)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                costCenter
                  ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-200"
                  : "border-amber-400/20 bg-amber-400/[0.07] text-amber-200",
              )}
            >
              <Landmark className="mr-1 h-3 w-3" />
              CC {costCenter || "não mapeado"}
            </Badge>
          </div>
          <DialogTitle className="pr-8 text-xl sm:text-2xl">Detalhes da solicitação de material</DialogTitle>
          <DialogDescription>
            Rastreabilidade da peça, chamado, ativo, centro de custo e evidências vinculadas.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90vh-145px)] overflow-y-auto px-4 py-5 sm:px-6">
          <section className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Peça / material solicitado</p>
                <h3 className="mt-1 break-words text-lg font-semibold text-white sm:text-xl">
                  {display(request.descricao)}
                </h3>
              </div>
              {onEdit && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onEdit}
                  className="gap-2 border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.07] hover:text-white"
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
              <InfoItem icon={Landmark} label="Centro de Custo" value={costCenter || "Não mapeado"} emphasis={Boolean(costCenter)} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <InfoItem
                icon={ClipboardList}
                label="Observação da peça"
                value={display(request.observacao)}
                className="sm:col-span-2"
              />
              <InfoItem icon={CalendarClock} label="Solicitado em" value={formatDate(request.material_request_date || request.created_at)} />
              <InfoItem icon={Wrench} label="Status gestor" value={statusLabel(request.status_gestor || request.material_status)} />
            </div>
          </section>

          <section className="mt-6 space-y-3 border-t border-white/[0.07] pt-5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Informações do chamado</p>
              <h3 className="mt-1 text-base font-semibold text-white">{display(os?.nome_os, `OS ${display(os?.numero_os, "—")}`)}</h3>
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

          <section className="mt-6 border-t border-white/[0.07] pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Evidências</p>
                <h3 className="mt-1 text-base font-semibold text-white">Fotos vinculadas à OS</h3>
              </div>
              <Badge variant="outline" className="border-white/[0.08] bg-white/[0.025] text-muted-foreground">
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                {photos.length}
              </Badge>
            </div>

            {photos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
                <Camera className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground">Nenhuma foto sincronizada para esta OS.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo, index) => (
                  <a
                    key={photo.id}
                    href={photo.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 transition hover:border-white/20"
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
                    <div className="border-t border-white/[0.07] px-2.5 py-2">
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
