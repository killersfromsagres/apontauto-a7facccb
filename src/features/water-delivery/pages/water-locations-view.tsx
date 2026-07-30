import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  GitMerge,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Search,
  ShieldAlert,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, SkeletonState } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { pontoSchema, primeiroErro } from "@/features/water-delivery/schemas/water";
import {
  criarPonto,
  atualizarPonto,
  listMerges,
  listPontos,
  listProgramacao,
  mesclarPontos,
  pontoLabel,
  PONTO_FREQUENCIAS,
  PONTO_PRIORIDADE_LABEL,
  type Ponto,
  type PontoPrioridade,
} from "@/features/water-delivery/queries/api";
import {
  detectarDuplicidades,
  normalizarCodigo,
} from "@/features/water-delivery/schemas/normalize";
import { DIA_LABEL } from "@/features/water-delivery/importer/reader";
import { cn } from "@/lib/utils";

type Form = Partial<Ponto>;

const VAZIO: Form = {
  codigo: "",
  predio: "",
  andar: "",
  espaco: "",
  descricao: "",
  bags_padrao: 1,
  bag_tipo: "",
  bag_capacidade_litros: null,
  estoque_minimo: null,
  frequencia: "Semanal",
  prioridade: "media",
  tempo_estimado_min: null,
  janela_inicio: null,
  janela_fim: null,
  ordem: 0,
  responsavel: "",
  contato_telefone: "",
  acesso_observacoes: "",
  requer_epi: false,
  epi_descricao: "",
  veiculo_recomendado: "",
  latitude: null,
  longitude: null,
  imagem_url: "",
  observacao: "",
  ativo: true,
};

const PRIORIDADE_COR: Record<PontoPrioridade, string> = {
  baixa: "border-slate-400/40 bg-slate-500/10 text-slate-200",
  media: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  alta: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  critica: "border-rose-400/40 bg-rose-500/10 text-rose-200",
};

function num(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

export function WaterLocationsView() {
  const qc = useQueryClient();
  const gestor = useCanAccessModule("abastecimento", "update").allowed;

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const prog = useQuery({ queryKey: ["agua", "programacao"], queryFn: listProgramacao });
  const merges = useQuery({ queryKey: ["agua", "merges"], queryFn: listMerges });

  const [busca, setBusca] = useState("");
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [confirmarDuplicidade, setConfirmarDuplicidade] = useState(false);
  const [merge, setMerge] = useState<{ origem: Ponto; destinoId: string; motivo: string } | null>(
    null,
  );

  const diasPorPonto = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const p of prog.data ?? []) {
      const arr = m.get(p.ponto_id) ?? [];
      arr.push(p.dia_semana);
      m.set(p.ponto_id, [...new Set(arr)].sort());
    }
    return m;
  }, [prog.data]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return (pontos.data ?? [])
      .filter((p) => (somenteAtivos ? p.ativo : true))
      .filter((p) =>
        !termo
          ? true
          : `${p.codigo} ${p.predio} ${p.andar} ${p.espaco} ${p.descricao ?? ""}`
              .toLocaleLowerCase("pt-BR")
              .includes(termo),
      );
  }, [pontos.data, busca, somenteAtivos]);

  // Item 24 — renderização incremental: em celulares, montar centenas de
  // cartões de uma vez trava a rolagem. Mostramos por página e o filtro
  // sempre reinicia a paginação.
  const PAGINA_PONTOS = 48;
  const [visiveis, setVisiveis] = useState(PAGINA_PONTOS);
  useEffect(() => {
    setVisiveis(PAGINA_PONTOS);
  }, [busca, somenteAtivos]);
  const listaVisivel = useMemo(() => lista.slice(0, visiveis), [lista, visiveis]);

  const duplicidades = useMemo(() => {
    if (!form?.predio) return [];
    return detectarDuplicidades(
      {
        id: form.id,
        predio: form.predio ?? "",
        andar: form.andar ?? "",
        espaco: form.espaco ?? "",
      },
      pontos.data ?? [],
    );
  }, [form, pontos.data]);

  const salvar = useMutation({
    mutationFn: async (dados: Form) => {
      const check = pontoSchema.partial({ bags_padrao: true, ordem: true }).safeParse(dados);
      if (!check.success) throw new Error(primeiroErro(check.error));
      if (dados.id) return atualizarPonto(dados.id, dados);
      await criarPonto(dados);
    },

    onSuccess: () => {
      toast.success("Cadastro salvo.");
      setForm(null);
      setConfirmarDuplicidade(false);
      void qc.invalidateQueries({ queryKey: ["agua"] });
    },
    onError: (e: Error) =>
      toast.error(
        /duplicate key|agua_pontos_local_uniq/i.test(e.message)
          ? "Já existe um ponto com este prédio + andar/setor + espaço."
          : e.message,
      ),
  });

  const mesclar = useMutation({
    mutationFn: async () => {
      if (!merge) return;
      const destino = (pontos.data ?? []).find((p) => p.id === merge.destinoId);
      if (!destino) throw new Error("Selecione o cadastro que permanecerá.");
      if (!merge.motivo.trim()) throw new Error("Descreva o motivo da mesclagem.");
      await mesclarPontos({ origem: merge.origem, destino, motivo: merge.motivo });
    },
    onSuccess: () => {
      toast.success("Cadastros mesclados com auditoria registrada.");
      setMerge(null);
      void qc.invalidateQueries({ queryKey: ["agua"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bloqueiaSalvar =
    duplicidades.some((d) => d.tipo === "exata") ||
    (duplicidades.length > 0 && !confirmarDuplicidade);

  function campo(patch: Form) {
    setForm((f) => ({ ...(f ?? VAZIO), ...patch }));
    setConfirmarDuplicidade(false);
  }

  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, prédio, andar ou espaço"
            className="min-h-[44px] pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="ativos" checked={somenteAtivos} onCheckedChange={setSomenteAtivos} />
          <Label htmlFor="ativos" className="text-xs">
            Somente ativos
          </Label>
        </div>
        {gestor && (
          <Button
            className="min-h-[44px]"
            onClick={() => {
              setForm({ ...VAZIO });
              setConfirmarDuplicidade(false);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo ponto
          </Button>
        )}
      </GlassCard>

      {pontos.isLoading ? (
        <SkeletonState rows={4} />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-5" aria-hidden />}
          title="Nenhum ponto cadastrado"
          description="Cadastre manualmente ou importe a planilha na aba Programação."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {listaVisivel.map((p) => {
            const dias = diasPorPonto.get(p.id) ?? [];
            return (
              <GlassCard key={p.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{pontoLabel(p)}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.codigo}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-[10px]", PRIORIDADE_COR[p.prioridade ?? "media"])}
                  >
                    {PONTO_PRIORIDADE_LABEL[p.prioridade ?? "media"]}
                  </Badge>
                </div>

                {p.descricao && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{p.descricao}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>
                    Bags padrão: <strong className="text-foreground">{p.bags_padrao}</strong>
                    {p.bag_tipo ? ` · ${p.bag_tipo}` : ""}
                    {p.bag_capacidade_litros ? ` · ${p.bag_capacidade_litros} L` : ""}
                  </span>
                  <span>
                    Estoque mín.:{" "}
                    <strong className="text-foreground">{p.estoque_minimo ?? "—"}</strong>
                  </span>
                  <span>Frequência: {p.frequencia ?? "—"}</span>
                  <span>
                    Janela:{" "}
                    {p.janela_inicio || p.janela_fim
                      ? `${p.janela_inicio?.slice(0, 5) ?? "--"}–${p.janela_fim?.slice(0, 5) ?? "--"}`
                      : "—"}
                  </span>
                  <span>Ordem: {p.ordem}</span>
                  <span>Tempo: {p.tempo_estimado_min ? `${p.tempo_estimado_min} min` : "—"}</span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {dias.length ? (
                    dias.map((d) => (
                      <Badge key={d} variant="secondary" className="text-[10px]">
                        {DIA_LABEL[d as keyof typeof DIA_LABEL] ?? d}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Sem dias programados</span>
                  )}
                  {p.requer_epi && (
                    <Badge
                      variant="outline"
                      className="border-amber-400/40 bg-amber-500/10 text-[10px] text-amber-200"
                    >
                      <ShieldAlert className="mr-1 h-3 w-3" />
                      EPI
                    </Badge>
                  )}
                  {!p.ativo && (
                    <Badge variant="outline" className="text-[10px]">
                      Inativo
                    </Badge>
                  )}
                </div>

                {p.qr_code && (
                  <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                    <QrCode className="h-3 w-3" />
                    {p.qr_code}
                  </p>
                )}

                {gestor && (
                  <div className="flex gap-2 border-t border-border/50 pt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="min-h-[40px] flex-1"
                      onClick={() => {
                        setForm({ ...p });
                        setConfirmarDuplicidade(false);
                      }}
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[40px]"
                      onClick={() => setMerge({ origem: p, destinoId: "", motivo: "" })}
                    >
                      <GitMerge className="mr-2 h-3.5 w-3.5" />
                      Mesclar
                    </Button>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {listaVisivel.length < lista.length && (
        <div className="flex flex-col items-center gap-2">
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Mostrando {listaVisivel.length} de {lista.length} pontos
          </p>
          <Button
            variant="secondary"
            className="min-h-[44px]"
            onClick={() => setVisiveis((v) => v + PAGINA_PONTOS)}
          >
            Carregar mais pontos
          </Button>
        </div>
      )}

      {(merges.data?.length ?? 0) > 0 && (
        <GlassCard className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Mesclagens registradas</h2>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {merges.data!.slice(0, 10).map((m) => (
              <li key={m.id} className="border-b border-border/40 pb-1 last:border-0">
                {new Date(m.criado_em).toLocaleString("pt-BR")} ·{" "}
                {String((m.origem_snapshot as { codigo?: string }).codigo ?? m.origem_id)} →{" "}
                {String((m.destino_snapshot as { codigo?: string }).codigo ?? m.destino_id)}
                {m.motivo ? ` · ${m.motivo}` : ""}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {/* Formulário */}
      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar ponto" : "Novo ponto de entrega"}</DialogTitle>
            <DialogDescription>
              O texto é normalizado ao salvar (espaços, hífens e caixa) preservando acentos.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Código interno">
                <Input
                  value={form.codigo ?? ""}
                  onChange={(e) => campo({ codigo: e.target.value })}
                  onBlur={(e) => campo({ codigo: normalizarCodigo(e.target.value) })}
                  placeholder="Gerado automaticamente se vazio"
                />
              </Campo>
              <Campo label="Prédio *">
                <Input
                  value={form.predio ?? ""}
                  onChange={(e) => campo({ predio: e.target.value })}
                />
              </Campo>
              <Campo label="Andar / pavimento / setor">
                <Input
                  value={form.andar ?? ""}
                  onChange={(e) => campo({ andar: e.target.value })}
                />
              </Campo>
              <Campo label="Espaço / ambiente">
                <Input
                  value={form.espaco ?? ""}
                  onChange={(e) => campo({ espaco: e.target.value })}
                />
              </Campo>
              <Campo label="Descrição curta" full>
                <Input
                  value={form.descricao ?? ""}
                  onChange={(e) => campo({ descricao: e.target.value })}
                />
              </Campo>

              <Campo label="Frequência">
                <Select
                  value={form.frequencia ?? ""}
                  onValueChange={(v) => campo({ frequencia: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {PONTO_FREQUENCIAS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Prioridade">
                <Select
                  value={form.prioridade ?? "media"}
                  onValueChange={(v) => campo({ prioridade: v as PontoPrioridade })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PONTO_PRIORIDADE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              <Campo label="Quantidade padrão de bags">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.bags_padrao ?? 0}
                  onChange={(e) => campo({ bags_padrao: Number(e.target.value) || 0 })}
                />
              </Campo>
              <Campo label="Tipo da bag">
                <Input
                  value={form.bag_tipo ?? ""}
                  onChange={(e) => campo({ bag_tipo: e.target.value })}
                  placeholder="Ex.: Bag 20 L retornável"
                />
              </Campo>
              <Campo label="Capacidade da bag (L)">
                <Input
                  inputMode="decimal"
                  value={form.bag_capacidade_litros ?? ""}
                  onChange={(e) => campo({ bag_capacidade_litros: num(e.target.value) })}
                  placeholder="Sem valor presumido"
                />
              </Campo>
              <Campo label="Estoque mínimo no ponto">
                <Input
                  inputMode="numeric"
                  value={form.estoque_minimo ?? ""}
                  onChange={(e) => campo({ estoque_minimo: num(e.target.value) })}
                />
              </Campo>

              <Campo label="Janela inicial">
                <Input
                  type="time"
                  value={form.janela_inicio?.slice(0, 5) ?? ""}
                  onChange={(e) => campo({ janela_inicio: e.target.value || null })}
                />
              </Campo>
              <Campo label="Janela final">
                <Input
                  type="time"
                  value={form.janela_fim?.slice(0, 5) ?? ""}
                  onChange={(e) => campo({ janela_fim: e.target.value || null })}
                />
              </Campo>
              <Campo label="Ordem padrão da rota">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.ordem ?? 0}
                  onChange={(e) => campo({ ordem: Number(e.target.value) || 0 })}
                />
              </Campo>
              <Campo label="Tempo estimado (min)">
                <Input
                  inputMode="numeric"
                  value={form.tempo_estimado_min ?? ""}
                  onChange={(e) => campo({ tempo_estimado_min: num(e.target.value) })}
                />
              </Campo>

              <Campo label="Responsável local (opcional)">
                <Input
                  value={form.responsavel ?? ""}
                  onChange={(e) => campo({ responsavel: e.target.value })}
                />
              </Campo>
              <Campo label="Telefone ou ramal (opcional)">
                <Input
                  value={form.contato_telefone ?? ""}
                  onChange={(e) => campo({ contato_telefone: e.target.value })}
                />
              </Campo>

              <Campo label="Observações de acesso" full>
                <Textarea
                  rows={2}
                  value={form.acesso_observacoes ?? ""}
                  onChange={(e) => campo({ acesso_observacoes: e.target.value })}
                  placeholder="Portaria, crachá, elevador de serviço, horários restritos…"
                />
              </Campo>

              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  id="epi"
                  checked={Boolean(form.requer_epi)}
                  onCheckedChange={(v) => campo({ requer_epi: v })}
                />
                <Label htmlFor="epi" className="text-xs">
                  Necessita EPI
                </Label>
                {form.requer_epi && (
                  <Input
                    className="flex-1"
                    value={form.epi_descricao ?? ""}
                    onChange={(e) => campo({ epi_descricao: e.target.value })}
                    placeholder="Quais EPIs"
                  />
                )}
              </div>

              <Campo label="Veículo recomendado (opcional)">
                <Input
                  value={form.veiculo_recomendado ?? ""}
                  onChange={(e) => campo({ veiculo_recomendado: e.target.value })}
                />
              </Campo>
              <Campo label="Imagem de referência (URL, opcional)">
                <Input
                  value={form.imagem_url ?? ""}
                  onChange={(e) => campo({ imagem_url: e.target.value })}
                />
              </Campo>
              <Campo label="Latitude (opcional)">
                <Input
                  inputMode="decimal"
                  value={form.latitude ?? ""}
                  onChange={(e) => campo({ latitude: num(e.target.value) })}
                />
              </Campo>
              <Campo label="Longitude (opcional)">
                <Input
                  inputMode="decimal"
                  value={form.longitude ?? ""}
                  onChange={(e) => campo({ longitude: num(e.target.value) })}
                />
              </Campo>

              <Campo label="Observações gerais" full>
                <Textarea
                  rows={2}
                  value={form.observacao ?? ""}
                  onChange={(e) => campo({ observacao: e.target.value })}
                />
              </Campo>

              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  id="ativo"
                  checked={form.ativo !== false}
                  onCheckedChange={(v) => campo({ ativo: v })}
                />
                <Label htmlFor="ativo" className="text-xs">
                  Ponto ativo
                </Label>
              </div>

              {duplicidades.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100 sm:col-span-2">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Possível duplicidade detectada
                  </p>
                  <ul className="space-y-1">
                    {duplicidades.map((d) => (
                      <li key={d.registro.id}>
                        {pontoLabel(d.registro as Ponto)} — {d.tipo} ({Math.round(d.score * 100)}%)
                      </li>
                    ))}
                  </ul>
                  {duplicidades.some((d) => d.tipo === "exata") ? (
                    <p>
                      Já existe um cadastro com o mesmo prédio + andar/setor + espaço. Edite o
                      existente ou use a mesclagem.
                    </p>
                  ) : (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={confirmarDuplicidade}
                        onChange={(e) => setConfirmarDuplicidade(e.target.checked)}
                      />
                      Confirmo que este é um local diferente
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" className="min-h-[44px]" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              className="min-h-[44px]"
              disabled={!form?.predio?.trim() || bloqueiaSalvar || salvar.isPending}
              onClick={() => form && salvar.mutate(form)}
            >
              <Check className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mesclagem */}
      <Dialog open={Boolean(merge)} onOpenChange={(o) => !o && setMerge(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mesclar cadastros</DialogTitle>
            <DialogDescription>
              As visitas e solicitações de <strong>{merge && pontoLabel(merge.origem)}</strong>{" "}
              passam para o cadastro escolhido. A origem é inativada e a operação fica registrada na
              auditoria.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Campo label="Cadastro que permanece" full>
              <Select
                value={merge?.destinoId ?? ""}
                onValueChange={(v) => setMerge((m) => (m ? { ...m, destinoId: v } : m))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o destino" />
                </SelectTrigger>
                <SelectContent>
                  {(pontos.data ?? [])
                    .filter((p) => p.id !== merge?.origem.id && p.ativo)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {pontoLabel(p)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Motivo da mesclagem" full>
              <Textarea
                rows={3}
                value={merge?.motivo ?? ""}
                onChange={(e) => setMerge((m) => (m ? { ...m, motivo: e.target.value } : m))}
                placeholder="Ex.: mesmo espaço cadastrado duas vezes com grafias diferentes."
              />
            </Campo>
          </div>

          <DialogFooter>
            <Button variant="ghost" className="min-h-[44px]" onClick={() => setMerge(null)}>
              Cancelar
            </Button>
            <Button
              className="min-h-[44px]"
              disabled={!merge?.destinoId || !merge?.motivo.trim() || mesclar.isPending}
              onClick={() => mesclar.mutate()}
            >
              <GitMerge className="mr-2 h-4 w-4" />
              Confirmar mesclagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("space-y-1", full && "sm:col-span-2")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
