import { supabase } from "@/integrations/supabase/client";

export const TERMS_VERSION = "2.0";
export const PRIVACY_VERSION = "2.0";

/** Hash simples e não reversível para agrupar acessos sem guardar IP puro. */
async function hashString(value: string): Promise<string | null> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf))
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/**
 * Persiste o aceite dos termos no banco (evidência oficial por usuário/versão).
 * Idempotente: a unique constraint impede duplicidade da mesma versão.
 */
export async function recordTermsAcceptance(userId: string): Promise<void> {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null;
  const ipHash = userAgent ? await hashString(`${userId}:${userAgent}`) : null;

  const { error } = await supabase.from("terms_acceptances").insert({
    user_id: userId,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    user_agent: userAgent,
    ip_hash: ipHash,
  });

  // 23505 = já aceito nesta versão; qualquer outro erro é apenas registrado.
  if (error && error.code !== "23505") {
    console.warn("[terms] falha ao registrar aceite:", error.message);
  }
}

/** Indica se o usuário já aceitou a versão vigente dos termos. */
export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("terms_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("terms_version", TERMS_VERSION)
    .eq("privacy_version", PRIVACY_VERSION)
    .maybeSingle();
  return Boolean(data);
}
