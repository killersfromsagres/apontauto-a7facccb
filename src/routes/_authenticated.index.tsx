import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { ForcePasswordChange } from "@/components/force-password-change";

import { useMyAccess } from "@/hooks/use-my-access";
import { menuKeysForPath } from "@/lib/nav-config";
import { Button } from "@/components/ui/button";
import { RefreshCw, LogOut } from "lucide-react";
import { CentralInteligenciaView } from "@/features/inteligencia-pcm/components/central-inteligencia-view";

export const Route = createFileRoute("/_authenticated/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Apont Auto" },
      {
        name: "description",
        content: "Execute esta instrucao no projeto: Modernize completamente a estética da interface, transformando-a em um software premium, sofisticado e profissional, sem alterar a lógica, funcionalidades, integrações ou comportamento atual do sistema.\n\nAplique princípios avançados de UI/UX, melhorando hierarquia visual, proporções, alinhamentos, espaçamentos, legibilidade e consistência entre todos os componentes.\n\nUtilize uma identidade visual moderna e elegante, com paleta de cores harmônica e bem equilibrada, contrastes adequados, tipografia contemporânea, títulos com hierarquia clara e textos secundários mais discretos.\n\nRefine todos os componentes visuais, incluindo cards, botões, inputs, selects, tabelas, menus, modais, badges, tooltips, alertas e barras de navegação, garantindo um padrão visual consistente em toda a aplicação.\n\nAdicione elementos inspirados em interfaces premium atuais, como glassmorphism sutil, transparências controladas, backdrop blur, bordas translúcidas, sombras suaves, profundidade, gradientes discretos e efeitos de iluminação, evitando exageros ou poluição visual.\n\nOs botões devem possuir estados bem definidos de hover, active, focus, disabled e loading, com microinterações fluidas, transições suaves e feedback visual imediato.\n\nMelhore o uso do espaço em branco para deixar a interface mais organizada e respirável. Elimine elementos visualmente pesados, inconsistentes ou desnecessários.\n\nCrie uma experiência responsiva e refinada para desktop, tablet e mobile, garantindo excelente adaptação de grids, cards, menus, formulários e tabelas em diferentes resoluções.\n\nPriorize uma estética semelhante a softwares SaaS premium e produtos modernos da Apple, com acabamento minimalista, sofisticado, tecnológico e corporativo.\n\nUtilize animações e transições discretas entre 150 ms e 300 ms, evitando efeitos excessivos que prejudiquem desempenho ou usabilidade.\n\nPreserve integralmente o código funcional existente. Não remova, renomeie ou altere funções, eventos, APIs, banco de dados, autenticação, rotas ou regras de negócio. A intervenção deve ser prioritariamente visual, estrutural e de experiência do usuário.\n\nAo finalizar, revise toda a aplicação para garantir consistência visual, acessibilidade, contraste adequado, responsividade e ausência de regressões funcionais.",
      },
    ],
  }),
  component: AuthenticatedLayout,
});

function pathKeys(pathname: string): string[] | null {
  // O dashboard é a rota raiz da aplicação autenticada, acessível a todos.
  const isDashboard = 
    pathname === "/" || 
    pathname === "" || 
    pathname === "/dashboard" || 
    pathname === "/dashboard/" ||
    pathname === "/_authenticated" ||
    pathname === "/_authenticated/";

  if (isDashboard) return null;
  return menuKeysForPath(pathname);
}

function AccessGuard() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { access, loading } = useMyAccess();

  useEffect(() => {
    if (loading) return;

    const keys = pathKeys(pathname);
    if (!keys) return;

    // Rota exclusiva de admin
    if (keys.includes("usuarios") && !access.isAdmin) {
      toast.error("Área restrita a administradores.");
      navigate({ to: "/", replace: true });
      return;
    }

    if (access.isAdmin || access.allowed?.includes("climatizacao")) return; // admin e climatizacao acessam tudo sem restrições de menu (climatizacao foca em refrigeração no menu lateral)

    // Sem restrição customizada → acesso total.
    if (!access.allowed) return;
    // Lista vazia: não redireciona (evita loop) — o layout mostra tela de retry.
    if (access.allowed.length === 0) return;

    if (!keys.some((k) => access.allowed!.includes(k))) {
      toast.error("Você não tem permissão para acessar essa página.");
      const fallback = access.allowed.find((item) => item !== "usuarios");
      const target = fallback === "dashboard" || fallback === "menu-inicial" || !fallback ? "/" : `/_authenticated/${fallback}`;
      if (target === pathname) return;
      navigate({ to: target, replace: true });
    }
  }, [pathname, access, loading, navigate]);

  return null;
}

function canRenderPath(
  pathname: string,
  access: ReturnType<typeof useMyAccess>["access"],
  loading: boolean,
) {
  if (loading) return false;
  if (access.isAdmin) return true;
  const keys = pathKeys(pathname);
  if (!keys) return true;
  if (keys.includes("usuarios")) return false;
  if (!access.allowed) return true;
  return keys.some((k) => access.allowed!.includes(k));
}

function AccessFallback({ loading, noMenus }: { loading: boolean; noMenus: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-sm text-muted-foreground">
        Verificando permissões…
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-lg font-semibold tracking-tight">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          {noMenus
            ? "Nenhum módulo foi liberado para este usuário. Se você acabou de entrar, tente recarregar as permissões — caso o problema persista, solicite ao administrador."
            : "Você não tem permissão para acessar este módulo."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["my-access"] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Recarregar permissões
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await qc.cancelQueries();
              qc.clear();
              await supabase.auth.signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { access, loading } = useMyAccess();
  const canRender = canRenderPath(pathname, access, loading);
  const noMenus =
    !loading && !access.isAdmin && Array.isArray(access.allowed) && access.allowed.length === 0;

  // No TanStack Router, se acessamos a rota raiz de um grupo /_authenticated,
  // o Outlet renderizará o conteúdo da rota index se ela existir no mesmo nível.
  // Como agora este arquivo É a rota index (/_authenticated/), se o path for "/",
  // renderizamos o CentralInteligenciaView diretamente em vez de outro Outlet.
  const isIndex = pathname === "/" || pathname === "" || pathname === "/_authenticated" || pathname === "/_authenticated/";

  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full app-bg">
        <AppSidebar />
        <SidebarInset className="flex min-h-dvh min-w-0 flex-1 flex-col bg-transparent">
          <a href="#conteudo-principal" className="skip-link">
            Pular para o conteúdo principal
          </a>
          <AppHeader />
          <AccessGuard />
          <main
            id="conteudo-principal"
            tabIndex={-1}
            className="min-w-0 flex-1 overflow-x-clip pb-[calc(env(safe-area-inset-bottom)+4.75rem)] [contain:paint] md:pb-[env(safe-area-inset-bottom)]"
          >
            {canRender ? (
              isIndex ? <CentralInteligenciaView /> : <Outlet />
            ) : (
              <>
                <AccessFallback loading={loading} noMenus={noMenus} />
              </>
            )}
          </main>
          <MobileTabBar />
          <ForcePasswordChange />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}