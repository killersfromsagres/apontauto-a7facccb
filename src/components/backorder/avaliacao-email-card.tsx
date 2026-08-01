import { useMemo, useState } from "react";
import { Copy, Check, Mail, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { GlassCard } from "@/components/glass-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  agruparSolicitantes,
  assuntoEmail,
  corpoEmail,
  nomesInline,
  type SolicitanteResumo,
} from "@/lib/backorder/avaliacao-email";

interface Props {
  /** Chamados concluídos + aguardando aprovação. */
  rows: Array<{ solicitante?: string | null; statusCat: string; os?: string }>;
  ano: number | string;
  /** Resumo já agregado no servidor (opcional, tem prioridade). */
  resumo?: SolicitanteResumo[];
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          toast.success(`${label} copiado`);
          setTimeout(() => setOk(false), 1800);
        } catch {
          toast.error("Não foi possível copiar automaticamente");
        }
      }}
    >
      {ok ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
      {label}
    </Button>
  );
}

export function AvaliacaoEmailCard({ rows, ano, resumo }: Props) {
  const solicitantes = useMemo(
    () => resumo ?? agruparSolicitantes(rows),
    [resumo, rows],
  );
  const totalOs = solicitantes.reduce((a, b) => a + b.total, 0);
  const assunto = assuntoEmail(ano, totalOs);
  const corpo = useMemo(() => corpoEmail({ solicitantes, ano }), [solicitantes, ano]);

  if (solicitantes.length === 0) {
    return (
      <GlassCard>
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum chamado concluído ou aguardando aprovação nesta seleção.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Mail className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">Cobrança de avaliação no Prisma</h3>
        <Badge variant="secondary" className="ml-auto">
          {solicitantes.length} solicitante(s) · {totalOs.toLocaleString("pt-BR")} OS
        </Badge>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden /> Solicitantes (coluna E, sem repetição)
        </div>
        <ScrollArea className="max-h-56 rounded-xl border">
          <ul className="divide-y">
            {solicitantes.map((s) => (
              <li key={s.nome} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate text-sm">{s.nome}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {s.aguardando > 0 && (
                    <Badge className="bg-amber-500 text-white">{s.aguardando} aguard.</Badge>
                  )}
                  <Badge variant="secondary">{s.total}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Assunto</label>
        <Textarea readOnly value={assunto} rows={2} className="resize-none text-sm" />
        <label className="text-xs font-medium text-muted-foreground">Corpo do e-mail</label>
        <Textarea readOnly value={corpo} rows={14} className="text-sm leading-relaxed" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <CopyButton text={nomesInline(solicitantes)} label="Copiar nomes" />
        <CopyButton text={assunto} label="Copiar assunto" />
        <CopyButton text={corpo} label="Copiar e-mail" />
        <Button
          size="sm"
          className="min-h-11 sm:min-h-9"
          onClick={() => {
            window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
          }}
        >
          <Mail className="mr-2 h-4 w-4" /> Abrir no e-mail
        </Button>
      </div>
    </GlassCard>
  );
}
