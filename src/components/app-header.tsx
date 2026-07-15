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

  const signOut = async () => {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    } finally {
      navigate({ to: "/auth", replace: true });
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/50 bg-background/70 px-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50 sm:gap-3 sm:px-4">
      <SidebarTrigger />
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/60 to-primary-glow/40 blur-lg opacity-70" />
          <img
            src={logoAsset.url}
            alt="Planejador de Manutenção — insígnia"
            className="relative h-9 w-9 object-contain drop-shadow-[0_0_8px_rgba(56,189,248,0.35)] sm:h-11 sm:w-11"
            loading="eager"
            width={44}
            height={44}
          />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <h1 className="truncate font-display text-sm font-bold tracking-wide sm:text-base">
            <span className="text-gradient">{title}</span>
          </h1>
          {isAdmin ? (
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-primary/70 sm:block">
              &lt;/&gt; Dev <span className="shine-text font-semibold">Gabriel Vitor</span>
            </p>
          ) : displayName ? (
            <p className="hidden truncate font-mono text-[10px] uppercase tracking-[0.2em] text-white sm:block">
              {displayName}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
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
