import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CalendarIcon, Download, Plus, Trash2 } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calcularApontamento,
  generateApontamentoWorkbook,
  downloadBlob,
} from "@/lib/apontamento/apontamento";

interface Props {
  titulo: string;
  descricao: string;
  accent?: string;
}

export function ApontamentoModule({ titulo, descricao, accent = "text-primary" }: Props) {
  const [tecnico, setTecnico] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [osText, setOsText] = useState("");

  const osList = useMemo(
    () =>
      osText
        .split(/\r?\n|,|;/)
        .map((s) => s.trim())
        .filter(Boolean),
    [osText],
  );

  const rows = useMemo(
    () => (tecnico && data && osList.length ? calcularApontamento({ tecnico, data, osList }) : []),
    [tecnico, data, osList],
  );

  const download = async () => {
    if (!rows.length) return toast.error("Informe técnico, data e ao menos uma OS.");
    try {
      const blob = await generateApontamentoWorkbook(titulo.toUpperCase(), rows);
      downloadBlob(blob, `${titulo.toUpperCase().replace(/\s+/g, "_")}_${data}.xlsx`);
      toast.success("Planilha gerada");
    } catch {
      toast.error("Falha ao gerar planilha");
    }
  };

  return (
    <PageShell title={titulo} description={descricao}>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <GlassCard>
          <div className="space-y-4">
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${accent}`}>
              Novo apontamento
            </h3>

            <div className="space-y-2">
              <Label htmlFor="tec">Técnico</Label>
              <Input
                id="tec"
                placeholder="Nome do técnico"
                value={tecnico}
                onChange={(e) => setTecnico(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="data"
                  type="date"
                  className="pl-8"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="os">Ordens de Serviço</Label>
              <Textarea
                id="os"
                rows={10}
                placeholder="Uma OS por linha (ou separadas por vírgula)"
                value={osText}
                onChange={(e) => setOsText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {osList.length} OS · tempo por OS ≈{" "}
                {osList.length ? Math.floor(480 / osList.length) : 0} min
              </p>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={download} disabled={!rows.length}>
                <Download className="mr-2 h-4 w-4" /> Baixar Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTecnico("");
                  setOsText("");
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Prévia da programação</h3>
            <span className="text-xs text-muted-foreground">
              {rows.length} linha{rows.length === 1 ? "" : "s"}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
              <Plus className="h-6 w-6" />
              <p className="text-sm">
                Preencha o formulário para gerar a distribuição de horários.
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-x-auto rounded-lg border border-border/60"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="bg-[#FA8072] text-black">Técnico</TableHead>
                    <TableHead className="bg-[#7CC77C] text-black">Data Início</TableHead>
                    <TableHead className="bg-[#7CC77C] text-black">Data Final</TableHead>
                    <TableHead className="bg-[#D8B4FE] text-black">OS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.tecnico}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.dataInicio.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.dataFinal.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.os}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </motion.div>
          )}
        </GlassCard>
      </div>
    </PageShell>
  );
}
