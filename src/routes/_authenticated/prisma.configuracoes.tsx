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
      {/* Download da extensão — botão de destaque */}
      <section className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-indigo-500/[0.08] via-fuchsia-500/[0.06] to-transparent p-6 backdrop-blur-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 shadow-inner">
              <PackageCheck className="h-6 w-6 text-fuchsia-300" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Extensão do navegador
              </h2>
              <p className="mt-0.5 text-xs text-white/60">
                Baixe o pacote <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">.zip</code>,
                extraia e carregue em <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">chrome://extensions</code>{" "}
                (Modo desenvolvedor → Carregar sem compactação).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={downloadExtension}
            disabled={downloading}
            aria-busy={downloading}
            className="group/btn relative isolate inline-flex shrink-0 items-center gap-2.5 overflow-hidden rounded-full border border-white/15 bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.55)] outline-none transition-all duration-300 hover:shadow-[0_18px_44px_-12px_rgba(168,85,247,0.75)] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 active:translate-y-0 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
          >
            {/* gradiente base */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 bg-[linear-gradient(120deg,#4f46e5_0%,#a855f7_50%,#ec4899_100%)] opacity-90"
            />
            {/* brilho passando */}
            <span
              aria-hidden
              className="absolute inset-y-0 -left-1/2 -z-10 w-1/2 -skew-x-12 bg-white/25 blur-md transition-transform duration-700 ease-out group-hover/btn:translate-x-[300%]"
            />
            <Download
              className={`h-4 w-4 transition-transform duration-300 ${
                downloading ? "animate-pulse" : "group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5"
              }`}
              strokeWidth={2.5}
            />
            <span className="tracking-wide">
              {downloading ? "Preparando…" : "Baixar extensão"}
            </span>
            <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10px] tracking-wider text-white/90">
              .zip
            </span>
          </button>
        </div>
      </section>


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
