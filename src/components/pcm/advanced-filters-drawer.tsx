import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type AdvancedFiltersDrawerProps = {
  children: ReactNode;
  /** Quantidade de filtros ativos exibida no botão. */
  activeCount?: number;
  onClear?: () => void;
  onApply?: () => void;
  title?: string;
  description?: string;
};

/** Gaveta de filtros avançados reaproveitável entre módulos (item 6.2). */
export function AdvancedFiltersDrawer({
  children,
  activeCount = 0,
  onClear,
  onApply,
  title = "Filtros avançados",
  description = "Combine critérios para refinar a visualização.",
}: AdvancedFiltersDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros
          {activeCount > 0 ? (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 p-5 text-left">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="text-xs">{description}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-5">{children}</div>
        </ScrollArea>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 p-4">
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!onClear}>
            Limpar
          </Button>
          <Button size="sm" onClick={onApply}>
            Aplicar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
