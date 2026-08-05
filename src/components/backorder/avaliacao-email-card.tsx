import { useMemo, useState } from "react";
import { Copy, Check, Mail, Users, FileDown } from "lucide-react";
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
import { generateAvaliacaoPDF } from "@/lib/backorder/avaliacao-pdf";
import { downloadBlob } from "@/lib/download";

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
  const solicitantes = useMemo(() => resumo ?? agruparSolicitantes(rows), [resumo, rows]);
  const totalOs = solicitantes.reduce((a, b) => a + b.total, 0);
  const assunto = assuntoEmail(ano);
  const corpo = useMemo(() => corpoEmail({}), []);
  const [exporting, setExporting] = useState(false);

  async function handleExportPDF() {
    setExporting(true);
    try {
      const blob = await generateAvaliacaoPDF({
        titulo: "Gestão Predial - Apont Auto",
        resumo: solicitantes,
        ano
      });
      downloadBlob(blob, `Relatorio_Avaliacao_${ano}.xlsx`);
      toast.success("Relatório gerado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar relatório");
    } finally {
      setExporting(false);
    }
  }

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-bold uppercase tracking-wider">Cobrança de avaliação no Prisma</h3>
        </div>
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
          {solicitantes.length} solicitantes · {totalOs} OS pendentes
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase text-muted-foreground tracking-widest">
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Lista de Solicitantes</span>
              <CopyButton text={nomesInline(solicitantes)} label="Copiar Nomes (Destinatários)" />
            </div>
            <ScrollArea className="h-48 rounded-xl border border-white/10 bg-white/5">
              <ul className="divide-y divide-white/5">
                {solicitantes.map((s) => (
                  <li key={s.nome} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors">
                    <span className="truncate text-xs font-medium">{s.nome}</span>
                    <div className="flex items-center gap-1.5">
                      {s.aguardando > 0 && <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/20 text-[9px]">{s.aguardando} AGUARD.</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{s.total} OS</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">Assunto do E-mail</label>
              <div className="flex gap-2">
                <Input readOnly value={assunto} className="bg-white/5 border-white/10 text-xs h-9" />
                <CopyButton text={assunto} label="Copiar" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">Corpo da Mensagem (Cordial)</label>
              <Textarea readOnly value={corpo} rows={8} className="bg-white/5 border-white/10 text-xs leading-relaxed resize-none" />
              <div className="mt-2 flex gap-2">
                <CopyButton text={corpo} label="Copiar Corpo do E-mail" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-white/10">
        <Button
          variant="secondary"
          className="h-10 px-6 font-bold uppercase tracking-widest text-[10px]"
          onClick={handleExportPDF}
          disabled={exporting}
        >
          {exporting ? "Gerando..." : <><FileDown className="mr-2 h-4 w-4" /> Gerar Relatório (XLSX/PDF)</>}
        </Button>
        <Button
          className="h-10 px-6 font-bold uppercase tracking-widest text-[10px] bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
          onClick={() => {
            window.location.href = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
          }}
        >
          <Mail className="mr-2 h-4 w-4" /> Abrir no Outlook/E-mail
        </Button>
      </div>
    </GlassCard>
  );
}
