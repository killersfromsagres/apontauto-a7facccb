import { supabase } from "@/integrations/supabase/client";
import type { ErrorLevel } from "../types";

type LogInput = {
  message: string;
  detail?: unknown;
  level?: ErrorLevel;
  origin?: string;
  moduleKey?: string;
  metadata?: Record<string, unknown>;
};

function serialize(detail: unknown): string | null {
  if (detail == null) return null;
  if (detail instanceof Error) return `${detail.name}: ${detail.message}\n${detail.stack ?? ""}`.slice(0, 4000);
  if (typeof detail === "string") return detail.slice(0, 4000);
  try {
    return JSON.stringify(detail).slice(0, 4000);
  } catch {
    return String(detail).slice(0, 4000);
  }
}

const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

/**
 * Registra uma falha técnica no banco. Nunca lança: observabilidade jamais
 * pode derrubar o fluxo do usuário, e o detalhe técnico fica restrito ao
 * painel administrativo (o usuário comum só vê mensagem amigável).
 */
export async function logClientError(input: LogInput): Promise<void> {
  try {
    const key = `${input.level ?? "error"}|${input.message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);

    const { data } = await supabase.auth.getUser();
    await supabase.from("client_error_logs").insert({
      user_id: data.user?.id ?? null,
      level: input.level ?? "error",
      origin: input.origin ?? "client",
      message: input.message.slice(0, 500),
      detail: serialize(input.detail),
      route: typeof window !== "undefined" ? window.location.pathname : null,
      module_key: input.moduleKey ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
      metadata: (input.metadata ?? {}) as never,
    });
  } catch {
    /* silencioso por design */
  }
}

let installed = false;

/** Captura global de erros e promises rejeitadas do frontend. */
export function installErrorTelemetry(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    if (!event.message) return;
    void logClientError({ message: event.message, detail: event.error, origin: "window.error" });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Promessa rejeitada";
    void logClientError({ message, detail: reason, origin: "unhandledrejection" });
  });
}

/** Sinaliza a saúde de uma integração externa (clima, ImgBB, IA, etc.). */
export async function reportIntegration(
  integration: string,
  status: "ok" | "degradado" | "falha",
  opts: { message?: string; durationMs?: number } = {},
): Promise<void> {
  try {
    await supabase.from("integration_heartbeats").insert({
      integration,
      status,
      message: opts.message?.slice(0, 500) ?? null,
      duration_ms: opts.durationMs ?? null,
    });
  } catch {
    /* silencioso */
  }
}
