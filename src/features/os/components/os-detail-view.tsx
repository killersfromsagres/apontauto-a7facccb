import * as React from "react";
import {
  Camera,
  MapPin,
  Clock,
  Users,
  AlertTriangle,
  History,
  FileText,
  Package,
  CheckCircle2,
  ChevronRight,
  User,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/glass-card";
import { Progress } from "@/components/ui/progress";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OSTimeline, type OSTimelineEvent } from "./os-timeline";
import type { OSBase } from "../schemas/os-base";

interface OSDetailViewProps {
  os: OSBase;
  onAction: (action: string) => void;
  timeline?: OSTimelineEvent[];
}

export function OSDetailView({ os, onAction, timeline = [] }: OSDetailViewProps) {
  const slaProgress = 65; // Mock

  const actionButtons = [
    { id: "start", label: "Iniciar", icon: CheckCircle2, variant: "default" as const },
    { id: "photo", label: "Foto", icon: Camera, variant: "outline" as const },
    { id: "parts", label: "Peças", icon: Package, variant: "outline" as const },
    { id: "issue", label: "Problema", icon: AlertTriangle, variant: "outline" as const },
    { id: "sign", label: "Assinar", icon: FileText, variant: "outline" as const },
    { id: "forward", label: "Encaminhar", icon: ChevronRight, variant: "ghost" as const },
  ];

  return (
    <div className="flex flex-col min-h-[85vh] bg-background">
      <div className="px-4 py-6 space-y-6">
        {/* Header Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-muted-foreground tracking-tighter">
              OS #{os.numero}
            </span>
            <Badge className="bg-primary/20 text-primary border-primary/30 uppercase text-[10px]">
              {os.status.replace("_", " ")}
            </Badge>
          </div>
          <h2 className="text-xl font-bold leading-tight">{os.descricao}</h2>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-3 gap-2">
          {actionButtons.map((btn) => (
            <Button
              key={btn.id}
              variant={btn.variant}
              className="h-auto py-3 flex-col gap-1.5 rounded-xl border-white/10"
              onClick={() => onAction(btn.id)}
            >
              <btn.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{btn.label}</span>
            </Button>
          ))}
        </div>

        {/* Info Cards */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <GlassCard className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">
                  Localização
                </span>
                <span className="text-sm font-medium">{os.local}</span>
              </div>
            </GlassCard>

            <GlassCard className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">
                  Equipe Responsável
                </span>
                <span className="text-sm font-medium">{os.equipe}</span>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">Prazo de SLA</span>
              </div>
              <span className="text-xs font-bold text-red-500">4h restantes</span>
            </div>
            <div className="space-y-2">
              <Progress value={slaProgress} className="h-2" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Criada: 12/05 08:30</span>
                <span>Vencimento: 12/05 16:30</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Timeline Section */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Histórico de Atividades
            </h3>
            <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2">
              Ver tudo
            </Button>
          </div>
          <OSTimeline events={timeline} className="px-2" />
        </div>
      </div>

      <div className="mt-auto p-4 border-t border-white/5 bg-background/50 backdrop-blur-md sticky bottom-0">
        <Button className="w-full h-12 text-base font-bold shadow-[0_0_20px_rgba(59,130,246,0.3)]">
          INICIAR TRABALHO
        </Button>
      </div>
    </div>
  );
}
