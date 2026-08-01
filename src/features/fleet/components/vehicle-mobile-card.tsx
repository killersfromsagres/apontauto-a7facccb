import { cn } from "@/lib/utils";
import { BrandMark, inferBrand } from "@/components/frota/brand-mark";
import { PlateBadge } from "@/components/frota/plate-badge";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/glass-card";
import { 
  Truck, 
  Calendar, 
  Gauge, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  ChevronRight,
  Droplets
} from "lucide-react";
import type { FleetVehicle } from "@/features/fleet/api";
import { VEHICLE_STATUS } from "@/features/fleet/api";

interface VehicleMobileCardProps {
  vehicle: FleetVehicle;
  onClick?: () => void;
  lastChecklist?: {
    date: string;
    status: string;
  };
  nextObligation?: {
    label: string;
    date: string;
    critical?: boolean;
  };
  stats?: {
    avgConsumption: string;
  };
}

export function VehicleMobileCard({ 
  vehicle, 
  onClick,
  lastChecklist,
  nextObligation,
  stats
}: VehicleMobileCardProps) {
  const brand = inferBrand(`${vehicle.brand} ${vehicle.model}`);
  
  return (
    <GlassCard 
      onClick={onClick}
      className="group tap-press active:scale-[0.98] transition-all duration-200 overflow-hidden border-border/40"
    >
      {/* Header with Mini Photo & Prefix */}
      <div className="flex items-center gap-3 p-4 bg-muted/20">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted border border-border/60">
          <Truck className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground/40" />
          {/* Placeholder for real mini-photo if available */}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-lg tracking-tight truncate">
              {vehicle.prefix}
            </h3>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] h-5 px-1.5 uppercase",
                vehicle.status === 'disponivel' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                vehicle.status === 'em_uso' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                "bg-amber-500/10 text-amber-500 border-amber-500/20"
              )}
            >
              {VEHICLE_STATUS[vehicle.status] || vehicle.status}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
            <BrandMark brand={brand} className="h-3.5 w-3.5" />
            <span>{vehicle.brand} {vehicle.model}</span>
          </div>
        </div>
        
        <PlateBadge plate={vehicle.plate} size="sm" />
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 border-t border-border/40">
        <DetailItem 
          icon={Gauge} 
          label="Hodômetro" 
          value={`${Number(vehicle.current_odometer_km).toLocaleString('pt-BR')} km`} 
        />
        <DetailItem 
          icon={Droplets} 
          label="Consumo Médio" 
          value={stats?.avgConsumption || "—"} 
        />
        <DetailItem 
          icon={Clock} 
          label="Último Checklist" 
          value={lastChecklist?.date || "—"} 
          status={lastChecklist?.status as any}
        />
        <DetailItem 
          icon={Calendar} 
          label="Próxima Obrigação" 
          value={nextObligation?.date || "—"} 
          subLabel={nextObligation?.label}
          critical={nextObligation?.critical}
        />
      </div>

      {/* Availability / Alert Footer */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/10 border-t border-border/40">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {vehicle.status === 'disponivel' ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          ) : (
            <Clock className="h-3 w-3 text-amber-500" />
          )}
          Disponibilidade: {vehicle.status === 'disponivel' ? 'Alta' : 'Ocupado'}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </GlassCard>
  );
}

function DetailItem({ 
  icon: Icon, 
  label, 
  value, 
  subLabel,
  status,
  critical 
}: { 
  icon: any; 
  label: string; 
  value: string; 
  subLabel?: string;
  status?: 'ok' | 'atencao' | 'critico';
  critical?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={cn(
          "h-3.5 w-3.5",
          critical ? "text-rose-500" : "text-muted-foreground/60"
        )} />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
          {label}
        </span>
      </div>
      <div className="flex flex-col">
        <span className={cn(
          "text-sm font-semibold tabular-nums",
          status === 'critico' || critical ? "text-rose-500" :
          status === 'atencao' ? "text-amber-500" :
          "text-foreground"
        )}>
          {value}
        </span>
        {subLabel && <span className="text-[9px] text-muted-foreground leading-none">{subLabel}</span>}
      </div>
    </div>
  );
}
