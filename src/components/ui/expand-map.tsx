"use client";

import type React from "react";
import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { MapPin } from "lucide-react";

interface LocationMapProps {
  location?: string;
  coordinates?: string;
  className?: string;
}

const horizontalStreets = [20, 50, 80];
const verticalStreets = [15, 45, 55, 85];

export function LocationMap({
  location = "Maria Servidei Demarchi, 123 · Demarchi · São Bernardo do Campo - SP",
  coordinates = "Demarchi · São Bernardo do Campo, SP",
  className,
}: LocationMapProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-50, 50], [8, -8]);
  const rotateY = useTransform(mouseX, [-50, 50], [-8, 8]);
  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set(event.clientX - (rect.left + rect.width / 2));
    mouseY.set(event.clientY - (rect.top + rect.height / 2));
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };

  const toggleExpanded = () => setIsExpanded((value) => !value);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpanded();
    }
  };

  return (
    <motion.div
      ref={containerRef}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Recolher" : "Expandir"} mapa de ${location}`}
      className={`relative cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#6ea8ff]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f] ${className ?? ""}`}
      style={{ perspective: 1000 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={toggleExpanded}
      onKeyDown={handleKeyDown}
    >
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-[#78aef7]/20 bg-[#06152b] shadow-[0_18px_45px_rgba(0,20,50,0.38)]"
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          transformStyle: "preserve-3d",
        }}
        animate={{
          width: isExpanded ? 360 : 260,
          height: isExpanded ? 280 : 156,
          y: isHovered ? -2 : 0,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#123b69]/85 via-[#082341] to-[#041425]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(96,165,250,0.20),transparent_34%),radial-gradient(circle_at_82%_82%,rgba(34,211,238,0.10),transparent_34%)]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(125,183,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(125,183,255,0.06)_1px,transparent_1px)] [background-size:24px_24px]" />

        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          <motion.line
            x1="0%"
            y1="35%"
            x2="100%"
            y2="35%"
            stroke="rgba(142,196,255,0.48)"
            strokeWidth="4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          />
          <motion.line
            x1="0%"
            y1="65%"
            x2="100%"
            y2="65%"
            stroke="rgba(142,196,255,0.40)"
            strokeWidth="4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          />
          <motion.line
            x1="30%"
            y1="0%"
            x2="30%"
            y2="100%"
            stroke="rgba(125,183,255,0.34)"
            strokeWidth="3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          />
          <motion.line
            x1="70%"
            y1="0%"
            x2="70%"
            y2="100%"
            stroke="rgba(125,183,255,0.34)"
            strokeWidth="3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          />

          {horizontalStreets.map((y, index) => (
            <motion.line
              key={`h-${y}`}
              x1="0%"
              y1={`${y}%`}
              x2="100%"
              y2={`${y}%`}
              stroke="rgba(117,174,235,0.20)"
              strokeWidth="1.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.45 + index * 0.08 }}
            />
          ))}
          {verticalStreets.map((x, index) => (
            <motion.line
              key={`v-${x}`}
              x1={`${x}%`}
              y1="0%"
              x2={`${x}%`}
              y2="100%"
              stroke="rgba(117,174,235,0.18)"
              strokeWidth="1.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.5 + index * 0.08 }}
            />
          ))}
        </svg>

        <motion.div
          className="absolute left-[10%] top-[40%] h-[20%] w-[15%] rounded-sm border border-[#72a7df]/20 bg-[#17395e]/90"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.4 }}
        />
        <motion.div
          className="absolute left-[35%] top-[15%] h-[15%] w-[12%] rounded-sm border border-[#72a7df]/15 bg-[#1a4169]/85"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.48 }}
        />
        <motion.div
          className="absolute left-[75%] top-[70%] h-[18%] w-[18%] rounded-sm border border-[#72a7df]/15 bg-[#163654]/90"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.56 }}
        />
        <motion.div
          className="absolute right-[10%] top-[20%] h-[25%] w-[10%] rounded-sm border border-[#72a7df]/15 bg-[#1a4169]/80"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.52 }}
        />

        <motion.div
          className="absolute left-[53%] top-[44%] z-20 -translate-x-1/2 -translate-y-1/2"
          animate={{ y: isHovered ? -5 : 0, scale: isExpanded ? 1.05 : 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
        >
          <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3b82f6]/20 blur-md" />
          <span className="relative grid h-10 w-10 place-items-center rounded-full border border-white/35 bg-gradient-to-br from-[#60a5fa] to-[#1d4ed8] shadow-[0_8px_24px_rgba(37,99,235,0.55)]">
            <MapPin className="h-5 w-5 text-white" strokeWidth={2.2} />
          </span>
          <motion.span
            className="absolute left-1/2 top-1/2 -z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#7dd3fc]/50"
            animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        </motion.div>

        <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-white/10 bg-[#04111f]/78 px-3 py-2.5 backdrop-blur-xl">
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#7dd3fc]" />
            <div className="min-w-0">
              <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-white/95">
                {location}
              </p>
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.p
                    className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9fc8f6]/65"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                  >
                    {coordinates}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="absolute right-3 top-3 z-20 rounded-full border border-[#8fc3ff]/20 bg-[#04111f]/65 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#b8d8ff]/70 backdrop-blur-md">
          {isExpanded ? "Clique para recolher" : "Ver localização"}
        </div>
      </motion.div>
    </motion.div>
  );
}
