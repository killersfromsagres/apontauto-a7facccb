import { useMemo, useState } from "react";

import { toast } from "sonner";
import { CalendarIcon, Download, Plus, Trash2, UserCog, X } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [tecInput, setTecInput] = useState("");
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
    () =>
      tecnicos.length && data && osList.length
        ? calcularApontamento({ tecnicos, data, osList })
        : [],
    [tecnicos, data, osList],
  );

  const addTecnicos = (raw: string) => {
    const items = raw
      .split(/[,;\n\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) return;
    setTecnicos((prev) => {
      const set = new Set(prev);
      for (const it of items) set.add(it);
      return Array.from(set);
    });
    setTecInput("");
  };

  const removeTecnico = (id: string) =>
    setTecnicos((prev) => prev.filter((t) => t !== id));

  const osPorTecnico = tecnicos.length
    ? Math.ceil(osList.length / tecnicos.length)
    : 0;
  const minPorOs = osPorTecnico ? Math.floor(480 / osPorTecnico) : 0;

  const download = async () => {
    if (!rows.length)
      return toast.error("Informe ao menos um técnico, a data e uma OS.");
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
      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        <GlassCard>
          <div className="space-y-4">
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${accent}`}>
              Novo apontamento
            </h3>

            <div className="space-y-2">
              <Label htmlFor="tec" className="flex items-center gap-2">
                <UserCog className="h-3.5 w-3.5" />
                Técnicos (ID / matrícula)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="tec"
                  placeholder="Ex.: 12345"
                  value={tecInput}
                  onChange={(e) => setTecInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTecnicos(tecInput);
                    }
                  }}
                  onBlur={() => tecInput && addTecnicos(tecInput)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addTecnicos(tecInput)}
                  disabled={!tecInput.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tecnicos.map((id) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="gap-1 rounded-md py-1 pl-2 pr-1 font-mono text-xs"
                  >
                    {id}
                    <button
                      type="button"
                      onClick={() => removeTecnico(id)}
                      className="ml-1 rounded-sm hover:bg-background/60"
                      aria-label={`Remover técnico ${id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {tecnicos.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Adicione uma ou mais identificações — separe por Enter ou vírgula.
                  </span>
                )}
              </div>
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
                {osList.length} OS · {tecnicos.length} técnico{tecnicos.length === 1 ? "" : "s"}
                {tecnicos.length > 0 && osList.length > 0 && (
                  <>
                    {" · "}
                    ≈{osPorTecnico} OS por técnico ({minPorOs} min/OS)
                  </>
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={download} disabled={!rows.length}>
                <Download className="mr-2 h-4 w-4" /> Baixar Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTecnicos([]);
                  setTecInput("");
                  setOsText("");
                }}
                aria-label="Limpar"
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
              className="scroll-fluid max-h-[65vh] overflow-auto rounded-lg border border-border/60"
            >
              <Table>
                <TableHeader className="sticky top-0 z-10 backdrop-blur-md">
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
                      <TableCell className="font-mono text-xs">{r.tecnico}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.dataInicio.toLocaleString("pt-BR", { timeZone: "UTC" })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.dataFinal.toLocaleString("pt-BR", { timeZone: "UTC" })}
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
