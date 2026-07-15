import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl animate-fade-in space-y-4 p-3 sm:space-y-6 sm:p-4 md:p-8">
      <div className="flex min-w-0 flex-col gap-3 border-b border-border/40 pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4 sm:pb-5">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
            <span className="text-gradient break-words">{title}</span>
          </h2>
          {description && (
            <p className="mt-1.5 max-w-2xl text-xs text-muted-foreground sm:mt-2 sm:text-sm">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            {actions}
          </div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
