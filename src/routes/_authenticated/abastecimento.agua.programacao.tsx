import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, FileSpreadsheet, Info, Loader2, Upload } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import {
  aplicarImportacao,
  atualizarPonto,
  listPontos,
  listProgramacao,
  loteComHash,
  pontoLabel,
} from "@/lib/agua/api";
import { DIA_LABEL, DIAS, lerPlanilhaAgua, sha256Hex, type LeituraAgua } from "@/lib/agua/reader";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/programacao")({
  component: PontosEFiltros,
});

function PontosEFiltros() {
  const qc = useQueryClient();
  const gestor = useCanAccessModule("abastecimento", "update").allowed;
  const inputRef = useRef<HTMLInputElement>(null);

  const [busca, setBusca] = useState("");
  const [dia, setDia] = useState<string>("todos");
  const [previa, setPrevia] = useState<{
    leitura: LeituraAgua;
    nome: string;
    hash: string;
    duplicado: boolean;
  } | null>(null);
  const [lendo, setLendo] = useState(false);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const prog = useQuery({ queryKey: ["agua", "programacao"], queryFn: listProgramacao });

  const diasPorPonto = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const p of prog.data ?? []) {
      const arr = m.get(p.ponto_id) ?? [];
      arr.push(p.dia_semana);
      m.set(p.ponto_id, arr.sort());
    }
    return m;
  }, [prog.data]);

  const lista = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return (pontos.data ?? []).filter((p) => {
      const dias = diasPorPonto.get(p.id) ?? [];
      if (dia !== "todos" && !dias.includes(Number(dia))) return false;
      if (!termo) return true;
      return `${p.predio} ${p.andar} ${p.espaco}`.includes(termo);
    });
  }, [pontos.data, diasPorPonto, busca, dia]);

  async function selecionarArquivo(file: File) {
    setLendo(true);
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf.slice(0));
      const leitura = lerPlanilhaAgua(buf);
      const jaImportado = await loteComHash(hash);
      setPrevia({ leitura, nome: file.name, hash, duplicado: Boolean(jaImportado) });
    } catch (e) {
      toast.error((e as Error)?.message ?? "Não foi possível ler a planilha.");
    } finally {
      setLendo(false);
    }
  }

  const aplicar = useMutation({
    mutationFn: async () => {
      if (!previa) throw new Error("Nenhuma pré-visualização carregada.");
      return aplicarImportacao({
        leitura: previa.leitura,
        arquivoNome: previa.nome,
        hash: previa.hash,
      });
    },
    onSuccess: () => {
      toast.success("Programação importada.");
      setPrevia(null);
      qc.invalidateQueries({ queryKey: ["agua"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha na importação."),
  });

  const editar = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      atualizarPonto(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agua", "pontos"] }),
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao salvar."),
  });

  return (
    <div className="space-y-4">
      {gestor && (
        <GlassCard className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Importar planilha de programação</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            As abas diárias são usadas como rota real; a aba consolidada é comparada e as
            divergências ficam visíveis antes de confirmar. Nada é gravado parcialmente.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void selecionarArquivo(f);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" disabled={lendo} onClick={() => inputRef.current?.click()}>
            {lendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Selecionar arquivo
          </Button>

          {previa && (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/40 p-3">
              <p className="text-sm font-medium">{previa.nome}</p>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Info2 label="Linhas lidas" value={previa.leitura.totalLinhas} />
                <Info2 label="Pontos canônicos" value={previa.leitura.pontos.length} />
                <Info2 label="Visitas/semana" value={previa.leitura.totalVisitas} />
                <Info2
                  label="Divergências"
                  value={previa.leitura.divergencias.length}
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {DIAS.map((d) => (
                  <span key={d.dia} className="rounded-full border border-border/60 px-2 py-0.5">
                    {d.label}: {previa.leitura.porDia[d.dia] ?? 0}
                  </span>
                ))}
              </div>

              <div className="max-h-64 space-y-1 overflow-auto">
                {previa.leitura.divergencias.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-border/50 bg-card/40 p-2 text-xs"
                  >
                    {d.severidade === "info" ? (
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                    ) : (
                      <AlertTriangle
                        className={
                          d.severidade === "erro"
                            ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300"
                            : "mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300"
                        }
                      />
                    )}
                    <span>{d.mensagem}</span>
                  </div>
                ))}
              </div>

              {previa.duplicado && (
                <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                  Este arquivo já foi importado antes (mesmo conteúdo). Confirme apenas se quiser
                  reaplicar a programação.
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  disabled={
                    aplicar.isPending ||
                    previa.leitura.divergencias.some((d) => d.severidade === "erro")
                  }
                  onClick={() => aplicar.mutate()}
                >
                  {aplicar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {previa.duplicado ? "Confirmar mesmo assim" : "Confirmar importação"}
                </Button>
                <Button variant="ghost" onClick={() => setPrevia(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div className="space-y-1">
            <Label htmlFor="busca">Buscar ponto</Label>
            <Input
              id="busca"
              placeholder="Prédio, andar ou espaço"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Dia da semana</Label>
            <Select value={dia} onValueChange={setDia}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os dias</SelectItem>
                {DIAS.map((d) => (
                  <SelectItem key={d.dia} value={String(d.dia)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {lista.length === 0 ? (
          <EmptyState
            title="Nenhum ponto encontrado"
            description="Importe a planilha ou ajuste os filtros de busca."
          />
        ) : (
          <div className="space-y-2">
            {lista.map((p) => {
              const dias = diasPorPonto.get(p.id) ?? [];
              return (
                <div
                  key={p.id}
                  className="grid gap-2 rounded-2xl border border-border/50 bg-card/40 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{pontoLabel(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      {dias.length ? dias.map((d) => DIA_LABEL[d]).join(" · ") : "Sem programação"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Bags</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-9 w-20"
                      defaultValue={p.bags_padrao}
                      disabled={!gestor}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== p.bags_padrao) {
                          editar.mutate({ id: p.id, patch: { bags_padrao: v } });
                        }
                      }}
                    />
                    <Input
                      type="number"
                      min={0}
                      className="h-9 w-20"
                      defaultValue={p.ordem}
                      disabled={!gestor}
                      title="Ordem da rota"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== p.ordem) {
                          editar.mutate({ id: p.id, patch: { ordem: v } });
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function Info2({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}
