import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { SlaBell } from "./sla-bell";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

export function AppHeader() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/50 bg-background/70 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
      <SidebarTrigger />
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary to-primary-glow blur-md opacity-60" />
          <img
            src={logo}
            alt="Logo Sistema de Apontamento"
            className="relative h-9 w-9 rounded-lg ring-1 ring-white/10"
          />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <h1 className="truncate font-display text-base font-semibold tracking-tight">
            Sistema de Apontamento
          </h1>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            Desenvolvido por Dev Gabriel Vitor
          </p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {email && (
          <span className="hidden max-w-[200px] truncate rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-xs text-muted-foreground md:inline">
            {email}
          </span>
        )}
        <SlaBell />
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Sair" onClick={signOut}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
