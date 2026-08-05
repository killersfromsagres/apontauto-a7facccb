import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";


export function PageShell({
  title,
  description,
  eyebrow,
  children,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl animate-fade-in space-y-4 p-3 sm:space-y-7 sm:p-4 md:p-8">
      {/* Cabeçalho Compacto Mobile */}
      <div className="relative flex min-w-0 flex-col gap-2 border-b border-border/40 pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4 sm:pb-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="md:hidden pt-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
              asChild
            >
              <a href="/">
                <ArrowLeft className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary/80 sm:text-xs mb-1.5 sm:mb-2">
                {eyebrow}
              </div>
            )}
            <h2 className="font-sans text-xl font-bold leading-tight tracking-tight sm:text-3xl md:text-4xl">
              <span className="text-gradient break-words">{title}</span>
            </h2>
            {description && (
              <p className="mt-1 line-clamp-2 max-w-2xl text-[12px] leading-snug text-muted-foreground sm:mt-3 sm:line-clamp-none sm:text-base">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap [&>*]:flex-1 sm:[&>*]:flex-none">
            {actions}
          </div>
        )}
      </div>
      <div className="min-w-0 pb-16 md:pb-0">{children}</div>
    </div>
  );
}
