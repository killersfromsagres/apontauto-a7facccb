import { useConfirm } from "@/components/ui/use-confirm";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Archive,
  BadgeCheck,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  HardHat,
  History,
  Loader2,
  Paperclip,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  deleteAttachment,
  listAttachments,
  promoteAttachment,
  signedUrl,
  uploadAttachment,
  legalAttachmentMime,
  type LegalAttachment,
  type LegalAttachmentMode,
  type LegalItem,
} from "@/lib/legal-items";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
const MAX_PDF_MB = 25;
const MAX_IMAGE_MB = 10;

type UploadMode = LegalAttachmentMode;

function fileSize(bytes: number | null) {
  if (!bytes) return "Tamanho não informado";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FileIcon({ type }: { type: string | null }) {
  return type?.startsWith("image/") ? (
    <FileImage className="h-5 w-5" />
  ) : (
    <FileText className="h-5 w-5" />
  );
}

function validateFiles(files: File[], mode: UploadMode): string | null {
  if (files.length === 0) return "Selecione ao menos um arquivo.";
  if (mode === "current" && files.length > 1) {
    return "Para o certificado atual, selecione apenas um arquivo por vez.";
  }
  for (const file of files) {
    const mimeType = legalAttachmentMime(file);
    if (!mimeType) {
      return `Formato não permitido em “${file.name}”. Envie PDF, JPG ou PNG.`;
    }
    const maxMb = mimeType === "application/pdf" ? MAX_PDF_MB : MAX_IMAGE_MB;
    if (file.size > maxMb * 1024 * 1024) {
      return `“${file.name}” ultrapassa o limite de ${maxMb} MB.`;
    }
  }
  return null;
}

export function LegalAttachmentsModal({
  item,
  open,
  onOpenChange,
}: {
  item: LegalItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { confirmar, dialogo } = useConfirm();
  const currentInputRef = useRef<HTMLInputElement>(null);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMode, setUploadingMode] = useState<UploadMode | null>(null);
  const [draggingMode, setDraggingMode] = useState<UploadMode | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const {
    data: attachments = [],
    isLoading,
    isError,
    error: attachmentsError,
    refetch,
  } = useQuery({
    queryKey: ["legal-attachments", item?.id],
    queryFn: () => (item ? listAttachments(item.id) : Promise.resolve([])),
    enabled: Boolean(item && open),
    retry: 1,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const currentAttachment = useMemo(
    () => attachments.find((attachment) => attachment.isCurrent) ?? null,
    [attachments],
  );
  const previousAttachments = useMemo(
    () => attachments.filter((attachment) => !attachment.isCurrent),
    [attachments],
  );

  useEffect(() => {
    if (!open) {
      if (currentInputRef.current) currentInputRef.current.value = "";
      if (historyInputRef.current) historyInputRef.current.value = "";
      setDraggingMode(null);
      setUploadingMode(null);
      setPromotingId(null);
      setDownloadingId(null);
    }
  }, [open]);

  const refreshAttachments = async () => {
    if (!item) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["legal-attachments", item.id] }),
      qc.invalidateQueries({ queryKey: ["legal-attachments-counts"] }),
    ]);
  };

  const handleFiles = async (input: FileList | File[], mode: UploadMode) => {
    if (!item || uploadingMode) return;
    const files = Array.from(input);
    const problem = validateFiles(files, mode);
    if (problem) {
      toast.error(problem);
      return;
    }

    const hadCurrent = Boolean(currentAttachment);
    setUploadingMode(mode);
    try {
      for (const file of files) {
        await uploadAttachment(item, file, mode);
      }
      if (mode === "current") {
        toast.success(
          hadCurrent
            ? "Novo certificado atual anexado. O certificado anterior foi arquivado automaticamente."
            : "Certificado atual anexado com sucesso.",
        );
      } else {
        toast.success(
          files.length === 1
            ? "Certificado anterior adicionado ao histórico."
            : `${files.length} certificados anteriores adicionados ao histórico.`,
        );
      }
      await refreshAttachments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o certificado.");
    } finally {
      setUploadingMode(null);
      if (currentInputRef.current) currentInputRef.current.value = "";
      if (historyInputRef.current) historyInputRef.current.value = "";
    }
  };

  const openAttachment = async (attachment: LegalAttachment) => {
    try {
      const url = await signedUrl(attachment.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o certificado.");
    }
  };

  const downloadAttachment = async (attachment: LegalAttachment) => {
    if (downloadingId) return;
    setDownloadingId(attachment.id);
    try {
      const url = await signedUrl(attachment.storagePath);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Não foi possível preparar o arquivo para download.");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.fileName || "certificado";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success("Download iniciado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar o certificado.");
    } finally {
      setDownloadingId(null);
    }
  };

  const makeCurrent = async (attachment: LegalAttachment) => {
    if (!item || attachment.isCurrent || promotingId) return;
    setPromotingId(attachment.id);
    try {
      await promoteAttachment(attachment);
      toast.success("Certificado definido como atual. O anterior foi movido para o histórico.");
      await refreshAttachments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o certificado atual.");
    } finally {
      setPromotingId(null);
    }
  };

  const removeAttachment = async (attachment: LegalAttachment) => {
    if (!item) return;
    const ok = await confirmar({
      titulo: attachment.isCurrent ? "Remover certificado atual" : "Remover certificado anterior",
      descricao: attachment.isCurrent
        ? `Remover “${attachment.fileName}”? Se houver histórico, o certificado anterior mais recente será promovido automaticamente.`
        : `Remover “${attachment.fileName}” do histórico? Esta ação não poderá ser desfeita.`,
      confirmar: "Remover",
      destrutivo: true,
    });
    if (!ok) return;

    const hadHistory = previousAttachments.length > 0;
    try {
      await deleteAttachment(attachment);
      toast.success(
        attachment.isCurrent && hadHistory
          ? "Certificado removido. O mais recente do histórico passou a ser o certificado atual."
          : "Certificado removido.",
      );
      await refreshAttachments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o certificado.");
    }
  };

  const dropZoneClass = (mode: UploadMode) =>
    cn(
      "rounded-2xl border border-dashed p-4 transition-all sm:p-5",
      draggingMode === mode
        ? "border-emerald-400/45 bg-emerald-500/[0.08] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.05)]"
        : "border-border/70 bg-muted/[0.10] hover:border-border hover:bg-muted/[0.16]",
    );

  const downloadButtonClass =
    "h-8 w-8 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-emerald-400/35 hover:bg-emerald-500/[0.14] hover:text-emerald-300";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {dialogo}
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto border-white/10 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:w-full">
        <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-foreground shadow-inner">
              <Paperclip className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-lg font-semibold tracking-tight">Certificados do item legal</DialogTitle>
              <p className="mt-1 truncate text-sm text-muted-foreground">{item?.titulo ?? "Item legal"}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {item?.empresa && <span>{item.empresa}</span>}
                {item?.predio && <span>Prédio: {item.predio}</span>}
                <span>{attachments.length} certificado(s)</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
          {item?.precisaAndaime && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3.5">
              <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-100">Execução requer andaime</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-100/55">
                  Considere a liberação e a montagem da estrutura antes da execução da atividade.
                </p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="grid min-h-44 place-items-center rounded-2xl border border-border/60 bg-muted/10">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando certificados…
              </div>
            </div>
          ) : isError ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-medium">Não foi possível carregar os certificados.</p>
                <p className="mt-1 text-xs text-muted-foreground">Tente novamente sem sair deste item.</p>
                {attachmentsError && (
                  <p className="mt-2 max-w-xl break-words text-[11px] text-destructive/80">
                    {attachmentsError instanceof Error
                      ? attachmentsError.message
                      : String(attachmentsError)}
                  </p>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4 text-emerald-400" />
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground/80">Certificado atual</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Documento vigente utilizado como referência deste item legal.
                    </p>
                  </div>
                  {currentAttachment && (
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                      Vigente
                    </span>
                  )}
                </div>

                {currentAttachment ? (
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-card/40 to-card/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                    <div className="absolute inset-y-0 left-0 w-0.5 bg-emerald-400/70" />
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300">
                        <FileIcon type={currentAttachment.mimeType} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold" title={currentAttachment.fileName}>{currentAttachment.fileName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fileSize(currentAttachment.sizeBytes)} · anexado em {fileDate(currentAttachment.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => void openAttachment(currentAttachment)} aria-label={`Abrir ${currentAttachment.fileName}`} title="Abrir certificado">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={downloadButtonClass}
                          disabled={Boolean(downloadingId)}
                          onClick={() => void downloadAttachment(currentAttachment)}
                          aria-label={`Baixar ${currentAttachment.fileName}`}
                          title="Baixar certificado"
                        >
                          {downloadingId === currentAttachment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => void removeAttachment(currentAttachment)} aria-label={`Remover ${currentAttachment.fileName}`} title="Remover certificado">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-28 place-items-center rounded-2xl border border-border/60 bg-muted/[0.08] p-5 text-center">
                    <div>
                      <BadgeCheck className="mx-auto h-6 w-6 text-muted-foreground/45" />
                      <p className="mt-2 text-sm font-medium">Nenhum certificado atual</p>
                      <p className="mt-1 text-xs text-muted-foreground">Anexe o documento vigente para iniciar o controle.</p>
                    </div>
                  </div>
                )}

                <div
                  className={dropZoneClass("current")}
                  onDragEnter={(event) => { event.preventDefault(); setDraggingMode("current"); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDraggingMode(null); }}
                  onDrop={(event) => { event.preventDefault(); setDraggingMode(null); void handleFiles(event.dataTransfer.files, "current"); }}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-muted-foreground">
                        <Upload className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{currentAttachment ? "Substituir certificado atual" : "Anexar certificado atual"}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Ao substituir, o documento vigente anterior será movido automaticamente para o histórico. PDF até {MAX_PDF_MB} MB · JPG/PNG até {MAX_IMAGE_MB} MB.
                        </p>
                      </div>
                    </div>
                    <input
                      ref={currentInputRef}
                      type="file"
                      accept={ACCEPT}
                      className="hidden"
                      onChange={(event) => { if (event.target.files) void handleFiles(event.target.files, "current"); }}
                    />
                    <Button type="button" variant="outline" className="shrink-0 border-white/10 bg-white/[0.035] hover:bg-white/[0.07]" disabled={Boolean(uploadingMode)} onClick={() => currentInputRef.current?.click()}>
                      {uploadingMode === "current" ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</>
                      ) : (
                        <><Upload className="mr-2 h-4 w-4" />Selecionar atual</>
                      )}
                    </Button>
                  </div>
                </div>
              </section>

              <div className="h-px bg-border/60" />

              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground/80">Certificados anteriores</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Histórico documental preservado para consulta, auditoria e rastreabilidade.
                    </p>
                  </div>
                  <span className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {previousAttachments.length} no histórico
                  </span>
                </div>

                <div
                  className={dropZoneClass("history")}
                  onDragEnter={(event) => { event.preventDefault(); setDraggingMode("history"); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDraggingMode(null); }}
                  onDrop={(event) => { event.preventDefault(); setDraggingMode(null); void handleFiles(event.dataTransfer.files, "history"); }}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-muted-foreground">
                        <Archive className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Adicionar certificados ao histórico</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Selecione vários arquivos de uma vez ou arraste-os para cá. PDF até {MAX_PDF_MB} MB · JPG/PNG até {MAX_IMAGE_MB} MB cada.
                        </p>
                      </div>
                    </div>
                    <input
                      ref={historyInputRef}
                      type="file"
                      accept={ACCEPT}
                      multiple
                      className="hidden"
                      onChange={(event) => { if (event.target.files) void handleFiles(event.target.files, "history"); }}
                    />
                    <Button type="button" variant="outline" className="shrink-0 border-white/10 bg-white/[0.035] hover:bg-white/[0.07]" disabled={Boolean(uploadingMode)} onClick={() => historyInputRef.current?.click()}>
                      {uploadingMode === "history" ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</>
                      ) : (
                        <><Archive className="mr-2 h-4 w-4" />Adicionar anteriores</>
                      )}
                    </Button>
                  </div>
                </div>

                {previousAttachments.length === 0 ? (
                  <div className="grid min-h-28 place-items-center rounded-2xl border border-border/50 bg-muted/[0.06] p-5 text-center">
                    <div>
                      <History className="mx-auto h-6 w-6 text-muted-foreground/40" />
                      <p className="mt-2 text-sm font-medium">Nenhum certificado anterior</p>
                      <p className="mt-1 text-xs text-muted-foreground">Quando o certificado atual for substituído, o anterior aparecerá aqui automaticamente.</p>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {previousAttachments.map((attachment) => (
                      <li key={attachment.id} className="group flex items-center gap-3 rounded-2xl border border-border/55 bg-card/25 px-3 py-3 transition hover:border-border/90 hover:bg-card/45 sm:px-4">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/55 bg-muted/25 text-muted-foreground">
                          <FileIcon type={attachment.mimeType} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={attachment.fileName}>{attachment.fileName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{fileSize(attachment.sizeBytes)} · {fileDate(attachment.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={Boolean(promotingId)} onClick={() => void makeCurrent(attachment)} aria-label={`Definir ${attachment.fileName} como atual`} title="Definir como certificado atual">
                            {promotingId === attachment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => void openAttachment(attachment)} aria-label={`Abrir ${attachment.fileName}`} title="Abrir certificado">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={downloadButtonClass}
                            disabled={Boolean(downloadingId)}
                            onClick={() => void downloadAttachment(attachment)}
                            aria-label={`Baixar ${attachment.fileName}`}
                            title="Baixar certificado"
                          >
                            {downloadingId === attachment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => void removeAttachment(attachment)} aria-label={`Remover ${attachment.fileName}`} title="Remover certificado">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
