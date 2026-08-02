import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Lock,
  Eye,
  EyeOff,
  UserRound,
  ShieldCheck,
  Loader2,
  X,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

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
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    terms?: string;
  }>({});

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
    // Valida contra o servidor: uma sessão salva pode ter sido revogada e
    // "restaurá-la" deixaria o usuário logado com um token morto.
    supabase.auth.getUser().then(({ data, error }) => {
      if (autoCancelled.current) return;
      if (!error && data.user) {
        touchCredentials();
        toast.success("Sessão restaurada.");
        navigate({ to: "/" });
      } else {
        void supabase.auth.signOut({ scope: "local" }).catch(() => {});
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

    // Validação inline: mensagens por campo, sem depender apenas de toast.
    const next: { email?: string; password?: string; terms?: string } = {};
    if (!email.trim()) next.email = "Informe seu usuário.";
    if (!password) next.password = "Informe sua senha.";
    if (!acceptTerms) next.terms = "É necessário aceitar os Termos de Uso para continuar.";
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      triggerShake();
      return;
    }

    setLoading(true);
    try {
      const raw = email.trim().toLowerCase();
      const loginEmail = raw.includes("@") ? raw : `${raw}@apontauto.local`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
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
      const msg = err instanceof Error ? err.message : "Falha ao autenticar";
      const invalid = /invalid login credentials/i.test(msg);
      setFieldErrors({
        password: invalid ? "Usuário ou senha inválidos." : msg,
      });
      toast.error(invalid ? "Usuário ou senha inválidos." : msg);
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
    <div className="auth-bg relative flex min-h-dvh items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <main className="relative z-10 grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_minmax(0,420px)]">
        {/* Coluna visual — apenas desktop */}
        <section className="hidden lg:block">
          <img
            src={logo.url}
            alt="Apont Auto"
            className="mb-6 h-20 w-auto object-contain"
            draggable={false}
          />
          <h2 className="max-w-md font-display text-3xl font-semibold leading-tight text-white">
            Planejamento e Controle de Manutenção, do campo à gestão.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
            Ordens de serviço, ativos, taludes, clima, frota e materiais em uma única plataforma
            operacional.
          </p>
          <dl className="mt-8 flex flex-wrap gap-3">
            {[
              { label: "Disponibilidade", value: "24/7" },
              { label: "Segurança", value: "RBAC + auditoria" },
              { label: "Sincronização", value: "Offline-first" },
            ].map((i) => (
              <div
                key={i.label}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-sm"
              >
                <dt className="text-[11px] uppercase tracking-wide text-white/45">{i.label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-white/85">{i.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Card de login */}
        <div className="auth-card-scene relative mx-auto w-full max-w-md">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[#4F8CFF]/10 blur-[100px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-[#52E5FF]/10 blur-[100px]"
          />

          <div
            className="auth-card-tilt group relative"
            style={tiltStyle}
            onMouseMove={handleTilt}
            onMouseLeave={resetTilt}
          >
            {/* Feixes de luz percorrendo a borda */}
            <div aria-hidden className="auth-beams">
              <span className="auth-beam auth-beam-h auth-beam-top" />
              <span className="auth-beam auth-beam-h auth-beam-bottom" />
              <span className="auth-beam auth-beam-v auth-beam-right" />
              <span className="auth-beam auth-beam-v auth-beam-left" />
              <span className="auth-corner left-0 top-0" />
              <span className="auth-corner right-0 top-0" />
              <span className="auth-corner bottom-0 right-0" />
              <span className="auth-corner bottom-0 left-0" />
            </div>

            {/* Halo do card no hover */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-r from-white/5 via-white/15 to-white/5 opacity-0 transition-opacity duration-500 group-hover:opacity-70"
            />

            <div
              className={`relative z-10 rounded-3xl border border-white/10 bg-[#0D1422]/60 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-8 ${
                shake ? "auth-shake" : ""
              }`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3xl opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, white 0.5px, transparent 0.5px), linear-gradient(45deg, white 0.5px, transparent 0.5px)",
                  backgroundSize: "30px 30px",
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />


            <div className="auth-logo-in mb-8 flex flex-col items-center text-center">
              <img
                src={logo.url}
                alt="Apont Auto"
                className="h-14 w-auto object-contain lg:hidden"
                draggable={false}
              />
              <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl lg:mt-0">
                Acesso ao sistema
              </h1>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Portal operacional
              </p>
            </div>

            <form onSubmit={submit} className="space-y-6" noValidate>
              <div>
                <label htmlFor="email" className="auth-field-label">
                  Usuário
                </label>
                <div className="auth-field">
                  <UserRound className="auth-icon" size={18} />
                  <input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                    }}
                    placeholder="usuario@empresa.com"
                    className="auth-input"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="next"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  />
                </div>
                {fieldErrors.email && (
                  <p id="email-error" role="alert" className="mt-1.5 pl-1 text-xs text-rose-300">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="auth-field-label">
                  Senha
                </label>
                <div className="auth-field">
                  <Lock className="auth-icon" size={18} />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password)
                        setFieldErrors((p) => ({ ...p, password: undefined }));
                    }}
                    placeholder="••••••••"
                    className="auth-input pr-11"
                    autoComplete="current-password"
                    enterKeyHint="go"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="auth-eye"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" role="alert" className="mt-1.5 pl-1 text-xs text-rose-300">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="space-y-4 pt-1">
                <div className="flex items-start gap-3 text-xs leading-tight text-slate-400">
                  <input
                    id="terms"
                    type="checkbox"
                    className="auth-checkbox mt-0.5 shrink-0"
                    checked={acceptTerms}
                    onChange={(e) => {
                      setAcceptTerms(e.target.checked);
                      if (e.target.checked) setFieldErrors((p) => ({ ...p, terms: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.terms)}
                    aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
                  />
                  <label htmlFor="terms" className="cursor-pointer leading-relaxed">
                    Li e aceito os{" "}
                    <a
                      href="/termos"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-white decoration-[#4F8CFF] underline-offset-2 hover:underline"
                    >
                      Termos de Uso
                    </a>{" "}
                    e a{" "}
                    <a
                      href="/privacidade"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-white decoration-[#4F8CFF] underline-offset-2 hover:underline"
                    >
                      Política de Privacidade
                    </a>
                    .
                  </label>
                </div>
                {fieldErrors.terms && (
                  <p id="terms-error" role="alert" className="pl-1 text-xs text-rose-300">
                    {fieldErrors.terms}
                  </p>
                )}

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setTermsOpen(true)}
                    className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-slate-400 transition-colors hover:text-white"
                  >
                    Ver resumo dos termos
                    <ChevronDown size={14} aria-hidden />
                  </button>
                </div>
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? (
                  <span className="dots inline-flex items-center justify-center text-white">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  <>
                    Entrar
                    <ArrowRight size={18} aria-hidden />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-slate-600">
              Sistema verificado · Acesso auditado
            </p>
          </div>
        </div>

      </main>

      <footer className="absolute inset-x-0 bottom-4 z-10 px-4 text-center">
        <p className="text-xs tracking-wide text-white/45">
          Dev by: <span className="shine-text font-semibold">Gabriel Vitor</span>
        </p>
        <nav className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-white/35">
          <a href="/sobre" className="hover:text-white/70">
            Sobre
          </a>
          <a href="/contato" className="hover:text-white/70">
            Contato
          </a>
          <a href="/privacidade" className="hover:text-white/70">
            Privacidade
          </a>
          <a href="/termos" className="hover:text-white/70">
            Termos
          </a>
        </nav>
      </footer>

      {/* Tela intermediária travada: só fecha ao clicar em Sim ou Não. */}
      <AlertDialog open={askSave}>
        <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Lembrar este usuário?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Podemos lembrar apenas o seu nome de usuário neste navegador para agilizar o próximo
              acesso. Sua senha nunca é armazenada: a reconexão automática usa somente a sessão
              segura do sistema, que expira em 30 dias.
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
              <p className="mt-1 text-sm text-white/60">Restaurando sua sessão de forma segura.</p>
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
