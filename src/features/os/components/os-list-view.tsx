import * as React from "react";
import { 
  Loader2, 
  Search, 
  RefreshCw,
} from "lucide-react";
import { OSMobileCard } from "../components/os-mobile-card";
import { OSFiltersMobile } from "../components/os-filters-mobile";
import { OSPageHeader } from "../components/os-page-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { OSBase } from "../schemas/os-base";

interface OSListViewProps {
  title: string;
  subtitle: string;
  osList: OSBase[];
  isLoading: boolean;
  onRefresh?: () => void;
  onAdd?: () => void;
  onOSAction?: (action: string, os: OSBase) => void;
  isOnline?: boolean;
}

export function OSListView({
  title,
  subtitle,
  osList,
  isLoading,
  onRefresh,
  onAdd,
  onOSAction,
  isOnline = true
}: OSListViewProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');

  const filteredList = React.useMemo(() => {
    if (!searchQuery) return osList;
    const q = searchQuery.toLowerCase();
    return osList.filter(os => 
      os.numero.toLowerCase().includes(q) ||
      os.descricao.toLowerCase().includes(q) ||
      os.local.toLowerCase().includes(q) ||
      os.equipe.toLowerCase().includes(q)
    );
  }, [osList, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="relative">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">Carregando ordens de serviço...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <OSPageHeader 
        title={title}
        subtitle={subtitle}
        onAdd={onAdd}
        isOnline={isOnline}
        totalItems={filteredList.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <div className="px-4 py-3 bg-background/50 sticky top-[92px] z-20 backdrop-blur-sm border-b border-white/5">
        <OSFiltersMobile 
          onFilterChange={() => {}} 
          onSearchChange={setSearchQuery} 
        />
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        {filteredList.length > 0 ? (
          <div className={cn(
            "grid gap-4 pb-24",
            viewMode === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
          )}>
            {filteredList.map((os, idx) => (
              <OSMobileCard 
                key={os.id} 
                os={os} 
                onAction={onOSAction}
                className="animate-in fade-in slide-in-from-bottom-4 duration-500"
                style={{ animationDelay: `${idx * 50}ms` }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/10">
              <Search className="h-8 w-8 text-muted-foreground opacity-20" />
            </div>
            <h3 className="text-lg font-semibold">Nenhuma OS encontrada</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-[260px]">
              Tente ajustar seus filtros ou busca para encontrar o que precisa.
            </p>
            {onRefresh && (
              <Button variant="outline" className="mt-6 gap-2" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" /> Atualizar Lista
              </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

