import { memo, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";

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

/**
 * Pesquisa global (⌘K / Ctrl+K) — módulos e ações liberados para o usuário.
 */
export const GlobalSearch = memo(function GlobalSearch() {
  const [open, setOpen] = useState(false);
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

  if (loading) return null;

  const go = (url: string) => {
    setOpen(false);
    navigate({ to: url });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Pesquisar módulos e ações"
        className="h-9 gap-2 rounded-full border-border/60 bg-muted/30 px-2.5 text-muted-foreground sm:px-3"
      >
        <Search className="h-4 w-4" />
        <span className="hidden text-xs sm:inline">Pesquisar…</span>
        <kbd className="hidden rounded border border-border/60 px-1 font-mono text-[10px] lg:inline">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar módulo ou ação…" />
        <CommandList>
          <CommandEmpty>Nenhum resultado.</CommandEmpty>
          {visibleSections.map((section) => {
            const items = section.kind === "item" ? [section.item] : section.items;
            const heading = section.kind === "item" ? "Atalhos" : section.title;
            return (
              <CommandGroup key={section.kind === "item" ? section.item.key : section.key} heading={heading}>
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
