/**
 * Item 19 — Assistente de importação da planilha de água.
 *
 * Etapas: arquivo → abas → colunas → normalização → divergências → pontos →
 * dias → quantidade padrão → ordem → confirmação → gravação → relatório.
 * Nada é gravado antes da confirmação e a gravação é feita em um único lote.
 */

import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { aplicarImportacao, loteComHash, type AjustePonto } from "@/lib/agua/api";
import {
  DIAS,
  DIA_LABEL,
  inspecionarPlanilha,
  lerPlanilhaAgua,
  sha256Hex,
  type InspecaoPlanilha,
  type LeituraAgua,
  type MapeamentoColunas,
} from "@/lib/agua/reader";

const PASSOS = [
  "Arquivo",
  "Abas",
  "Colunas",
  "Normalização",
  "Divergências",
  "Pontos",
  "Dias",
  "Quantidade",
  "Ordem",
  "Confirmar",
  "Relatório",
] as const;

type Ajustes = Record<string, AjustePonto>;

export function ImportadorWizard({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [passo, setPasso] = useState(0);
  const [lendo, setLendo] = useState(false);

  const [arquivo, setArquivo] = useState<{ nome: string; hash: string; buffer: ArrayBuffer } | null>(
    null,
  );
  const [inspecao, setInspecao] = useState<InspecaoPlanilha | null>(null);
  const [abas, setAbas] = useState<Partial<Record<number, string>>>({});
  const [mapeamento, setMapeamento] = useState<MapeamentoColunas>({});
  const [leitura, setLeitura] = useState<LeituraAgua | null>(null);
  const [duplicado, setDuplicado] = useState(false);
  const [ajustes, setAjustes] = useState<Ajustes>({});
  const [bagsPadrao, setBagsPadrao] = useState(1);
  const [loteId, setLoteId] = useState<string | null>(null);

  const revisao = useMemo(
    () => (leitura?.pontos ?? []).filter((p) => p.revisao),
    [leitura],
  );

  function reset() {
    setPasso(0);
    setArquivo(null);
    setInspecao(null);
    setAbas({});
    setMapeamento({});
    setLeitura(null);
    setDuplicado(false);
    setAjustes({});
    setBagsPadrao(1);
    setLoteId(null);
  }

  async function selecionarArquivo(file: File) {
    setLendo(true);
    try {
      const buffer = await file.arrayBuffer();
      const hash = await sha256Hex(buffer.slice(0));
      const insp = inspecionarPlanilha(buffer);
      setArquivo({ nome: file.name, hash, buffer });
      setInspecao(insp);
      setAbas(insp.abaPorDia);
      setMapeamento(insp.mapeamentoSugerido);
      setDuplicado(Boolean(await loteComHash(hash)));
      setLeitura(null);
      setAjustes({});
      setPasso(1);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Não foi possível ler a planilha.");
    } finally {
      setLendo(false);
    }
  }

  function normalizar() {
    if (!arquivo) return;
    try {
      const nova = lerPlanilhaAgua(arquivo.buffer, { abas, mapeamento });
      setLeitura(nova);
      setAjustes(
        Object.fromEntries(
          nova.pontos.map((p, i) => [
            p.codigo,
            { dias: [...p.dias], bags: bagsPadrao, ordem: i + 1, incluir: true } as AjustePonto,
          ]),
        ),
      );
      setPasso(4);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao normalizar os dados.");
    }
  }

  function setAjuste(codigo: string, patch: Partial<AjustePonto>) {
    setAjustes((prev) => ({ ...prev, [codigo]: { ...prev[codigo], ...patch } }));
  }

  const gravar = useMutation({
    mutationFn: async () => {
      if (!leitura || !arquivo) throw new Error("Nenhuma leitura carregada.");
      return aplicarImportacao({
        leitura,
        arquivoNome: arquivo.nome,
        hash: arquivo.hash,
        ajustes,
        bagsPadrao,
        relatorio: {
          gerado_em: new Date().toISOString(),
          abas,
          mapeamento,
          bags_padrao: bagsPadrao,
          total_pontos: leitura.pontos.length,
          pontos_importados: leitura.pontos.filter((p) => ajustes[p.codigo]?.incluir !== false)
            .length,
          pontos_em_revisao: revisao.map((p) => p.codigo),
        },
      });
    },
    onSuccess: ({ loteId: id }) => {
      setLoteId(id);
      setPasso(10);
      toast.success("Programação importada.");
      onDone();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha na importação."),
  });

  function baixarRelatorio() {
    if (!leitura || !arquivo) return;
    const linhas = [
      ["Prédio", "Andar/Setor", "Espaço", ...DIAS.map((d) => d.label), "Bags", "Ordem", "Revisar"],
      ...leitura.pontos
        .filter((p) => ajustes[p.codigo]?.incluir !== false)
        .map((p) => {
          const a = ajustes[p.codigo] ?? {};
          const dias = a.dias ?? p.dias;
          return [
            p.predio,
            p.andar,
            p.espaco,
            ...DIAS.map((d) => (dias.includes(d.dia) ? "X" : "")),
            String(a.bags ?? bagsPadrao),
            String(a.ordem ?? ""),
            p.revisao ? p.revisao.motivo : "",
          ];
        }),
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `importacao-agua-${arquivo.nome.replace(/\.[^.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const podeAvancar = (() => {
    switch (passo) {
      case 0:
        return Boolean(arquivo);
      case 1:
        return Object.values(abas).some(Boolean);
      case 2:
        return Boolean(mapeamento.predio && mapeamento.espaco);
      case 4:
        return !(leitura?.divergencias ?? []).some((d) => d.severidade === "erro");
      default:
        return true;
    }
  })();

  return (
    <GlassCard className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Importar planilha de programação</h2>
      </div>

      {/* Trilha de etapas */}
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {PASSOS.map((nome, i) => (
          <button
            key={nome}
            type="button"
            disabled={i > passo}
            onClick={() => setPasso(i)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-[11px] transition",
              i === passo
                ? "border-primary bg-primary/20 text-foreground"
                : i < passo
                  ? "border-border/60 bg-card/50 text-muted-foreground"
                  : "border-border/40 text-muted-foreground/50",
            )}
          >
            {i + 1}. {nome}
          </button>
        ))}
      </div>

      {/* 1 — arquivo */}
      {passo === 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            As abas diárias são a rota real; a aba consolidada é usada apenas para comparar. Nada é
            gravado antes da confirmação.
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
            {lendo ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Selecionar arquivo
          </Button>
          {arquivo && <p className="text-sm font-medium">{arquivo.nome}</p>}
          {duplicado && (
            <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              Este arquivo já foi importado antes (mesmo conteúdo).
            </p>
          )}
        </div>
      )}

      {/* 2 — abas */}
      {passo === 1 && inspecao && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {inspecao.abas.length} abas reconhecidas. Confirme qual aba corresponde a cada dia.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DIAS.map((d) => (
              <div key={d.dia} className="space-y-1">
                <Label>{d.label}</Label>
                <Select
                  value={abas[d.dia] ?? "__nenhuma"}
                  onValueChange={(v) =>
                    setAbas((prev) => ({ ...prev, [d.dia]: v === "__nenhuma" ? undefined : v }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhuma">Sem aba</SelectItem>
                    {inspecao.abas.map((a) => (
                      <SelectItem key={a.nome} value={a.nome}>
                        {a.nome} ({a.linhas} linhas)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3 — colunas */}
      {passo === 2 && inspecao && (
        <div className="grid gap-2 sm:grid-cols-3">
          {(["predio", "andar", "espaco"] as const).map((campo) => (
            <div key={campo} className="space-y-1">
              <Label>
                {campo === "predio" ? "Prédio" : campo === "andar" ? "Andar/Setor" : "Espaço"}
              </Label>
              <Select
                value={mapeamento[campo] ?? "__nenhuma"}
                onValueChange={(v) =>
                  setMapeamento((prev) => ({ ...prev, [campo]: v === "__nenhuma" ? undefined : v }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhuma">Não usar</SelectItem>
                  {inspecao.cabecalhos.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {/* 4 — normalização */}
      {passo === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A normalização unifica grafias (D55 - D85 → D55-D85), corrige acentos e erros conhecidos
            e gera o código canônico de cada ponto.
          </p>
          <Button onClick={normalizar}>Normalizar dados</Button>
        </div>
      )}

      {/* 5 — divergências */}
      {passo === 4 && leitura && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Metrica label="Linhas lidas" valor={leitura.totalLinhas} />
            <Metrica label="Pontos" valor={leitura.pontos.length} />
            <Metrica label="Visitas/semana" valor={leitura.totalVisitas} />
            <Metrica label="Divergências" valor={leitura.divergencias.length} />
          </div>
          <div className="max-h-64 space-y-1 overflow-auto">
            {leitura.divergencias.map((d, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-border/50 bg-card/40 p-2 text-xs"
              >
                {d.severidade === "info" ? (
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
                ) : (
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      d.severidade === "erro" ? "text-rose-300" : "text-amber-300",
                    )}
                  />
                )}
                <span>{d.mensagem}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6 — pontos */}
      {passo === 5 && leitura && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Desmarque os pontos que não devem entrar na programação-base.
          </p>
          <div className="max-h-80 space-y-1 overflow-auto">
            {leitura.pontos.map((p) => (
              <label
                key={p.codigo}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 p-2 text-xs"
              >
                <Checkbox
                  checked={ajustes[p.codigo]?.incluir !== false}
                  onCheckedChange={(v) => setAjuste(p.codigo, { incluir: v === true })}
                />
                <span className="flex-1">
                  <strong>{p.predio}</strong> · {p.andar || "—"} · {p.espaco}
                </span>
                {p.revisao && (
                  <Badge variant="outline" className="border-amber-400/50 text-amber-200">
                    revisar
                  </Badge>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 7 — dias */}
      {passo === 6 && leitura && (
        <div className="space-y-3">
          {revisao.length > 0 && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
              <p className="font-semibold">
                {revisao.length} ponto(s) precisam da sua confirmação (item 19.2)
              </p>
              <p className="mt-1">
                Os dias vindos das abas diárias foram mantidos. Nenhum dia foi removido
                automaticamente — ajuste abaixo apenas se quiser.
              </p>
            </div>
          )}
          <div className="max-h-96 space-y-1 overflow-auto">
            {leitura.pontos
              .filter((p) => ajustes[p.codigo]?.incluir !== false)
              .map((p) => {
                const dias = ajustes[p.codigo]?.dias ?? p.dias;
                return (
                  <div
                    key={p.codigo}
                    className={cn(
                      "rounded-lg border p-2 text-xs",
                      p.revisao
                        ? "border-amber-400/50 bg-amber-500/10"
                        : "border-border/50 bg-card/40",
                    )}
                  >
                    <p className="font-medium">
                      {p.predio} · {p.andar || "—"} · {p.espaco}
                    </p>
                    {p.revisao && <p className="mt-0.5 text-amber-200">{p.revisao.motivo}</p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {DIAS.map((d) => {
                        const ativo = dias.includes(d.dia);
                        return (
                          <button
                            key={d.dia}
                            type="button"
                            onClick={() =>
                              setAjuste(p.codigo, {
                                dias: ativo
                                  ? dias.filter((x) => x !== d.dia)
                                  : [...dias, d.dia].sort((a, b) => a - b),
                              })
                            }
                            className={cn(
                              "min-h-9 rounded-full border px-3 text-[11px]",
                              ativo
                                ? "border-primary bg-primary/20"
                                : "border-border/50 text-muted-foreground",
                            )}
                          >
                            {DIA_LABEL[d.dia].slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 8 — quantidade padrão */}
      {passo === 7 && (
        <div className="space-y-2">
          <Label htmlFor="bags-padrao">Quantidade padrão de bags por ponto</Label>
          <Input
            id="bags-padrao"
            type="number"
            min={1}
            className="h-11 max-w-[160px]"
            value={bagsPadrao}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              setBagsPadrao(v);
              setAjustes((prev) =>
                Object.fromEntries(Object.entries(prev).map(([k, a]) => [k, { ...a, bags: v }])),
              );
            }}
          />
          <p className="text-xs text-muted-foreground">
            O valor pode ser alterado ponto a ponto depois, na aba Programação.
          </p>
        </div>
      )}

      {/* 9 — ordem */}
      {passo === 8 && leitura && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Ordem inicial de atendimento (menor primeiro). Pode ser reordenada por arrastar depois.
          </p>
          <div className="max-h-80 space-y-1 overflow-auto">
            {leitura.pontos
              .filter((p) => ajustes[p.codigo]?.incluir !== false)
              .map((p, i) => (
                <div
                  key={p.codigo}
                  className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 p-2 text-xs"
                >
                  <Input
                    type="number"
                    min={1}
                    className="h-9 w-20"
                    value={ajustes[p.codigo]?.ordem ?? i + 1}
                    onChange={(e) =>
                      setAjuste(p.codigo, { ordem: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                  <span>
                    {p.predio} · {p.andar || "—"} · {p.espaco}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 10 — confirmar */}
      {passo === 9 && leitura && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Metrica
              label="Pontos a gravar"
              valor={leitura.pontos.filter((p) => ajustes[p.codigo]?.incluir !== false).length}
            />
            <Metrica
              label="Visitas/semana"
              valor={leitura.pontos
                .filter((p) => ajustes[p.codigo]?.incluir !== false)
                .reduce((acc, p) => acc + (ajustes[p.codigo]?.dias ?? p.dias).length, 0)}
            />
            <Metrica label="Bags padrão" valor={bagsPadrao} />
            <Metrica label="Em revisão" valor={revisao.length} />
          </div>
          {duplicado && (
            <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              Arquivo já importado anteriormente. Confirme apenas se quiser reaplicar.
            </p>
          )}
          <Button disabled={gravar.isPending} onClick={() => gravar.mutate()}>
            {gravar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Gravar programação
          </Button>
        </div>
      )}

      {/* 11 — relatório */}
      {passo === 10 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Importação concluída {loteId ? `(lote ${loteId.slice(0, 8)})` : ""}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={baixarRelatorio}>
              <Download className="mr-2 h-4 w-4" />
              Baixar relatório (CSV)
            </Button>
            <Button variant="ghost" onClick={reset}>
              Nova importação
            </Button>
          </div>
        </div>
      )}

      {/* Navegação */}
      {passo < 10 && (
        <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
          <Button
            variant="ghost"
            disabled={passo === 0}
            onClick={() => setPasso((p) => Math.max(0, p - 1))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          {passo !== 3 && passo !== 9 && (
            <Button
              disabled={!podeAvancar}
              onClick={() => setPasso((p) => Math.min(PASSOS.length - 1, p + 1))}
            >
              Avançar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function Metrica({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold">{valor}</p>
    </div>
  );
}
