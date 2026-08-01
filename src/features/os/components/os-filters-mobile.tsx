import * as React from "react";
import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OSFiltersMobileProps {
  onFilterChange: (filters: any) => void;
  onSearchChange: (query: string) => void;
}

export function OSFiltersMobile({ onFilterChange, onSearchChange }: OSFiltersMobileProps) {
  const [search, setSearch] = React.useState("");
  const [activeFiltersCount, setActiveFiltersCount] = React.useState(0);

  const handleSearch = (val: string) => {
    setSearch(val);
    onSearchChange(val);
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar OS, ativo, prédio..."
          className="pl-9 h-11 bg-white/5 border-white/10"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={() => handleSearch("")}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Drawer>
        <DrawerTrigger asChild>
          <Button variant="outline" className="h-11 px-3 relative border-white/10 bg-white/5">
            <Filter className="h-4 w-4" />
            {activeFiltersCount > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left border-b border-white/5 pb-4">
            <DrawerTitle>Filtros Avançados</DrawerTitle>
            <DrawerDescription>Refine sua busca por ordens de serviço</DrawerDescription>
          </DrawerHeader>

          <ScrollArea className="p-4 h-full overflow-y-auto">
            <div className="space-y-6 pb-20">
              <section>
                <h4 className="text-sm font-medium mb-3">Status</h4>
                <div className="flex flex-wrap gap-2">
                  {["Aberto", "Backorder", "Concluído", "Cancelado", "Em Execução"].map((s) => (
                    <Badge
                      key={s}
                      variant="outline"
                      className="px-3 py-1 cursor-pointer hover:bg-white/10"
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-medium mb-3">Criticidade</h4>
                <div className="flex flex-wrap gap-2">
                  {["Crítica", "Alta", "Média", "Baixa"].map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="px-3 py-1 cursor-pointer hover:bg-white/10"
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-medium mb-3">Evidências</h4>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    <input type="checkbox" className="h-4 w-4 accent-primary" />
                    <span className="text-sm">Sem fotos</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    <input type="checkbox" className="h-4 w-4 accent-primary" />
                    <span className="text-sm">Sem assinatura</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    <input type="checkbox" className="h-4 w-4 accent-primary" />
                    <span className="text-sm">Vencidas (SLA)</span>
                  </label>
                </div>
              </section>
            </div>
          </ScrollArea>

          <DrawerFooter className="pt-4 border-t border-white/5 bg-background/80 backdrop-blur-xl">
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => {}}>
                Limpar
              </Button>
              <Button className="flex-1" onClick={() => {}}>
                Aplicar Filtros
              </Button>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" className="mt-2 w-full">
                Fechar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
