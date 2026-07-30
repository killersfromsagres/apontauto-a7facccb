import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Barra de filtros padrão: busca + slots de filtros + ações.
 * Mantém alvo de toque >= 40px e não estoura em telas pequenas.
 */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Pesquisar…",
  filters,
  actions,
  activeCount = 0,
  onClear,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  /** Quantidade de filtros ativos — habilita o botão de limpar. */
  activeCount?: number;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-2xl border border-border/50 bg-card/40 p-2.5 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {onSearchChange && (
        <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search ?? ""}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 pl-9"
          />
        </div>
      )}

      {filters && <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>}

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {onClear && activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-10" onClick={onClear}>
            <X className="size-4" aria-hidden />
            Limpar ({activeCount})
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
