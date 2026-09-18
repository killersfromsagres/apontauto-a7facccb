import { useConfirm } from "@/components/ui/use-confirm";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ExternalLink,
  FileImage,
  FileText,
  HardHat,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  deleteAttachment,
  listAttachments,
  signedUrl,
  uploadAttachment,
  type LegalAttachment,
  type LegalItem,
} from "@/lib/legal-items";
import { cn } from "@/lib/utils";

const ACCEPT = "application/pdf,image/png,image/jpeg";
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_MB = 10;

function fileSize(bytes: number | null) {
  if (!bytes) return "Tamanho não informado";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string | null }) {
  return type?.startsWith("image/") ? (
    <FileImage className="h-5 w-5" />
  ) : (
    <FileText className="h-5 w-5" />
  );
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const {
    data: attachments = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["legal-attachments", item?.id],
    queryFn: () => (item ? listAttachments(item.id) : Promise.resolve([])),
    enabled: Boolean(item && open),
  });

  useEffect(() => {
    if (!open && inputRef.current) inputRef.current.value = "";
    if (!open) setDragging(false);
  }, [open]);

  const handleFile = async (file: File) => {
    if (!item || uploading) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Formato não permitido. Envie PDF, JPG ou PNG.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo acima de ${MAX_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      await uploadAttachment(item, file);
      toast.success("Documento anexado com sucesso.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["legal-attachments", item.id] }),
        qc.invalidateQueries({ queryKey: ["legal-attachments-counts"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openAttachment = async (attachment: LegalAttachment) => {
    try {
      const url = await signedUrl(attachment.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o arquivo.");
    }
  };

  const removeAttachment = async (attachment: LegalAttachment) => {
    if (!item) return;
    const ok = await confirmar({
      titulo: "Remover documento",
      descricao: `Remover “${attachment.fileName}”? Esta ação não poderá ser desfeita.`,
      confirmar: "Remover",
      destrutivo: true,
    });
    if (!ok) return;

    try {
      await deleteAttachment(attachment);
      toast.success("Documento removido.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["legal-attachments", item.id] }),
        qc.invalidateQueries({ queryKey: ["legal-attachments-counts"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o arquivo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {dialogo}
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto border-white/10 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:w-full">
        <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Paperclip className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg">Documentos e certificados</DialogTitle>
              <p className="mt-1 truncate text-sm text-muted-foreground">{item?.titulo ?? "Item legal"}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {item?.empresa && <span>{item.empresa}</span>}
                {item?.predio && <span>Prédio: {item.predio}</span>}
                <span>{attachments.length} arquivo(s)</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {item?.precisaAndaime && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
              <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-200">Execução requer andaime</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-100/60">
                  Considere a liberação e a montagem da estrutura antes da execução da atividade.
                </p>
              </div>
            </div>
          )}

          <div
            className={cn(
              "rounded-2xl border border-dashed p-5 transition-colors",
              dragging ? "border-primary/60 bg-primary/10" : "border-border/70 bg-muted/15",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget === event.target) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted/50 text-muted-foreground">
                  <Upload className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Adicionar evidência</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Arraste um arquivo para esta área ou selecione manualmente. PDF, JPG ou PNG, até {MAX_MB} MB.
                  </p>
                </div>
              </div>
              <input
                ref={inputRef}
                id="legal-attach-input"
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <Button
                type="button"
                className="shrink-0"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" />Selecionar arquivo</>
                )}
              </Button>
            </div>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Arquivo documental</p>
                <p className="mt-1 text-sm text-muted-foreground">Histórico de certificados e evidências deste item.</p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid min-h-28 place-items-center rounded-xl border border-border/60 bg-muted/10">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando documentos…</div>
              </div>
            ) : isError ? (
              <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <div><p className="text-sm font-medium">Não foi possível carregar os documentos.</p><p className="mt-1 text-xs text-muted-foreground">Tente novamente sem sair deste item.</p></div>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
              </div>
            ) : attachments.length === 0 ? (
              <div className="grid min-h-32 place-items-center rounded-xl border border-border/60 bg-muted/10 p-5 text-center">
                <div><FileText className="mx-auto h-6 w-6 text-muted-foreground/60" /><p className="mt-2 text-sm font-medium">Nenhum documento anexado</p><p className="mt-1 text-xs text-muted-foreground">Adicione o primeiro certificado ou evidência deste item legal.</p></div>
              </div>
            ) : (
              <ul className="space-y-2">
                {attachments.map((attachment) => (
                  <li key={attachment.id} className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/30 px-3 py-3 transition hover:border-border hover:bg-card/60 sm:px-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/60 bg-muted/30 text-primary"><FileIcon type={attachment.mimeType} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={attachment.fileName}>{attachment.fileName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fileSize(attachment.sizeBytes)} · {new Date(attachment.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => void openAttachment(attachment)} aria-label={`Abrir ${attachment.fileName}`} title="Abrir documento"><ExternalLink className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => void removeAttachment(attachment)} aria-label={`Remover ${attachment.fileName}`} title="Remover documento"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
