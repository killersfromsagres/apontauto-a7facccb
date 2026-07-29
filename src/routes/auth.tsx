import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, UserRound, ShieldCheck, Loader2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  saveLogin,
  loadLogin,
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
import { TermsSummaryDialog } from "@/components/terms-summary-dialog";
import { recordTermsAcceptance } from "@/lib/auth/terms";
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
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [askSave, setAskSave] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const pendingCreds = useRef<{ email: string } | null>(null);
  const autoTried = useRef(false);
  const autoCancelled = useRef(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") {
        // Se veio de fluxo automático, navega direto; senão o diálogo trata.
        if (!pendingCreds.current) navigate({ to: "/" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Reconexão automática: nenhuma senha é guardada. Usamos apenas a sessão
  // persistida (refresh token) do backend; se ela ainda for válida, o usuário
  // entra direto. Caso contrário, apenas pré-preenchemos o usuário.
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    const saved = loadLogin();
    if (!saved) return;
    setEmail(saved.email.replace(/@apontauto\.local$/, ""));
    setAutoLogin(true);
    supabase.auth.getSession().then(({ data }) => {
      if (autoCancelled.current) return;
      if (data.session) {
        touchCredentials();
        toast.success("Sessão restaurada.");
        navigate({ to: "/" });
      } else {
        setAutoLogin(false);
      }
    });
  }, [navigate]);

  const cancelAutoLogin = () => {
    autoCancelled.current = true;
    setAutoLogin(false);
    toast.info("Reconexão automática cancelada.");
  };


  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptTerms) {
      triggerShake();
      toast.error("Você precisa aceitar os Termos de Uso para continuar.");
      return;
    }
    setLoading(true);
    try {
      const raw = email.trim().toLowerCase();
      const loginEmail = raw.includes("@") ? raw : `${raw}@apontauto.local`;
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      // Evidência oficial do aceite fica no banco, não no navegador.
      if (data.user) await recordTermsAcceptance(data.user.id);
      toast.success("Bem-vindo!");
      // Tela intermediária obrigatória: sempre pergunta se deseja salvar
      // para login automático. A navegação para "/" ocorre somente após
      // a escolha (Sim/Não) no diálogo.
      pendingCreds.current = { email: loginEmail };
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
      saveLogin(pendingCreds.current.email);
      toast.success("Usuário lembrado neste dispositivo.");

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
    <div className="auth-bg relative flex min-h-dvh items-center justify-center px-4 py-10">
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




            <div className="flex items-start gap-3 text-xs text-white/70">
              <input
                id="terms"
                type="checkbox"
                className="auth-checkbox mt-0.5"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <label htmlFor="terms" className="cursor-pointer leading-relaxed">
                Li e aceito os{" "}
                <a href="/termos" target="_blank" rel="noreferrer" className="font-medium text-sky-300 hover:underline">
                  Termos de Uso
                </a>{" "}
                e a{" "}
                <a href="/privacidade" target="_blank" rel="noreferrer" className="font-medium text-sky-300 hover:underline">
                  Política de Privacidade
                </a>
                .{" "}
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="text-white/50 underline underline-offset-2 hover:text-white/80"
                >
                  Ver resumo
                </button>
              </label>
            </div>


            <button type="submit" className="auth-btn" disabled={loading || !acceptTerms}>
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
              Lembrar este usuário?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Podemos lembrar apenas o seu nome de usuário neste navegador para
              agilizar o próximo acesso. Sua senha nunca é armazenada: a
              reconexão automática usa somente a sessão segura do sistema, que
              expira em 30 dias.
            </AlertDialogDescription>

          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleSaveChoice(false)}>Não</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSaveChoice(true)}>Sim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Splash de login automático com opção de cancelar. */}
      {autoLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-8 shadow-2xl">
            <button
              type="button"
              onClick={cancelAutoLogin}
              aria-label="Cancelar"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4 grid h-16 w-16 place-items-center">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                <Loader2 className="relative h-10 w-10 animate-spin text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-white">Entrando automaticamente…</h2>
              <p className="mt-1 text-sm text-white/60">
                Restaurando sua sessão de forma segura.
              </p>
              {email && (
                <p className="mt-3 rounded-full bg-white/5 px-3 py-1 text-xs text-white/70">
                  {email}
                </p>
              )}
              <button
                type="button"
                onClick={cancelAutoLogin}
                className="mt-6 text-xs text-white/50 underline-offset-4 transition hover:text-white/80 hover:underline"
              >
                Cancelar e usar outra conta
              </button>
            </div>
          </div>
        </div>
      )}

      <TermsSummaryDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </div>
  );
}
