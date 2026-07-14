import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";
import logo from "@/assets/logo.png";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/60 px-4 backdrop-blur-xl">
      <SidebarTrigger />
      <div className="flex items-center gap-3">
        <img src={logo} alt="Logo Sistema de Apontamento" className="h-9 w-9 rounded-lg shadow-sm" />
        <div className="flex flex-col leading-tight">
          <h1 className="text-base font-semibold tracking-tight">Sistema de Apontamento</h1>
          <p className="text-[11px] text-muted-foreground">
            Desenvolvido por: Dev Gabriel Vitor
          </p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
