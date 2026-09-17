import { useEffect } from "react";
import { useMyAccess } from "./use-my-access";

const REOPEN_BUTTON_SELECTOR =
  'button[title="Voltar este chamado para o status Aberta"]';

/**
 * Retorna se o usuário logado é admin.
 * Compartilha o mesmo cache de permissões e também garante que a ação visual
 * "Reabrir chamado" de Corretiva Novo só exista para administradores.
 * A autorização definitiva da reabertura também é protegida no banco.
 */
export function useIsAdmin() {
  const { access, loading } = useMyAccess();

  useEffect(() => {
    if (typeof document === "undefined" || loading) return;

    const enforceReopenVisibility = () => {
      document
        .querySelectorAll<HTMLButtonElement>(REOPEN_BUTTON_SELECTOR)
        .forEach((button) => {
          const container = button.parentElement;
          if (container) container.style.display = access.isAdmin ? "" : "none";
          if (!access.isAdmin) button.disabled = true;
        });
    };

    const blockNonAdminReopen = (event: Event) => {
      if (access.isAdmin) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(REOPEN_BUTTON_SELECTOR)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    enforceReopenVisibility();
    const observer = new MutationObserver(enforceReopenVisibility);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", blockNonAdminReopen, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", blockNonAdminReopen, true);
    };
  }, [access.isAdmin, loading]);

  return { isAdmin: access.isAdmin, loading };
}
