// Início (8.1) e finalização (8.5) da rota do dia.

import { useState } from "react";
import { Camera, Flag, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadFrotaPhoto } from "@/lib/frota/photo";
import {
  calcularBalanco,
  finalizarRota,
  iniciarRota,
  type RotaExecucao,
} from "@/features/water-delivery/mutations/execucao";

function FotoCarga({
  url,
  onChange,
  label,
  rotaId,
}: {
  url: string | null;
  onChange: (u: string | null) => void;
  label: string;
  rotaId: string;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {url && (
          <img loading="lazy" decoding="async"
            src={url}
            alt={label}
            className="h-16 w-16 rounded-xl border border-border/60 object-cover"
          />
        )}
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border/60 px-3 text-sm">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {url ? "Trocar foto" : "Adicionar foto"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setEnviando(true);
              try {
                const { url: novo } = await uploadFrotaPhoto(file, `agua-rota-${rotaId}.jpg`, {
                  module: "abastecimento-agua",
                  entityType: "agua_rota",
                  entityId: rotaId,
                });
                onChange(novo);
              } catch (err) {
                toast.error((err as Error)?.message ?? "Falha ao enviar a foto.");
              } finally {
                setEnviando(false);
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}

export function InicioRotaCard({
  rota,
  checklistValido,
  onIniciada,
}: {
  rota: RotaExecucao;
  checklistValido: boolean;
  onIniciada: () => void;
}) {
  const [veiculo, setVeiculo] = useState(rota.veiculo ?? "");
  const [hodometro, setHodometro] = useState("");
  const [principal, setPrincipal] = useState(rota.colaborador_principal ?? "");
  const [secundario, setSecundario] = useState(rota.colaborador_secundario ?? "");
  const [bags, setBags] = useState(String(rota.bags_carregadas ?? ""));
  const [foto, setFoto] = useState<string | null>(rota.foto_carga_url);
  const [checklist, setChecklist] = useState(rota.checklist_confirmado);
  const [observacao, setObservacao] = useState(rota.observacao_inicial ?? "");
  const [salvando, setSalvando] = useState(false);

  async function iniciar() {
    setSalvando(true);
    try {
      await iniciarRota(rota.id, {
        veiculo: veiculo || null,
        hodometro_inicial: hodometro === "" ? null : Number(hodometro),
        colaborador_principal: principal,
        colaborador_secundario: secundario || null,
        bags_carregadas: bags === "" ? null : Number(bags),
        foto_carga_url: foto,
        checklist_confirmado: checklist,
        observacao_inicial: observacao,
      });
      toast.success("Rota iniciada. Bom trabalho!");
      onIniciada();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Não foi possível iniciar a rota.");
    } finally {
      setSalvando(false);
    }
  }

  const pronto = Boolean(veiculo && principal && checklist);

  return (
    <GlassCard className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <PlayCircle className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">Início da rota</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Veículo</Label>
          <Input
            className="min-h-[44px]"
            value={veiculo}
            onChange={(e) => setVeiculo(e.target.value)}
            placeholder="Placa ou prefixo"
          />
        </div>
        <div className="space-y-1">
          <Label>Hodômetro inicial (km)</Label>
          <Input
            className="min-h-[44px]"
            type="number"
            min={0}
            inputMode="numeric"
            value={hodometro}
            onChange={(e) => setHodometro(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Colaborador principal</Label>
          <Input
            className="min-h-[44px]"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Acompanhante (opcional)</Label>
          <Input
            className="min-h-[44px]"
            value={secundario}
            onChange={(e) => setSecundario(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Bags carregadas</Label>
          <Input
            className="min-h-[44px]"
            type="number"
            min={0}
            inputMode="numeric"
            value={bags}
            onChange={(e) => setBags(e.target.value)}
          />
        </div>
        <FotoCarga
          rotaId={rota.id}
          url={foto}
          onChange={setFoto}
          label="Foto da carga (opcional)"
        />
      </div>

      <div className="space-y-1">
        <Label>Observação inicial</Label>
        <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-border/60 p-3 text-sm">
        <Checkbox checked={checklist} onCheckedChange={(v) => setChecklist(Boolean(v))} />
        <span>
          Confirmo o checklist veicular do dia.
          {!checklistValido && (
            <span className="block text-xs text-amber-300">
              Nenhum checklist válido encontrado hoje para este veículo.
            </span>
          )}
        </span>
      </label>

      <Button
        className="min-h-[48px] w-full"
        disabled={!pronto || salvando}
        onClick={() => void iniciar()}
      >
        {salvando ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <PlayCircle className="mr-2 h-4 w-4" />
        )}
        Iniciar rota e registrar saída
      </Button>
    </GlassCard>
  );
}

export function FimRotaCard({
  rota,
  totalEntregue,
  onFinalizada,
}: {
  rota: RotaExecucao;
  totalEntregue: number;
  onFinalizada: () => void;
}) {
  const [hodometro, setHodometro] = useState("");
  const [restantes, setRestantes] = useState("0");
  const [recolhidas, setRecolhidas] = useState("0");
  const [danificadas, setDanificadas] = useState("0");
  const [ajustes, setAjustes] = useState("0");
  const [observacao, setObservacao] = useState("");
  const [foto, setFoto] = useState<string | null>(rota.foto_carga_final_url);
  const [confPrincipal, setConfPrincipal] = useState(false);
  const [confSecundario, setConfSecundario] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);

  const balanco = calcularBalanco({
    carregadas: rota.bags_carregadas ?? 0,
    ajustes: Number(ajustes) || 0,
    entregues: totalEntregue,
    restantes: Number(restantes) || 0,
    danificadas: Number(danificadas) || 0,
  });

  async function finalizar() {
    setSalvando(true);
    try {
      const { divergencia } = await finalizarRota(
        rota,
        {
          hodometro_final: hodometro === "" ? null : Number(hodometro),
          bags_restantes: Number(restantes) || 0,
          bags_recolhidas: Number(recolhidas) || 0,
          bags_danificadas: Number(danificadas) || 0,
          bags_ajustes: Number(ajustes) || 0,
          observacao_final: observacao,
          foto_carga_final_url: foto,
          confirmado_principal: confPrincipal,
          confirmado_secundario: confSecundario,
          divergencia_justificativa: justificativa,
        },
        totalEntregue,
      );
      toast.success(
        divergencia === 0
          ? "Rota finalizada com balanço fechado."
          : `Rota finalizada com divergência de ${divergencia} bag(s) — ocorrência aberta e gestor notificado.`,
      );
      onFinalizada();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Não foi possível finalizar a rota.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <GlassCard className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Flag className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">Finalização da rota</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Hodômetro final (km)</Label>
          <Input
            className="min-h-[44px]"
            type="number"
            min={0}
            inputMode="numeric"
            value={hodometro}
            onChange={(e) => setHodometro(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Bags restantes</Label>
          <Input
            className="min-h-[44px]"
            type="number"
            min={0}
            inputMode="numeric"
            value={restantes}
            onChange={(e) => setRestantes(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Bags vazias recolhidas</Label>
          <Input
            className="min-h-[44px]"
            type="number"
            min={0}
            inputMode="numeric"
            value={recolhidas}
            onChange={(e) => setRecolhidas(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Bags danificadas/perdidas</Label>
          <Input
            className="min-h-[44px]"
            type="number"
            min={0}
            inputMode="numeric"
            value={danificadas}
            onChange={(e) => setDanificadas(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Outras saídas / ajustes</Label>
          <Input
            className="min-h-[44px]"
            type="number"
            inputMode="numeric"
            value={ajustes}
            onChange={(e) => setAjustes(e.target.value)}
          />
        </div>
        <FotoCarga
          rotaId={rota.id}
          url={foto}
          onChange={setFoto}
          label="Foto da carga remanescente"
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Carregadas {rota.bags_carregadas ?? 0} + ajustes {Number(ajustes) || 0} = entregues{" "}
          {totalEntregue} + restantes {Number(restantes) || 0} + danificadas{" "}
          {Number(danificadas) || 0}
        </p>
        <p
          className={
            balanco.divergencia === 0
              ? "mt-1 font-semibold text-emerald-300"
              : "mt-1 font-semibold text-amber-300"
          }
        >
          {balanco.divergencia === 0
            ? "Balanço fechado."
            : `Divergência de ${balanco.divergencia} bag(s) — justificativa obrigatória.`}
        </p>
      </div>

      {balanco.divergencia !== 0 && (
        <div className="space-y-1">
          <Label>Justificativa da divergência</Label>
          <Textarea
            rows={2}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label>Observação final</Label>
        <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-sm">
        <Checkbox checked={confPrincipal} onCheckedChange={(v) => setConfPrincipal(Boolean(v))} />
        Confirmação de {rota.colaborador_principal ?? "colaborador principal"}
      </label>
      {rota.colaborador_secundario && (
        <label className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-sm">
          <Checkbox
            checked={confSecundario}
            onCheckedChange={(v) => setConfSecundario(Boolean(v))}
          />
          Confirmação de {rota.colaborador_secundario}
        </label>
      )}

      <Button className="min-h-[48px] w-full" disabled={salvando} onClick={() => void finalizar()}>
        {salvando ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Flag className="mr-2 h-4 w-4" />
        )}
        Finalizar rota
      </Button>
    </GlassCard>
  );
}
