import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, ShieldAlert, Wifi, WifiOff, Download, PackageCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prisma/configuracoes")({
  component: ConfigPage,
});

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function ConfigPage() {
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [versao, setVersao] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("prisma_extensao_status")
        .select("ultima_atividade,versao")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!cancelled) {
        setLastHeartbeat(data?.ultima_atividade ?? null);
        setVersao(data?.versao ?? null);
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const connected = lastHeartbeat && Date.now() - new Date(lastHeartbeat).getTime() < 60_000;

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  const [downloading, setDownloading] = useState(false);
  const downloadExtension = async () => {
    try {
      setDownloading(true);
      const res = await fetch("/apontauto-prisma-extension.zip");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = window.URL.createObjectURL(blob);
      a.download = "apontauto-prisma-extension.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(a.href);
      toast.success("Download iniciado");
    } catch (e) {
      toast.error(`Falha no download: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  };


  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl">
        <div className="mb-4 flex items-center gap-3">
          {connected ? (
            <>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/20">
                <Wifi className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-emerald-300">Extensão conectada</p>
                <p className="text-xs text-white/50">
                  Último heartbeat: {new Date(lastHeartbeat!).toLocaleTimeString("pt-BR")}
                  {versao && ` · v${versao}`}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
                <WifiOff className="h-5 w-5 text-white/50" />
              </div>
              <div>
                <p className="font-medium text-white/80">Extensão offline</p>
                <p className="text-xs text-white/50">
                  {lastHeartbeat
                    ? `Última atividade em ${new Date(lastHeartbeat).toLocaleString("pt-BR")}`
                    : "Aguardando primeira conexão da extensão..."}
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
          Credenciais para a extensão
        </h2>
        <p className="mb-4 text-xs text-white/50">
          Cole estes valores exatamente nos campos correspondentes dentro da extensão.
        </p>
        <div className="space-y-3">
          <CopyRow label="URL do Supabase" value={URL} onCopy={() => copy(URL, "URL")} />
          <CopyRow
            label="Anon Key"
            value={KEY}
            secret
            onCopy={() => copy(KEY, "Anon key")}
          />
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-[28px] border border-amber-400/20 bg-amber-500/[0.06] p-5 backdrop-blur-2xl">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-amber-100">Segurança do login do Prisma</p>
          <p className="text-xs text-amber-100/80">
            Por segurança, o usuário e senha do Prisma <strong>não ficam salvos no painel</strong>.
            Eles são digitados uma única vez direto na extensão e usados apenas para o login
            automático no navegador. Configure isso nas opções da extensão, não aqui.
          </p>
        </div>
      </section>
    </div>
  );
}

function CopyRow({
  label,
  value,
  secret,
  onCopy,
}: {
  label: string;
  value: string;
  secret?: boolean;
  onCopy: () => void;
}) {
  const [show, setShow] = useState(!secret);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</span>
        <div className="flex gap-1">
          {secret && (
            <button
              onClick={() => setShow((s) => !s)}
              className="rounded-full px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/[0.06]"
            >
              {show ? "Ocultar" : "Mostrar"}
            </button>
          )}
          <button
            onClick={onCopy}
            className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium transition hover:bg-white/[0.1] active:scale-95"
          >
            <Copy className="h-3 w-3" /> Copiar
          </button>
        </div>
      </div>
      <p className="break-all font-mono text-xs text-white/80">{show ? value : "•".repeat(Math.min(value.length, 40))}</p>
    </div>
  );
}
