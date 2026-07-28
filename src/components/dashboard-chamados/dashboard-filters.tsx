import { Filter } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardChamadosState, Filters } from "./use-dashboard-chamados";

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DashboardFilters({
  filters,
  setFilters,
  uniques,
  activeFilterCount,
  onReset,
}: {
  filters: Filters;
  setFilters: DashboardChamadosState["setFilters"];
  uniques: DashboardChamadosState["uniques"];
  activeFilterCount: number;
  onReset: () => void;
}) {
  const set = (patch: Partial<Filters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  return (
    <GlassCard delay={0.15}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Filtros</h3>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeFilterCount} ativo(s)
              </Badge>
            )}
          </div>
          {activeFilterCount > 0 && (
            <Button size="sm" variant="ghost" onClick={onReset}>
              Limpar filtros
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <FilterSelect
            label="Período"
            value={filters.periodo}
            onChange={(v) => set({ periodo: v })}
            options={[
              { value: "todos", label: "Todos" },
              { value: "7", label: "Últimos 7 dias" },
              { value: "30", label: "Últimos 30 dias" },
              { value: "90", label: "Últimos 90 dias" },
            ]}
          />
          <FilterSelect
            label="Equipe"
            value={filters.equipe}
            onChange={(v) => set({ equipe: v })}
            options={[
              { value: "todas", label: "Todas" },
              ...uniques.equipes.map((v) => ({ value: v, label: v })),
            ]}
          />
          <FilterSelect
            label="Categoria"
            value={filters.categoria}
            onChange={(v) => set({ categoria: v })}
            options={[
              { value: "todas", label: "Todas" },
              ...uniques.categorias.map((v) => ({ value: v, label: v })),
            ]}
          />
          <FilterSelect
            label="Criticidade"
            value={filters.criticidade}
            onChange={(v) => set({ criticidade: v })}
            options={[
              { value: "todas", label: "Todas" },
              ...uniques.criticidades.map((v) => ({ value: v, label: v })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => set({ status: v })}
            options={[
              { value: "todos", label: "Todos" },
              ...uniques.statuses.map((v) => ({ value: v, label: v })),
            ]}
          />
          <FilterSelect
            label="Solicitante"
            value={filters.solicitante}
            onChange={(v) => set({ solicitante: v })}
            options={[
              { value: "todos", label: "Todos" },
              ...uniques.solicitantes.map((v) => ({ value: v, label: v })),
            ]}
          />
          <FilterSelect
            label="Prédio"
            value={filters.predio}
            onChange={(v) => set({ predio: v })}
            options={[
              { value: "todos", label: "Todos" },
              ...uniques.predios.map((v) => ({ value: v, label: v })),
            ]}
          />
        </div>
      </div>
    </GlassCard>
  );
}
