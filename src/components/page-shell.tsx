import type { ReactNode } from "react";
import { motion } from "framer-motion";

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/40 pb-5">
        <div className="min-w-0">
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            <span className="text-gradient">{title}</span>
          </h2>
          {description && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </motion.div>
  );
}
