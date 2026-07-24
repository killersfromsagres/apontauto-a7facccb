import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Snowflake, Plus, Trash2, Users, Copy, Download, Upload, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PageShell } from "@/components/page-shell";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/_authenticated/apontamento-os")({
  head: () => ({
    meta: [
      { title: "Apontamento OS · Apont Auto" },
      { name: "description", content: "Prepare lotes de apontamento de OS para a extensão Prisma4." },
      { property: "og:title", content: "Apontamento OS · Apont Auto" },
      { property: "og:description", content: "Cadastro de colaboradores, equipes e geração de lotes de OS." },
    ],
  }),
  component: ApontamentoOSPage,
});

// ---------- Tipos ----------
type Colaborador = { id: string; nome: string };
type Equipe = { id: string; nome: string; colaboradores: Colaborador[] };
type Categoria = "refrigeracao" | "geral";
type StatusItem = "concluido" | "erro" | "cancelado" | "gerado";
type ItemHistorico = {
  id: string;
  timestamp: string;
  categoria: Categoria;
  totalOS: number;
  sucesso: number;
  erro: number;
  cancelado: number;
  detalhes: Array<{ os: string; status: StatusItem; etapa?: string; mensagem?: string }>;
};
type Config = { categoriaPadrao: Categoria; tempoTrabalhoHoras: number; jornadaInicio: number; jornadaFim: number };

// ---------- Storage helpers ----------
const K = {
  colabs: "apontamentoOS:colaboradores",
  equipes: "apontamentoOS:equipes",
  hist: "apontamentoOS:historico",
  config: "apontamentoOS:config",
} as const;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

const DEFAULT_CONFIG: Config = { categoriaPadrao: "refrigeracao", tempoTrabalhoHoras: 1, jornadaInicio: 8, jornadaFim: 17 };

// ---------- Agendamento ----------
function ehDiaUtil(d: Date) { const w = d.getDay(); return w !== 0 && w !== 6; }
function proxDiaUtil(d: Date) { const n = new Date(d); n.setDate(n.getDate() + 1); while (!ehDiaUtil(n)) n.setDate(n.getDate() + 1); return n; }
function pad2(n: number) { return String(n).padStart(2, "0"); }
function fmtData(d: Date) { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; }
function fmtHM(min: number) { return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`; }

function gerarAgendamento(osList: string[], inicio: Date, horas: number, jIni: number, jFim: number) {
  const jIniMin = jIni * 60, jFimMin = jFim * 60;
  let dia = new Date(inicio);
  if (!ehDiaUtil(dia)) dia = proxDiaUtil(dia);
  let cur = dia.getHours() * 60 + dia.getMinutes();
  if (cur < jIniMin || cur >= jFimMin) cur = jIniMin;
  const dur = Math.max(1, Math.round(horas * 60));
  const out: Array<{ os: string; inicio: string; fim: string }> = [];
  for (const os of osList) {
    if (cur >= jFimMin) { dia = proxDiaUtil(dia); cur = jIniMin; }
    const ini = `${fmtData(dia)} ${fmtHM(cur)}`;
    const fimMin = cur + dur;
    const fim = `${fmtData(dia)} ${fmtHM(Math.min(fimMin, jFimMin))}`;
    out.push({ os, inicio: ini, fim });
    cur = fimMin;
  }
  return out;
}

function parseOSInput(txt: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of txt.split(/[\s,;\n\r\t]+/)) {
    const t = raw.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

// ---------- Componente principal ----------
function ApontamentoOSPage() {
  const [colabs, setColabs] = useState<Colaborador[]>(() => loadJSON<Colaborador[]>(K.colabs, []));
  const [equipes, setEquipes] = useState<Equipe[]>(() => loadJSON<Equipe[]>(K.equipes, []));
  const [historico, setHistorico] = useState<ItemHistorico[]>(() => loadJSON<ItemHistorico[]>(K.hist, []));
  const [config, setConfig] = useState<Config>(() => ({ ...DEFAULT_CONFIG, ...loadJSON<Partial<Config>>(K.config, {}) }));

  useEffect(() => saveJSON(K.colabs, colabs), [colabs]);
  useEffect(() => saveJSON(K.equipes, equipes), [equipes]);
  useEffect(() => saveJSON(K.hist, historico), [historico]);
  useEffect(() => saveJSON(K.config, config), [config]);

  return (
    <PageShell title="Apontamento OS" description="Cadastro de colaboradores, equipes e geração de lotes prontos para a extensão do Prisma4.">
      <div className="grid gap-4 md:gap-6">
        <ColaboradoresCard colabs={colabs} setColabs={setColabs} equipes={equipes} setEquipes={setEquipes} />
        <EquipesCard colabs={colabs} equipes={equipes} setEquipes={setEquipes} />
        <NovoLoteCard
          colabs={colabs}
          equipes={equipes}
          config={config}
          setConfig={setConfig}
          onGerado={(item) => setHistorico((h) => [item, ...h])}
        />
        <AutomacaoPlaywrightCard />
        <HistoricoCard historico={historico} setHistorico={setHistorico} />
      </div>
    </PageShell>
  );
}

// ---------- Extensão do navegador ----------
function ExtensaoCard() {
  const [instalada, setInstalada] = useState<boolean | null>(null);

  useEffect(() => {
    const meta = document.querySelector('meta[name="apontauto-extension"]');
    if (meta || document.documentElement.dataset.apontautoExtension) { setInstalada(true); return; }
    const reqId = Math.random().toString(36).slice(2);
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { source?: string; type?: string; requestId?: string } | null;
      if (d?.source === "apontauto-extension" && d.type === "pong" && d.requestId === reqId) setInstalada(true);
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "apontauto-panel", type: "ping", requestId: reqId }, "*");
    const t = setTimeout(() => setInstalada((v) => v ?? false), 1200);
    return () => { clearTimeout(t); window.removeEventListener("message", onMsg); };
  }, []);

  const baixar = () => {
    fetch("/apontauto-prisma4-extension.zip")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "apontauto-prisma4-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success("Download iniciado.");
      })
      .catch((e) => toast.error(`Falha ao baixar: ${e.message}`));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" /> Extensão do navegador (Chrome/Edge)</CardTitle>
            <CardDescription>Automação 100% pelo navegador. Envie o lote e execute direto no Prisma4 — sem CMD nem Node.js.</CardDescription>
          </div>
          {instalada !== null && (
            <Badge variant={instalada ? "default" : "outline"} className={instalada ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20" : ""}>
              {instalada ? "Extensão detectada" : "Extensão não instalada"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={baixar} className="gap-2"><Download className="h-4 w-4" /> Baixar extensão (.zip)</Button>
        </div>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Descompacte o ZIP em uma pasta local.</li>
          <li>Abra <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">chrome://extensions</code> (ou <code className="font-mono text-xs">edge://extensions</code>).</li>
          <li>Ative <b>Modo desenvolvedor</b> e clique em <b>Carregar sem compactação</b>. Selecione a pasta descompactada.</li>
          <li>Clique no ícone da extensão, informe seu <b>usuário/senha do Prisma4</b> e salve.</li>
          <li>Recarregue esta página, monte o lote acima e clique em <b>Enviar para a extensão</b>.</li>
          <li>Abra o Prisma4 (a extensão faz login automaticamente) e clique em <b>Executar próximo</b> no overlay verde.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          A extensão replica o fluxo antigo do Playwright/CMD: número da OS → estado "Concluído" → mão-de-obra por técnico/data/horário → procedimentos via data cabeçalho → medições MED=0 (refrigeração) → salvar. Nada roda em servidor — as credenciais ficam só no seu navegador.
        </p>
      </CardContent>
    </Card>
  );
}


// ---------- Colaboradores ----------
function ColaboradoresCard({
  colabs, setColabs, equipes, setEquipes,
}: {
  colabs: Colaborador[]; setColabs: (u: (c: Colaborador[]) => Colaborador[]) => void;
  equipes: Equipe[]; setEquipes: (u: (e: Equipe[]) => Equipe[]) => void;
}) {
  const [matricula, setMatricula] = useState("");
  const [nome, setNome] = useState("");

  const add = () => {
    const m = matricula.trim(); const n = nome.trim();
    if (!m || !n) { toast.error("Matrícula e nome são obrigatórios."); return; }
    if (colabs.some((c) => c.id === m)) { toast.error("Já existe um colaborador com essa matrícula."); return; }
    setColabs((c) => [...c, { id: m, nome: n }]);
    setMatricula(""); setNome("");
    toast.success("Colaborador cadastrado.");
  };

  const remove = (id: string) => {
    setColabs((c) => c.filter((x) => x.id !== id));
    setEquipes((es) => es.map((e) => ({ ...e, colaboradores: e.colaboradores.filter((c) => c.id !== id) })));
  };

  const editNome = (id: string, novo: string) => {
    setColabs((c) => c.map((x) => (x.id === id ? { ...x, nome: novo } : x)));
    setEquipes((es) => es.map((e) => ({ ...e, colaboradores: e.colaboradores.map((c) => c.id === id ? { ...c, nome: novo } : c) })));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Colaboradores</CardTitle>
        <CardDescription>Matrícula é o ID usado no Prisma4 e identifica o colaborador de forma única.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="mat">Matrícula</Label>
            <Input id="mat" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Ex.: 969717" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="flex items-end">
            <Button onClick={add} className="w-full gap-2 sm:w-auto"><Plus className="h-4 w-4" /> Adicionar</Button>
          </div>
        </div>

        {colabs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum colaborador cadastrado ainda.</p>
        ) : (
          <div className="rounded-lg border">
            <div className="grid grid-cols-[120px_1fr_auto] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Matrícula</span><span>Nome</span><span className="sr-only">Ações</span>
            </div>
            <div className="divide-y">
              {colabs.map((c) => (
                <div key={c.id} className="grid grid-cols-[120px_1fr_auto] items-center gap-2 px-3 py-2">
                  <code className="font-mono text-sm">{c.id}</code>
                  <Input value={c.nome} onChange={(e) => editNome(c.id, e.target.value)} className="h-8" />
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)} aria-label="Remover"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Equipes ----------
function EquipesCard({
  colabs, equipes, setEquipes,
}: {
  colabs: Colaborador[]; equipes: Equipe[]; setEquipes: (u: (e: Equipe[]) => Equipe[]) => void;
}) {
  const [nome, setNome] = useState("");
  const [selIds, setSelIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setSelIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const criar = () => {
    const n = nome.trim();
    if (!n) { toast.error("Nome da equipe é obrigatório."); return; }
    if (selIds.size === 0) { toast.error("Selecione ao menos um colaborador."); return; }
    const sel = colabs.filter((c) => selIds.has(c.id));
    setEquipes((es) => [...es, { id: uid(), nome: n, colaboradores: sel }]);
    setNome(""); setSelIds(new Set());
    toast.success("Equipe criada.");
  };

  const remover = (id: string) => setEquipes((es) => es.filter((e) => e.id !== id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Equipes</CardTitle>
        <CardDescription>Agrupam colaboradores já cadastrados. Selecionar uma equipe preenche as matrículas automaticamente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="eqnome">Nome da equipe</Label>
            <Input id="eqnome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Turma A" />
          </div>
          <div className="flex items-end">
            <Button onClick={criar} className="gap-2"><Plus className="h-4 w-4" /> Criar equipe</Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Colaboradores</Label>
          {colabs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cadastre colaboradores primeiro.</p>
          ) : (
            <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 md:grid-cols-3">
              {colabs.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <Checkbox checked={selIds.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  <span className="truncate text-sm"><code className="mr-1 font-mono text-xs text-muted-foreground">{c.id}</code>{c.nome}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {equipes.length > 0 && (
          <div className="space-y-2">
            <Label>Equipes salvas</Label>
            <div className="grid gap-2">
              {equipes.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium">{e.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.colaboradores.map((c) => `${c.id} · ${c.nome}`).join("  •  ")}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remover(e.id)} aria-label="Remover"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Novo lote ----------
function NovoLoteCard({
  colabs, equipes, config, setConfig, onGerado,
}: {
  colabs: Colaborador[]; equipes: Equipe[]; config: Config;
  setConfig: (u: (c: Config) => Config) => void;
  onGerado: (i: ItemHistorico) => void;
}) {
  const [equipeId, setEquipeId] = useState<string>("");
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [categoria, setCategoria] = useState<Categoria>(config.categoriaPadrao);
  const [osTexto, setOsTexto] = useState("");
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date(); d.setHours(config.jornadaInicio, 0, 0, 0);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  });
  const [horas, setHoras] = useState<number>(config.tempoTrabalhoHoras);

  const osList = useMemo(() => parseOSInput(osTexto), [osTexto]);
  const colabIds = useMemo(() => Array.from(selIds), [selIds]);
  const agendamento = useMemo(() => {
    if (!dataInicio || osList.length === 0) return [];
    const d = new Date(dataInicio);
    if (Number.isNaN(d.getTime())) return [];
    return gerarAgendamento(osList, d, horas, config.jornadaInicio, config.jornadaFim);
  }, [osList, dataInicio, horas, config.jornadaInicio, config.jornadaFim]);

  const aplicarEquipe = (id: string) => {
    setEquipeId(id);
    const e = equipes.find((x) => x.id === id);
    if (!e) return;
    setSelIds(new Set(e.colaboradores.map((c) => c.id)));
  };

  const toggle = (id: string) => setSelIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const gerarPayload = () => ({
    colaboradores: colabIds,
    categoria,
    dataInicio,
    tempoTrabalhoHoras: horas,
    os: osList,
  });

  const registrar = (): ItemHistorico => {
    const item: ItemHistorico = {
      id: uid(),
      timestamp: new Date().toISOString(),
      categoria,
      totalOS: osList.length,
      sucesso: 0, erro: 0, cancelado: 0,
      detalhes: osList.map((os) => ({ os, status: "gerado" as StatusItem })),
    };
    onGerado(item);
    return item;
  };

  const gerarECopiar = async () => {
    if (colabIds.length === 0) { toast.error("Selecione ao menos um colaborador."); return; }
    if (osList.length === 0) { toast.error("Informe pelo menos uma OS."); return; }
    const payload = gerarPayload();
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      registrar();
      toast.success("Lote gerado e copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar. Use o botão Baixar JSON.");
    }
  };

  const gerarEBaixar = () => {
    if (colabIds.length === 0) { toast.error("Selecione ao menos um colaborador."); return; }
    if (osList.length === 0) { toast.error("Informe pelo menos uma OS."); return; }
    const payload = gerarPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `apontamento-os-${new Date().toISOString().slice(0, 10)}.json`);
    registrar();
    toast.success("Lote gerado e arquivo baixado.");
  };

  const ultimo = agendamento[agendamento.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Snowflake className="h-5 w-5 text-primary" /> Novo lote de apontamento</CardTitle>
        <CardDescription>Monta o JSON pronto para colar na extensão do Prisma4. Não executa automação aqui.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Equipe (auto-preenche colaboradores)</Label>
            <Select value={equipeId} onValueChange={aplicarEquipe}>
              <SelectTrigger><SelectValue placeholder="Selecionar equipe salva…" /></SelectTrigger>
              <SelectContent>
                {equipes.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma equipe salva</div>}
                {equipes.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={(v) => { setCategoria(v as Categoria); setConfig((c) => ({ ...c, categoriaPadrao: v as Categoria })); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="refrigeracao">Refrigeração</SelectItem>
                <SelectItem value="geral">Geral</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Colaboradores selecionados</Label>
          {colabs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cadastre colaboradores primeiro.</p>
          ) : (
            <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 md:grid-cols-3">
              {colabs.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <Checkbox checked={selIds.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  <span className="truncate text-sm"><code className="mr-1 font-mono text-xs text-muted-foreground">{c.id}</code>{c.nome}</span>
                </label>
              ))}
            </div>
          )}
          {colabIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {colabIds.map((id) => <Badge key={id} variant="secondary" className="font-mono">{id}</Badge>)}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="os">Ordens de Serviço</Label>
            <span className="text-xs text-muted-foreground">{osList.length} OS únicas</span>
          </div>
          <Textarea id="os" value={osTexto} onChange={(e) => setOsTexto(e.target.value)} placeholder="Cole os números separados por vírgula, espaço ou quebra de linha" className="min-h-[110px] font-mono text-sm" />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="dini">Data/hora de início</Label>
            <Input id="dini" type="datetime-local" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dur">Horas por OS</Label>
            <Input id="dur" type="number" min={0.25} step={0.25} value={horas} onChange={(e) => { const v = Number(e.target.value) || 1; setHoras(v); setConfig((c) => ({ ...c, tempoTrabalhoHoras: v })); }} />
          </div>
          <div className="space-y-1">
            <Label>Jornada (h)</Label>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={23} value={config.jornadaInicio} onChange={(e) => setConfig((c) => ({ ...c, jornadaInicio: Math.max(0, Math.min(23, Number(e.target.value) || 0)) }))} />
              <span className="text-muted-foreground">–</span>
              <Input type="number" min={1} max={24} value={config.jornadaFim} onChange={(e) => setConfig((c) => ({ ...c, jornadaFim: Math.max(1, Math.min(24, Number(e.target.value) || 17)) }))} />
            </div>
          </div>
        </div>

        {agendamento.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Prévia do agendamento</div>
              <div className="text-xs text-muted-foreground">
                {agendamento.length} OS · término previsto <span className="font-mono">{ultimo?.fim}</span>
              </div>
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-2">OS</th><th className="py-1 pr-2">Início</th><th className="py-1">Fim</th></tr>
                </thead>
                <tbody className="font-mono">
                  {agendamento.map((r, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="py-1 pr-2">{r.os}</td><td className="py-1 pr-2">{r.inicio}</td><td className="py-1">{r.fim}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={gerarECopiar} className="gap-2"><Copy className="h-4 w-4" /> Gerar e copiar JSON</Button>
          <Button variant="outline" onClick={gerarEBaixar} className="gap-2"><Download className="h-4 w-4" /> Gerar e baixar JSON</Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              if (colabIds.length === 0) { toast.error("Selecione ao menos um colaborador."); return; }
              if (osList.length === 0) { toast.error("Informe pelo menos uma OS."); return; }
              const d = new Date(dataInicio);
              if (Number.isNaN(d.getTime())) { toast.error("Data/hora inválida."); return; }
              const inicio = `${fmtData(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
              const txt =
                `inicio: ${inicio}\n\n[LOTE]\ncategoria: ${categoria}\ntecnicos: ${colabIds.join(", ")}\nos: ${osList.join(",")}\n`;
              downloadBlob(new Blob([txt], { type: "text/plain;charset=utf-8" }), "entradas-os.txt");
              registrar();
              toast.success("entradas-os.txt gerado.");
            }}
          >
            <FileText className="h-4 w-4" /> Baixar entradas-os.txt
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Histórico ----------
function HistoricoCard({
  historico, setHistorico,
}: {
  historico: ItemHistorico[]; setHistorico: (u: (h: ItemHistorico[]) => ItemHistorico[]) => void;
}) {
  const [expandido, setExpandido] = useState<string | null>(null);

  const importar = async (file: File) => {
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      const arr: ItemHistorico[] = Array.isArray(data) ? data : (Array.isArray(data.historico) ? data.historico : [data]);
      setHistorico((h) => {
        const map = new Map(h.map((x) => [x.id, x]));
        for (const it of arr) {
          if (!it?.id) continue;
          map.set(it.id, { ...map.get(it.id), ...it });
        }
        return Array.from(map.values()).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      });
      toast.success("Histórico importado.");
    } catch {
      toast.error("Arquivo inválido.");
    }
  };

  const limpar = () => {
    if (!confirm("Limpar todo o histórico local desta aba?")) return;
    setHistorico(() => []);
    toast.success("Histórico limpo.");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Histórico</CardTitle>
            <CardDescription>Registro dos lotes gerados. Importe atualizações da extensão para consolidar status.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex">
              <input type="file" accept="application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.currentTarget.value = ""; }} />
              <Button asChild variant="outline" size="sm" className="gap-2"><span><Upload className="h-4 w-4" /> Importar .json</span></Button>
            </label>
            <Button variant="ghost" size="sm" onClick={limpar} disabled={historico.length === 0} className="gap-2 text-destructive"><Trash2 className="h-4 w-4" /> Limpar</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lote gerado ainda.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {historico.map((h) => {
              const isOpen = expandido === h.id;
              const d = new Date(h.timestamp);
              return (
                <div key={h.id}>
                  <button type="button" onClick={() => setExpandido(isOpen ? null : h.id)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-mono text-xs">{d.toLocaleString("pt-BR", { hour12: false })}</span>
                    <Badge variant="secondary" className="capitalize">{h.categoria}</Badge>
                    <span className="text-sm">{h.totalOS} OS</span>
                    <div className="ml-auto flex gap-1 text-xs">
                      {h.sucesso > 0 && <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">✓ {h.sucesso}</Badge>}
                      {h.erro > 0 && <Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/20">! {h.erro}</Badge>}
                      {h.cancelado > 0 && <Badge variant="outline">– {h.cancelado}</Badge>}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-muted/20 px-3 py-2">
                      <div className="max-h-56 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="text-left text-muted-foreground">
                            <tr><th className="py-1 pr-2">OS</th><th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Etapa</th><th className="py-1">Mensagem</th></tr>
                          </thead>
                          <tbody className="font-mono">
                            {h.detalhes.map((d, i) => (
                              <tr key={i} className="border-t border-border/50">
                                <td className="py-1 pr-2">{d.os}</td>
                                <td className="py-1 pr-2">{d.status}</td>
                                <td className="py-1 pr-2">{d.etapa ?? "—"}</td>
                                <td className="py-1">{d.mensagem ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
