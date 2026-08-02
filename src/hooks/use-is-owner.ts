import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** E-mail do proprietário do sistema — único autorizado a importar planilhas. */
export const OWNER_EMAIL = "gabrielvlp33@gmail.com";

/**
 * Verdadeiro apenas para o proprietário (`OWNER_EMAIL`).
 * Usado para esconder ações de importação em massa. A proteção real
 * continua nas políticas do banco (RLS) — isto é apenas a camada de UI.
 */
export function useIsOwner() {
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        const email = (data.user?.email ?? "").trim().toLowerCase();
        setIsOwner(email === OWNER_EMAIL);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { isOwner, loading };
}
