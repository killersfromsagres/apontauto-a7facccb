import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles, Bot, FileCode2, ClipboardCopy, Puzzle } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  gerarAgendamento,
  parseLote,
  type LoteAgendado,
} from "@/lib/automacao-os/parser";
import { converterTextoParaLote } from "@/lib/automacao-os/ai-convert.functions";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/automacao-os")({
  head: () => ({
    meta: [
      { title: "Automação de OS — Apont Auto" },
      {
        name: "description",
        content:
          "Painel de lote, IA orquestradora e extensão Chrome para automatizar apontamentos no Prisma4.",
      },
      { property: "og:title", content: "Automação de OS — Apont Auto" },
      {
        property: "og:description",
        content: "Gera, valida e dispara lotes de apontamento no Prisma4 sem terminal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AutomacaoOSPage,
});

const EXEMPLO = `inicio: 14/07/2026 08:00

[LOTE]
categoria: refrigeracao
tecnicos: 352010, 262023
os: 123456, 789012, 345678`;

function AutomacaoOSPage() {
  const [texto, setTexto] = useState(EXEMPLO);
  const [textoLivre, setTextoLivre] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [validado, setValidado] = useState<LoteAgendado[] | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [dataInicioDetectada, setDataInicioDetectada] = useState<Date | null>(null);

  const validar = () => {
    const r = parseLote(texto);
    setErros(r.erros);
    if (r.itens.length === 0) {
      setValidado(null);
      toast.error("Nenhuma OS detectada.");
      return;
    }
    const inicio = r.dataInicio ?? new Date();
    setDataInicioDetectada(r.dataInicio);
    setValidado(gerarAgendamento(r.itens, inicio));
    toast.success(`${r.itens.length} OS agendadas.`);
  };

  const converter = async () => {
    if (!textoLivre.trim()) {
      toast.error("Cole um texto para converter.");
      return;
    }
    setAiLoading(true);
    try {
      const r = await converterTextoParaLote({ data: { texto: textoLivre } });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      setTexto(r.formato);
      toast.success("Texto convertido em lote estruturado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const exportarJSON = () => {
    if (!validado) return;
    const payload = {
      geradoEm: new Date().toISOString(),
      dataInicio: dataInicioDetectada?.toISOString() ?? null,
      itens: validado,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `lote-prisma4-${Date.now()}.json`,
    );
  };

  const copiarLote = () => {
    if (!validado) return;
    navigator.clipboard.writeText(JSON.stringify(validado));
    toast.success("Lote copiado para a área de transferência.");
  };

  const baixarExtensao = () => {
    fetch("/apontauto-prisma-extension.zip")
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao baixar (" + r.status + ")");
        return r.blob();
      })
      .then((blob) => {
        downloadBlob(blob, "apontauto-prisma-extension.zip");
        toast.success("Extensão baixada. Siga as instruções abaixo para instalar.");
      })
      .catch((e) => toast.error((e as Error).message));
  };

  const resumoDias = useMemo(() => {
    if (!validado) return [];
    const map = new Map<string, number>();
    for (const it of validado) {
      const dia = it.dataHoraInicio.split(" ")[0];
      map.set(dia, (map.get(dia) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [validado]);

  return (
    <PageShell
      title="Automação de OS · Prisma4"
      description="Prepare o lote, valide o agendamento e dispare a automação pela extensão do navegador — sem terminal."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={baixarExtensao}>
            <Puzzle className="mr-2 h-4 w-4" />
            Baixar extensão Chrome
          </Button>
        </>
      }
    >
      <Tabs defaultValue="lote" className="space-y-4">
        <TabsList className="w-full flex-wrap sm:w-auto">
          <TabsTrigger value="lote"><FileCode2 className="mr-2 h-4 w-4" />Lote estruturado</TabsTrigger>
          <TabsTrigger value="ia"><Bot className="mr-2 h-4 w-4" />Assistente IA</TabsTrigger>
          <TabsTrigger value="extensao"><Puzzle className="mr-2 h-4 w-4" />Extensão</TabsTrigger>
        </TabsList>

        <TabsContent value="lote" className="space-y-4">
          <GlassCard className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-semibold">Entrada do lote</h3>
                <p className="text-xs text-muted-foreground">
                  Formato: <code>inicio: DD/MM/AAAA HH:mm</code> + blocos <code>[LOTE]</code> com{" "}
                  <code>categoria</code>, <code>tecnicos</code>, <code>os</code>.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={validar} size="sm">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Validar lote
                </Button>
              </div>
            </div>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="min-h-[220px] font-mono text-xs"
              spellCheck={false}
            />
            {erros.length > 0 && (
              <ul className="text-xs text-destructive">
                {erros.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            )}
          </GlassCard>

          {validado && (
            <GlassCard className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold">Pré-visualização do agendamento</h3>
                  <Badge variant="secondary">{validado.length} OS</Badge>
                  {resumoDias.map(([dia, n]) => (
                    <Badge key={dia} variant="outline" className="text-[10px]">
                      {dia}: {n}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copiarLote}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                    Copiar JSON
                  </Button>
                  <Button size="sm" onClick={exportarJSON}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar JSON
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Técnicos</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validado.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{it.numeroOS}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{it.categoria}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {it.colaboradores.join(", ") || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{it.dataHoraInicio}</TableCell>
                        <TableCell className="font-mono text-xs">{it.dataHoraFim}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ao clicar em "Exportar JSON", salve o arquivo e importe-o na extensão do navegador para disparar a automação diretamente no Prisma4.
              </p>
            </GlassCard>
          )}
        </TabsContent>

        <TabsContent value="ia" className="space-y-4">
          <GlassCard className="space-y-3 p-4 sm:p-5">
            <div>
              <h3 className="font-display text-lg font-semibold">Converter texto livre em lote</h3>
              <p className="text-xs text-muted-foreground">
                Cole uma mensagem de WhatsApp, e-mail ou relatório. A IA extrai técnicos, OS e categoria.
              </p>
            </div>
            <Textarea
              value={textoLivre}
              onChange={(e) => setTextoLivre(e.target.value)}
              className="min-h-[180px] text-sm"
              placeholder="Ex.: Segunda 08:00, refrigeração. Técnicos 352010 e 262023. OS 123456, 789012."
            />
            <Button onClick={converter} disabled={aiLoading}>
              <Bot className="mr-2 h-4 w-4" />
              {aiLoading ? "Convertendo..." : "Converter com IA"}
            </Button>
          </GlassCard>
        </TabsContent>

        <TabsContent value="extensao" className="space-y-4">
          <GlassCard className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">Extensão Apont Auto · Prisma4</h3>
                <p className="text-xs text-muted-foreground">
                  Executa o mesmo fluxo do script Playwright, mas diretamente no seu Chrome logado. Sem
                  terminal, sem servidor.
                </p>
              </div>
              <Button onClick={baixarExtensao}>
                <Download className="mr-2 h-4 w-4" />
                Baixar .zip
              </Button>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Baixe o .zip e extraia em uma pasta permanente.</li>
              <li>
                Abra <code>chrome://extensions</code> no Chrome (ou Edge/Brave).
              </li>
              <li>
                Ative o <strong>Modo desenvolvedor</strong> no canto superior direito.
              </li>
              <li>
                Clique em <strong>Carregar sem compactação</strong> e selecione a pasta descompactada.
              </li>
              <li>Fixe o ícone da extensão na barra e abra o popup.</li>
              <li>
                Salve suas credenciais do Prisma4 (ficam apenas no seu navegador,{" "}
                <code>chrome.storage.local</code>).
              </li>
              <li>Importe o JSON exportado nesta página e clique em "Iniciar automação".</li>
            </ol>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
