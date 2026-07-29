import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, History, Loader2, RefreshCw, XCircle } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { cn } from "@/lib/utils";
import { listVisitas } from "@/lib/agua/api";
import { listChecklists, listVehicles, vehicleLabel } from "@/lib/frota/api";
import {
  cancelarRota,
  checklistPartida,
  formatarData,
  gerarRotas,
  hojeSP,
  listGeracaoJobs,
  listRotas,
  listVersoesRota,
  ROTA_STATUS_LABEL,
  salvarRota,
  TURNO_LABEL,
  type Rota,
} from "@/lib/agua/programacao";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/rotas")({
  component: RotasPage,
});

function RotasPage() {
  const qc = useQueryClient();
  const gestor = useCanAccessModule("abastecimento", "update").allowed;
  const [data, setData] = useState(hojeSP());

  const rotas = useQuery({ queryKey: ["agua", "rotas", data], queryFn: () => listRotas(data, data) });
  const visitas = useQuery({
    queryKey: ["agua", "visitas", data],
    queryFn: () => listVisitas(data, data),
  });
  const jobs = useQuery({ queryKey: ["agua", "geracao-jobs"], queryFn: listGeracaoJobs });
  const veiculos = useQuery({ queryKey: ["frota", "vehicles"], queryFn: listVehicles });
  const checklists = useQuery({ queryKey: ["frota", "checklists"], queryFn: () => listChecklists(200) });

  const gerar = useMutation({
    mutationFn: () => gerarRotas(data, "manual"),
    onSuccess: (res: any) => {
      if (res?.status === "ignorado") toast.info(`Data bloqueada: ${res.motivo}`);
      else toast.success(`${res?.rotas ?? 0} rota(s) e ${res?.visitas ?? 0} parada(s) geradas.`);
      qc.invalidateQueries({ queryKey: ["agua"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha na geração."),
  });

  const paradasPorRota = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visitas.data ?? []) {
      const key = (v as any).rota_id as string | null;
      if (key) m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [visitas.data]);

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-3 sm:p-4">
        <h2 className="text-sm font-semibold">Geração de rotas</h2>
        <p className="text-xs text-muted-foreground">
          Rotina idempotente no fuso America/São Paulo: gera uma rota por template, data, turno e
          equipe. Rodar de novo não duplica nada e respeita feriados e exceções. O sistema executa
          automaticamente no horário configurado em Configurações.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="data-rota">Data</Label>
            <Input
              id="data-rota"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="h-11 w-[170px]"
            />
          </div>
          {gestor && (
            <Button className="h-11" disabled={gerar.isPending} onClick={() => gerar.mutate()}>
              {gerar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Gerar / regerar
            </Button>
          )}
        </div>
      </GlassCard>

      {(rotas.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma rota para esta data"
          description="Gere as rotas do dia a partir da programação semanal."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(rotas.data ?? []).map((rota) => (
            <RotaCard
              key={rota.id}
              rota={rota}
              paradas={paradasPorRota.get(rota.id) ?? 0}
              gestor={gestor}
              veiculos={veiculos.data ?? []}
              checklistHoje={(checklists.data ?? []).filter(
                (c) => c.submitted_at.slice(0, 10) === rota.data,
              )}
              onDone={() => qc.invalidateQueries({ queryKey: ["agua", "rotas"] })}
            />
          ))}
        </div>
      )}

      <GlassCard className="space-y-2 p-3 sm:p-4">
        <h2 className="text-sm font-semibold">Registro das gerações</h2>
        {(jobs.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma execução registrada ainda.</p>
        ) : (
          (jobs.data ?? []).map((j) => (
            <div
              key={j.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card/40 p-2 text-xs"
            >
              <span className="font-medium">{formatarData(j.data_alvo)}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5",
                  j.status === "ok"
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-amber-500/15 text-amber-200",
                )}
              >
                {j.status}
              </span>
              <span className="text-muted-foreground">{j.origem}</span>
              <span className="flex-1 truncate text-muted-foreground">{j.mensagem}</span>
              <span className="text-muted-foreground">
                {new Date(j.criado_em).toLocaleString("pt-BR")}
              </span>
            </div>
          ))
        )}
      </GlassCard>
    </div>
  );
}

function RotaCard({
  rota,
  paradas,
  gestor,
  veiculos,
  checklistHoje,
  onDone,
}: {
  rota: Rota;
  paradas: number;
  gestor: boolean;
  veiculos: Array<{ id: string; prefix: string; status: string; plate: string | null; brand: string; model: string; version: string | null; year_model: number | null }>;
  checklistHoje: Array<{ vehicle_id: string; critical_block: boolean }>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    colaborador_principal: rota.colaborador_principal ?? "",
    colaborador_secundario: rota.colaborador_secundario ?? "",
    veiculo: rota.veiculo ?? "",
    supervisor: rota.supervisor ?? "",
    horario_previsto: rota.horario_previsto ?? "",
    bags_carregadas: String(rota.bags_carregadas ?? ""),
    observacao: rota.observacao ?? "",
    status: rota.status,
  });
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const veiculo = veiculos.find((v) => v.prefix === form.veiculo || v.id === form.veiculo);
  const checklist = checklistHoje.find((c) => c.vehicle_id === veiculo?.id);

  const itens = checklistPartida({
    rota: { ...rota, ...form, bags_carregadas: Number(form.bags_carregadas) || 0 } as Rota,
    paradas,
    veiculoDisponivel: veiculo ? ["disponivel", "em_uso"].includes(veiculo.status) : false,
    checklistValido: Boolean(checklist),
    bloqueioCritico: Boolean(checklist?.critical_block) || veiculo?.status === "bloqueado",
    offlinePronto:
      typeof window !== "undefined" && Boolean(window.localStorage.getItem("agua:cache:rota")),
  });
  const pronta = itens.every((i) => i.ok);

  async function salvar(patch: Partial<Rota>, just?: string) {
    setSalvando(true);
    try {
      await salvarRota(rota, patch, just);
      toast.success("Rota atualizada.");
      onDone();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao salvar rota.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <GlassCard className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">
          {formatarData(rota.data)} · {TURNO_LABEL[rota.turno] ?? rota.turno}
        </p>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px]">
          {rota.equipe} · {rota.template_key}
        </span>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
          {ROTA_STATUS_LABEL[rota.status] ?? rota.status}
        </span>
        <span className="text-[11px] text-muted-foreground">v{rota.versao} · {paradas} parada(s)</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Campo
          label="Colaborador principal"
          value={form.colaborador_principal}
          onChange={(v) => setForm((f) => ({ ...f, colaborador_principal: v }))}
          disabled={!gestor}
        />
        <Campo
          label="Segundo colaborador"
          value={form.colaborador_secundario}
          onChange={(v) => setForm((f) => ({ ...f, colaborador_secundario: v }))}
          disabled={!gestor}
        />
        <div className="space-y-1">
          <Label>Veículo</Label>
          <Select
            value={form.veiculo}
            onValueChange={(v) => setForm((f) => ({ ...f, veiculo: v }))}
            disabled={!gestor}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {veiculos.map((v) => (
                <SelectItem key={v.id} value={v.prefix}>
                  {v.prefix} · {vehicleLabel(v as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Campo
          label="Supervisor"
          value={form.supervisor}
          onChange={(v) => setForm((f) => ({ ...f, supervisor: v }))}
          disabled={!gestor}
        />
        <div className="space-y-1">
          <Label>Horário previsto</Label>
          <Input
            type="time"
            className="h-11"
            value={form.horario_previsto ?? ""}
            disabled={!gestor}
            onChange={(e) => setForm((f) => ({ ...f, horario_previsto: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Bags carregadas</Label>
          <Input
            type="number"
            min={0}
            className="h-11"
            value={form.bags_carregadas}
            disabled={!gestor}
            onChange={(e) => setForm((f) => ({ ...f, bags_carregadas: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Observação</Label>
        <Textarea
          rows={2}
          value={form.observacao}
          disabled={!gestor}
          onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
        />
      </div>

      <div className="space-y-1 rounded-xl border border-border/50 bg-card/40 p-2">
        <p className="text-xs font-semibold">Verificação antes de iniciar</p>
        {itens.map((i) => (
          <div key={i.chave} className="flex items-start gap-2 text-[11px]">
            {i.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
            )}
            <span className={i.ok ? "text-muted-foreground" : "text-rose-200"}>
              {i.label} — {i.detalhe}
            </span>
          </div>
        ))}
      </div>

      {gestor && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={salvando}
            onClick={() =>
              salvar({
                colaborador_principal: form.colaborador_principal || null,
                colaborador_secundario: form.colaborador_secundario || null,
                veiculo: form.veiculo || null,
                supervisor: form.supervisor || null,
                horario_previsto: form.horario_previsto || null,
                bags_carregadas: Number(form.bags_carregadas) || null,
                observacao: form.observacao || null,
                status: pronta && rota.status === "planejada" ? "pronta" : rota.status,
              })
            }
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar atribuição
          </Button>
          {rota.status !== "em_andamento" && rota.status !== "concluida" && (
            <Button
              variant="secondary"
              disabled={!pronta || salvando}
              onClick={() =>
                salvar({ status: "em_andamento", iniciada_em: new Date().toISOString() })
              }
            >
              Iniciar rota
            </Button>
          )}
          {rota.status !== "cancelada" && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost">Cancelar rota</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancelar rota</DialogTitle>
                </DialogHeader>
                <div className="space-y-1">
                  <Label>Justificativa (obrigatória)</Label>
                  <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await cancelarRota(rota, motivo);
                        toast.success("Rota cancelada.");
                        onDone();
                      } catch (e) {
                        toast.error((e as Error)?.message ?? "Falha ao cancelar.");
                      }
                    }}
                  >
                    Confirmar cancelamento
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <VersoesDialog rotaId={rota.id} />
        </div>
      )}
      {rota.motivo_cancelamento && (
        <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-200">
          Cancelada: {rota.motivo_cancelamento}
        </p>
      )}
    </GlassCard>
  );
}

function Campo({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        className="h-11"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function VersoesDialog({ rotaId }: { rotaId: string }) {
  const [aberto, setAberto] = useState(false);
  const versoes = useQuery({
    queryKey: ["agua", "rota-versoes", rotaId],
    queryFn: () => listVersoesRota(rotaId),
    enabled: aberto,
  });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <History className="mr-2 h-4 w-4" />
          Histórico
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Versões da rota</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-auto">
          {(versoes.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
          ) : (
            (versoes.data ?? []).map((v) => (
              <div key={v.id} className="rounded-xl border border-border/50 bg-card/40 p-2 text-xs">
                <p className="font-medium">
                  v{v.versao} · {new Date(v.criado_em).toLocaleString("pt-BR")}
                </p>
                {v.motivo && <p className="text-muted-foreground">{v.motivo}</p>}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
