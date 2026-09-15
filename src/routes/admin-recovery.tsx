import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recoverAdministrator } from "@/lib/admin-recovery.functions";

export const Route = createFileRoute("/admin-recovery")({
  head: () => ({
    meta: [
      { title: "Recuperação administrativa — Apont Auto" },
      {
        name: "description",
        content: "Recuperação protegida e de uso único da conta administrativa.",
      },
    ],
  }),
  component: AdminRecoveryPage,
});

function AdminRecoveryPage() {
  const navigate = useNavigate();
  const recover = useServerFn(recoverAdministrator);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      await recover({ data: { recoveryCode, newPassword } });
      setRecoveryCode("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Administrador restaurado. Entre com o login admin.");
      navigate({ to: "/auth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao restaurar administrador.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg relative flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-[28px] border border-white/10 bg-[#0d1425]/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>

          <div className="mb-6 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              Recuperação protegida
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Restaurar administrador
            </h1>
            <p className="text-sm leading-relaxed text-white/55">
              Este procedimento é de uso único. O código é validado somente no servidor e não fica
              armazenado no navegador.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-code" className="text-white/75">
                Código de recuperação
              </Label>
              <Input
                id="recovery-code"
                type="password"
                autoComplete="off"
                required
                minLength={16}
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                placeholder="Código temporário do servidor"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-white/75">
                Nova senha
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-white/75">
                Confirmar nova senha
              </Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>

            <Button type="submit" disabled={loading} className="mt-2 w-full">
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Restaurar administrador
            </Button>
          </form>

          <div className="mt-6 border-t border-white/10 pt-5">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 text-xs font-medium text-white/55 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
