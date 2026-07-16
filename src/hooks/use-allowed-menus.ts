import { useMyAccess } from "./use-my-access";

/**
 * Retorna os menus permitidos ao usuário logado.
 * `allowed = null` significa acesso total (default).
 * Compartilha o mesmo cache de `useIsAdmin` (uma única chamada por sessão).
 */
export function useAllowedMenus() {
  const { access, loading } = useMyAccess();
  return { allowed: access.allowed, loading };
}
