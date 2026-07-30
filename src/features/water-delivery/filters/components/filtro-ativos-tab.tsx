import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Camera, Loader2, Plus, QrCode, Wrench } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
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
import { EmptyState, KpiCard } from "@/components/pcm";
import { cn } from "@/lib/utils";
import { enviarEvidencia } from "@/features/water-delivery/offline/fotos";
import { listPontos, pontoLabel, type Ponto } from "@/features/water-delivery/queries/api";
import {
  CONDICOES,
  TIPOS_EQUIPAMENTO,
  TIPOS_FILTRO,
  ativosParaPreventiva,
  diasParaTroca,
  listFiltroAtivos,
  salvarFiltroAtivo,
  type FiltroAtivo,
  type FiltroCondicao,
} from "@/features/water-delivery/filters/filtros";

interface Props {
  podeEscrever: boolean;
}

const VAZIO = {
  ponto_id: "",
  tipo_filtro: TIPOS_FILTRO[0] as string,
  tipo_equipamento: TIPOS_EQUIPAMENTO[0] as string,
  codigo: "",
  predio: "",
  andar_setor: "",
  espaco: "",
  fabricante: "",
  marca: "",
  modelo: "",
  modelo_elemento: "",
  patrimonio: "",
  numero_serie: "",
  local_instalacao: "",
  instalado_em: "",
  ultima_troca: "",
  periodicidade_dias: 180,
  condicao_atual: "boa" as FiltroCondicao,
  situacao: "ativo" as FiltroAtivo["situacao"],
  responsavel: "",
  foto_url: "",
  observacao: "",
};

/** Diálogo do QR Code que abre a solicitação já vinculada ao filtro. */
function QrFiltro({ token, rotulo }: { token: string; rotulo: string }) {
  const [open, setOpen] = useState(false);
  const [png, setPng] = useState<string | null>(null);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/abastecimento/agua/filtros?qr=${token}`
      : `/abastecimento/agua/filtros?qr=${token}`;

  async function abrir() {
    setOpen(true);
    try {
      const { default: QRCode } = await import("qrcode");
      setPng(await QRCode.toDataURL(url, { width: 512, margin: 1, errorCorrectionLevel: "M" }));
    } catch {
      setPng(null);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => void abrir()}>
        <QrCode className="mr-1.5 h-3.5 w-3.5" /> QR
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">QR do filtro</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {png ? (
              <img
                src={png}
                alt="QR Code do filtro"
                className="h-56 w-56 rounded-xl bg-white p-2"
              />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded-xl bg-muted" />
            )}
            <p className="text-center text-xs text-muted-foreground">
              {rotulo} — aponte a câmera para abrir a solicitação já vinculada a este filtro.
            </p>
            {png && (
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = png;
                  a.download = `qr-filtro-${token.slice(0, 8)}.png`;
                  a.click();
                }}
              >
                Baixar PNG
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FiltroAtivosTab({ podeEscrever }: Props) {
  const qc = useQueryClient();
  const fotoRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ ...VAZIO, id: "" });
  const [busca, setBusca] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const ativos = useQuery({ queryKey: ["agua", "filtro-ativos"], queryFn: listFiltroAtivos });

  const porPonto = useMemo(
    () => new Map((pontos.data ?? []).map((p: Ponto) => [p.id, p])),
    [pontos.data],
  );

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = ativos.data ?? [];
    if (!termo) return base;
    return base.filter((a) => {
      const ponto = porPonto.get(a.ponto_id);
      return [
        a.codigo,
        a.predio,
        a.espaco,
        a.fabricante,
        a.marca,
        a.modelo,
        a.modelo_elemento,
        a.patrimonio,
        a.numero_serie,
        ponto ? pontoLabel(ponto) : "",
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [ativos.data, busca, porPonto]);

  const vencendo = useMemo(() => ativosParaPreventiva(ativos.data ?? [], 30), [ativos.data]);
  const vencidos = vencendo.filter((a) => a.dias <= 0).length;

  const salvar = useMutation({
    mutationFn: () =>
      salvarFiltroAtivo({
        ...form,
        id: form.id || undefined,
        periodicidade_dias: Number(form.periodicidade_dias),
      } as Partial<FiltroAtivo> & { id?: string }),
    onSuccess: () => {
      toast.success("Ponto de filtro salvo.");
      setAberto(false);
      setForm({ ...VAZIO, id: "" });
      void qc.invalidateQueries({ queryKey: ["agua", "filtro-ativos"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao salvar."),
  });

  async function anexarFoto(file: File) {
    setEnviandoFoto(true);
    try {
      const { url } = await enviarEvidencia(file, { tipo: "filtro" }, { nome: "filtro-ativo" });
      if (!url) throw new Error("Sem rede: a foto ficou na fila e será enviada depois.");
      setForm((f) => ({ ...f, foto_url: url }));
      toast.success("Foto de referência anexada.");
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao enviar a foto.");
    } finally {
      setEnviandoFoto(false);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  }

  function editar(a: FiltroAtivo) {
    setForm({
      id: a.id,
      ponto_id: a.ponto_id,
      tipo_filtro: a.tipo_filtro,
      tipo_equipamento: a.tipo_equipamento ?? TIPOS_EQUIPAMENTO[0],
      codigo: a.codigo ?? "",
      predio: a.predio ?? "",
      andar_setor: a.andar_setor ?? "",
      espaco: a.espaco ?? "",
      fabricante: a.fabricante ?? "",
      marca: a.marca ?? "",
      modelo: a.modelo ?? "",
      modelo_elemento: a.modelo_elemento ?? "",
      patrimonio: a.patrimonio ?? "",
      numero_serie: a.numero_serie ?? "",
      local_instalacao: a.local_instalacao ?? "",
      instalado_em: a.instalado_em ?? "",
      ultima_troca: a.ultima_troca ?? "",
      periodicidade_dias: a.periodicidade_dias,
      condicao_atual: a.condicao_atual ?? "boa",
      situacao: a.situacao,
      responsavel: a.responsavel ?? "",
      foto_url: a.foto_url ?? "",
      observacao: a.observacao ?? "",
    });
    setAberto(true);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Filtros cadastrados"
          value={(ativos.data ?? []).length}
          icon={<Wrench className="h-4 w-4" />}
        />
        <KpiCard
          label="Troca em 30 dias"
          value={vencendo.length}
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <KpiCard
          label="Trocas vencidas"
          value={vencidos}
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <KpiCard
          label="Periodicidade média"
          value={
            (ativos.data ?? []).length
              ? `${Math.round(
                  (ativos.data ?? []).reduce((s, a) => s + a.periodicidade_dias, 0) /
                    (ativos.data ?? []).length,
                )}d`
              : "—"
          }
          icon={<CalendarClock className="h-4 w-4" />}
        />
      </div>

      <GlassCard className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Input
          placeholder="Buscar por prédio, código, patrimônio, modelo ou série…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="sm:max-w-sm"
        />
        {podeEscrever && (
          <Button
            className="min-h-[44px] sm:ml-auto"
            onClick={() => {
              setForm({ ...VAZIO, id: "" });
              setAberto(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo ponto de filtro
          </Button>
        )}
      </GlassCard>

      {ativos.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          title="Nenhum filtro cadastrado"
          description="Cadastre purificadores e bebedouros para acompanhar a troca preventiva."
        />
      ) : (
        <div className="space-y-2">
          {lista.map((a) => {
            const dias = diasParaTroca(a);
            const ponto = porPonto.get(a.ponto_id);
            const tom =
              dias === null
                ? "border-border/60 text-muted-foreground"
                : dias <= 0
                  ? "border-rose-400/40 text-rose-300"
                  : dias <= 30
                    ? "border-amber-400/40 text-amber-300"
                    : "border-emerald-400/40 text-emerald-300";
            return (
              <div
                key={a.id}
                className="space-y-2 rounded-2xl border border-border/50 bg-card/40 p-3"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {a.predio || (ponto ? pontoLabel(ponto) : "Ponto removido")}
                      {a.codigo ? ` · ${a.codigo}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[a.andar_setor, a.espaco, a.tipo_equipamento].filter(Boolean).join(" · ")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[a.fabricante ?? a.marca, a.modelo, a.modelo_elemento, a.tipo_filtro]
                        .filter(Boolean)
                        .join(" · ")}
                      {a.patrimonio ? ` · pat. ${a.patrimonio}` : ""}
                      {a.numero_serie ? ` · série ${a.numero_serie}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ciclo de {a.periodicidade_dias} dias · condição {a.condicao_atual}
                      {a.ultima_troca
                        ? ` · última troca ${a.ultima_troca.split("-").reverse().join("/")}`
                        : ""}
                      {a.responsavel ? ` · resp. ${a.responsavel}` : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px]", tom)}>
                    {dias === null
                      ? "sem data"
                      : dias <= 0
                        ? `vencida há ${Math.abs(dias)}d`
                        : `em ${dias}d`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <QrFiltro
                    token={a.qr_token}
                    rotulo={[a.predio, a.espaco, a.codigo].filter(Boolean).join(" · ") || "Filtro"}
                  />
                  {podeEscrever && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[40px]"
                      onClick={() => editar(a)}
                    >
                      Editar ficha
                    </Button>
                  )}
                  {a.foto_url && (
                    <a
                      href={a.foto_url}
                      target="_blank"
                      rel="noreferrer"
                      className="self-center text-xs text-primary underline"
                    >
                      Foto de referência
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar ponto de filtro" : "Novo ponto de filtro"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Ponto de entrega</Label>
              <Select
                value={form.ponto_id}
                onValueChange={(v) => setForm((f) => ({ ...f, ponto_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ponto" />
                </SelectTrigger>
                <SelectContent>
                  {(pontos.data ?? []).map((p: Ponto) => (
                    <SelectItem key={p.id} value={p.id}>
                      {pontoLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Tipo de equipamento</Label>
              <Select
                value={form.tipo_equipamento}
                onValueChange={(v) => setForm((f) => ({ ...f, tipo_equipamento: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_EQUIPAMENTO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo de filtro</Label>
              <Select
                value={form.tipo_filtro}
                onValueChange={(v) => setForm((f) => ({ ...f, tipo_filtro: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_FILTRO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(
              [
                ["codigo", "Código do ativo"],
                ["predio", "Prédio"],
                ["andar_setor", "Andar / setor"],
                ["espaco", "Espaço"],
                ["fabricante", "Fabricante"],
                ["modelo", "Modelo"],
                ["modelo_elemento", "Modelo do elemento filtrante"],
                ["patrimonio", "Nº de patrimônio (opcional)"],
                ["numero_serie", "Nº de série (opcional)"],
                ["local_instalacao", "Local de instalação"],
                ["responsavel", "Responsável"],
              ] as const
            ).map(([campo, label]) => (
              <div key={campo} className="space-y-1">
                <Label htmlFor={`ativo-${campo}`}>{label}</Label>
                <Input
                  id={`ativo-${campo}`}
                  value={form[campo]}
                  onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                />
              </div>
            ))}

            <div className="space-y-1">
              <Label htmlFor="ativo-per">Periodicidade (dias)</Label>
              <Input
                id="ativo-per"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.periodicidade_dias}
                onChange={(e) =>
                  setForm((f) => ({ ...f, periodicidade_dias: Number(e.target.value) }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ativo-inst">Instalado em</Label>
              <Input
                id="ativo-inst"
                type="date"
                value={form.instalado_em}
                onChange={(e) => setForm((f) => ({ ...f, instalado_em: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ativo-troca">Data da última troca</Label>
              <Input
                id="ativo-troca"
                type="date"
                value={form.ultima_troca}
                onChange={(e) => setForm((f) => ({ ...f, ultima_troca: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Condição atual</Label>
              <Select
                value={form.condicao_atual}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, condicao_atual: v as FiltroCondicao }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDICOES.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Situação</Label>
              <Select
                value={form.situacao}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, situacao: v as FiltroAtivo["situacao"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="substituido">Substituído</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ativo-obs">Observações</Label>
              <Textarea
                id="ativo-obs"
                rows={2}
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>

            <input
              ref={fotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void anexarFoto(f);
              }}
            />
            <div className="sm:col-span-2">
              <Button
                variant="secondary"
                className="min-h-[44px] w-full"
                disabled={enviandoFoto}
                onClick={() => fotoRef.current?.click()}
              >
                {enviandoFoto ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-4 w-4" />
                )}
                {form.foto_url ? "Trocar foto de referência" : "Foto de referência"}
              </Button>
              {form.foto_url && (
                <img
                  src={form.foto_url}
                  alt="Foto de referência do filtro"
                  className="mt-2 h-28 w-full rounded-2xl border border-border/50 object-cover"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              className="min-h-[44px] w-full"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
