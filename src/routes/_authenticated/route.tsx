// Auto-injected by the Supabase integration when this file does not exist.
import { useEffect } from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { useMyAccess } from "@/hooks/use-my-access";
import { supabase } from "@/integrations/supabase/client";
import {
  allMenuItems,
  itemKeys,
  menuItemForPath,
  menuKeysForPath,
} from "@/lib/nav-config";

const SIGN_IN_ROUTE = "/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession reads the persisted local session and does not introduce a
    // blocking network round-trip on every navigation. Supabase/RLS remains
    // the source of truth for all protected data calls.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) {
      throw redirect({ to: SIGN_IN_ROUTE });
    }
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function TaludesPointEditorEnhancer() {
  useEffect(() => {
    let editingPoints = false;
    let manuallyExpanded = false;
    let pill: HTMLButtonElement | null = null;
    let currentPanel: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    const getEditor = () =>
      Array.from(document.querySelectorAll<HTMLElement>("div")).find((element) =>
        element.classList.contains("group/editor"),
      ) ?? null;

    const getConfigPanel = () => {
      const heading = Array.from(document.querySelectorAll<HTMLElement>("span")).find(
        (element) => element.textContent?.trim().toLowerCase() === "configurar legenda",
      );
      const panel = heading?.parentElement?.parentElement as HTMLElement | null;
      if (panel) {
        panel.classList.add("taludes-config-panel");
        currentPanel = panel;
      }
      return panel;
    };

    const getTaludeLabel = (panel: HTMLElement) => {
      const inputs = Array.from(panel.querySelectorAll<HTMLInputElement>("input"));
      const numberInput = inputs.find((input) => {
        const value = input.value.trim();
        return input.type === "number" || /^\d{1,3}$/.test(value);
      });
      return numberInput?.value ? `Talude ${numberInput.value}` : "Talude selecionado";
    };

    const removePill = () => {
      pill?.remove();
      pill = null;
    };

    const expandPanel = () => {
      const panel = getConfigPanel();
      if (panel) panel.classList.remove("taludes-config-panel--minimized");
      manuallyExpanded = true;
      removePill();
    };

    const ensureMinimizeButton = (panel: HTMLElement) => {
      const header = panel.firstElementChild as HTMLElement | null;
      if (!header || header.querySelector("[data-taludes-minimize='true']")) return;

      const closeButton = header.querySelector("button");
      const minimizeButton = document.createElement("button");
      minimizeButton.type = "button";
      minimizeButton.dataset.taludesMinimize = "true";
      minimizeButton.className = "taludes-panel-minimize";
      minimizeButton.title = "Minimizar ajustes e continuar editando pontos";
      minimizeButton.setAttribute("aria-label", "Minimizar painel de ajustes");
      minimizeButton.innerHTML = "<span aria-hidden='true'>−</span>";
      minimizeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        manuallyExpanded = false;
        panel.classList.add("taludes-config-panel--minimized");
        window.requestAnimationFrame(() => ensurePill(panel));
      });

      if (closeButton) header.insertBefore(minimizeButton, closeButton);
      else header.appendChild(minimizeButton);
    };

    const ensurePill = (panel: HTMLElement) => {
      if (!editingPoints || manuallyExpanded) return;
      const editor = getEditor();
      if (!editor) return;

      if (!pill || !document.body.contains(pill)) {
        pill = document.createElement("button");
        pill.type = "button";
        pill.className = "taludes-edit-pill";
        pill.title = "Reabrir os ajustes da demarcação sem sair do modo de edição";
        pill.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          expandPanel();
        });
        editor.appendChild(pill);
      }

      pill.innerHTML = `
        <span class="taludes-edit-pill__dot" aria-hidden="true"></span>
        <span class="taludes-edit-pill__label">${getTaludeLabel(panel)} · Editando pontos</span>
        <span class="taludes-edit-pill__action">Abrir ajustes</span>
      `;
    };

    const minimizePanel = () => {
      if (!editingPoints || manuallyExpanded) return;
      const panel = getConfigPanel();
      if (!panel) {
        removePill();
        return;
      }
      ensureMinimizeButton(panel);
      panel.classList.add("taludes-config-panel--minimized");
      ensurePill(panel);
    };

    const deactivateEditing = () => {
      editingPoints = false;
      manuallyExpanded = false;
      const panel = getConfigPanel();
      panel?.classList.remove("taludes-config-panel--minimized");
      removePill();
    };

    const handleToolbarClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      const title = button?.getAttribute("title") ?? "";

      if (title === "Editar Pontos") {
        editingPoints = true;
        manuallyExpanded = false;
        window.setTimeout(minimizePanel, 0);
        window.requestAnimationFrame(minimizePanel);
        return;
      }

      if (["Visualizar", "Desenhar Área", "Mover Legendas"].includes(title)) {
        deactivateEditing();
      }
    };

    document.addEventListener("click", handleToolbarClick, true);

    observer = new MutationObserver(() => {
      if (!editingPoints) return;
      window.requestAnimationFrame(() => {
        const panel = getConfigPanel();
        if (!panel) {
          removePill();
          return;
        }
        ensureMinimizeButton(panel);
        if (!manuallyExpanded) minimizePanel();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("click", handleToolbarClick, true);
      observer?.disconnect();
      currentPanel?.classList.remove("taludes-config-panel--minimized");
      removePill();
    };
  }, []);

  return (
    <style>{`
      .taludes-config-panel {
        transition: opacity 160ms ease, transform 180ms ease, max-height 180ms ease;
      }

      .taludes-config-panel--minimized {
        display: none !important;
      }

      .taludes-panel-minimize {
        display: inline-flex;
        height: 24px;
        width: 24px;
        align-items: center;
        justify-content: center;
        margin-left: auto;
        margin-right: 2px;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 7px;
        background: rgba(255,255,255,0.035);
        color: rgba(255,255,255,0.72);
        font-size: 16px;
        line-height: 1;
        transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
      }

      .taludes-panel-minimize:hover {
        background: rgba(56,189,248,0.12);
        border-color: rgba(56,189,248,0.28);
        color: #e0f2fe;
      }

      .taludes-edit-pill {
        position: absolute;
        top: 72px;
        left: 16px;
        z-index: 65;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 34px;
        max-width: min(360px, calc(100% - 32px));
        padding: 0 10px;
        border: 1px solid rgba(125,211,252,0.22);
        border-radius: 999px;
        background: rgba(5,10,18,0.88);
        color: rgba(255,255,255,0.88);
        box-shadow: 0 10px 30px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.05);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.025em;
        cursor: pointer;
        animation: taludes-pill-in 160ms ease-out;
      }

      .taludes-edit-pill:hover {
        border-color: rgba(125,211,252,0.38);
        background: rgba(8,16,28,0.94);
      }

      .taludes-edit-pill__dot {
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: #38bdf8;
        box-shadow: 0 0 0 4px rgba(56,189,248,0.10), 0 0 14px rgba(56,189,248,0.40);
      }

      .taludes-edit-pill__label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .taludes-edit-pill__action {
        flex: 0 0 auto;
        padding-left: 8px;
        border-left: 1px solid rgba(255,255,255,0.10);
        color: #7dd3fc;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }

      div[class~="group/editor"] svg circle.pointer-events-auto.cursor-pointer {
        filter: drop-shadow(0 0 2px rgba(255,255,255,0.95)) drop-shadow(0 0 7px rgba(56,189,248,0.42));
        transition: filter 120ms ease, opacity 120ms ease;
      }

      div[class~="group/editor"] svg circle.pointer-events-auto.cursor-pointer:hover {
        filter: drop-shadow(0 0 3px rgba(255,255,255,1)) drop-shadow(0 0 10px rgba(56,189,248,0.78));
      }

      @keyframes taludes-pill-in {
        from { opacity: 0; transform: translateY(-5px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @media (max-width: 768px) {
        .taludes-config-panel:not(.taludes-config-panel--minimized) {
          position: fixed !important;
          left: 10px !important;
          right: 10px !important;
          bottom: 10px !important;
          top: auto !important;
          width: auto !important;
          min-width: 0 !important;
          max-height: min(58dvh, 520px) !important;
          z-index: 90 !important;
          border-radius: 18px !important;
          box-shadow: 0 -12px 42px rgba(0,0,0,0.48) !important;
        }

        .taludes-edit-pill {
          position: fixed;
          top: auto;
          left: 50%;
          bottom: 14px;
          transform: translateX(-50%);
          width: max-content;
          max-width: calc(100vw - 24px);
          min-height: 38px;
          z-index: 95;
        }

        .taludes-edit-pill__action {
          display: none;
        }

        @keyframes taludes-pill-in {
          from { opacity: 0; transform: translate(-50%, 6px) scale(0.98); }
          to { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
      }
    `}</style>
  );
}

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { access, loading } = useMyAccess();
  const knownSection = menuItemForPath(pathname);
  const pathKeys = menuKeysForPath(pathname) ?? [];
  const canView =
    access.isAdmin ||
    !knownSection ||
    pathKeys.some((key) => access.allowed?.includes(key));

  if (loading) {
    return (
      <BrandedLoadingState
        label="Validando acesso"
        detail="Carregando permissões e preparando seu ambiente operacional"
        variant="page"
      />
    );
  }

  if (!canView) {
    const firstAllowed = allMenuItems.find(
      (item) =>
        item.url !== "#" &&
        item.key !== "usuarios" &&
        itemKeys(item).some((key) => access.allowed?.includes(key)),
    );

    return (
      <div className="flex min-h-[55vh] items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/60 p-6 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Seção não liberada</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Este login não possui permissão de visualização para esta seção. Um administrador
            pode ajustar o acesso no Controle de Usuários.
          </p>
          {firstAllowed && (
            <Button asChild className="mt-5">
              <a href={firstAllowed.url}>Abrir primeira seção permitida</a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {pathname === "/corretiva-novo" && (
        <style>{`
          /* Corretiva Novo — hierarquia compacta dos identificadores do card. */
          .mb-3.flex.flex-wrap.items-center.justify-between > .font-mono {
            height: 28px !important;
            padding: 0 10px !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            letter-spacing: 0.025em !important;
            border-radius: 9999px !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18) !important;
          }

          .mb-3.flex.flex-wrap.items-center.justify-between > div:has(> [title^="Score "]) {
            gap: 5px !important;
          }

          [title^="Equipe responsável:"] {
            order: 1 !important;
            height: 28px !important;
            max-width: min(100%, 180px) !important;
            padding: 0 10px !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            letter-spacing: 0.025em !important;
            border-radius: 9999px !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18) !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          .mb-3.flex.flex-wrap.items-center.justify-between > div:has(> [title^="Score "]) {
            gap: 5px !important;
          }

          [title^="Score "] {
            order: 2 !important;
            height: 21px !important;
            padding: 0 7px !important;
            font-size: 9px !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            letter-spacing: 0.025em !important;
            border-radius: 9999px !important;
            box-shadow: none !important;
          }

          [title^="Backorder"] {
            order: 3 !important;
            height: 20px !important;
            padding: 0 7px !important;
            font-size: 8px !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            letter-spacing: 0.04em !important;
            border-color: rgba(248, 113, 113, 0.42) !important;
            background: rgba(220, 38, 38, 0.88) !important;
            box-shadow: none !important;
          }

          [class*="border-emerald-500/35"] {
            order: 4 !important;
            height: 20px !important;
            padding-left: 7px !important;
            padding-right: 7px !important;
            font-size: 8px !important;
            box-shadow: none !important;
          }
        `}</style>
      )}
      {pathname === "/taludes" && <TaludesPointEditorEnhancer />}
      <Outlet />
    </>
  );
}
