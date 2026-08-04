import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** E-mail do proprietário do sistema. */
export const OWNER_EMAIL = "gabrielvlp33@gmail.com"; // Keep for internal ID but hide from UI

/**
 * Verdadeiro para o proprietário (`OWNER_EMAIL`) **e** para qualquer usuário
 * com papel `admin`. Administradores não têm restrições de UI — a proteção
 * real continua nas políticas do banco (RLS).
 */
export function useIsOwner() {
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) return;

        const email = (user.email ?? "").trim().toLowerCase();
        if (email === OWNER_EMAIL) {
          if (active) setIsOwner(true);
          return;
        }

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin");

        if (active) setIsOwner((roles ?? []).length > 0);
      } catch {
        /* mantém falso em caso de falha */
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { isOwner, loading };
}
