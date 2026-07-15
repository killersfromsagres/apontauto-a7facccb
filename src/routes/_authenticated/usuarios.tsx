import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAppUser } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
});

function UsuariosPage() {
  const create = useServerFn(createAppUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await create({ data: { email, password, fullName: fullName || undefined } });
      toast.success(`Usuário ${email} criado. Já pode entrar com essa senha.`);
      setEmail("");
      setPassword("");
      setFullName("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao criar usuário";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title="Usuários"
      description="Crie novos usuários que poderão entrar imediatamente com o e-mail e senha informados."
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
              <p className="text-xs text-muted-foreground">
                A conta é criada com e-mail já confirmado — o usuário entra imediatamente com essas credenciais.
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
