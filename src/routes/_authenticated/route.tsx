import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { useMyAccess } from "@/hooks/use-my-access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

// Mapeia o primeiro segmento da URL para uma chave de menu (mesma usada em
// `MENU_KEYS` / `allowed_menus`). `null` = rota sempre permitida (auth página, etc.).
function pathToMenuKey(pathname: string): string | null {
  if (pathname === "/" || pathname === "") return "dashboard";
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return "dashboard";
  return seg;
}

function AccessGuard() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { access, loading } = useMyAccess();

  useEffect(() => {
    if (loading) return;
    if (access.isAdmin) return; // admin acessa tudo

    const key = pathToMenuKey(pathname);
    if (!key) return;

    // Rota exclusiva de admin
    if (key === "usuarios") {
      toast.error("Área restrita a administradores.");
      navigate({ to: "/", replace: true });
      return;
    }

    // Sem restrição customizada → acesso total somente após resposta válida do backend.
    if (!access.allowed) return;

    if (!access.allowed.includes(key)) {
      toast.error("Você não tem permissão para acessar essa página.");
      const fallback = access.allowed.find((item) => item !== "usuarios");
      const target =
        fallback === "dashboard" || !fallback ? "/" : `/${fallback}`;
      if (target === pathname) return;
      navigate({ to: target, replace: true });
    }
  }, [pathname, access, loading, navigate]);

  return null;
}

function canRenderPath(pathname: string, access: ReturnType<typeof useMyAccess>["access"], loading: boolean) {
  if (loading) return false;
  if (access.isAdmin) return true;
  const key = pathToMenuKey(pathname);
  if (!key) return true;
  if (key === "usuarios") return false;
  if (!access.allowed) return true;
  return access.allowed.includes(key);
}

function AccessFallback({ loading, noMenus }: { loading: boolean; noMenus: boolean }) {
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-sm text-muted-foreground">
        Verificando permissões…
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-semibold tracking-tight">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          {noMenus
            ? "Nenhum módulo foi liberado para este usuário. Solicite a revisão das permissões ao administrador."
            : "Você não tem permissão para acessar este módulo."}
        </p>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { access, loading } = useMyAccess();
  const canRender = canRenderPath(pathname, access, loading);
  const noMenus = !loading && !access.isAdmin && Array.isArray(access.allowed) && access.allowed.length === 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full app-bg">
        <AppSidebar />
        <SidebarInset className="flex min-h-screen flex-1 flex-col bg-transparent">
          <AppHeader />
          <AccessGuard />
          <main className="flex-1">
            {canRender ? <Outlet /> : <AccessFallback loading={loading} noMenus={noMenus} />}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
