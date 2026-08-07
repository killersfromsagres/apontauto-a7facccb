import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Database, Loader2, Send, ShieldCheck, Sparkles, User } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { copilotChat, copilotExecutar } from "@/lib/copilot/copilot.functions";
import { isComandoIgnorado, sanitizeComando } from "@/lib/copilot/sanitize-comando";
import type { AcaoProposta, CopilotConsulta } from "@/lib/copilot/types";

interface Bolha {
  role: "user" | "assistant";
  content: string;
  consultas?: CopilotConsulta[];
  acoes?: AcaoProposta[];
}

const EXEMPLOS = [
  "Quantas OS de corretiva estão abertas por equipe neste mês?",
  "Liste os 10 prédios com mais chamados em backorder no ano atual.",
  "Quais usuários existem e quais módulos cada um pode acessar?",
  "Libere os módulos de água e frota para o login abastecimento.",
  "Quantos abastecimentos foram lançados nos últimos 30 dias e o total gasto?",
];

export function CopilotView() {
  const { isAdmin, loading } = useIsAdmin();
  const [mensagens, setMensagens] = useState<Bolha[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [executadas, setExecutadas] = useState<Record<string, string>>({});
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, ocupado]);

  const enviar = async (pergunta?: string) => {
    const bruto = (pergunta ?? texto).trim();
    if (!bruto || ocupado) return;
    // Comando-preâmbulo: descartado por completo; o próximo comando enviado
    // pelo usuário é que será processado como principal.
    if (isComandoIgnorado(bruto)) {
      setTexto("");
      toast.info("Comando de contexto ignorado. Envie o comando a ser executado.");
      return;
    }
    const conteudo = sanitizeComando(bruto);
    const historico: Bolha[] = [...mensagens, { role: "user", content: conteudo }];
    setMensagens(historico);
    setTexto("");
    setOcupado(true);
    try {
      const res = await copilotChat({
        data: { messages: historico.map((m) => ({ role: m.role, content: m.content })) },
      });
      setMensagens([
        ...historico,
        {
          role: "assistant",
          content: res.reply,
          consultas: res.consultas,
          acoes: res.acoes,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao falar com o copiloto.";
      toast.error(msg);
      setMensagens([...historico, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async (acao: AcaoProposta) => {
    setOcupado(true);
    try {
      const res = await copilotExecutar({ data: { tipo: acao.tipo, params: acao.params } });
      setExecutadas((prev) => ({ ...prev, [acao.id]: res.detalhe }));
      toast.success(res.detalhe);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível executar a ação.");
    } finally {
      setOcupado(false);
    }
  };

  if (loading) {
    return (
      <PageShell eyebrow="Inteligência e BI" title="Copiloto Admin" description="Carregando…">
        <GlassCard>
          <p className="text-sm text-muted-foreground">Verificando permissões…</p>
        </GlassCard>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell
        eyebrow="Inteligência e BI"
        title="Copiloto Admin"
        description="Área restrita a administradores."
      >
        <GlassCard className="border-destructive/40">
          <p className="text-sm text-destructive">
            Você não tem permissão para acessar o Copiloto Admin.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Inteligência e BI"
      title="Copiloto Admin"
      description="Converse em português com a IA do sistema: ela consulta os dados reais do banco, responde com números e propõe alterações administrativas — que só são aplicadas depois da sua confirmação."
      actions={
        <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
          <ShieldCheck className="size-3.5" /> Somente admin
        </Badge>
      }
    >
      <GlassCard variant="block" className="flex min-h-[60vh] flex-col gap-4">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {mensagens.length === 0 ? (
            <div className="space-y-4 py-6 text-center">
              <Sparkles className="mx-auto size-8 text-primary" />
              <p className="text-sm text-muted-foreground">
                Pergunte qualquer coisa sobre a operação ou peça uma alteração administrativa.
              </p>
              <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2">
                {EXEMPLOS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void enviar(ex)}
                    className="rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mensagens.map((m, i) => (
            <div key={i} className="flex gap-3">
              <div className="mt-0.5 shrink-0">
                {m.role === "user" ? (
                  <User className="size-5 text-muted-foreground" />
                ) : (
                  <Bot className="size-5 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                  {m.content}
                </p>

                {m.consultas && m.consultas.length > 0 ? (
                  <div className="space-y-1.5">
                    {m.consultas.map((c, ci) => (
                      <details
                        key={ci}
                        className="rounded-xl border border-border/50 bg-background/40 px-3 py-2"
                      >
                        <summary className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                          <Database className="size-3.5" /> Consulta {ci + 1} • {c.linhas} linha(s)
                        </summary>
                        <pre className="mt-2 overflow-x-auto text-[11px] text-muted-foreground">
                          {c.sql}
                        </pre>
                      </details>
                    ))}
                  </div>
                ) : null}

                {m.acoes?.map((a) => (
                  <div
                    key={a.id}
                    className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{a.resumo}</p>
                        <pre className="mt-1 overflow-x-auto text-[11px] text-muted-foreground">
                          {JSON.stringify(a.params, null, 2)}
                        </pre>
                      </div>
                    </div>
                    {executadas[a.id] ? (
                      <p className="text-xs text-emerald-500">✓ {executadas[a.id]}</p>
                    ) : (
                      <Button
                        size="sm"
                        variant={a.perigosa ? "destructive" : "default"}
                        disabled={ocupado}
                        onClick={() => void confirmar(a)}
                      >
                        Confirmar e executar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {ocupado ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Consultando os dados…
            </div>
          ) : null}
          <div ref={fimRef} />
        </div>

        <div className="flex items-end gap-2 border-t border-border/50 pt-3">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={2}
            disabled={ocupado}
            placeholder="Ex.: quantas OS de refrigeração foram concluídas em julho?"
            className="min-h-[52px] resize-y text-sm"
          />
          <Button onClick={() => void enviar()} disabled={ocupado || !texto.trim()} size="lg">
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </GlassCard>
    </PageShell>
  );
}
