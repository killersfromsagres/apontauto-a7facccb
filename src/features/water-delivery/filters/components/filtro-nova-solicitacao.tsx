import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Filter, Loader2, Plus } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { enviarEvidencia } from "@/features/water-delivery/offline/fotos";
import {
  FILTRO_TIPOS,
  criarFiltro,
  listPontos,
  pontoLabel,
  type FiltroPrioridade,
} from "@/features/water-delivery/queries/api";
import {
  MOTIVOS_SOLICITACAO,
  listFiltroAtivos,
  validarSolicitacao,
  type FiltroAtivo,
} from "@/features/water-delivery/filters/filtros";

interface Props {
  /** Ativo pré-selecionado (abertura por QR Code ou pelo ponto de entrega). */
  ativoInicial?: FiltroAtivo | null;
  onCriada?: () => void;
}

const VAZIO = {
  solicitante: "",
  ponto_id: "",
  ativo_id: "",
  predio: "",
  andar_setor: "",
  espaco: "",
  tipo: FILTRO_TIPOS[0],
  prioridade: "media" as FiltroPrioridade,
  descricao: "",
  telefone: "",
  disponibilidade: "",
  os: "",
  motivo_outro: "",
};

/** 12.2 — formulário de abertura de solicitação de filtro. */
export function FiltroNovaSolicitacao({ ativoInicial, onCriada }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(() => ({
    ...VAZIO,
    ponto_id: ativoInicial?.ponto_id ?? "",
    ativo_id: ativoInicial?.id ?? "",
    predio: ativoInicial?.predio ?? "",
    andar_setor: ativoInicial?.andar_setor ?? "",
    espaco: ativoInicial?.espaco ?? "",
  }));
  const [motivos, setMotivos] = useState<string[]>([]);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const ativos = useQuery({ queryKey: ["agua", "filtro-ativos"], queryFn: listFiltroAtivos });

  const ativosDoPonto = useMemo(
    () => (ativos.data ?? []).filter((a) => a.ponto_id === form.ponto_id && a.situacao === "ativo"),
    [ativos.data, form.ponto_id],
  );

  function alternarMotivo(valor: string) {
    setMotivos((m) => (m.includes(valor) ? m.filter((x) => x !== valor) : [...m, valor]));
  }

  async function anexarFoto(file: File) {
    setEnviandoFoto(true);
    try {
      const { url } = await enviarEvidencia(file, { tipo: "filtro" }, { nome: "filtro-abertura" });
      if (!url) {
        toast.info("Sem rede: a foto ficou na fila e será enviada automaticamente.");
        return;
      }
      setFotoUrl(url);
      toast.success("Foto anexada.");
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao enviar a foto.");
    } finally {
      setEnviandoFoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const criar = useMutation({
    mutationFn: async () => {
      const erro = validarSolicitacao({
        ponto_id: form.ponto_id,
        motivos,
        motivo_outro: form.motivo_outro,
      });
      if (erro) throw new Error(erro);

      await criarFiltro({
        ponto_id: form.ponto_id,
        ativo_id: form.ativo_id || null,
        tipo: form.tipo,
        prioridade: form.prioridade,
        origem: ativoInicial ? "qrcode" : "solicitante",
        situacao: "solicitada",
        descricao: form.descricao.trim() || null,
        foto_url: fotoUrl,
        solicitante_nome: form.solicitante.trim() || null,
        predio: form.predio.trim() || null,
        andar_setor: form.andar_setor.trim() || null,
        espaco: form.espaco.trim() || null,
        motivos,
        motivo_outro: form.motivo_outro.trim() || null,
        telefone: form.telefone.trim() || null,
        disponibilidade_acesso: form.disponibilidade.trim() || null,
        os_relacionada: form.os.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Solicitação registrada.");
      setForm({ ...VAZIO });
      setMotivos([]);
      setFotoUrl(null);
      void qc.invalidateQueries({ queryKey: ["agua", "filtros"] });
      onCriada?.();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao registrar."),
  });

  const set = (campo: keyof typeof VAZIO, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Nova solicitação de filtro</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="sol-nome">Solicitante</Label>
          <Input
            id="sol-nome"
            value={form.solicitante}
            onChange={(e) => set("solicitante", e.target.value)}
            placeholder="Quem está pedindo"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label>Prédio / ponto</Label>
          <Select
            value={form.ponto_id}
            onValueChange={(v) => setForm((f) => ({ ...f, ponto_id: v, ativo_id: "" }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o ponto" />
            </SelectTrigger>
            <SelectContent>
              {(pontos.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {pontoLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sol-andar">Andar / setor</Label>
          <Input
            id="sol-andar"
            value={form.andar_setor}
            onChange={(e) => set("andar_setor", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sol-espaco">Espaço</Label>
          <Input
            id="sol-espaco"
            value={form.espaco}
            onChange={(e) => set("espaco", e.target.value)}
          />
        </div>

        {ativosDoPonto.length > 0 && (
          <div className="space-y-1 sm:col-span-2">
            <Label>Filtro / ponto de filtro</Label>
            <Select value={form.ativo_id} onValueChange={(v) => set("ativo_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Vincular a um filtro cadastrado" />
              </SelectTrigger>
              <SelectContent>
                {ativosDoPonto.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {[a.codigo, a.fabricante ?? a.marca, a.modelo, a.tipo_filtro]
                      .filter(Boolean)
                      .join(" · ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1">
          <Label>Tipo de serviço</Label>
          <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTRO_TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Prioridade (define o SLA)</Label>
          <Select
            value={form.prioridade}
            onValueChange={(v) => setForm((f) => ({ ...f, prioridade: v as FiltroPrioridade }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alta">Alta · 24h</SelectItem>
              <SelectItem value="media">Média · 72h</SelectItem>
              <SelectItem value="baixa">Baixa · 7 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sol-tel">Telefone / ramal</Label>
          <Input
            id="sol-tel"
            inputMode="tel"
            value={form.telefone}
            onChange={(e) => set("telefone", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sol-acesso">Disponibilidade de acesso</Label>
          <Input
            id="sol-acesso"
            value={form.disponibilidade}
            onChange={(e) => set("disponibilidade", e.target.value)}
            placeholder="Ex.: das 8h às 12h"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sol-os">OS relacionada (opcional)</Label>
          <Input id="sol-os" value={form.os} onChange={(e) => set("os", e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Motivo</Label>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS_SOLICITACAO.map((m) => (
            <button
              key={m.valor}
              type="button"
              onClick={() => alternarMotivo(m.valor)}
              className={cn(
                "min-h-[40px] rounded-full border px-3 text-xs font-medium",
                motivos.includes(m.valor)
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/60 bg-card/40 text-muted-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {motivos.includes("outro") && (
          <Input
            value={form.motivo_outro}
            onChange={(e) => set("motivo_outro", e.target.value)}
            placeholder="Descreva a outra causa"
          />
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="sol-desc">Descrição</Label>
        <Textarea
          id="sol-desc"
          rows={2}
          value={form.descricao}
          onChange={(e) => set("descricao", e.target.value)}
          placeholder="Ex.: água com gosto de cloro desde ontem, vazão muito baixa…"
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void anexarFoto(f);
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          className="min-h-[44px] sm:flex-1"
          disabled={enviandoFoto}
          onClick={() => fileRef.current?.click()}
        >
          {enviandoFoto ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Camera className="mr-2 h-4 w-4" />
          )}
          {fotoUrl ? "Trocar foto" : "Anexar foto (quando possível)"}
        </Button>
        <Button
          className="min-h-[44px] sm:flex-1"
          disabled={!form.ponto_id || criar.isPending}
          onClick={() => criar.mutate()}
        >
          {criar.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Registrar solicitação
        </Button>
      </div>

      {fotoUrl && (
        <img
          src={fotoUrl}
          alt="Foto anexada à solicitação"
          className="h-28 w-full rounded-2xl border border-border/50 object-cover"
        />
      )}
    </GlassCard>
  );
}
