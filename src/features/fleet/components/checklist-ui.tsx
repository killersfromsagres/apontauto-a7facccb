import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Camera, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Info,
  History,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";

interface StepperProps {
  steps: { label: string; icon?: any }[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <div className="relative flex justify-between w-full">
      {/* Background Line */}
      <div className="absolute top-5 left-0 w-full h-0.5 bg-muted -z-10" />
      <div 
        className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-300 -z-10" 
        style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
      />
      
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        
        return (
          <button
            key={i}
            onClick={() => onStepClick?.(i)}
            disabled={!isCompleted && !isActive}
            className="flex flex-col items-center gap-2 group outline-none"
          >
            <div className={cn(
              "h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all duration-200 bg-background",
              isCompleted ? "bg-primary border-primary text-primary-foreground" :
              isActive ? "border-primary text-primary shadow-glow ring-4 ring-primary/10" :
              "border-muted text-muted-foreground"
            )}>
              {isCompleted ? <Check className="h-5 w-5" /> : 
               step.icon ? <step.icon className="h-5 w-5" /> : (i + 1)}
            </div>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
              {step.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ChecklistProgress({ 
  total, 
  answered, 
  photos, 
  isOffline 
}: { 
  total: number; 
  answered: number; 
  photos: number;
  isOffline?: boolean;
}) {
  const percentage = Math.round((answered / total) * 100);
  
  return (
    <div className="sticky top-0 z-30 pt-2 pb-1 bg-background/80 backdrop-blur-xl border-b border-border/40 px-4 -mx-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Progresso da Vistoria
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isOffline && (
            <Badge variant="outline" className="h-5 bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px]">
              Offline
            </Badge>
          )}
          <span className="text-xs font-bold tabular-nums">
            {answered}/{total} <span className="text-muted-foreground font-normal">itens</span>
          </span>
        </div>
      </div>
      <Progress value={percentage} className="h-1.5" />
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Camera className="h-3 w-3" />
          {photos} fotos anexadas
        </div>
        <span className="text-[10px] font-bold text-primary">{percentage}% concluído</span>
      </div>
    </div>
  );
}

export function CriticalItemAlert({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-bold text-rose-600 uppercase tracking-tight">
          Atenção: Itens Críticos
        </p>
        <p className="text-[11px] text-rose-500/80 leading-snug">
          Existem {count} {count === 1 ? 'item crítico' : 'itens críticos'} que impedem a liberação segura do veículo.
        </p>
      </div>
    </div>
  );
}
