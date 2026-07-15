import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Liquid Glass panel (iOS 26 language):
 *  - translucent frosted fill (glass-surface utility handles blur + refraction)
 *  - top edge highlight simulating light refraction (::before)
 *  - continuous large radius (squircle-like)
 *  - depth from layered blur, never from solid color fills
 */
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
        "glass-surface relative overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-6",
        // top refraction highlight
        "before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px",
        "before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent",
        "transition-shadow duration-300 hover:shadow-elegant",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
