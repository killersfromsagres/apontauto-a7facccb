import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSettings, type AguaWhatsappConfig } from "@/lib/settings";
import { mascararTelefone } from "@/features/water-delivery/whatsapp/whatsapp";
import { enviarPelaCloudApi } from "@/features/water-delivery/whatsapp/whatsapp-cloud";

/**
 * Configuração administrativa do item 11: modelo de mensagem, números
 * administrativos e o modo avançado (Cloud API oficial), que permanece
 * desativado até o administrador habilitar E validar.
 */
export function WhatsAppConfigCard({ podeEditar }: { podeEditar: boolean }) {
  const [settings, salvar] = useSettings();
  const [cfg, setCfg] = useState<AguaWhatsappConfig>(settings.aguaWhatsapp);
  const [novoLabel, setNovoLabel] = useState("");
  const [novoNumero, setNovoNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);

  useEffect(() => setCfg(settings.aguaWhatsapp), [settings.aguaWhatsapp]);

  async function persistir(next: AguaWhatsappConfig) {
    setCfg(next);
    setSalvando(true);
    try {
      await salvar({ ...settings, aguaWhatsapp: next });
      toast.success("Configuração de WhatsApp salva.");
    } catch {
      toast.error("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    const destino = cfg.cloud.destinatarios[0] ?? cfg.numeros[0]?.numero;
    if (!destino) {
      toast.error("Cadastre um destinatário antes de testar.");
      return;
    }
    setTestando(true);
    try {
      await enviarPelaCloudApi({
        destinatario: destino,
        mensagem: "Teste de configuração — Apont Auto.",
        teste: true,
        idempotencyKey: `teste:${Date.now()}`,
      });
      toast.success("Teste concluído. Configuração respondeu corretamente.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no teste.");
    } finally {
      setTestando(false);
    }
  }

  return (
    <GlassCard className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Envio de evidências ao WhatsApp</h3>
        {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="wa-template">Modelo da mensagem</Label>
        <Textarea
          id="wa-template"
          rows={10}
          className="text-xs"
          value={cfg.template}
          disabled={!podeEditar}
          onChange={(e) => setCfg({ ...cfg, template: e.target.value })}
          onBlur={() => podeEditar && void persistir(cfg)}
        />
        <p className="text-xs text-muted-foreground">
          Variáveis: {"{data} {equipe} {veiculo} {progresso} {bags} {ocorrencias} {lista}"}. Nunca
          inclua CPF, senhas ou dados desnecessários.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="wa-max">Máximo de links por mensagem</Label>
          <Input
            id="wa-max"
            type="number"
            min={1}
            value={cfg.maxLinks}
            disabled={!podeEditar}
            onChange={(e) => setCfg({ ...cfg, maxLinks: Number(e.target.value) || 1 })}
            onBlur={() => podeEditar && void persistir(cfg)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wa-pdf">Gerar PDF acima de</Label>
          <Input
            id="wa-pdf"
            type="number"
            min={0}
            value={cfg.pdfAcimaDe}
            disabled={!podeEditar}
            onChange={(e) => setCfg({ ...cfg, pdfAcimaDe: Number(e.target.value) || 0 })}
            onBlur={() => podeEditar && void persistir(cfg)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Números administrativos</Label>
        {cfg.numeros.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum número cadastrado.</p>
        ) : null}
        {cfg.numeros.map((n) => (
          <div key={n.numero} className="flex items-center justify-between rounded-lg border p-2">
            <span className="text-sm">
              {n.label} — {podeEditar ? n.numero : mascararTelefone(n.numero)}
            </span>
            {podeEditar ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover número"
                onClick={() =>
                  void persistir({
                    ...cfg,
                    numeros: cfg.numeros.filter((x) => x.numero !== n.numero),
                  })
                }
               aria-label="Excluir">
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
        {podeEditar ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Rótulo (ex.: Gestor)"
              value={novoLabel}
              onChange={(e) => setNovoLabel(e.target.value)}
            />
            <Input
              placeholder="5511999999999"
              inputMode="tel"
              value={novoNumero}
              onChange={(e) => setNovoNumero(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => {
                const numero = novoNumero.replace(/\D/g, "");
                if (!novoLabel.trim() || numero.length < 10) {
                  toast.error("Informe rótulo e número com DDI.");
                  return;
                }
                void persistir({
                  ...cfg,
                  numeros: [...cfg.numeros, { label: novoLabel.trim(), numero }],
                });
                setNovoLabel("");
                setNovoNumero("");
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Adicionar
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-dashed p-3">
        <p className="text-sm font-medium">Modo avançado — API oficial da Meta (opcional)</p>
        <p className="text-xs text-muted-foreground">
          Executa somente no servidor, com token e phone number ID guardados em secrets. Fica
          desativado até ser habilitado e validado por um administrador.
        </p>

        <div className="flex items-center justify-between">
          <Label htmlFor="wa-cloud">Habilitado</Label>
          <Switch
            id="wa-cloud"
            checked={cfg.cloud.habilitado}
            disabled={!podeEditar}
            onCheckedChange={(v) =>
              void persistir({ ...cfg, cloud: { ...cfg.cloud, habilitado: v } })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="wa-sandbox">Ambiente sandbox (sem disparo real)</Label>
          <Switch
            id="wa-sandbox"
            checked={cfg.cloud.sandbox}
            disabled={!podeEditar}
            onCheckedChange={(v) => void persistir({ ...cfg, cloud: { ...cfg.cloud, sandbox: v } })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="wa-validado">Configuração validada</Label>
          <Switch
            id="wa-validado"
            checked={cfg.cloud.validado}
            disabled={!podeEditar}
            onCheckedChange={(v) =>
              void persistir({ ...cfg, cloud: { ...cfg.cloud, validado: v } })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wa-limite">Limite diário de disparos</Label>
          <Input
            id="wa-limite"
            type="number"
            min={1}
            value={cfg.cloud.limiteDiario}
            disabled={!podeEditar}
            onChange={(e) =>
              setCfg({
                ...cfg,
                cloud: { ...cfg.cloud, limiteDiario: Number(e.target.value) || 1 },
              })
            }
            onBlur={() => podeEditar && void persistir(cfg)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wa-dest">Destinatários autorizados (um por linha)</Label>
          <Textarea
            id="wa-dest"
            rows={3}
            className="text-xs"
            value={cfg.cloud.destinatarios.join("\n")}
            disabled={!podeEditar}
            onChange={(e) =>
              setCfg({
                ...cfg,
                cloud: {
                  ...cfg.cloud,
                  destinatarios: e.target.value
                    .split("\n")
                    .map((s) => s.replace(/\D/g, ""))
                    .filter(Boolean),
                },
              })
            }
            onBlur={() => podeEditar && void persistir(cfg)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={!podeEditar || testando}
          onClick={testar}
        >
          {testando ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          Testar configuração
        </Button>
      </div>
    </GlassCard>
  );
}
