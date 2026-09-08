"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { LocationMap } from "@/components/ui/expand-map";

export function AuthLocationMapPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const visualColumn = document.querySelector<HTMLElement>(".auth-bg main > section");
    setTarget(visualColumn);
  }, []);

  if (!target) return null;

  return createPortal(
    <div className="mt-8 w-fit max-w-full">
      <div className="mb-3 flex items-center gap-3">
        <span className="h-px w-8 bg-gradient-to-r from-[#60a5fa]/80 to-transparent" aria-hidden />
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9fc8f6]/60">
          Local da operação
        </p>
      </div>
      <LocationMap
        location="Maria Servidei Demarchi, 123 · Demarchi · São Bernardo do Campo - SP"
        coordinates="Demarchi · São Bernardo do Campo, SP"
      />
    </div>,
    target,
  );
}
