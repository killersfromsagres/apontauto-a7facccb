import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Layers3,
  ListChecks,
  Mail,
  Paperclip,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  buildEvaluationEmailDraft,
  parseEvaluationWorkbook,
  type EvaluationEmailDraft,
  type EvaluationImportResult,
  type RequesterGroup,
} from "@/features/avaliacao-chamados/lib/evaluation-workbook";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/avaliacao-chamados")({
  component: AvaliacaoChamadosPage,
});

const DEFAULT_SIGNATURE = "Equipe de Facilities | Grupo GPS";

function fileSizeLabel(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  } catch {
    toast.error("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
  }
}

function AvaliacaoChamadosPage() {
  const workbookInputRef = useRef<HTMLInputElement | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  const [workbookFile, setWorkbookFile] = useState<File | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [result, setResult] = useState<EvaluationImportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRequesterKey, setSelectedRequesterKey] = useState<string | null>(null);
  const [selectedOsIds, setSelectedOsIds] = useState<string[]>([]);
  const [signature, setSignature] = useState(DEFAULT_SIGNATURE);
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<EvaluationEmailDraft | null>(null);

  useEffect(() => {
    if (!manualFile) {
      setManualUrl("");
      return;
    }

    const url = URL.createObjectURL(manualFile);
    setManualUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [manualFile]);

  const groups = result?.groups ?? [];
  const selectedGroup = useMemo(
    () => groups.find((group) => group.key === selectedRequesterKey) ?? null,
    [groups, selectedRequesterKey],
  );

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return groups;

    return groups.filter((group) => {
      const haystack = [
        group.nome,
        group.codigo,
        group.email,
        ...group.items.flatMap((item) => [item.os, item.descricao, item.especialidade]),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return haystack.includes(query);
    });
  }, [groups, search]);

  const multiOsRequesters = useMemo(
    () => groups.filter((group) => group.items.length > 1).length,
    [groups],
  );

  const groupsWithEmail = useMemo(
    () => groups.filter((group) => Boolean(group.email)).length,
    [groups],
  );

  const selectedItems = useMemo(
    () =>
      selectedGroup?.items.filter((item) => selectedOsIds.includes(item.os)) ?? [],
    [selectedGroup, selectedOsIds],
  );

  const rebuildDraft = (group: RequesterGroup, osIds: string[]) => {
    const items = group.items.filter((item) => osIds.includes(item.os));
    setDraft(
      buildEvaluationEmailDraft(
        group,
        items,
        signature,
        emailOverrides[group.key] ?? "",
      ),
    );
  };

  const selectRequester = (group: RequesterGroup) => {
    const osIds = group.items.map((item) => item.os);
    setSelectedRequesterKey(group.key);
    setSelectedOsIds(osIds);
    rebuildDraft(group, osIds);
  };

  const handleWorkbook = async (file: File | null) => {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Envie uma planilha Excel (.xlsx ou .xls).");
      return;
    }

    setProcessing(true);
    try {
      const imported = await parseEvaluationWorkbook(file);
      setWorkbookFile(file);
      setResult(imported);
      setSearch("");
      setEmailOverrides({});

      const firstGroup = imported.groups[0] ?? null;
      if (firstGroup) {
        const osIds = firstGroup.items.map((item) => item.os);
        setSelectedRequesterKey(firstGroup.key);
        setSelectedOsIds(osIds);
        setDraft(buildEvaluationEmailDraft(firstGroup, firstGroup.items, signature));
      } else {
        setSelectedRequesterKey(null);
        setSelectedOsIds([]);
        setDraft(null);
      }

      toast.success(
        `${imported.pendingRows} chamado(s) pendente(s) organizados em ${imported.groups.length} solicitante(s).`,
      );
    } catch (error) {
      console.error("[Avaliação de Chamados] Falha na leitura local:", error);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível processar a planilha.",
      );
    } finally {
      setProcessing(false);
      if (workbookInputRef.current) workbookInputRef.current.value = "";
    }
  };

  const handleManual = (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("O manual deve estar em formato PDF.");
      return;
    }
    setManualFile(file);
    toast.success("Manual carregado somente nesta sessão.");
    if (manualInputRef.current) manualInputRef.current.value = "";
  };

  const toggleOs = (os: string) => {
    if (!selectedGroup) return;
    const next = selectedOsIds.includes(os)
      ? selectedOsIds.filter((item) => item !== os)
      : [...selectedOsIds, os];
    setSelectedOsIds(next);
    rebuildDraft(selectedGroup, next);
  };

  const selectAllCurrent = () => {
    if (!selectedGroup) return;
    const next = selectedGroup.items.map((item) => item.os);
    setSelectedOsIds(next);
    rebuildDraft(selectedGroup, next);
  };

  const clearCurrentSelection = () => {
    if (!selectedGroup) return;
    setSelectedOsIds([]);
    setDraft(buildEvaluationEmailDraft(selectedGroup, [], signature, emailOverrides[selectedGroup.key] ?? ""));
  };

  const updateRecipient = (value: string) => {
    if (!selectedGroup || !draft) return;
    setEmailOverrides((current) => ({ ...current, [selectedGroup.key]: value }));
    setDraft({ ...draft, destinatario: value });
  };

  const openMailClient = () => {
    if (!draft) return;
    if (!draft.destinatario.trim()) {
      toast.warning("Preencha o e-mail do solicitante antes de abrir o aplicativo de e-mail.");
      return;
    }

    const href = `mailto:${encodeURIComponent(draft.destinatario.trim())}?subject=${encodeURIComponent(
      draft.assunto,
    )}&body=${encodeURIComponent(draft.corpo)}`;
    window.location.href = href;
  };

  const clearSession = () => {
    setWorkbookFile(null);
    setManualFile(null);
    setResult(null);
    setSearch("");
    setSelectedRequesterKey(null);
    setSelectedOsIds([]);
    setEmailOverrides({});
    setDraft(null);
    toast.success("Sessão limpa. Nenhum dado ficou armazenado pelo módulo.");
  };

  return (
    <PageShell
      title="Avaliação de Chamados"
      description="Organize chamados pendentes por solicitante e prepare e-mails corporativos sem armazenar a planilha."
    >
      <div className="space-y-6">
        <GlassCard className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background/40 to-background/70">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_0.8fr] lg:p-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-1.5 bg-primary/15 text-primary border-primary/20" variant="outline">
                  <Sparkles className="h-3.5 w-3.5" /> Organização inteligente local
                </Badge>
                <Badge className="gap-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-400" variant="outline">
                  <ShieldCheck className="h-3.5 w-3.5" /> Sem banco de dados
                </Badge>
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                  Da planilha para o e-mail em poucos cliques
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                  O arquivo é lido no seu navegador, as OS são agrupadas automaticamente por solicitante e o módulo cria um texto corporativo com todos os chamados pendentes daquela pessoa.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  ref={workbookInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => void handleWorkbook(event.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  size="lg"
                  disabled={processing}
                  onClick={() => workbookInputRef.current?.click()}
                  className="h-14 justify-start gap-3 rounded-2xl px-5 shadow-lg shadow-primary/10"
                >
                  <UploadCloud className="h-5 w-5" />
                  <span className="text-left">
                    <span className="block font-bold">{processing ? "Processando planilha..." : "Anexar planilha de pendências"}</span>
                    <span className="block text-[11px] font-normal opacity-75">Excel .xlsx ou .xls</span>
                  </span>
                </Button>

                <input
                  ref={manualInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(event) => handleManual(event.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => manualInputRef.current?.click()}
                  className="h-14 justify-start gap-3 rounded-2xl border-white/10 bg-white/5 px-5"
                >
                  <Paperclip className="h-5 w-5 text-primary" />
                  <span className="text-left">
                    <span className="block font-bold">Anexar manual de avaliação</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">PDF disponível apenas nesta sessão</span>
                  </span>
                </Button>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {workbookFile && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                    {workbookFile.name} · {fileSizeLabel(workbookFile.size)}
                  </span>
                )}
                {manualFile && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <FileText className="h-3.5 w-3.5 text-blue-400" />
                    {manualFile.name} · {fileSizeLabel(manualFile.size)}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/10 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold">Privacidade por padrão</div>
                  <div className="text-xs text-muted-foreground">Processamento temporário no navegador</div>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm text-muted-foreground">
                <p>• O módulo não envia a planilha para Supabase, API ou IA.</p>
                <p>• Não grava solicitantes, OS, e-mails ou histórico no localStorage.</p>
                <p>• Ao substituir a planilha ou recarregar a página, os dados temporários são descartados.</p>
              </div>
              {(workbookFile || manualFile) && (
                <Button variant="ghost" className="mt-4 w-full gap-2" onClick={clearSession}>
                  <RotateCcw className="h-4 w-4" /> Limpar sessão
                </Button>
              )}
            </div>
          </div>
        </GlassCard>

        {result ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard icon={ListChecks} label="OS pendentes" value={result.pendingRows} tone="text-amber-400" />
              <KpiCard icon={Users} label="Solicitantes" value={groups.length} tone="text-blue-400" />
              <KpiCard icon={Layers3} label="Com múltiplas OS" value={multiOsRequesters} tone="text-purple-400" />
              <KpiCard icon={AtSign} label="E-mails identificados" value={groupsWithEmail} tone="text-emerald-400" />
              <KpiCard icon={CheckCircle2} label="Duplicidades removidas" value={result.duplicatesRemoved} tone="text-primary" />
            </div>

            {!result.emailColumnDetected && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <div className="font-semibold text-amber-200">A planilha não possui coluna de e-mail.</div>
                  <div className="mt-1 text-muted-foreground">
                    O módulo deixou o destinatário editável para você colar o e-mail corporativo. Nenhum endereço é inventado automaticamente.
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <GlassCard className="p-4 border-white/10 xl:sticky xl:top-4 xl:self-start">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Solicitantes</h3>
                    <p className="text-xs text-muted-foreground">Um grupo por pessoa, sem repetir OS.</p>
                  </div>
                  <Badge variant="secondary">{filteredGroups.length}</Badge>
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar nome, OS ou serviço..."
                    className="pl-9 bg-white/5 border-white/10"
                  />
                </div>

                <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {filteredGroups.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => selectRequester(group)}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition-all",
                        selectedRequesterKey === group.key
                          ? "border-primary/30 bg-primary/10 shadow-lg shadow-primary/5"
                          : "border-white/5 bg-white/[0.025] hover:border-white/10 hover:bg-white/5",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 font-bold text-primary">
                          {group.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{group.nome}</div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {group.email || "E-mail não informado na planilha"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge variant="secondary" className="text-[10px]">{group.items.length} OS</Badge>
                            {group.codigo && <Badge variant="outline" className="text-[10px] border-white/10">{group.codigo}</Badge>}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </GlassCard>

              {selectedGroup && draft ? (
                <div className="space-y-6">
                  <GlassCard className="p-5 md:p-6 border-white/10">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-bold">{selectedGroup.nome}</h2>
                          <Badge className="bg-primary/10 text-primary border-primary/20" variant="outline">
                            {selectedItems.length}/{selectedGroup.items.length} selecionadas
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Selecione exatamente as OS que devem entrar no e-mail desta pessoa.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={selectAllCurrent} className="border-white/10">
                          Selecionar todas
                        </Button>
                        <Button size="sm" variant="ghost" onClick={clearCurrentSelection}>
                          Limpar seleção
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {selectedGroup.items.map((item) => {
                        const checked = selectedOsIds.includes(item.os);
                        return (
                          <button
                            key={item.os}
                            type="button"
                            onClick={() => toggleOs(item.os)}
                            className={cn(
                              "flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all",
                              checked
                                ? "border-primary/25 bg-primary/[0.055]"
                                : "border-white/5 bg-white/[0.02] opacity-70 hover:opacity-100",
                            )}
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleOs(item.os)} onClick={(event) => event.stopPropagation()} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="font-mono text-[11px] border-white/10">OS {item.os}</Badge>
                                {item.especialidade && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.especialidade}</span>}
                              </div>
                              <div className="mt-2 text-sm font-semibold leading-5">{item.descricao}</div>
                              {(item.statusAvaliacao || item.estado) && (
                                <div className="mt-2 text-[11px] text-muted-foreground">
                                  {item.statusAvaliacao || item.estado}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </GlassCard>

                  <GlassCard className="p-5 md:p-6 border-primary/20 bg-primary/[0.025]">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-lg font-bold">
                          <Mail className="h-5 w-5 text-primary" /> E-mail corporativo pronto
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Revise, ajuste o destinatário se necessário e copie para o seu Outlook/e-mail corporativo.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        className="gap-2 border-white/10"
                        onClick={() => rebuildDraft(selectedGroup, selectedOsIds)}
                      >
                        <Sparkles className="h-4 w-4" /> Regenerar texto
                      </Button>
                    </div>

                    <div className="mt-6 grid gap-4">
                      <FieldLabel label="Destinatário">
                        <div className="flex gap-2">
                          <Input
                            value={draft.destinatario}
                            onChange={(event) => updateRecipient(event.target.value)}
                            placeholder="nome.sobrenome@empresa.com"
                            className="bg-white/5 border-white/10"
                          />
                          <Button variant="outline" size="icon" className="shrink-0 border-white/10" onClick={() => void copyText(draft.destinatario, "Destinatário")}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </FieldLabel>

                      <FieldLabel label="Assunto">
                        <div className="flex gap-2">
                          <Input
                            value={draft.assunto}
                            onChange={(event) => setDraft({ ...draft, assunto: event.target.value })}
                            className="bg-white/5 border-white/10 font-semibold"
                          />
                          <Button variant="outline" size="icon" className="shrink-0 border-white/10" onClick={() => void copyText(draft.assunto, "Assunto")}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </FieldLabel>

                      <FieldLabel label="Corpo do e-mail">
                        <textarea
                          value={draft.corpo}
                          onChange={(event) => setDraft({ ...draft, corpo: event.target.value })}
                          rows={18}
                          className="w-full resize-y rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                        />
                      </FieldLabel>

                      <FieldLabel label="Assinatura usada ao regenerar">
                        <Input
                          value={signature}
                          onChange={(event) => setSignature(event.target.value)}
                          className="bg-white/5 border-white/10"
                        />
                      </FieldLabel>
                    </div>

                    <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <Button className="gap-2" onClick={() => void copyText(draft.corpo, "Corpo do e-mail")}>
                        <Copy className="h-4 w-4" /> Copiar corpo
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2 border-white/10"
                        onClick={() =>
                          void copyText(
                            `Para: ${draft.destinatario}\nAssunto: ${draft.assunto}\n\n${draft.corpo}`,
                            "E-mail completo",
                          )
                        }
                      >
                        <Mail className="h-4 w-4" /> Copiar e-mail completo
                      </Button>
                      <Button variant="outline" className="gap-2 border-white/10" onClick={openMailClient}>
                        <ExternalLink className="h-4 w-4" /> Abrir no e-mail
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2 border-white/10"
                        disabled={!manualUrl}
                        onClick={() => manualUrl && window.open(manualUrl, "_blank", "noopener,noreferrer")}
                      >
                        <FileText className="h-4 w-4" /> Abrir manual
                      </Button>
                    </div>

                    <div className="mt-5 rounded-2xl border border-blue-500/15 bg-blue-500/[0.06] p-4 text-xs leading-5 text-muted-foreground">
                      <strong className="text-blue-300">Anexo:</strong> navegadores não permitem inserir automaticamente um PDF no Outlook por segurança. O módulo mantém o manual carregado nesta sessão para você abrir e anexar ao e-mail manualmente.
                    </div>
                  </GlassCard>
                </div>
              ) : (
                <GlassCard className="flex min-h-[420px] items-center justify-center p-8 text-center border-dashed border-white/10">
                  <div className="max-w-sm">
                    <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
                    <h3 className="mt-4 font-bold">Nenhum solicitante selecionado</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Selecione uma pessoa na lista para montar o e-mail com as respectivas OS.</p>
                  </div>
                </GlassCard>
              )}
            </div>

            <GlassCard className="p-5 border-white/10">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-bold">Leitura da planilha concluída</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Aba “{result.sheetName}” · {result.totalRows} linha(s) lida(s) · {result.pendingRows} OS pendente(s) válida(s) · {result.skippedRows} linha(s) ignorada(s).
                  </div>
                </div>
                <Badge variant="outline" className="w-fit gap-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" /> Dados somente em memória
                </Badge>
              </div>
            </GlassCard>
          </>
        ) : (
          <GlassCard className="border-dashed border-white/10 p-10 md:p-14">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
                <FileSpreadsheet className="h-8 w-8" />
              </div>
              <h3 className="mt-5 text-xl font-bold">Anexe a planilha de chamados não avaliados</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                O sistema reconhece colunas como Número OS, Denominação OS, Solicitante e Denominação do Solicitante, agrupa os chamados por pessoa e prepara um único e-mail por solicitante.
              </p>
              <Button className="mt-6 gap-2 rounded-full px-6" onClick={() => workbookInputRef.current?.click()}>
                <UploadCloud className="h-4 w-4" /> Selecionar planilha
              </Button>
            </div>
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <GlassCard className="p-4 border-white/10">
      <Icon className={cn("h-5 w-5", tone)} />
      <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
    </GlassCard>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
