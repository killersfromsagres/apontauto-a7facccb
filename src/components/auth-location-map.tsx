"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { LocationMap } from "@/components/ui/expand-map";

const MAP_MOUNT_ATTRIBUTE = "data-auth-location-map-mount";

export function AuthLocationMapPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    let ownedMount: HTMLDivElement | null = null;

    const attachMapMount = () => {
      const visualColumn = document.querySelector<HTMLElement>(".auth-bg main > section");
      if (!visualColumn) return false;

      const existingMount = visualColumn.querySelector<HTMLElement>(
        `[${MAP_MOUNT_ATTRIBUTE}]`,
      );

      if (existingMount) {
        setTarget(existingMount);
        return true;
      }

      const mount = document.createElement("div");
      mount.setAttribute(MAP_MOUNT_ATTRIBUTE, "true");
      mount.className = "w-full";

      // Mantém o mapa no fluxo natural da coluna de apresentação e o coloca
      // antes dos indicadores (Disponibilidade / Segurança / Sincronização).
      const metrics = visualColumn.querySelector("dl");
      visualColumn.insertBefore(mount, metrics ?? null);

      ownedMount = mount;
      setTarget(mount);
      return true;
    };

    // Em navegação SPA a rota pode montar depois do RootComponent. Tentamos
    // imediatamente e, caso ainda não exista, aguardamos a árvore do /auth.
    if (!attachMapMount()) {
      observer = new MutationObserver(() => {
        if (attachMapMount()) {
          observer?.disconnect();
          observer = null;
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer?.disconnect();
      ownedMount?.remove();
    };
  }, []);

  if (!target) return null;

  return createPortal(
    <div className="mb-7 mt-7 w-fit max-w-full">
      <div className="mb-3 flex items-center gap-3">
        <span
          className="h-px w-8 bg-gradient-to-r from-[#60a5fa]/80 to-transparent"
          aria-hidden
        />
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9fc8f6]/70">
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
