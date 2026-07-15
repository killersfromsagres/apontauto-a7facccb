import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip, Upload, ExternalLink, Trash2, FileText, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  listAttachments,
  uploadAttachment,
  signedUrl,
  deleteAttachment,
  type LegalItem,
  type LegalAttachment,
} from "@/lib/legal-items";

const ACCEPT = "application/pdf,image/png,image/jpeg";
const MAX_MB = 10;

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
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["legal-attachments", item?.id],
    queryFn: () => (item ? listAttachments(item.id) : Promise.resolve([])),
    enabled: !!item && open,
  });

  useEffect(() => {
    if (!open && inputRef.current) inputRef.current.value = "";
  }, [open]);

  const handleFile = async (file: File) => {
    if (!item) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máx. ${MAX_MB} MB).`);
      return;
    }
    setUploading(true);
    try {
      await uploadAttachment(item, file);
      toast.success("Certificado enviado.");
      qc.invalidateQueries({ queryKey: ["legal-attachments", item.id] });
      qc.invalidateQueries({ queryKey: ["legal-attachments-counts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openAttachment = async (att: LegalAttachment) => {
    try {
      const url = await signedUrl(att.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao abrir arquivo");
    }
  };

  const removeAttachment = async (att: LegalAttachment) => {
    if (!item) return;
    if (!confirm(`Remover "${att.fileName}"?`)) return;
    try {
      await deleteAttachment(att);
      toast.success("Removido.");
      qc.invalidateQueries({ queryKey: ["legal-attachments", item.id] });
      qc.invalidateQueries({ queryKey: ["legal-attachments-counts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Certificados — {item?.titulo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Enviar novo certificado</p>
                <p>PDF, JPG ou PNG — até {MAX_MB} MB.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="hidden"
                  id="legal-attach-input"
                />
                <Button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" /> Escolher arquivo
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Histórico de anexos
            </p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : attachments.length === 0 ? (
              <p className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                Nenhum certificado enviado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
                {attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center gap-3 bg-card/40 px-3 py-2.5 transition hover:bg-card/70"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{att.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(att.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {att.sizeBytes ? ` · ${(att.sizeBytes / 1024).toFixed(0)} KB` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAttachment(att)}
                      aria-label="Abrir"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(att)}
                      aria-label="Remover"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
