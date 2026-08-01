import * as React from "react";
import { 
  MoreVertical, 
  MapPin, 
  Users, 
  Clock, 
  AlertTriangle,
  Camera,
  Package,
  History,
  CheckCircle2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { OSBase } from "../schemas/os-base";

interface OSMobileCardProps {
  os: OSBase;
  onAction?: (action: string, os: OSBase) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function OSMobileCard({ os, onAction, className, style }: OSMobileCardProps) {
  const navigate = useNavigate();

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      aberto: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      backorder: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      concluido: "bg-green-500/20 text-green-400 border-green-500/30",
      cancelado: "bg-red-500/20 text-red-400 border-red-500/30",
      em_execucao: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    };
    return colors[status] || "bg-slate-500/20 text-slate-400 border-slate-500/30";
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      critica: "text-red-500",
      alta: "text-orange-500",
      media: "text-yellow-500",
      baixa: "text-blue-500",
    };
    return colors[priority] || "text-slate-500";
  };

  const slaProgress = 65; // Mock for visual representation

  return (
    <GlassCard 
      className={cn("p-4 space-y-4 active:scale-[0.98] transition-transform", className)} 
      style={style}
      onClick={() => {
        // Implementação do clique no card para ver detalhes
        toast.info(`Abrindo OS ${os.numero}`);
      }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">#{os.numero}</span>
            <Badge variant="outline" className={cn("text-[10px] uppercase px-1.5 py-0", getStatusColor(os.status))}>
              {os.status.replace("_", " ")}
            </Badge>
          </div>
          <h3 className="font-semibold text-sm leading-tight line-clamp-2">{os.descricao}</h3>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2" onClick={(e) => e.stopPropagation()} aria-label="Mais opções">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction?.("start", os); }}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Iniciar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction?.("photo", os); }}>
              <Camera className="mr-2 h-4 w-4" /> Adicionar Foto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction?.("parts", os); }}>
              <Package className="mr-2 h-4 w-4" /> Registrar Peça
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction?.("history", os); }}>
              <History className="mr-2 h-4 w-4" /> Abrir Histórico
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{os.local}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{os.equipe}</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", getPriorityColor(os.prioridade))} />
          <span className="capitalize">{os.prioridade}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{os.sla_horas}h SLA</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-medium">
          <span>SLA Progress</span>
          <span className={cn(slaProgress > 80 ? "text-red-500" : "text-emerald-500")}>
            {slaProgress}%
          </span>
        </div>
        <Progress value={slaProgress} className="h-1.5" />
      </div>

      {os.tecnico_responsavel && (
        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground italic">
            Resp: {os.tecnico_responsavel}
          </span>
          <div className="flex gap-2">
            {os.fotos.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                <Camera className="h-2.5 w-2.5" /> {os.fotos.length}
              </Badge>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
