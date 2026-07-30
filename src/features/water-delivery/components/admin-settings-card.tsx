import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  Camera,
  Droplets,
  KeyRound,
  Loader2,
  MapPin,
  Package,
  Plus,
  Power,
  Save,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSettings } from "@/lib/settings";
import {
  DEFAULT_AGUA_ADMIN,
  DIAS_SEMANA,
  aguaAdminSchema,
  mergeAguaAdmin,
  type AguaAdminConfig,
} from "@/features/water-delivery/schemas/config";
import {
  criarFeriado,
  desativarBagTipo,
  listBagTipos,
  listFeriados,
  removerFeriado,
  upsertBagTipo,
} from "@/features/water-delivery/queries/config";
import { AGUA_PERMISSAO_LABEL, AGUA_PERMISSOES } from "@/features/water-delivery/schemas/permissoes";

function Campo({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Alternador({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * Item 22 — Configurações administrativas do módulo Água.
 * Somente parâmetros operacionais: nenhum segredo é exibido ou devolvido aqui.
 */
export function AdminSettingsCard({ podeEditar }: { podeEditar: boolean }) {
  const [settings, salvarSettings] = useSettings();
  const extras = settings as unknown as Record<string, unknown>;
  const salvo = useMemo(() => mergeAguaAdmin(extras.aguaAdmin), [extras.aguaAdmin]);
  const [cfg, setCfg] = useState<AguaAdminConfig>(salvo);
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setCfg(salvo), [salvo]);

  const sujo = JSON.stringify(cfg) !== JSON.stringify(salvo);

  async function salvar() {
    const parsed = aguaAdminSchema.safeParse(cfg);
    if (!parsed.success) {
      setErros(parsed.error.issues.map((i) => i.message));
      toast.error("Revise os campos destacados.");
      return;
    }
    setErros([]);
    setSalvando(true);
    try {
      await salvarSettings({ ...(settings as never), aguaAdmin: parsed.data } as never);
      toast.success("Configurações salvas.");
    } catch (e) {
      toast.error((e as Error)?.message ?? "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const op = cfg.operacao;
  const num = (v: string, fallback: number) => (v === "" ? fallback : Number(v));

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Power className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Módulo e notificações</h3>
          {!podeEditar && <Badge variant="outline">somente leitura</Badge>}
        </div>
        <Alternador
          id="cfg-modulo"
          label="Módulo Abastecimento de Água ativo"
          hint="Desativado, o módulo fica oculto para todos, exceto administradores."
          checked={cfg.moduloAtivo}
          disabled={!podeEditar}
          onChange={(v) => setCfg({ ...cfg, moduloAtivo: v })}
        />
        <Alternador
          id="cfg-notif"
          label="Notificações do módulo ativas"
          hint="Rotas atribuídas, atrasos, divergência de bags, filtros e falhas de upload."
          checked={cfg.notificacoesAtivas}
          disabled={!podeEditar}
          onChange={(v) => setCfg({ ...cfg, notificacoesAtivas: v })}
        />
      </GlassCard>

      <GlassCard className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Operação, horários e dias úteis</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="cfg-bags" label="Quantidade padrão de bags" hint="Sugerida ao criar paradas.">
            <Input
              id="cfg-bags"
              type="number"
              min={1}
              value={op.bagsPadrao}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({ ...cfg, operacao: { ...op, bagsPadrao: num(e.target.value, 1) } })
              }
            />
          </Campo>
          <Campo
            id="cfg-tolerancia"
            label="Tolerância de atraso (min)"
            hint="Depois disso a parada entra como atrasada e dispara aviso."
          >
            <Input
              id="cfg-tolerancia"
              type="number"
              min={0}
              value={op.toleranciaAtrasoMin}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  operacao: { ...op, toleranciaAtrasoMin: num(e.target.value, 0) },
                })
              }
            />
          </Campo>
          <Campo id="cfg-inicio" label="Início da janela de trabalho">
            <Input
              id="cfg-inicio"
              type="time"
              value={op.horaInicio}
              disabled={!podeEditar}
              onChange={(e) => setCfg({ ...cfg, operacao: { ...op, horaInicio: e.target.value } })}
            />
          </Campo>
          <Campo id="cfg-fim" label="Fim da janela de trabalho">
            <Input
              id="cfg-fim"
              type="time"
              value={op.horaFim}
              disabled={!podeEditar}
              onChange={(e) => setCfg({ ...cfg, operacao: { ...op, horaFim: e.target.value } })}
            />
          </Campo>
          <Campo
            id="cfg-geracao"
            label="Hora da geração automática de rotas"
            hint="Fuso America/São Paulo. A rotina é idempotente."
          >
            <select
              id="cfg-geracao"
              value={String(op.horaGeracao)}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({ ...cfg, operacao: { ...op, horaGeracao: Number(e.target.value) } })
              }
              className="h-11 w-full rounded-xl border border-border/60 bg-card/40 px-3 text-sm"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="space-y-2">
          <Label>Dias úteis</Label>
          <div className="flex flex-wrap gap-2">
            {DIAS_SEMANA.map((d) => {
              const ativo = op.diasUteis.includes(d.valor);
              return (
                <Button
                  key={d.valor}
                  type="button"
                  size="sm"
                  variant={ativo ? "default" : "outline"}
                  className="min-h-[44px] min-w-[56px]"
                  disabled={!podeEditar}
                  onClick={() =>
                    setCfg({
                      ...cfg,
                      operacao: {
                        ...op,
                        diasUteis: ativo
                          ? op.diasUteis.filter((x) => x !== d.valor)
                          : [...op.diasUteis, d.valor].sort(),
                      },
                    })
                  }
                >
                  {d.label}
                </Button>
              );
            })}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Regras de campo</h3>
        </div>
        <Alternador
          id="cfg-foto"
          label="Foto obrigatória para concluir a parada"
          hint="Sem evidência, a entrega não pode ser finalizada."
          checked={cfg.campo.fotoObrigatoria}
          disabled={!podeEditar}
          onChange={(v) => setCfg({ ...cfg, campo: { ...cfg.campo, fotoObrigatoria: v } })}
        />
        <Alternador
          id="cfg-geo"
          label="Geolocalização obrigatória"
          hint="Captura a posição do aparelho no momento da conclusão."
          checked={cfg.campo.geolocalizacaoObrigatoria}
          disabled={!podeEditar}
          onChange={(v) =>
            setCfg({ ...cfg, campo: { ...cfg.campo, geolocalizacaoObrigatoria: v } })
          }
        />
        <Campo
          id="cfg-raio"
          label="Raio aceito do ponto (m)"
          hint="Acima disso a entrega é marcada como divergência de local."
        >
          <Input
            id="cfg-raio"
            type="number"
            min={20}
            value={cfg.campo.raioGeoMetros}
            disabled={!podeEditar}
            onChange={(e) =>
              setCfg({ ...cfg, campo: { ...cfg.campo, raioGeoMetros: num(e.target.value, 20) } })
            }
          />
        </Campo>
      </GlassCard>

      <GlassCard className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Filtros de água — SLA e periodicidades</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["slaAltaHoras", "SLA alta (h)"],
              ["slaMediaHoras", "SLA média (h)"],
              ["slaBaixaHoras", "SLA baixa (h)"],
            ] as const
          ).map(([chave, label]) => (
            <Campo key={chave} id={`cfg-${chave}`} label={label}>
              <Input
                id={`cfg-${chave}`}
                type="number"
                min={1}
                value={cfg.filtros[chave]}
                disabled={!podeEditar}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    filtros: { ...cfg.filtros, [chave]: num(e.target.value, 1) },
                  })
                }
              />
            </Campo>
          ))}
          <Campo
            id="cfg-period"
            label="Periodicidade preventiva (dias)"
            hint="Define a próxima troca dos filtros cadastrados."
          >
            <Input
              id="cfg-period"
              type="number"
              min={7}
              value={cfg.filtros.periodicidadeDias}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  filtros: { ...cfg.filtros, periodicidadeDias: num(e.target.value, 7) },
                })
              }
            />
          </Campo>
          <Campo id="cfg-aviso" label="Aviso de vencimento (dias antes)">
            <Input
              id="cfg-aviso"
              type="number"
              min={1}
              value={cfg.filtros.avisoAntecedenciaDias}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  filtros: { ...cfg.filtros, avisoAntecedenciaDias: num(e.target.value, 1) },
                })
              }
            />
          </Campo>
        </div>
      </GlassCard>

      <GlassCard className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Evidências, imagem e retenção</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            id="cfg-qualidade"
            label="Qualidade da imagem"
            hint="0,50 a 0,95 — quanto menor, mais leve o upload."
          >
            <Input
              id="cfg-qualidade"
              type="number"
              step="0.05"
              min={0.5}
              max={0.95}
              value={cfg.evidencias.qualidadeImagem}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  evidencias: {
                    ...cfg.evidencias,
                    qualidadeImagem: Number(e.target.value) || 0.8,
                  },
                })
              }
            />
          </Campo>
          <Campo id="cfg-lado" label="Lado máximo (px)" hint="Entre 1280 e 1600 px.">
            <Input
              id="cfg-lado"
              type="number"
              min={1280}
              max={1600}
              step={40}
              value={cfg.evidencias.ladoMaximoPx}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  evidencias: { ...cfg.evidencias, ladoMaximoPx: num(e.target.value, 1600) },
                })
              }
            />
          </Campo>
          <Campo
            id="cfg-fallback"
            label="Modo de fallback do upload"
            hint="O armazenamento emergencial só deve ficar ativo durante incidentes."
          >
            <select
              id="cfg-fallback"
              value={cfg.evidencias.modoFallback}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  evidencias: {
                    ...cfg.evidencias,
                    modoFallback: e.target.value as AguaAdminConfig["evidencias"]["modoFallback"],
                  },
                })
              }
              className="h-11 w-full rounded-xl border border-border/60 bg-card/40 px-3 text-sm"
            >
              <option value="somente-fila">Manter na fila local até o serviço voltar</option>
              <option value="storage-emergencial">Armazenamento emergencial do servidor</option>
            </select>
          </Campo>
          <Campo
            id="cfg-retencao"
            label="Retenção de histórico técnico (dias)"
            hint="Vale só para logs e filas. Fotos e evidências nunca são apagadas."
          >
            <Input
              id="cfg-retencao"
              type="number"
              min={30}
              value={cfg.evidencias.retencaoLogsDias}
              disabled={!podeEditar}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  evidencias: {
                    ...cfg.evidencias,
                    retencaoLogsDias: num(e.target.value, 90),
                  },
                })
              }
            />
          </Campo>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Modo de compartilhamento</h3>
        </div>
        <select
          value={cfg.compartilhamento.modo}
          disabled={!podeEditar}
          onChange={(e) =>
            setCfg({
              ...cfg,
              compartilhamento: {
                modo: e.target.value as AguaAdminConfig["compartilhamento"]["modo"],
              },
            })
          }
          className="h-11 w-full rounded-xl border border-border/60 bg-card/40 px-3 text-sm"
          aria-label="Modo de compartilhamento"
        >
          <option value="link">Link wa.me (padrão, sem integração)</option>
          <option value="app">Compartilhamento nativo do aparelho</option>
          <option value="cloud-api">API oficial da Meta (exige validação)</option>
        </select>
      </GlassCard>

      {erros.length > 0 && (
        <GlassCard className="space-y-1 border-destructive/40 p-4">
          {erros.map((e) => (
            <p key={e} className="text-xs text-destructive">
              {e}
            </p>
          ))}
        </GlassCard>
      )}

      {podeEditar && (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2">
          <Button className="min-h-[44px]" disabled={!sujo || salvando} onClick={() => void salvar()}>
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar configurações
          </Button>
          <Button
            variant="ghost"
            className="min-h-[44px]"
            disabled={!sujo || salvando}
            onClick={() => setCfg(salvo)}
          >
            Descartar alterações
          </Button>
          <Button
            variant="ghost"
            className="min-h-[44px]"
            disabled={salvando}
            onClick={() => setCfg(DEFAULT_AGUA_ADMIN)}
          >
            Restaurar padrões
          </Button>
        </div>
      )}

      <BagTiposCard podeEditar={podeEditar} />
      <FeriadosCard podeEditar={podeEditar} />
      <SegredosCard />
      <PermissoesCard />
    </div>
  );
}

/** Tipos de bags — cadastro usado no controle de estoque. */
function BagTiposCard({ podeEditar }: { podeEditar: boolean }) {
  const qc = useQueryClient();
  const tipos = useQuery({ queryKey: ["agua", "bag-tipos"], queryFn: listBagTipos });
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [capacidade, setCapacidade] = useState("");

  const criar = useMutation({
    mutationFn: () =>
      upsertBagTipo({ codigo, nome, capacidade_label: capacidade, estoque_minimo: 0 }),
    onSuccess: () => {
      setCodigo("");
      setNome("");
      setCapacidade("");
      void qc.invalidateQueries({ queryKey: ["agua", "bag-tipos"] });
      toast.success("Tipo de bag cadastrado.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao cadastrar."),
  });

  const desativar = useMutation({
    mutationFn: (id: string) => desativarBagTipo(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agua", "bag-tipos"] });
      toast.success("Tipo desativado (histórico preservado).");
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao desativar."),
  });

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Tipos de bags</h3>
      </div>

      {(tipos.data ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum tipo cadastrado.</p>
      )}
      <div className="space-y-1">
        {(tipos.data ?? []).map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium">
                {t.nome} <span className="text-muted-foreground">({t.codigo})</span>
              </span>
              <p className="text-xs text-muted-foreground">
                {t.capacidade_label ?? "sem capacidade definida"} · estoque {t.estoque_atual} · mínimo{" "}
                {t.estoque_minimo}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!t.ativo && <Badge variant="outline">inativo</Badge>}
              {podeEditar && t.ativo && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Desativar ${t.nome}`}
                  onClick={() => desativar.mutate(t.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {podeEditar && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input
            placeholder="Capacidade (ex.: 20 L)"
            value={capacidade}
            onChange={(e) => setCapacidade(e.target.value)}
          />
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={criar.isPending || !codigo.trim() || !nome.trim()}
            onClick={() => criar.mutate()}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

/** Feriados que bloqueiam (ou não) a geração automática de rotas. */
function FeriadosCard({ podeEditar }: { podeEditar: boolean }) {
  const qc = useQueryClient();
  const feriados = useQuery({ queryKey: ["agua", "feriados"], queryFn: listFeriados });
  const [data, setData] = useState("");
  const [descricao, setDescricao] = useState("");
  const [bloqueia, setBloqueia] = useState(true);

  const criar = useMutation({
    mutationFn: () => criarFeriado({ data, descricao, bloqueia_geracao: bloqueia }),
    onSuccess: () => {
      setData("");
      setDescricao("");
      void qc.invalidateQueries({ queryKey: ["agua", "feriados"] });
      toast.success("Feriado cadastrado.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao cadastrar feriado."),
  });

  const remover = useMutation({
    mutationFn: (id: string) => removerFeriado(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agua", "feriados"] });
      toast.success("Feriado removido.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao remover."),
  });

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Feriados e datas sem operação</h3>
      </div>

      {(feriados.data ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum feriado cadastrado.</p>
      )}
      <div className="space-y-1">
        {(feriados.data ?? []).map((f) => (
          <div
            key={f.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium">
                {new Date(`${f.data}T12:00:00`).toLocaleDateString("pt-BR")}
              </span>
              <p className="truncate text-xs text-muted-foreground">{f.descricao}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {f.bloqueia_geracao ? "bloqueia geração" : "apenas informativo"}
              </Badge>
              {podeEditar && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover feriado ${f.descricao}`}
                  onClick={() => remover.mutate(f.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {podeEditar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <Input
            placeholder="Descrição"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Switch id="fer-bloqueia" checked={bloqueia} onCheckedChange={setBloqueia} />
            <Label htmlFor="fer-bloqueia" className="text-xs">
              Bloqueia geração
            </Label>
          </div>
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={criar.isPending || !data || !descricao.trim()}
            onClick={() => criar.mutate()}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

/** Segredos são gravados no servidor e nunca retornam para a tela. */
function SegredosCard() {
  const segredos = [
    { nome: "Chave do ImgBB", uso: "Envio de evidências pelo proxy autenticado" },
    { nome: "Token da Cloud API (WhatsApp)", uso: "Disparo oficial de mensagens" },
    { nome: "Phone Number ID (WhatsApp)", uso: "Identificação do remetente" },
    { nome: "Verify token do webhook", uso: "Validação dos retornos da Meta" },
  ];
  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Segredos e integrações</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Os segredos ficam somente no servidor. Depois de salvos, o valor não é exibido nem devolvido
        para o navegador — é possível apenas substituí-lo ou testar a integração.
      </p>
      <div className="space-y-1">
        {segredos.map((s) => (
          <div
            key={s.nome}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium">{s.nome}</span>
              <p className="truncate text-xs text-muted-foreground">{s.uso}</p>
            </div>
            <code className="rounded bg-background/60 px-2 py-1 text-xs tracking-widest">
              ••••••••
            </code>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Use “Testar configuração” no cartão do WhatsApp para validar as credenciais sem expô-las.
      </p>
    </GlassCard>
  );
}

/** Referência rápida das permissões do módulo (gestão fica no RBAC). */
function PermissoesCard() {
  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Permissões do módulo</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        A concessão é feita no RBAC (Administração → Permissões). Perfis de corretiva e climatização
        não recebem acesso automático a este módulo.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {AGUA_PERMISSOES.map((p) => (
          <Badge key={p} variant="outline" className="text-[11px]">
            {AGUA_PERMISSAO_LABEL[p]}
          </Badge>
        ))}
      </div>
    </GlassCard>
  );
}
