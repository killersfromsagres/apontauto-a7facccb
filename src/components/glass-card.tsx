import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={cn(
        "glass-surface relative overflow-hidden rounded-2xl p-6",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px",
        "before:bg-gradient-to-r before:from-transparent before:via-primary/40 before:to-transparent",
        "after:pointer-events-none after:absolute after:-top-24 after:-right-16 after:h-48 after:w-48",
        "after:rounded-full after:bg-primary/15 after:blur-3xl",
        "transition-shadow hover:shadow-elegant",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
