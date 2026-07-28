import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { SlaBell } from "./sla-bell";
import { GlobalSearch } from "./global-search";
import { supabase } from "@/integrations/supabase/client";
import { clearCredentials } from "@/lib/auth/saved-credentials";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
const logoAsset = { url: "/apontauto-logo.png" };

const ADMIN_EMAIL = "gabrielvlp33@gmail.com";

export function AppHeader() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    // getSession lê do storage local — sem round-trip. RLS no servidor continua sendo a autoridade real.
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
      setFullName((data.session?.user?.user_metadata?.full_name as string | undefined) ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
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
      clearCredentials();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[signOut]", err);
    } finally {
      // Hard redirect evita ficar preso em rota protegida com queries suspensas após limpar a sessão.
      window.location.replace("/auth");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 sm:h-16 border-b border-border/50 bg-background/70 px-3 pt-[env(safe-area-inset-top)] pl-[max(env(safe-area-inset-left),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/50 sm:gap-3 sm:px-4">
      <SidebarToggle />
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <div className="relative shrink-0">
          <img
            src={logoAsset.url}
            alt="Apont Auto — Sistema Automático de Apontamento"
            className="relative h-9 w-9 object-contain sm:h-12 sm:w-12"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={48}
            height={48}
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
        <GlobalSearch />
        <SlaBell />
        <ThemeToggle />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Sair">
              <LogOut className="h-5 w-5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deseja sair da conta?</AlertDialogTitle>
              <AlertDialogDescription>
                Você será desconectado e retornado à tela de login.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={signOut}>Sair</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
}
