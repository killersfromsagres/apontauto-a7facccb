import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Download, ShieldAlert, Radio, Puzzle } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useExtStatus } from "@/lib/prisma-panel/hooks";
import { downloadBlob } from "@/lib/download";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard.writeText(value);
    setCopiado(true);
    toast.success(`${label} copiado.`);
    setTimeout(() => setCopiado(false), 1500);
  };
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <Input readOnly value={value} className="rounded-2xl border-white/10 bg-white/[0.04] font-mono text-xs" />
        <Button onClick={copiar} variant="outline" className="rounded-full active:scale-95">
          {copiado ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ConfigTab() {
  const { data: ext } = useExtStatus();
  const conectado = ext && Date.now() - new Date(ext.ultima_atividade).getTime() < 3 * 60 * 1000;

  const baixarExtensao = () => {
    fetch("/apontauto-prisma-extension.zip")
      .then((r) => {
        if (!r.ok) throw new Error(`Falha ao baixar (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        downloadBlob(blob, "apontauto-prisma-extension.zip");
        toast.success("Extensão baixada.");
      })
      .catch((e) => toast.error((e as Error).message));
  };

  return (
    <div className="space-y-4">
      <GlassCard className="!rounded-[28px] !p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">Extensão do navegador</h3>
            <p className="text-xs text-muted-foreground">Baixe, instale e cole as credenciais abaixo no popup da extensão.</p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium ${
              conectado
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-white/[0.04] text-muted-foreground"
            }`}
          >
            <Radio className={`h-3 w-3 ${conectado ? "animate-pulse" : ""}`} />
            {conectado ? "Conectada" : "Desconectada"}
          </div>
        </div>

        <Button
          onClick={baixarExtensao}
          className="rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 active:scale-95"
        >
          <Download className="mr-2 h-4 w-4" /> Baixar extensão (.zip)
        </Button>

        <div className="mt-5 grid gap-4">
          <CopyField label="URL do projeto Supabase" value={SUPABASE_URL} />
          <CopyField label="Chave anon (publishable)" value={SUPABASE_ANON_KEY} hint="Segura para o cliente — protegida por RLS." />
        </div>

        <div className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 text-xs text-blue-100">
          <p className="mb-1 font-medium">Instruções:</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Extraia o .zip em uma pasta.</li>
            <li>Abra <code>chrome://extensions</code> e ative o modo desenvolvedor.</li>
            <li>Clique em "Carregar sem compactação" e selecione a pasta.</li>
            <li>Abra o popup e cole a URL, a chave anon, seu e-mail e senha.</li>
            <li>Ative a automação e mantenha o Prisma aberto em uma aba do mesmo navegador.</li>
          </ol>
        </div>
      </GlassCard>

      <GlassCard className="!rounded-[28px] !p-5">
        <div className="flex gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-300" />
          <div className="text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Sobre suas credenciais do Prisma</p>
            <p>
              Por segurança, a extensão usa a sessão em que você já está logado no Prisma pelo próprio navegador.
              Nenhuma credencial do Prisma é armazenada aqui ou no Supabase.
            </p>
          </div>
        </div>
      </GlassCard>

      {ext && (
        <GlassCard className="!rounded-[28px] !p-5">
          <div className="flex items-start gap-3">
            <Puzzle className="h-5 w-5 shrink-0 text-blue-300" />
            <div className="text-xs">
              <p className="font-medium">Última atividade da extensão</p>
              <p className="text-muted-foreground">
                {new Date(ext.ultima_atividade).toLocaleString("pt-BR")} · versão {ext.versao ?? "?"}
              </p>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
