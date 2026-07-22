import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type PrismaTabKey = "dashboard" | "novo" | "tecnicos" | "execucoes" | "config";

export function PrismaTabNav({
  active,
  onChange,
  items,
}: {
  active: PrismaTabKey;
  onChange: (k: PrismaTabKey) => void;
  items: { key: PrismaTabKey; label: string; icon: LucideIcon }[];
}) {
  return (
    <div className="flex w-full overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-2xl">
      {items.map((it) => {
        const Icon = it.icon;
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-[0.97] sm:text-sm",
              isActive
                ? "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
