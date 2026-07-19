import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, UserRound, ShieldCheck, Loader2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  touchCredentials,
} from "@/lib/auth/saved-credentials";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
const logo = { url: "/apontauto-logo.png" };

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Sistema de Apontamento" },
      { name: "description", content: "Acesse o Sistema de Apontamento de manutenção industrial." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [askSave, setAskSave] = useState(false);
  const pendingCreds = useRef<{ email: string; password: string } | null>(null);
  const autoTried = useRef(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") {
        // Se veio de fluxo automático, navega direto; senão o diálogo trata.
        if (!pendingCreds.current) navigate({ to: "/" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Login automático: se há credenciais salvas, tenta autenticar sem interação.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    const saved = loadCredentials();
    if (!saved) return;
    setEmail(saved.email.replace(/@apontauto\.local$/, ""));
    setLoading(true);
    supabase.auth
      .signInWithPassword({ email: saved.email, password: saved.password })
      .then(({ error }) => {
        if (error) {
          clearCredentials();
          toast.info("Credenciais salvas expiraram. Faça login novamente.");
        } else {
          toast.success("Login automático realizado.");
          navigate({ to: "/" });
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const raw = email.trim().toLowerCase();
      const loginEmail = raw.includes("@") ? raw : `${raw}@apontauto.local`;
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      toast.success("Bem-vindo!");
      // Tela intermediária obrigatória: sempre pergunta se deseja salvar
      // para login automático. A navegação para "/" ocorre somente após
      // a escolha (Sim/Não) no diálogo.
      pendingCreds.current = { email: loginEmail, password };
      setAskSave(true);
    } catch (err) {
      triggerShake();
      toast.error(err instanceof Error ? err.message : "Falha ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChoice = (save: boolean) => {
    if (save && pendingCreds.current) {
      saveCredentials(pendingCreds.current);
      toast.success("Credenciais salvas neste dispositivo.");
    } else if (!save) {
      clearCredentials();
    }
    pendingCreds.current = null;
    setAskSave(false);
    navigate({ to: "/" });
  };

  const forgotPassword = async () => {
    if (!email) {
      toast.info("Informe seu e-mail acima para receber o link de redefinição.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) toast.error(error.message);
    else toast.success("E-mail de redefinição enviado.");
  };

  return (
    <div className="auth-bg relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="auth-grid" aria-hidden />

      <main className="relative z-10 w-full max-w-md">
        <div
          className={`relative rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-9 ${
            shake ? "auth-shake" : ""
          }`}
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />

          <div className="auth-logo-in mb-4 flex flex-col items-center sm:mb-6">
            <div className="relative mx-auto grid h-40 w-40 place-items-center xs:h-48 xs:w-48 sm:h-56 sm:w-56 md:h-64 md:w-64">
              <img
                src={logo.url}
                alt="PCM · Planejador de Manutenção"
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
            <h1 className="-mt-4 text-center text-lg font-semibold tracking-tight text-white sm:-mt-6 sm:text-xl md:-mt-8">
              Sistema Exclusivo
            </h1>
            <p className="mt-1 text-center text-sm text-white/60">
              Faça seu login para continuar
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="auth-field">
              <UserRound className="auth-icon" size={18} />
              <input
                id="email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                className="auth-input"
                autoComplete="username"
              />
              <label htmlFor="email" className="auth-label">
                Usuário
              </label>
            </div>

            <div className="auth-field">
              <Lock className="auth-icon" size={18} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                className="auth-input pr-11"
                autoComplete="current-password"
              />
              <label htmlFor="password" className="auth-label">
                Senha
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="auth-eye"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="flex items-center justify-end text-sm">
              <button
                type="button"
                onClick={forgotPassword}
                className="text-cyan-300/90 transition-colors hover:text-cyan-200"
              >
                Esqueceu a senha?
              </button>
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? (
                <span className="dots inline-flex items-center justify-center text-white">
                  <span /><span /><span />
                </span>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs tracking-wide text-white/50">
          Dev by:{" "}
          <span className="shine-text font-semibold">Gabriel Vitor</span>
        </p>
        <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-white/40">
          <a href="/sobre" className="hover:text-white/70">Sobre</a>
          <a href="/contato" className="hover:text-white/70">Contato</a>
          <a href="/privacidade" className="hover:text-white/70">Privacidade</a>
          <a href="/termos" className="hover:text-white/70">Termos</a>
        </nav>
      </main>

      {/* Tela intermediária travada: só fecha ao clicar em Sim ou Não. */}
      <AlertDialog open={askSave}>
        <AlertDialogContent
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Salvar dados de login?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja salvar seus dados de login para entrar automaticamente nas
              próximas sessões? Ficam armazenados apenas neste navegador, de
              forma ofuscada, e expiram em 30 dias. Use somente em dispositivos
              pessoais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleSaveChoice(false)}>Não</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSaveChoice(true)}>Sim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
