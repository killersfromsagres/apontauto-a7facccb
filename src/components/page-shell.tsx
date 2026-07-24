import type { ReactNode } from "react";

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
    <div className="mx-auto w-full min-w-0 max-w-7xl animate-fade-in space-y-5 p-3 sm:space-y-7 sm:p-4 md:p-8">
      <div className="relative flex min-w-0 flex-col gap-3 border-b border-border/50 pb-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4 sm:pb-6">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-eyebrow mb-2">{eyebrow}</div>
          )}
          <h2 className="font-display text-2xl font-bold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl">
            <span className="text-gradient break-words">{title}</span>
          </h2>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:text-base">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap [&>*]:flex-1 sm:[&>*]:flex-none">
            {actions}
          </div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
