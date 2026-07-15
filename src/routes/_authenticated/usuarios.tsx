import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus, Loader2, ShieldCheck, User as UserIcon } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAppUser } from "@/lib/users.functions";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
});

type Role = "admin" | "user";

function UsuariosPage() {
  const { isAdmin, loading: checking } = useIsAdmin();
  const create = useServerFn(createAppUser);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await create({ data: { login, password, fullName: fullName || undefined, role } });
      toast.success(`Usuário "${login}" criado como ${role === "admin" ? "administrador" : "usuário"}.`);
      setLogin("");
      setPassword("");
      setFullName("");
      setRole("user");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao criar usuário";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <PageShell title="Usuários" description="Verificando permissões…">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell title="Usuários" description="Área restrita">
        <GlassCard>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para acessar esta página. Apenas administradores podem gerenciar usuários.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Usuários"
      description="Crie novos usuários e defina o nível de acesso. Contas já são criadas confirmadas."
    >
      <div className="max-w-xl">
        <GlassCard>
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <UserPlus className="h-4 w-4" strokeWidth={1.75} />
              Novo usuário
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo (opcional)</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex.: João da Silva"
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@exemplo.com"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de acesso</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("user")}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                    role === "user"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <UserIcon className="h-4 w-4" /> Usuário
                </button>
                <button
                  type="button"
                  onClick={() => setRole("admin")}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                    role === "admin"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" /> Administrador
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Administradores podem criar outros usuários e acessar áreas restritas.
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando…
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Criar usuário
                </>
              )}
            </Button>
          </form>
        </GlassCard>
      </div>
    </PageShell>
  );
}
