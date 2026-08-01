import * as React from "react";
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  Filter, 
  LayoutGrid, 
  List, 
  Clock,
  Wifi,
  WifiOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

interface OSPageHeaderProps {
  title: string;
  subtitle?: string;
  onSearch?: (query: string) => void;
  onAdd?: () => void;
  isOnline?: boolean;
  totalItems?: number;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
}

export function OSPageHeader({
  title,
  subtitle,
  onAdd,
  isOnline = true,
  totalItems = 0,
  viewMode = 'grid',
  onViewModeChange
}: OSPageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-30 w-full bg-background/80 backdrop-blur-xl border-b border-white/5 px-4 py-3 safe-area-top">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 -ml-2"
              onClick={() => navigate({ to: "/" })}
             aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold leading-none tracking-tight">{title}</h1>
              {subtitle && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-1">
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOnline ? (
              <Badge variant="outline" className="h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1 px-1.5 text-[9px]">
                <Wifi className="h-2.5 w-2.5" /> ONLINE
              </Badge>
            ) : (
              <Badge variant="outline" className="h-5 bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1 px-1.5 text-[9px]">
                <WifiOff className="h-2.5 w-2.5" /> OFFLINE
              </Badge>
            )}
            
            {onAdd && (
              <Button size="icon" className="h-9 w-9 rounded-full shadow-lg" onClick={onAdd} aria-label="Adicionar">
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{totalItems}</span> registros encontrados
          </div>
          
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10">
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn("h-7 w-7 rounded-md", viewMode === 'grid' && "bg-white/10 text-primary")}
              onClick={() => onViewModeChange?.('grid')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn("h-7 w-7 rounded-md", viewMode === 'list' && "bg-white/10 text-primary")}
              onClick={() => onViewModeChange?.('list')}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
