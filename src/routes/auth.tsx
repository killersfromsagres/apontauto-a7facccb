import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Lock, Eye, EyeOff, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/apontauto-logo.png.asset.json";

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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup") {
      const valid = /^[a-zA-Z0-9]{6,}$/.test(password);
      if (!valid) {
        triggerShake();
        toast.error("A senha deve ter pelo menos 6 caracteres (apenas números ou letras).");
        return;
      }
    }
    setLoading(true);
    try {
      // Atalho: admin/admin entra na conta do planejador
      if (mode === "signin" && email.trim().toLowerCase() === "admin" && password === "admin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: "gabrielvlp33@gmail.com",
          password: "Eliana159951",
        });
        if (error) throw error;
        toast.success("Bem-vindo!");
        return;
      }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        // Auto-login: se a confirmação de e-mail estiver desativada, a sessão
        // já vem no signUp. Caso contrário, tentamos entrar com as credenciais.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) throw signInError;
        }
        toast.success("Conta criada! Redirecionando…");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
      }
    } catch (err) {
      triggerShake();
      toast.error(err instanceof Error ? err.message : "Falha ao autenticar");
    } finally {
      setLoading(false);
    }
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
      {/* animated grid overlay */}
      <div className="auth-grid" aria-hidden />

      <main className="relative z-10 w-full max-w-md">
        {/* Glass card */}
        <div
          className={`relative rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-9 ${
            shake ? "auth-shake" : ""
          }`}
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
          }}
        >
          {/* subtle top highlight */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />

          {/* Logo */}
          <div className="auth-logo-in mb-6 flex flex-col items-center">
            <div className="relative mx-auto grid h-56 w-56 place-items-center sm:h-64 sm:w-64">
              <img
                src={logo.url}
                alt="PCM · Planejador de Manutenção"
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
            <h1 className="-mt-1 text-center text-xl font-semibold tracking-tight text-white">
              {mode === "signin" ? "Sistema Exclusivo" : "Criar sua conta"}
            </h1>
            <p className="mt-1 text-center text-sm text-white/60">
              {mode === "signin"
                ? "Acesse ou crie sua conta para continuar"
                : "Preencha os dados para começar"}
            </p>
          </div>


          {/* Toggle */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-lg px-3 py-2 font-medium transition-all ${
                mode === "signin"
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-lg px-3 py-2 font-medium transition-all ${
                mode === "signup"
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === "signup" && (
              <div className="auth-field">
                <User className="auth-icon" size={18} />
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder=" "
                  className="auth-input"
                  autoComplete="name"
                />
                <label htmlFor="name" className="auth-label">
                  Nome completo
                </label>
              </div>
            )}

            <div className="auth-field">
              <Mail className="auth-icon" size={18} />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                className="auth-input"
                autoComplete="email"
              />
              <label htmlFor="email" className="auth-label">
                E-mail
              </label>
            </div>

            <div className="auth-field">
              <Lock className="auth-icon" size={18} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={mode === "signup" ? 6 : undefined}
                pattern={mode === "signup" ? "^[a-zA-Z0-9]{6,}$" : undefined}
                title={mode === "signup" ? "A senha deve ter pelo menos 6 caracteres (apenas números ou letras)" : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                className="auth-input pr-11"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
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

            {mode === "signin" && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer select-none items-center gap-2 text-white/70">
                  <input
                    type="checkbox"
                    className="auth-checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Lembrar-me
                </label>
                <button
                  type="button"
                  onClick={forgotPassword}
                  className="text-cyan-300/90 transition-colors hover:text-cyan-200"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? (
                <span className="dots inline-flex items-center justify-center text-white">
                  <span /><span /><span />
                </span>
              ) : mode === "signin" ? (
                "Entrar"
              ) : (
                "Criar conta"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs tracking-wide text-white/50">
          Dev by:{" "}
          <span className="shine-text font-semibold">Gabriel Vitor</span>
        </p>
      </main>
    </div>
  );
}
