import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  LogOut,
  MapPin,
  Plus,
  Send,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clientAuthIdentity } from "../../../supabase/functions/_shared/demarchi-login";
import { createTicket } from "./api";
import {
  PRIORITIES,
  compareTickets,
  isClosed,
  locationText,
  protocol,
  type Priority,
  type DemTicket,
} from "./domain";
import { useDemarchi } from "./use-demarchi";
import { AssetPicker, dateLabel, Field, PriorityBadge, StatusBadge } from "./components/shared";
import { TicketDetail } from "./components/ticket-detail";
import "./demarchi.css";

export function ClientPortal() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loginId, setLoginId] = useState(""),
    [password, setPassword] = useState(""),
    [logging, setLogging] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [loginError, setLoginError] = useState("");
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (logging) return;
    setLoginError("");
    setLogging(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: clientAuthIdentity(loginId),
        password,
      });
      if (error) throw error;
      setPassword("");
    } catch (e: any) {
      const message = /banned|user_banned/i.test(`${e.message} ${e.code || ""}`)
        ? "Este acesso está inativo. Fale com a administração."
        : /invalid login/i.test(e.message)
          ? "ID ou senha inválidos. Confira os dados e tente novamente."
          : /Informe um ID/.test(e.message)
            ? e.message
            : "Não foi possível entrar. Confira sua conexão e tente novamente.";
      setLoginError(message);
    } finally {
      setLogging(false);
    }
  }
  if (session === undefined)
    return (
      <main className="dem-app dem-client dem-client-auth">
        <div className="dem-loading" role="status">
          Carregando seu acesso…
        </div>
      </main>
    );
  return (
    <main className={`dem-app dem-client${!session ? " dem-client-auth" : ""}`}>
      {session && (
        <header className="dem-client-header">
          <a href="/cliente" className="dem-brand">
            <img src="/apontauto-logo.png" alt="Apont Auto" />
          </a>
          <button
            className="dem-btn dem-btn-ghost"
            onClick={() =>
              void supabase.auth
                .signOut()
                .catch(() => toast.error("Não foi possível sair. Tente novamente."))
            }
          >
            <LogOut size={17} /> Sair
          </button>
        </header>
      )}
      {session ? (
        <ClientWorkspace key={session.user.id} />
      ) : (
        <section className="dem-access-shell" aria-labelledby="dem-access-title">
          <div className="dem-access-card">
            <img
              className="dem-access-logo"
              src="/apontauto-logo.png"
              alt="Apont Auto"
              width="96"
              height="96"
            />
            <h1 id="dem-access-title">Manutenção Demarchi</h1>
            <form className="dem-access-form" onSubmit={login}>
              <label className="dem-access-field" htmlFor="dem-client-id">
                <span>ID de acesso</span>
                <div className="dem-access-input">
                  <KeyRound size={19} aria-hidden="true" />
                  <input
                    id="dem-client-id"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    minLength={8}
                    maxLength={40}
                    pattern="[Ss][Hh][Ee][Rr][Ww][Ii][Nn][0-9]{1,33}"
                    value={loginId}
                    onChange={(e) => {
                      setLoginId(e.target.value);
                      setLoginError("");
                    }}
                    placeholder="Ex.: Sherwin001234"
                    aria-invalid={!!loginError}
                    aria-describedby={loginError ? "dem-login-error" : undefined}
                  />
                </div>
              </label>
              <label className="dem-access-field" htmlFor="dem-client-password">
                <span>Senha</span>
                <div className="dem-access-input">
                  <LockKeyhole size={19} aria-hidden="true" />
                  <input
                    id="dem-client-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setLoginError("");
                    }}
                    placeholder="Digite sua senha"
                    aria-invalid={!!loginError}
                  />
                  <button
                    type="button"
                    className="dem-access-reveal"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {loginError && (
                <p className="dem-access-error" id="dem-login-error" role="alert">
                  {loginError}
                </p>
              )}
              <button type="submit" className="dem-access-submit" disabled={logging}>
                {logging ? (
                  <>
                    <Loader2 size={18} className="dem-access-spinner" aria-hidden />
                    Entrando…
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight size={18} aria-hidden />
                  </>
                )}
              </button>
            </form>
            <div className="dem-access-legal">
              <a href="/privacidade">Privacidade</a>
              <a href="/termos">Termos de uso</a>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function ClientWorkspace() {
  const data = useDemarchi();
  const [view, setView] = useState<"list" | "new">("list"),
    [step, setStep] = useState(1),
    [asset, setAsset] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [reference, setReference] = useState(""),
    [priority, setPriority] = useState<Priority>("baixa"),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [success, setSuccess] = useState<DemTicket | null>(null);
  const assets = data.assets.data || [],
    tickets = (data.tickets.data || []).slice().sort(compareTickets),
    me = data.me.data;
  const active = tickets.filter((t) => !isClosed(t.status));
  function openNew() {
    setSuccess(null);
    setView("new");
    setStep(1);
    setAsset("");
    setTitle("");
    setDescription("");
    setReference("");
    setPriority("baixa");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const created = await createTicket({
        title: title.trim(),
        description: description.trim(),
        asset_id: asset,
        priority,
        location_detail: reference.trim(),
      });
      setSuccess(created);
      setView("list");
      await data.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (data.assets.isPending || data.me.isPending)
    return (
      <div className="dem-loading" role="status">
        Preparando seus chamados…
      </div>
    );
  if (data.error)
    return (
      <div className="dem-client-container">
        <div className="dem-error" role="alert">
          <h2>Não foi possível carregar o portal</h2>
          <p>{data.error.message}</p>
          <button className="dem-btn" onClick={() => void data.refresh()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  if (!me)
    return (
      <div className="dem-client-container">
        <div className="dem-empty">
          <ShieldCheck size={32} />
          <h2>Seu acesso ao portal ainda não foi cadastrado.</h2>
          <p>Peça ao administrador para cadastrar seu ID de acesso.</p>
          <a className="dem-btn" href="/central-chamados">
            Sou administrador
          </a>
        </div>
      </div>
    );
  if (!me.active || me.removed_at)
    return (
      <div className="dem-client-container">
        <div className="dem-error">
          <h2>Acesso inativo</h2>
          <p>Fale com a administração para reativar seu cadastro.</p>
        </div>
      </div>
    );
  return (
    <div className="dem-client-container">
      <div className="dem-client-intro">
        <div>
          <span className="dem-eyebrow">SEU ESPAÇO</span>
          <h1>Olá, {me.name.split(" ")[0]}.</h1>
          <p>
            {me.kind === "tecnico"
              ? "Acompanhe as atividades atribuídas a você e suas solicitações."
              : "Como podemos ajudar hoje?"}
          </p>
        </div>
        <span className={`dem-live ${data.connection === "SUBSCRIBED" ? "" : "dem-live-off"}`}>
          <i />
          {data.connection === "SUBSCRIBED" ? "Acompanhamento ao vivo" : "Reconectando…"}
        </span>
      </div>
      {success && (
        <section className="dem-success" role="status">
          <CheckCircle2 size={30} />
          <div>
            <h2>Chamado enviado. Pode deixar com a gente.</h2>
            <p>
              <strong>{protocol(success.number)}</strong> · Prazo até{" "}
              {dateLabel(success.deadline, true)}
            </p>
            <p>Você acompanha as atualizações nesta página.</p>
          </div>
          <button
            type="button"
            className="dem-btn dem-btn-secondary"
            onClick={() => setSelected(success.id)}
          >
            Ver chamado
          </button>
        </section>
      )}
      {view === "list" ? (
        <>
          <div className="dem-client-actions">
            <button className="dem-new-call" onClick={openNew}>
              <span>
                <Plus size={26} />
              </span>
              <div>
                <strong>Abrir um chamado</strong>
                <small>Informe o local e o problema em poucos passos.</small>
              </div>
              <ArrowRight size={22} />
            </button>
            <div className="dem-client-count">
              <strong>{active.length}</strong>
              <span>
                chamado(s)
                <br />
                em atendimento
              </span>
            </div>
          </div>
          <div className="dem-section-title">
            <h2>
              <ClipboardList size={21} /> Meus chamados
            </h2>
            <span>{tickets.length} no total</span>
          </div>
          {!tickets.length ? (
            <div className="dem-empty">
              <ClipboardList size={36} />
              <h3>Seus chamados aparecerão aqui.</h3>
              <p>Quando precisar, clique em “Abrir um chamado”.</p>
            </div>
          ) : (
            <div className="dem-client-tickets">
              {tickets.map((t) => (
                <button className="dem-client-ticket" key={t.id} onClick={() => setSelected(t.id)}>
                  <div>
                    <small>{protocol(t.number)}</small>
                    <StatusBadge ticket={t} />
                  </div>
                  <h3>{t.title}</h3>
                  <p>
                    <MapPin size={15} />
                    {locationText(t.asset_id, assets)}
                  </p>
                  <footer>
                    <PriorityBadge value={t.priority} />
                    <span>Prazo: {dateLabel(t.deadline)}</span>
                    <ArrowRight size={18} />
                  </footer>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <section className="dem-wizard">
          <button
            type="button"
            className="dem-back"
            onClick={() => {
              if (step > 1) setStep(step - 1);
              else setView("list");
            }}
          >
            <ArrowLeft size={17} />
            {step > 1 ? "Voltar" : "Meus chamados"}
          </button>
          <h2>Vamos abrir seu chamado</h2>
          <ol className="dem-steps">
            {["Onde está o problema?", "O que aconteceu?", "Conferir e enviar"].map((text, i) => (
              <li className={step === i + 1 ? "current" : step > i + 1 ? "done" : ""} key={text}>
                <span>{step > i + 1 ? "✓" : i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
          <form onSubmit={submit}>
            {step === 1 && (
              <div className="dem-step-content">
                <h3>1. Escolha o local</h3>
                <p>Você pode buscar pelo nome ou selecionar prédio, andar e ambiente.</p>
                <AssetPicker assets={assets} value={asset} onChange={setAsset} />
                <Field label="Uma referência para encontrar o local (opcional)">
                  <input
                    value={reference}
                    maxLength={500}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ex.: ao lado da sala de reunião, porta da direita"
                  />
                </Field>
              </div>
            )}
            {step === 2 && (
              <div className="dem-step-content">
                <h3>2. Conte o que aconteceu</h3>
                <Field label="Qual é o problema?">
                  <input
                    autoFocus
                    required
                    minLength={3}
                    maxLength={180}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: lâmpada apagada na sala de reunião"
                  />
                </Field>
                <Field
                  label="Explique com um pouco mais de detalhe"
                  hint="Conte o que você percebeu e desde quando acontece."
                >
                  <textarea
                    required
                    minLength={10}
                    maxLength={10000}
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex.: duas lâmpadas não acendem desde esta manhã. A sala está em uso."
                  />
                </Field>
                <fieldset className="dem-priority-options">
                  <legend>Qual é a urgência?</legend>
                  {(Object.keys(PRIORITIES) as Priority[]).map((p) => (
                    <label className={priority === p ? "selected" : ""} key={p}>
                      <input
                        type="radio"
                        name="priority"
                        value={p}
                        checked={priority === p}
                        onChange={() => setPriority(p)}
                      />
                      <div>
                        <strong>
                          {PRIORITIES[p].label}
                          <span>{PRIORITIES[p].days} dia(s)</span>
                        </strong>
                        <p>{PRIORITIES[p].description}</p>
                      </div>
                    </label>
                  ))}
                </fieldset>
                <small className="dem-help">
                  Os prazos são contados em dias corridos. Em risco imediato à segurança, acione
                  também a equipe de emergência da unidade.
                </small>
              </div>
            )}
            {step === 3 && (
              <div className="dem-step-content">
                <h3>3. Está tudo certo?</h3>
                <dl className="dem-review">
                  <div>
                    <dt>Solicitante</dt>
                    <dd>
                      {me.name}
                      <small>{me.email}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Local</dt>
                    <dd>
                      {locationText(asset, assets)}
                      {reference && <small>{reference}</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>Problema</dt>
                    <dd>{title}</dd>
                  </div>
                  <div>
                    <dt>Descrição</dt>
                    <dd className="dem-prewrap">{description}</dd>
                  </div>
                  <div>
                    <dt>Criticidade</dt>
                    <dd>
                      <PriorityBadge value={priority} /> · até {PRIORITIES[priority].days} dia(s)
                      corridos após a abertura
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            <div className="dem-wizard-footer">
              <span>Etapa {step} de 3</span>
              <button className="dem-btn" disabled={busy || (step === 1 && !asset)}>
                {busy ? "Enviando…" : step === 3 ? "Enviar chamado" : "Continuar"}
                {step === 3 ? <Send size={18} /> : <ArrowRight size={18} />}
              </button>
            </div>
          </form>
        </section>
      )}
      {selected && tickets.find((t) => t.id === selected) && (
        <TicketDetail
          key={selected}
          ticket={tickets.find((t) => t.id === selected)!}
          assets={assets}
          close={() => setSelected(null)}
          refresh={data.refresh}
        />
      )}
    </div>
  );
}
