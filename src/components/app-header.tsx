import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { SlaBell } from "./sla-bell";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/pm-rank.png.asset.json";

const ADMIN_EMAIL = "gabrielvlp33@gmail.com";

export function AppHeader() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setFullName((data.user?.user_metadata?.full_name as string | undefined) ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
      setFullName((s?.user?.user_metadata?.full_name as string | undefined) ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isAdmin = email?.toLowerCase() === ADMIN_EMAIL;
  const title = isAdmin ? "Planejador de Manutenção" : "Colaborador";
  const displayName = isAdmin ? "Dev Gabriel Vitor" : (fullName ?? email ?? "");

        <SlaBell />
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Sair" onClick={signOut}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
