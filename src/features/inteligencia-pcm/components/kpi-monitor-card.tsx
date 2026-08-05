import React from "react";
import { GlassCard } from "@/components/glass-card";
import { cn } from "@/lib/utils";

interface KpiMonitorCardProps {
  title: string;
  value: string | number;
  trend?: string;
  trendValue?: number;
  icon: React.ReactNode;
  chartColor?: string;
  className?: string;
  description?: string;
}

export function KpiMonitorCard({
  title,
  value,
  trend,
  trendValue,
  icon,
  chartColor = "#4F8CFF",
  className,
  description
}: KpiMonitorCardProps) {
  const isPositive = trendValue !== undefined ? trendValue > 0 : trend?.startsWith("+");
  
  return (
    <GlassCard 
      className={cn(
        "relative overflow-hidden group transition-all duration-300",
        "hover:border-primary/40 hover:shadow-[0_0_20px_rgba(79,140,255,0.15)]",
        "glass-surface card-sheen p-4 flex flex-col justify-between h-full min-h-[140px]",
        className
      )}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/70 uppercase block">
            {title}
          </span>
          <div className="text-2xl font-bold tracking-tight text-white tabular-nums">
            {value}
          </div>
        </div>
        <div className={cn(
          "p-2 rounded-xl bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-300",
          "shadow-[0_0_15px_rgba(255,255,255,0.02)]"
        )}>
          {icon}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {trend && (
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
              isPositive 
                ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" 
                : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
            )}>
              {trend}
            </span>
          )}
          {description && (
            <span className="text-[10px] text-muted-foreground/60 font-medium">
              {description}
            </span>
          )}
        </div>
        
        {/* Futurist Sparkline Indicator */}
        <div className="w-full h-[3px] bg-white/5 rounded-full mt-2 overflow-hidden">
          <div 
            className="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_var(--chart-color)]"
            style={{ 
              width: typeof value === 'number' ? `${Math.min(value, 100)}%` : '70%',
              backgroundColor: chartColor,
              // @ts-ignore
              '--chart-color': chartColor
            } as React.CSSProperties}
          />
        </div>
      </div>
      
      {/* Decorative inner glow */}
      <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-primary/5 blur-3xl rounded-full pointer-events-none group-hover:bg-primary/10 transition-colors duration-500" />
    </GlassCard>
  );
}
