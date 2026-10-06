import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  AtSign,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FileUp,
  Layers3,
  ListChecks,
  Mail,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
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
    () => selectedGroup?.items.filter((item) => selectedOsIds.includes(item.os)) ?? [],
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
    toast.success("Manual carregado para esta sessão.");
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
    setDraft(
      buildEvaluationEmailDraft(
        selectedGroup,
        [],
        signature,
        emailOverrides[selectedGroup.key] ?? "",
      ),
    );
  };

  const updateRecipient = (value: string) => {
    if (!selectedGroup || !draft) return;
    setEmailOverrides((current) => ({ ...current, [selectedGroup.key]: value }));
    setDraft({ ...draft, destinatario: value });
  };

  const openMailClient = () => {
    if (!draft) return;
    if (!draft.destinatario.trim()) {
      toast.warning("Informe o e-mail do solicitante antes de abrir o aplicativo de e-mail.");
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
    toast.success("Sessão limpa. Os dados temporários foram descartados.");
  };

  return (
    <PageShell
      title="Avaliação de Chamados"
      description="Prepare solicitações de avaliação a partir da planilha de pendências, com processamento local e fluxo direto para envio."
    >
      <div className="space-y-4">
        <GlassCard className="border-white/10 p-4 md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/10 text-primary">
                  <ClipboardCheck className="h-3.5 w-3.5" /> Central de avaliações
                </Badge>
                <Badge variant="outline" className="gap-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" /> Processamento local
                </Badge>
              </div>
              <h2 className="mt-3 text-lg font-bold tracking-tight md:text-xl">
                Importe, organize e prepare o e-mail de cada solicitante
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                A planilha é analisada no navegador, as OS são agrupadas por solicitante e o texto fica pronto para revisão e envio.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <input
                ref={workbookInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => void handleWorkbook(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                disabled={processing}
                onClick={() => workbookInputRef.current?.click()}
                className="h-10 gap-2 rounded-xl px-4"
              >
                <FileUp className="h-4 w-4" />
                {processing ? "Processando..." : workbookFile ? "Trocar planilha" : "Importar planilha"}
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
                variant="outline"
                onClick={() => manualInputRef.current?.click()}
                className="h-10 gap-2 rounded-xl border-white/10 px-4"
              >
                <BookOpen className="h-4 w-4" />
                {manualFile ? "Trocar manual" : "Anexar manual"}
              </Button>

              {(workbookFile || manualFile) && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearSession}
                  className="h-10 gap-2 rounded-xl px-3 text-muted-foreground"
                >
                  <RotateCcw className="h-4 w-4" /> Limpar
                </Button>
              )}
            </div>
          </div>

          {(workbookFile || manualFile) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-3 text-[11px] text-muted-foreground">
              {workbookFile && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="max-w-[260px] truncate">{workbookFile.name}</span>
                  <span>· {fileSizeLabel(workbookFile.size)}</span>
                </span>
              )}
              {manualFile && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-400" />
                  <span className="max-w-[260px] truncate">{manualFile.name}</span>
                  <span>· {fileSizeLabel(manualFile.size)}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-1.5 py-1.5 text-emerald-400/90">
                <ShieldCheck className="h-3.5 w-3.5" /> Dados mantidos somente durante esta sessão
              </span>
            </div>
          )}
        </GlassCard>

        {result ? (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <KpiCard icon={ListChecks} label="OS pendentes" value={result.pendingRows} tone="text-amber-400" />
              <KpiCard icon={Users} label="Solicitantes" value={groups.length} tone="text-blue-400" />
              <KpiCard icon={Layers3} label="Múltiplas OS" value={multiOsRequesters} tone="text-violet-400" />
              <KpiCard icon={AtSign} label="E-mails lidos" value={groupsWithEmail} tone="text-emerald-400" />
              <KpiCard icon={CheckCircle2} label="Duplicadas removidas" value={result.duplicatesRemoved} tone="text-primary" />
            </div>

            {!result.emailColumnDetected && (
              <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-3.5 py-2.5 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span className="text-muted-foreground">
                  <strong className="text-amber-200">E-mail não identificado na planilha.</strong>{" "}
                  Informe o destinatário no campo do e-mail antes de enviar.
                </span>
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
              <GlassCard className="border-white/10 p-3 xl:sticky xl:top-4 xl:self-start">
                <div className="flex items-center justify-between gap-2 px-1 pb-3">
                  <div>
                    <h3 className="text-sm font-bold">Solicitantes</h3>
                    <p className="text-[11px] text-muted-foreground">Selecione para revisar as OS.</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{filteredGroups.length}</Badge>
                </div>

                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nome, OS ou serviço"
                    className="h-9 border-white/10 bg-white/[0.03] pl-9 text-sm"
                  />
                </div>

                <div className="max-h-[700px] space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                  {filteredGroups.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => selectRequester(group)}
                      className={cn(
                        "w-full rounded-xl border px-2.5 py-2.5 text-left transition-all",
                        selectedRequesterKey === group.key
                          ? "border-primary/30 bg-primary/[0.08]"
                          : "border-transparent bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-muted-foreground">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold">{group.nome}</div>
                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {group.email || group.codigo || "E-mail não informado"}
                          </div>
                        </div>
                        <Badge
                          variant={selectedRequesterKey === group.key ? "outline" : "secondary"}
                          className="shrink-0 text-[9px]"
                        >
                          {group.items.length} OS
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </GlassCard>

              {selectedGroup && draft ? (
                <div className="space-y-4">
                  <GlassCard className="border-white/10 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-base font-bold">{selectedGroup.nome}</h2>
                          <Badge variant="outline" className="border-primary/20 bg-primary/[0.06] text-[10px] text-primary">
                            {selectedItems.length}/{selectedGroup.items.length} selecionadas
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Revise os chamados que devem constar na solicitação de avaliação.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={selectAllCurrent} className="h-8 border-white/10 px-3 text-xs">
                          Selecionar todas
                        </Button>
                        <Button size="sm" variant="ghost" onClick={clearCurrentSelection} className="h-8 px-3 text-xs">
                          Limpar
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {selectedGroup.items.map((item) => {
                        const checked = selectedOsIds.includes(item.os);
                        return (
                          <button
                            key={item.os}
                            type="button"
                            onClick={() => toggleOs(item.os)}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                              checked
                                ? "border-primary/20 bg-primary/[0.045]"
                                : "border-white/5 bg-white/[0.015] opacity-65 hover:opacity-100",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleOs(item.os)}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[11px] font-semibold text-primary">OS {item.os}</span>
                                {item.especialidade && (
                                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    {item.especialidade}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs font-medium leading-5">{item.descricao}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </GlassCard>

                  <GlassCard className="border-primary/15 bg-primary/[0.018] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-bold">
                          <Mail className="h-4 w-4 text-primary" /> E-mail para avaliação
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Confira o destinatário e o conteúdo antes de copiar ou abrir no Outlook.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2 border-white/10 px-3 text-xs"
                        onClick={() => rebuildDraft(selectedGroup, selectedOsIds)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Atualizar texto
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <FieldLabel label="Destinatário">
                        <div className="flex gap-2">
                          <Input
                            value={draft.destinatario}
                            onChange={(event) => updateRecipient(event.target.value)}
                            placeholder="nome.sobrenome@empresa.com"
                            className="h-9 border-white/10 bg-white/[0.035] text-sm"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0 border-white/10"
                            onClick={() => void copyText(draft.destinatario, "Destinatário")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </FieldLabel>

                      <FieldLabel label="Assunto">
                        <div className="flex gap-2">
                          <Input
                            value={draft.assunto}
                            onChange={(event) => setDraft({ ...draft, assunto: event.target.value })}
                            className="h-9 border-white/10 bg-white/[0.035] text-sm font-medium"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0 border-white/10"
                            onClick={() => void copyText(draft.assunto, "Assunto")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </FieldLabel>

                      <div className="md:col-span-2">
                        <FieldLabel label="Mensagem">
                          <textarea
                            value={draft.corpo}
                            onChange={(event) => setDraft({ ...draft, corpo: event.target.value })}
                            rows={12}
                            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                          />
                        </FieldLabel>
                      </div>

                      <div className="md:col-span-2 flex flex-col gap-2 border-t border-white/5 pt-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="w-full sm:max-w-md">
                          <FieldLabel label="Assinatura">
                            <Input
                              value={signature}
                              onChange={(event) => setSignature(event.target.value)}
                              className="h-9 border-white/10 bg-white/[0.035] text-sm"
                            />
                          </FieldLabel>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button size="sm" className="h-9 gap-2 px-3 text-xs" onClick={() => void copyText(draft.corpo, "Mensagem")}>
                            <Copy className="h-3.5 w-3.5" /> Copiar mensagem
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-2 border-white/10 px-3 text-xs"
                            onClick={() =>
                              void copyText(
                                `Para: ${draft.destinatario}\nAssunto: ${draft.assunto}\n\n${draft.corpo}`,
                                "E-mail completo",
                              )
                            }
                          >
                            <Mail className="h-3.5 w-3.5" /> Copiar completo
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 gap-2 border-white/10 px-3 text-xs" onClick={openMailClient}>
                            <ExternalLink className="h-3.5 w-3.5" /> Abrir no e-mail
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-2 border-white/10 px-3 text-xs"
                            disabled={!manualUrl}
                            onClick={() => manualUrl && window.open(manualUrl, "_blank", "noopener,noreferrer")}
                          >
                            <Paperclip className="h-3.5 w-3.5" /> Manual
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[10px] leading-4 text-muted-foreground">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      O manual permanece somente nesta sessão. O navegador não permite anexar o PDF automaticamente ao Outlook.
                    </div>
                  </GlassCard>
                </div>
              ) : (
                <GlassCard className="flex min-h-[320px] items-center justify-center border-dashed border-white/10 p-8 text-center">
                  <div className="max-w-sm">
                    <UserRound className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <h3 className="mt-3 text-sm font-bold">Selecione um solicitante</h3>
                    <p className="mt-1 text-xs text-muted-foreground">As OS e o e-mail correspondente serão exibidos aqui.</p>
                  </div>
                </GlassCard>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.015] px-3 py-2 text-[10px] text-muted-foreground">
              <span>
                Aba “{result.sheetName}” · {result.totalRows} linhas · {result.pendingRows} pendentes · {result.skippedRows} ignoradas
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400/90">
                <ShieldCheck className="h-3.5 w-3.5" /> Dados somente em memória
              </span>
            </div>
          </>
        ) : (
          <GlassCard className="border-dashed border-white/10 p-8 md:p-10">
            <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold">Importe a planilha de avaliações pendentes</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                O sistema identifica as OS, agrupa por solicitante e prepara uma única comunicação corporativa para cada pessoa.
              </p>
              <Button className="mt-4 h-9 gap-2 rounded-xl px-4" onClick={() => workbookInputRef.current?.click()}>
                <FileUp className="h-4 w-4" /> Selecionar planilha
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
  icon: LucideIcon;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <GlassCard className="flex items-center gap-3 border-white/10 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-white/[0.025]">
        <Icon className={cn("h-4 w-4", tone)} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-none tabular-nums">{value}</div>
        <div className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      </div>
    </GlassCard>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
