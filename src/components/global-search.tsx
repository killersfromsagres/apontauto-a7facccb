import { memo, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useVisibleSections } from "@/lib/nav-config";
import { searchEntities, type EntityResult } from "@/lib/search/entities";

/**
 * Pesquisa global (⌘K / Ctrl+K): módulos e ações liberados para o usuário
 * mais entidades reais do banco (OS, ativo, veículo e colaborador).
 * Os resultados de dados respeitam a RLS — módulos sem permissão não retornam.
 */
export const GlobalSearch = memo(function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [entities, setEntities] = useState<EntityResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const { visibleSections, loading } = useVisibleSections();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Busca de dados com debounce — evita disparar consulta a cada tecla.
  useEffect(() => {
    if (!open) return;
    const q = term.trim();
    if (q.length < 2) {
      setEntities([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let ativo = true;
    const timer = window.setTimeout(() => {
      searchEntities(q)
        .then((r) => {
          if (ativo) setEntities(r);
        })
        .finally(() => {
          if (ativo) setSearching(false);
        });
    }, 300);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [term, open]);

  const entityGroups = useMemo(() => {
    const map = new Map<string, EntityResult[]>();
    for (const item of entities) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [entities]);

  if (loading) return null;

  const go = (url: string) => {
    setOpen(false);
    setTerm("");
    navigate({ to: url });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Pesquisar páginas, OS, ativos, veículos e colaboradores"
        className="h-9 gap-2 rounded-full border-border/60 bg-muted/30 px-2.5 text-muted-foreground sm:px-3"
      >
        <Search className="h-4 w-4" />
        <span className="hidden text-xs sm:inline">Pesquisar…</span>
        <kbd className="hidden rounded border border-border/60 px-1 font-mono text-[10px] lg:inline">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder="Buscar página, OS, ativo, veículo ou colaborador…"
        />
        <CommandList>
          <CommandEmpty>
            {searching ? (
              <span className="flex items-center justify-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
              </span>
            ) : (
              "Nenhum resultado."
            )}
          </CommandEmpty>

          {entityGroups.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.title} ${item.subtitle ?? ""}`}
                  onSelect={() => go(item.url)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.title}</p>
                    {item.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          {visibleSections.map((section) => {
            const items = section.kind === "item" ? [section.item] : section.items;
            const heading = section.kind === "item" ? "Atalhos" : section.title;
            return (
              <CommandGroup
                key={section.kind === "item" ? section.item.key : section.key}
                heading={heading}
              >
                {items.map((item) => (
                  <CommandItem
                    key={item.key}
                    value={`${item.title} ${item.short ?? ""} ${(item.keywords ?? []).join(" ")} ${heading}`}
                    onSelect={() => go(item.url)}
                  >
                    <item.icon className="mr-2 h-4 w-4 opacity-80" />
                    <span>{item.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
});
