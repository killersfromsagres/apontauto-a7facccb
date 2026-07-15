import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getIsAdmin } from "@/lib/users.functions";

export function useIsAdmin() {
  const check = useServerFn(getIsAdmin);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }
      try {
        const res = await check();
        if (!cancelled) setIsAdmin(Boolean(res?.isAdmin));
      } catch {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") run();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [check]);

  return { isAdmin, loading };
}
