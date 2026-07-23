import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock, Play, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";

import {
  enableTimeWarp,
  disableTimeWarp,
  subscribeTimeWarp,
  getRealNow,
  getVirtualNow,
} from "@/lib/time-warp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relogio")({
  head: () => ({
    meta: [
      { title: "Relógio Virtual · Apont Auto" },
      { name: "description", content: "Defina uma data e hora customizadas para o navegador desta sessão." },
      { property: "og:title", content: "Relógio Virtual · Apont Auto" },
      { property: "og:description", content: "Manipulação de data e hora do navegador." },
    ],
  }),
  component: RelogioPage,
});

function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function RelogioPage() {
  const [state, setState] = useState(() => ({
    enabled: false,
    offsetMs: 0,
    customBaseIso: null as string | null,
    activatedAt: null as number | null,
  }));
  const [input, setInput] = useState<string>(() => toLocalInputValue(getRealNow()));
  const [timeOnly, setTimeOnly] = useState<string>(() => {
    const d = new Date(getRealNow());
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  });
  const [realNowTick, setRealNowTick] = useState(getRealNow());
  const [virtualNowTick, setVirtualNowTick] = useState(getVirtualNow());

  useEffect(() => subscribeTimeWarp((s) => setState(s)), []);
  useEffect(() => {
    const id = window.setInterval(() => {
      setRealNowTick(getRealNow());
      setVirtualNowTick(getVirtualNow());
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const realStr = useMemo(
    () => new Date(realNowTick).toLocaleString("pt-BR", { hour12: false }),
    [realNowTick],
  );
  const virtualStr = useMemo(
    () => new Date(virtualNowTick).toLocaleString("pt-BR", { hour12: false }),
    [virtualNowTick],
  );

  const handleApply = () => {
    if (!input) {
      toast.error("Informe uma data e hora válidas.");
      return;
    }
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Data/hora inválida.");
      return;
    }
    enableTimeWarp(parsed);
    toast.success("Relógio virtual ativado.");
  };

  const handleApplyTimeOnly = () => {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeOnly.trim());
    if (!m) {
      toast.error("Formato inválido. Use HH:MM:SS.");
      return;
    }
    const h = Number(m[1]), mm = Number(m[2]), ss = Number(m[3] ?? "0");
    if (h > 23 || mm > 59 || ss > 59) {
      toast.error("Horário fora do intervalo.");
      return;
    }
    const now = new Date(getRealNow());
    now.setHours(h, mm, ss, 0);
    enableTimeWarp(now);
    toast.success(`Horário definido para ${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.`);
  };

  const handleReset = () => {
    disableTimeWarp();
    setInput(toLocalInputValue(getRealNow()));
    toast.success("Relógio real restaurado.");
  };

  const fillWithNow = () => setInput(toLocalInputValue(getRealNow()));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Relógio Virtual</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Substitui <code className="rounded bg-muted px-1 py-0.5 text-xs">Date.now()</code> e{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">new Date()</code> dentro deste
          navegador por uma data/hora customizada. O relógio continua correndo normalmente a partir
          do ponto escolhido. Válido apenas para este aplicativo (não afeta o sistema operacional
          nem outros sites).
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Status atual</CardTitle>
            <CardDescription>
              {state.enabled
                ? "O navegador está usando uma data/hora customizada."
                : "O navegador está usando a data/hora real do sistema."}
            </CardDescription>
          </div>
          {state.enabled ? (
            <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20">
              <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Ativo
            </Badge>
          ) : (
            <Badge variant="secondary">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Real
            </Badge>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Hora real do sistema
            </div>
            <div className="mt-1 font-mono text-lg tabular-nums">{realStr}</div>
          </div>
          <div className="rounded-lg border bg-primary/5 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Hora vista pelo app
            </div>
            <div className="mt-1 font-mono text-lg tabular-nums text-primary">{virtualStr}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Definir data e hora</CardTitle>
          <CardDescription>
            Escolha a data/hora inicial. A partir dela o relógio continua contando em tempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dt">Data e hora customizadas</Label>
            <Input
              id="dt"
              type="datetime-local"
              step={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="button"
              onClick={fillWithNow}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              usar a hora real atual
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleApply} className="gap-2">
              <Play className="h-4 w-4" />
              Ativar relógio virtual
            </Button>
            <Button variant="outline" onClick={handleReset} className="gap-2" disabled={!state.enabled}>
              <RotateCcw className="h-4 w-4" />
              Voltar ao relógio real
            </Button>
          </div>
          {state.enabled && state.customBaseIso && (
            <p className="text-xs text-muted-foreground">
              Base customizada: {new Date(state.customBaseIso).toLocaleString("pt-BR", { hour12: false })} ·{" "}
              offset: {(state.offsetMs / 1000 / 60).toFixed(1)} min
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Observações técnicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            A manipulação é feita substituindo <code>window.Date</code> por uma subclasse que aplica
            um deslocamento (offset) sobre o tempo real. Persistido em{" "}
            <code>localStorage</code> — recarregar a página mantém o estado.
          </p>
          <p>
            Não é possível interceptar o relógio do sistema operacional a partir de um navegador — o
            escopo desta ferramenta é o próprio aplicativo web.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
