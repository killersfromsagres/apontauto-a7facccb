import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, ExternalLink, Copy, Loader2, ImageIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type FotoRow = {
  id: string;
  image_url: string | null;
  storage_path: string | null;
  created_at: string;
  legenda: string | null;
};

export type FotosModulo = "refrigeracao" | "corretiva";

const TABELA: Record<FotosModulo, "refrigeracao_fotos" | "corretiva_fotos"> = {
  refrigeracao: "refrigeracao_fotos",
  corretiva: "corretiva_fotos",
};
const BUCKET: Record<FotosModulo, string> = {
  refrigeracao: "refrigeracao-fotos",
  corretiva: "corretiva-fotos",
};

async function fetchFotos(osId: string, modulo: FotosModulo): Promise<FotoRow[]> {
  const { data, error } = await supabase
    .from(TABELA[modulo])
    .select("id, image_url, storage_path, created_at, legenda")
    .eq("os_id", osId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FotoRow[];
}

async function resolveStorageUrl(path: string, modulo: FotosModulo): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET[modulo]).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/**
 * Botão compacto que abre um diálogo com as fotos hospedadas da OS
 * (links ImgBB + fallback para Storage). Use em listas de OS.
 */
export function OsPhotosButton({
  osId,
  numeroOs,
  variant = "outline",
  size = "sm",
  className = "",
  label = "Fotos",
  modulo = "refrigeracao",
}: {
  osId: string;
  numeroOs?: string | null;
  variant?: "outline" | "secondary" | "ghost" | "default";
  size?: "sm" | "default";
  className?: string;
  label?: string;
  modulo?: FotosModulo;
}) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fotos-os-btn", modulo, osId],
    enabled: open,
    staleTime: 15_000,
    queryFn: async () => {
      const rows = await fetchFotos(osId, modulo);
      // Resolve URLs (ImgBB direto ou signed URL do Storage)
      const withUrl = await Promise.all(
        rows.map(async (r) => {
          if (r.image_url) return { ...r, url: r.image_url };
          if (r.storage_path) {
            const u = await resolveStorageUrl(r.storage_path, modulo);
            return { ...r, url: u };
          }
          return { ...r, url: null };
        }),
      );
      return withUrl;
    },
  });

  const links = (data ?? []).map((f) => f.url).filter((u): u is string => !!u);

  const copy = async (u: string) => {
    try {
      await navigator.clipboard.writeText(u);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const openAll = () => {
    links.forEach((u, i) => setTimeout(() => window.open(u, "_blank", "noopener"), i * 120));
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={`h-8 rounded-full px-3 text-xs transition-transform active:scale-95 ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Camera className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4 text-primary" />
              Fotos da OS {numeroOs ? `#${numeroOs}` : ""}
              {data && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {data.length}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando fotos…
              </div>
            ) : error ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
                <span>Falha ao carregar fotos.</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full"
                  onClick={() => refetch()}
                >
                  Tentar de novo
                </Button>
              </div>
            ) : !data || data.length === 0 ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
                Nenhuma foto enviada para esta OS ainda.
              </div>
            ) : (
              <div className="space-y-4">
                {links.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 rounded-full"
                      onClick={openAll}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Abrir todas ({links.length})
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {data.map((f, i) => (
                    <div
                      key={f.id}
                      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl transition-all duration-200 hover:border-primary/30"
                    >
                      <a
                        href={f.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="relative block aspect-square overflow-hidden bg-black/20"
                        onClick={(e) => {
                          if (!f.url) e.preventDefault();
                        }}
                      >
                        {f.url ? (
                          <img
                            src={f.url}
                            alt={`Foto ${i + 1}`}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            sem link
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="text-[10px] font-medium text-white">Foto {i + 1}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-white" />
                        </div>
                      </a>
                      {f.url && (
                        <div className="flex items-center gap-1 border-t border-white/5 p-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 flex-1 rounded-full px-2 text-[11px]"
                            onClick={() => copy(f.url!)}
                          >
                            <Copy className="mr-1 h-3 w-3" /> Copiar
                          </Button>
                          <a
                            href={f.url}
                            download={`OS-${numeroOs ?? "foto"}-${i + 1}.jpg`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-7 items-center rounded-full bg-primary/90 px-2 text-[11px] font-medium text-primary-foreground shadow-sm transition-transform active:scale-95"
                          >
                            <Download className="mr-1 h-3 w-3" /> Baixar
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
