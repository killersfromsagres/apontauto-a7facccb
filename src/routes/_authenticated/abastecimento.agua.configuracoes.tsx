import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, CloudOff, Database, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { WhatsAppConfigCard } from "@/components/agua/whatsapp-config-card";
import { useCanAccessModule } from "@/hooks/use-can-access-module";

import { listPontos, listProgramacao } from "@/lib/agua/api";
import { lerFila, useAguaSync } from "@/lib/agua/offline";
import { useSettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/configuracoes")({
  component: Configuracoes,
});

const PREF_KEY = "agua:prefs";

type Prefs = { autoFoto: boolean; cacheRota: boolean };
const DEFAULT_PREFS: Prefs = { autoFoto: true, cacheRota: true };

function Configuracoes() {
  const acesso = useCanAccessModule("abastecimento", "update");
  const { pendentes, online, sincronizando, sincronizar } = useAguaSync();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [cacheados, setCacheados] = useState(0);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const prog = useQuery({ queryKey: ["agua", "programacao"], queryFn: listProgramacao });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) });
    } catch {
      /* preferências inválidas: mantém padrão */
    }
    setCacheados(
      Object.keys(localStorage).filter((k) => k.startsWith("agua:rota:")).length,
    );
  }, []);

  function salvar(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem(PREF_KEY, JSON.stringify(next));
    toast.success("Preferência salva neste aparelho.");
  }

  function limparCache() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("agua:rota:"))
      .forEach((k) => localStorage.removeItem(k));
    setCacheados(0);
    toast.success("Cache de rotas removido.");
  }

  return (
    <div className="space-y-4">
      <WhatsAppConfigCard podeEditar={acesso.allowed} />

      <GlassCard className="space-y-4 p-4">

        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Execução offline</h2>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <Label htmlFor="cache-rota">Manter rota do dia no aparelho</Label>
            <p className="text-xs text-muted-foreground">
              Permite abrir a rota e registrar entregas sem internet.
            </p>
          </div>
          <Switch
            id="cache-rota"
            checked={prefs.cacheRota}
            onCheckedChange={(v) => salvar({ cacheRota: v })}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <Label htmlFor="auto-foto">Abrir a câmera direto na evidência</Label>
            <p className="text-xs text-muted-foreground">
              Usa a câmera traseira ao tocar em “Evidência” na parada.
            </p>
          </div>
          <Switch
            id="auto-foto"
            checked={prefs.autoFoto}
            onCheckedChange={(v) => salvar({ autoFoto: v })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <Button
            variant="secondary"
            className="min-h-[44px]"
            disabled={sincronizando || pendentes === 0 || !online}
            onClick={() => void sincronizar()}
          >
            <RefreshCw className={sincronizando ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Sincronizar {pendentes > 0 ? `(${pendentes})` : ""}
          </Button>
          <Button variant="ghost" className="min-h-[44px]" onClick={limparCache}>
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar cache ({cacheados})
          </Button>
          <span className="text-xs text-muted-foreground">
            {online ? "Conectado" : "Sem conexão"} · {pendentes} pendência(s)
          </span>
        </div>
      </GlassCard>

      <FilaSincronizacaoCard />


      {acesso.allowed && <GeracaoCard />}

      <div className="grid gap-3 sm:grid-cols-2">

        <GlassCard className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Base cadastrada</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {pontos.data?.length ?? 0} ponto(s) · {prog.data?.length ?? 0} visita(s) programada(s)
            por semana.
          </p>
          <p className="text-xs text-muted-foreground">
            A base é atualizada pela importação da planilha na aba Programação.
          </p>
        </GlassCard>

        <GlassCard className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Seu acesso</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {acesso.allowed
              ? "Você pode registrar execuções, importar programação e tratar solicitações."
              : "Acesso somente de leitura: você visualiza os dados, mas não registra alterações."}
          </p>
        </GlassCard>
      </div>
    </div>
  );
}

/** Horário (fuso São Paulo) em que o sistema gera as rotas do dia automaticamente. */
function GeracaoCard() {
  const [settings, save] = useSettings();
  const extras = settings as unknown as Record<string, any>;
  const atual = Number(extras.aguaGeracao?.hora ?? 5);
  const [hora, setHora] = useState(String(atual));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setHora(String(atual));
  }, [atual]);

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Geração automática de rotas</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Todo dia, no horário abaixo (fuso America/São Paulo), o sistema gera as rotas e paradas a
        partir da programação semanal, respeitando feriados e exceções. A rotina é idempotente:
        rodar de novo não duplica nada.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="hora-geracao">Hora de execução</Label>
          <select
            id="hora-geracao"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="h-11 w-[120px] rounded-xl border border-border/60 bg-card/40 px-3 text-sm"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={String(h)}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <Button
          className="min-h-[44px]"
          disabled={salvando}
          onClick={async () => {
            setSalvando(true);
            try {
              await save({ ...extras, aguaGeracao: { hora: Number(hora) } } as never);
              toast.success("Horário salvo.");
            } catch (e) {
              toast.error((e as Error)?.message ?? "Falha ao salvar horário.");
            } finally {
              setSalvando(false);
            }
          }}
        >
          Salvar horário
        </Button>
      </div>
    </GlassCard>
  );
}

