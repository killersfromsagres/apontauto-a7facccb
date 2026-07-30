// Cliente do modo avançado (item 11.3). Todo o segredo fica no servidor —
// aqui apenas chamamos a rota autenticada `/api/whatsapp-enviar`.

import { supabase } from "@/integrations/supabase/client";

export interface EnvioCloudResultado {
  id: string | null;
  status: string;
  sandbox?: boolean;
  reaproveitado?: boolean;
}

export async function enviarPelaCloudApi(params: {
  destinatario: string;
  mensagem: string;
  imagens?: string[];
  escopoTipo?: string;
  escopoId?: string | null;
  idempotencyKey?: string;
  teste?: boolean;
}): Promise<EnvioCloudResultado> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Sessão expirada.");

  const res = await fetch("/api/whatsapp-enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? "Falha no envio oficial."));
  return json as unknown as EnvioCloudResultado;
}
