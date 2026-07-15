import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { SlaBell } from "./sla-bell";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.png.asset.json";

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
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary to-primary-glow blur-md opacity-70" />
          <img
            src={logoAsset.url}
            alt="PCM · Planejador de Manutenção"
            className="relative h-10 w-10 rounded-lg object-cover ring-1 ring-primary/30"
          />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <h1 className="truncate font-display text-base font-bold tracking-wide">
            PCM <span className="text-gradient">· Planejador de Manutenção</span>
          </h1>
          <p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-primary/70 sm:block">
            &lt;/&gt; Dev Gabriel Vitor
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
