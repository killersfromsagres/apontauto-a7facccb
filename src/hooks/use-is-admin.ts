import { useMyAccess } from "./use-my-access";

/**
 * Retorna se o usuário logado é admin.
 * Compartilha o mesmo cache de `useAllowedMenus` (uma única chamada por sessão).
 */
export function useIsAdmin() {
  const { access, loading } = useMyAccess();
  return { isAdmin: access.isAdmin, loading };
}
