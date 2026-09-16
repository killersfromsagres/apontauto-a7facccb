import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Lock,
  Eye,
  EyeOff,
  UserRound,
  ShieldCheck,
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
const NETWORK_ERROR_MESSAGE =
  "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
const AUTH_TIMEOUT_MS = 6500;

function loginToEmail(value: string) {
  const raw = value.trim().toLowerCase();
  return raw.includes("@") ? raw : `${raw}@apontauto.local`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Falha ao autenticar";
}

function isNetworkFailure(error: unknown) {
  if (error instanceof TypeError) return true;
  return /failed to fetch|networkerror|network error|network request failed|fetch failed|load failed|timeout|timed out|aborted/i.test(
    errorMessage(error),
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(NETWORK_ERROR_MESSAGE)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function signInWithRetry(email: string, password: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
      );

      if (!result.error) return result.data;
      lastError = result.error;

      if (attempt === 0 && isNetworkFailure(result.error)) {
        await delay(280);
        continue;
      }
      throw result.error;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isNetworkFailure(error)) {
        await delay(280);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error(NETWORK_ERROR_MESSAGE);
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Sistema de Apontamento" },
      {
        name: "description",
        content: "Acesse o Sistema de Apontamento de manutenção industrial.",
      },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    // Não faça validação remota aqui. A tela de login deve renderizar sem
    // depender da latência da rede. A sessão persistida local é suficiente
    // para decidir o redirecionamento inicial; RLS protege os dados depois.
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) throw redirect({ to: "/" });
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
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    terms?: string;
  }>({});

  const pendingCreds = useRef<{ email: string } | null>(null);
  const submittingRef = useRef(false);

  // Apenas pré-preenche o usuário salvo. Não há round-trip remoto nem splash
  // de "reconexão" antes da tela ficar utilizável.
  useEffect(() => {
    const saved = loadLogin();
    if (saved?.email) {
      setEmail(saved.email.replace(/@apontauto\.local$/, ""));
    }
  }, []);

  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const handleTilt = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * 10, y: px * 10 });
  };
  const resetTilt = () => setTilt({ x: 0, y: 0 });
  const tiltStyle = {
    transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
  } as React.CSSProperties;

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const next: { email?: string; password?: string; terms?: string } = {};
    if (!email.trim()) next.email = "Informe seu usuário.";
    if (!password) next.password = "Informe sua senha.";
    if (!acceptTerms) {
      next.terms = "É necessário aceitar os Termos de Uso para continuar.";
    }
    setFieldErrors(next);

    if (Object.keys(next).length > 0) {
      triggerShake();
      return;
    }

    const loginEmail = loginToEmail(email);
    setLoading(true);
    submittingRef.current = true;

    try {
      const data = await signInWithRetry(loginEmail, password);

      // O aceite é uma tarefa secundária. Nunca transforma um login já
      // autenticado em falha por indisponibilidade momentânea do banco.
      if (data.user) {
        void recordTermsAcceptance(data.user.id).catch((error) => {
          console.warn("[auth] terms acceptance sync deferred", error);
        });
      }

      toast.success("Bem-vindo!");

      const saved = loadLogin();
      if (saved?.email?.toLowerCase() === loginEmail.toLowerCase()) {
        touchCredentials();
        navigate({ to: "/" });
        return;
      }

      pendingCreds.current = { email: loginEmail };
      setAskSave(true);
    } catch (error) {
      triggerShake();
      const rawMessage = errorMessage(error);
      const invalid = /invalid login credentials/i.test(rawMessage);
      const friendly = invalid
        ? "Usuário ou senha inválidos."
        : isNetworkFailure(error) || rawMessage === NETWORK_ERROR_MESSAGE
          ? NETWORK_ERROR_MESSAGE
          : rawMessage;

      setFieldErrors({ password: friendly });
      toast.error(friendly);
    } finally {
      submittingRef.current = false;
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
    if (!email.trim()) {
      toast.info("Informe seu usuário acima para receber o link de redefinição.");
      return;
    }

    try {
      const loginEmail = loginToEmail(email);
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(loginEmail, {
          redirectTo: window.location.origin,
        }),
      );
      if (error) throw error;
      toast.success("E-mail de redefinição enviado.");
    } catch (error) {
      toast.error(isNetworkFailure(error) ? NETWORK_ERROR_MESSAGE : errorMessage(error));
    }
  };

  return (
    <div className="auth-bg relative flex min-h-dvh items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <main className="relative z-10 grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_minmax(0,420px)]">
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
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-sm"
              >
                <dt className="text-[11px] uppercase tracking-wide text-white/45">{item.label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-white/85">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

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

            <div
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-r from-white/5 via-white/15 to-white/5 opacity-0 transition-opacity duration-500 group-hover:opacity-70"
            />

            <div
              className={`relative z-10 rounded-3xl border border-white/10 bg-[#0D1422]/60 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-8 ${shake ? "auth-shake" : ""}`}
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
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (fieldErrors.email) {
                          setFieldErrors((previous) => ({ ...previous, email: undefined }));
                        }
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
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (fieldErrors.password) {
                          setFieldErrors((previous) => ({ ...previous, password: undefined }));
                        }
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
                      onClick={() => setShowPassword((value) => !value)}
                      className="auth-eye"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p
                      id="password-error"
                      role="alert"
                      className="mt-1.5 pl-1 text-xs text-rose-300"
                    >
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
                      onChange={(event) => {
                        setAcceptTerms(event.target.checked);
                        if (event.target.checked) {
                          setFieldErrors((previous) => ({ ...previous, terms: undefined }));
                        }
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

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setTermsOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition-colors hover:text-white"
                    >
                      Ver resumo dos termos
                      <ChevronDown size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={forgotPassword}
                      className="text-xs font-medium text-slate-500 transition-colors hover:text-white"
                    >
                      Esqueci a senha
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
        </div>
      </main>

      <footer className="absolute inset-x-0 bottom-4 z-10 px-4 text-center">
        <p className="text-xs tracking-wide text-white/45">
          Dev by: <span className="shine-text font-semibold">Gabriel Vitor</span>
        </p>
        <nav className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-white/35">
          <a href="/sobre" className="hover:text-white/70">Sobre</a>
          <a href="/contato" className="hover:text-white/70">Contato</a>
          <a href="/privacidade" className="hover:text-white/70">Privacidade</a>
          <a href="/termos" className="hover:text-white/70">Termos</a>
        </nav>
      </footer>

      <AlertDialog open={askSave}>
        <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Lembrar este usuário?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Podemos lembrar apenas o seu nome de usuário neste navegador para agilizar o próximo
              acesso. Sua senha nunca é armazenada; a sessão segura é gerenciada pelo Supabase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleSaveChoice(false)}>Não</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSaveChoice(true)}>Sim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TermsSummaryDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </div>
  );
}
