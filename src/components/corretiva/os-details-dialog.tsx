import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { processarDescricaoPecaIA } from "@/lib/materiais/ia.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera,
  Package,
  CheckCircle2,
  X,
  Loader2,
  LayoutGrid,
  Zap,
  Droplets,
  Hammer,
  Key,
  Paintbrush,
  Snowflake,
  Trash2,
  ImagePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { equipeStyles } from "@/lib/corretiva/equipe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OsDetailsDialogProps {
  os: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

type MaterialPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type EvidenceKind = "antes" | "depois";
type EvidenceSource = "camera" | "galeria";

const MAX_MATERIAL_PHOTOS = 8;
const MAX_MATERIAL_PHOTO_SIZE = 10 * 1024 * 1024;

const TEAM_OPTIONS = [
  { name: "Elétrica", icon: Zap, color: "text-yellow-500" },
  { name: "Hidráulica", icon: Droplets, color: "text-blue-500" },
  { name: "Civil", icon: Hammer, color: "text-emerald-500" },
  { name: "Chaveiro", icon: Key, color: "text-violet-500" },
  { name: "Pintura", icon: Paintbrush, color: "text-pink-500" },
  { name: "Refrigeração", icon: Snowflake, color: "text-cyan-500" },
  { name: "Limpeza", icon: Trash2, color: "text-sky-500" },
] as const;

function SilverField({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-zinc-500/35 via-slate-200/75 to-zinc-600/35 p-px shadow-[0_0_14px_rgba(226,232,240,0.06)]">
      <div className={cn("rounded-[11px] bg-background", className)}>{children}</div>
    </div>
  );
}

export function OsDetailsDialog({ os, isOpen, onClose, onUpdate }: OsDetailsDialogProps) {
  const processIA = useServerFn(processarDescricaoPecaIA);
  const [loading, setLoading] = useState(false);
  const [photoBefore, setPhotoBefore] = useState<string | null>(null);
  const [photoAfter, setPhotoAfter] = useState<string | null>(null);
  const [pecas, setPecas] = useState("");
  const [materialPhotos, setMaterialPhotos] = useState<MaterialPhoto[]>([]);
  const [observacao, setObservacao] = useState(os.observacao_conclusao || "");
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const hasMaterialDraft = pecas.trim().length > 0;
  const isCompleted = ["concluida", "concluido"].includes(String(os.status || "").toLowerCase());

  useEffect(() => {
    const handleStatus = () => setOfflineMode(!navigator.onLine);
    window.addEventListener("online", handleStatus);
    window.addEventListener("offline", handleStatus);
    return () => {
      window.removeEventListener("online", handleStatus);
      window.removeEventListener("offline", handleStatus);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPecas("");
    setMaterialPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
  }, [isOpen, os.id]);

  const clearMaterialDraft = () => {
    setPecas("");
    setMaterialPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
  };

  const removeMaterialPhoto = (photoId: string) => {
    setMaterialPhotos((current) => {
      const photo = current.find((item) => item.id === photoId);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== photoId);
    });
  };

  const handleMaterialPhotosSelected = (files: FileList | null) => {
    if (!files?.length) return;

    const availableSlots = Math.max(0, MAX_MATERIAL_PHOTOS - materialPhotos.length);
    if (availableSlots === 0) {
      toast.warning(`Você pode anexar no máximo ${MAX_MATERIAL_PHOTOS} fotos por pedido.`);
      return;
    }

    const selected = Array.from(files);
    const validImages = selected.filter((file) => {
      if (!file.type.startsWith("image/")) return false;
      if (file.size > MAX_MATERIAL_PHOTO_SIZE) {
        toast.warning(`${file.name} ultrapassa o limite de 10 MB e não foi anexada.`);
        return false;
      }
      return true;
    });

    const accepted = validImages.slice(0, availableSlots);
    if (validImages.length > availableSlots) {
      toast.warning(`Foram anexadas ${availableSlots} foto(s). O limite é de ${MAX_MATERIAL_PHOTOS} por pedido.`);
    }

    if (!accepted.length) return;

    setMaterialPhotos((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);

    toast.success(`${accepted.length} foto(s) adicionada(s) ao pedido de material.`);
  };

  const queueMaterialPhotos = async (requestRef: string, description: string) => {
    if (!materialPhotos.length) return 0;

    const { outboxAdd, blobPut } = await import("@/lib/corretiva/db");
    const safeDescription = description.replace(/\s+/g, " ").slice(0, 120);

    for (const [index, photo] of materialPhotos.entries()) {
      const blobKey = `os-${os.id}-material-${requestRef}-${Date.now()}-${index}`;
      await blobPut(blobKey, photo.file);
      await outboxAdd({
        id: crypto.randomUUID(),
        kind: "foto",
        osId: os.id,
        numeroOs: os.numero_os,
        payload: {
          blobKey,
          legenda: `Pedido de material • ${requestRef} • ${safeDescription}`,
        },
        createdAt: Date.now(),
        attempts: 0,
      });
    }

    return materialPhotos.length;
  };

  const handleFinish = async (withPhoto: boolean) => {
    const hasSpecialPermission = os?.allowedMenus?.includes("corretiva-concluir-sem-foto-especial");
    const isAdmin = os?.isAdmin;
    const canBypass = isAdmin || hasSpecialPermission;

    if (!withPhoto && !canBypass) {
      toast.error("Você não tem permissão para concluir sem foto.");
      return;
    }

    if (withPhoto && !canBypass && (!photoBefore || !photoAfter)) {
      toast.error("Por favor, adicione as fotos de 'Antes' e 'Depois' para concluir.");
      return;
    }

    setLoading(true);
    try {
      if (!navigator.onLine) {
        const { outboxAdd } = await import("@/lib/corretiva/db");
        await outboxAdd({
          id: crypto.randomUUID(),
          kind: "status",
          osId: os.id,
          numeroOs: os.numero_os,
          payload: { status: "concluida" },
          createdAt: Date.now(),
          attempts: 0,
        });

        try {
          const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
          const cached = await getCachedOsList();
          const updated = cached.map((item) =>
            item.id === os.id ? { ...item, status: "concluida" } : item,
          );
          await cacheOsList(updated);
        } catch (error) {
          console.warn("Erro ao atualizar cache local:", error);
        }

        toast.success("Modo Offline: OS marcada para conclusão e será sincronizada automaticamente.");
        onUpdate();
        onClose();
        return;
      }

      const { error: statusError } = await supabase
        .from("corretiva_os")
        .update({
          status: "concluida",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", os.id);

      if (statusError) throw statusError;

      toast.success("Chamado concluído com sucesso!");
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error("[CorretivaAudit] Erro fatal ao finalizar OS:", error);
      toast.error(error.message || "Erro ao concluir OS no servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleSolicitarPeca = async (): Promise<boolean> => {
    if (!pecas.trim()) {
      toast.error("Descreva as peças necessárias.");
      return false;
    }

    setLoading(true);
    const pecaTexto = pecas.trim();
    const requestRef = `MAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const attachmentSummary =
      materialPhotos.length > 0 ? `${materialPhotos.length} foto(s) vinculada(s)` : "sem fotos";

    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      const userName =
        sess.session?.user?.user_metadata?.nome ||
        sess.session?.user?.user_metadata?.full_name ||
        sess.session?.user?.email?.split("@")[0] ||
        "Colaborador";

      const { items } = await processIA({ data: { descricao: pecaTexto } });
      const logs = items.length > 0 ? items : [{ item: pecaTexto, qtd: 1 }];

      if (navigator.onLine) {
        for (const log of logs) {
          await supabase.from("corretiva_pecas").insert({
            os_id: os.id,
            descricao: log.item,
            quantidade: log.qtd,
            urgencia: "Media",
            status_gestor: "pendente",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any);
        }
      }

      if (!navigator.onLine) {
        const { outboxAdd } = await import("@/lib/corretiva/db");

        await outboxAdd({
          id: crypto.randomUUID(),
          kind: "material",
          osId: os.id,
          numeroOs: os.numero_os,
          payload: {
            descricao: pecaTexto,
            equipe: os.equipe,
            solicitante: userName,
            predio: os.predio,
            local: os.local,
            numeroOs: os.numero_os,
            observacao: `Solicitação automática via Execução de Campo • Ref. ${requestRef} • ${attachmentSummary}`,
          },
          createdAt: Date.now(),
          attempts: 0,
        });

        const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
        const cached = await getCachedOsList();
        const updated = cached.map((item) => {
          if (item.id === os.id) {
            const history = item.pecas_solicitadas
              ? `${item.pecas_solicitadas}\n${pecaTexto}`
              : pecaTexto;
            return { ...item, pecas_solicitadas: history };
          }
          return item;
        });
        await cacheOsList(updated);

        try {
          const queuedPhotos = await queueMaterialPhotos(requestRef, pecaTexto);
          toast.success(
            queuedPhotos > 0
              ? `Pedido ${requestRef} e ${queuedPhotos} foto(s) salvos para sincronização.`
              : `Pedido ${requestRef} salvo para sincronização.`,
          );
        } catch (photoError) {
          console.error("[CorretivaPecas] Falha ao preparar fotos offline:", photoError);
          toast.warning(`Pedido ${requestRef} salvo, mas não foi possível preparar todas as fotos.`);
        }
      } else {
        const { data: solData, error: solError } = await supabase
          .from("material_solicitacoes")
          .insert({
            user_id: userId,
            solicitante: userName,
            setor: os.equipe || null,
            predio: os.predio || null,
            local: os.local || null,
            prioridade: "normal",
            status: "enviada",
            observacao: `[Solicitado via OS ${os.numero_os}] Requisitado via Execução de Campo • Ref. ${requestRef} • ${attachmentSummary}`,
            enviada_em: new Date().toISOString(),
          } as any)
          .select("id")
          .single();

        if (solError) throw solError;

        if (solData) {
          const { error: itemError } = await supabase.from("material_solicitacao_itens").insert({
            solicitacao_id: (solData as any).id,
            descricao: pecaTexto,
            quantidade: 1,
            unidade: "UN",
            justificativa: `Referente à OS ${os.numero_os} • Ref. ${requestRef}`,
          } as any);

          if (itemError) {
            console.error("[CorretivaPecas] Erro ao criar item da solicitação:", itemError);
          }
        }

        const { data: current } = await (supabase
          .from("corretiva_os")
          .select("pecas_solicitadas")
          .eq("id", os.id)
          .single() as any);

        const currentHistory = current?.pecas_solicitadas || "";
        const novoHistorico = currentHistory ? `${currentHistory}\n${pecaTexto}` : pecaTexto;

        await supabase
          .from("corretiva_os")
          .update({
            pecas_solicitadas: novoHistorico,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", os.id);

        try {
          const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
          const cached = await getCachedOsList();
          const updated = cached.map((item) =>
            item.id === os.id ? { ...item, pecas_solicitadas: novoHistorico } : item,
          );
          await cacheOsList(updated);
        } catch (error) {
          console.warn("Erro ao atualizar cache local:", error);
        }

        let queuedPhotos = 0;
        if (materialPhotos.length > 0) {
          try {
            queuedPhotos = await queueMaterialPhotos(requestRef, pecaTexto);
            const { syncPending } = await import("@/lib/corretiva/sync");
            const syncResult = await syncPending();
            if (syncResult.failed > 0) {
              toast.warning(
                `Pedido ${requestRef} salvo. Algumas fotos permaneceram na fila para nova sincronização.`,
              );
            }
          } catch (photoError) {
            console.error("[CorretivaPecas] Falha ao anexar fotos:", photoError);
            toast.warning(`Pedido ${requestRef} salvo, mas algumas fotos não puderam ser anexadas agora.`);
          }
        }

        if (queuedPhotos === 0) {
          toast.success(`Material registrado no Controle de Materiais. Ref. ${requestRef}`);
        } else {
          toast.success(`Pedido ${requestRef} registrado com ${queuedPhotos} foto(s) anexada(s).`);
        }
      }

      if (onUpdate) onUpdate();
      return true;
    } catch (error: any) {
      console.error("[CorretivaPecas] Erro:", error);
      toast.error("Erro ao processar solicitação: " + (error.message || "Tente novamente"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleReclassificar = async (novaEquipe: string) => {
    if (loading) return;

    setLoading(true);
    const toastId = toast.loading(`Reclassificando para ${novaEquipe}...`);

    try {
      console.log(`[CorretivaReclassificar] Iniciando para OS ${os.id} -> ${novaEquipe}`);

      const { data, error } = await supabase
        .from("corretiva_os")
        .update({
          equipe: novaEquipe,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", os.id)
        .select();

      if (error) {
        console.error("[CorretivaReclassificar] Erro Supabase:", error);
        throw error;
      }

      console.log("[CorretivaReclassificar] Sucesso:", data);

      try {
        const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
        const cached = await getCachedOsList();
        const updated = cached.map((item) =>
          item.id === os.id ? { ...item, equipe: novaEquipe } : item,
        );
        await cacheOsList(updated);
      } catch (error) {
        console.warn("[CorretivaReclassificar] Erro cache local:", error);
      }

      toast.success(`OS reclassificada para ${novaEquipe}`, { id: toastId });

      if (onUpdate) onUpdate();

      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error: any) {
      console.error("[CorretivaReclassificar] Erro fatal:", error);
      toast.error(`Erro ao reclassificar: ${error.message || "Tente novamente"}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleEvidenceSelected = async (
    file: File | undefined,
    kind: EvidenceKind,
    source: EvidenceSource,
  ) => {
    if (!file) return;

    try {
      const { outboxAdd, blobPut } = await import("@/lib/corretiva/db");
      const sourceSuffix = source === "galeria" ? "-galeria" : "";
      const blobKey = `os-${os.id}-${kind}${sourceSuffix}-${Date.now()}`;
      const kindLabel = kind === "antes" ? "Antes" : "Depois";
      const sourceLabel = source === "galeria" ? " (Galeria)" : "";

      await blobPut(blobKey, file);
      await outboxAdd({
        id: crypto.randomUUID(),
        kind: "foto",
        osId: os.id,
        numeroOs: os.numero_os,
        payload: { blobKey, legenda: `Evidência: ${kindLabel}${sourceLabel}` },
        createdAt: Date.now(),
        attempts: 0,
      });

      const previewUrl = URL.createObjectURL(file);
      if (kind === "antes") setPhotoBefore(previewUrl);
      else setPhotoAfter(previewUrl);

      toast.success(
        `Foto (${source === "galeria" ? "Galeria" : "Câmera"}) salva e aguardando sincronização.`,
      );
    } catch (error) {
      console.error("[CorretivaFotos] Erro ao salvar evidência:", error);
      toast.error("Erro ao salvar foto localmente.");
    }
  };

  const saveObservation = async () => {
    if (!observacao.trim()) {
      toast.error("Descreva a observação.");
      return;
    }

    setLoading(true);
    try {
      if (!navigator.onLine) {
        const { outboxAdd } = await import("@/lib/corretiva/db");
        await outboxAdd({
          id: crypto.randomUUID(),
          kind: "status",
          osId: os.id,
          numeroOs: os.numero_os,
          payload: { observacao_conclusao: observacao.trim() },
          createdAt: Date.now(),
          attempts: 0,
        });
        toast.success("Observação salva offline.");
        return;
      }

      const { error } = await supabase
        .from("corretiva_os")
        .update({ observacao_conclusao: observacao.trim() } as any)
        .eq("id", os.id);
      if (error) throw error;
      toast.success("Observação salva.");
    } catch (error) {
      console.error("[CorretivaObservacao] Erro:", error);
      toast.error("Erro ao salvar observação.");
    } finally {
      setLoading(false);
    }
  };

  const renderEvidence = (kind: EvidenceKind, photo: string | null) => {
    const isBefore = kind === "antes";
    const label = isBefore ? "Antes" : "Depois";
    const setPhoto = isBefore ? setPhotoBefore : setPhotoAfter;

    return (
      <div className="space-y-1.5 sm:space-y-2">
        <Label className="block text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </Label>

        {photo ? (
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted sm:aspect-square">
            <img src={photo} alt={label} className="h-full w-full object-cover" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8 rounded-full"
              onClick={() => setPhoto(null)}
              aria-label={`Remover foto de ${label.toLowerCase()}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="grid aspect-[4/3] grid-rows-2 gap-1.5 sm:aspect-square sm:gap-2">
            <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-2 text-center transition-colors hover:bg-muted/40 sm:px-3">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                disabled={loading}
                onChange={(event) => void handleEvidenceSelected(event.target.files?.[0], kind, "camera")}
              />
              <Camera className="mb-0.5 h-4 w-4 text-primary sm:mb-1 sm:h-5 sm:w-5" />
              <span className="text-[10px] font-semibold text-foreground">Câmera</span>
            </label>

            <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-2 text-center transition-colors hover:bg-muted/40 sm:px-3">
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                disabled={loading}
                onChange={(event) => void handleEvidenceSelected(event.target.files?.[0], kind, "galeria")}
              />
              <LayoutGrid className="mb-0.5 h-4 w-4 text-muted-foreground sm:mb-1" />
              <span className="text-[10px] font-semibold text-foreground">Galeria</span>
            </label>
          </div>
        )}
      </div>
    );
  };

  const canFinishWithoutPhoto =
    os?.isAdmin || os?.allowedMenus?.includes("corretiva-concluir-sem-foto-especial");
  const canFinishWithPhoto = Boolean(photoBefore && photoAfter) || canFinishWithoutPhoto;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="z-[9999] max-h-[94dvh] w-[calc(100%-0.75rem)] max-w-lg gap-0 overflow-hidden rounded-xl border border-border bg-background p-0 shadow-lg sm:w-[calc(100%-1.5rem)] sm:rounded-2xl md:w-full"
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-radix-dropdown-menu-content]")) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex max-h-[94dvh] flex-col overflow-hidden bg-background">
          <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:space-y-5 sm:p-6">
            <DialogHeader className="space-y-2 text-left sm:space-y-3">
              <div className="flex items-center justify-between gap-2 pr-7 sm:pr-0">
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 px-3 py-1.5 font-mono text-sm font-bold tracking-wide sm:text-base",
                    equipeStyles(os.equipe).badge,
                  )}
                >
                  OS {os.numero_os}
                </Badge>
                <Badge
                  variant="outline"
                  aria-label={isCompleted ? "Ordem de serviço concluída" : "Ordem de serviço aberta"}
                  className={cn(
                    "gap-1.5 whitespace-nowrap px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors",
                    isCompleted
                      ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.12)]"
                      : "border-amber-400/35 bg-amber-400/10 text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.10)]",
                  )}
                >
                  <span className="relative flex h-2 w-2 items-center justify-center" aria-hidden="true">
                    {!isCompleted && (
                      <span className="absolute h-2 w-2 animate-ping rounded-full bg-amber-300/45" />
                    )}
                    <span
                      className={cn(
                        "relative h-1.5 w-1.5 rounded-full",
                        isCompleted ? "bg-emerald-300" : "bg-amber-300",
                      )}
                    />
                  </span>
                  {isCompleted ? "Concluída" : "Aberta"}
                </Badge>
              </div>
              <DialogTitle className="line-clamp-3 text-base font-semibold leading-snug text-foreground sm:text-xl sm:leading-tight">
                {os.nome_os || "Sem descrição"}
              </DialogTitle>
            </DialogHeader>

            <SilverField className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-muted/20 p-3 text-sm sm:gap-4 sm:p-4">
              <div className="min-w-0 space-y-1">
                <Label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px]">
                  Localização
                </Label>
                <p className="truncate text-xs font-semibold text-foreground sm:text-sm">
                  {os.predio || "-"} - {os.andar || "-"}
                </p>
                <p className="line-clamp-1 text-[10px] text-muted-foreground sm:line-clamp-2 sm:text-xs">
                  {os.local || "Local não informado"}
                </p>
              </div>

              <div className="space-y-1 text-right">
                <Label className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px]">
                  Equipe
                </Label>
                <div className="flex items-center justify-end">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger
                      asChild
                      disabled={!os?.isAdmin && !os?.allowedMenus?.includes("reclassificar-equipe")}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 rounded-lg px-2.5 text-[10px] font-medium sm:h-9 sm:px-3 sm:text-xs",
                          equipeStyles(os.equipe).badge,
                        )}
                      >
                        <LayoutGrid className="mr-1.5 h-3.5 w-3.5 sm:mr-2" />
                        {os.equipe || "Não definida"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      side="bottom"
                      sideOffset={5}
                      className="z-[10000] w-56 rounded-xl border border-border bg-popover p-1 shadow-lg"
                    >
                      <div className="px-2 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Reclassificar equipe
                        </p>
                      </div>
                      {TEAM_OPTIONS.map((team) => (
                        <DropdownMenuItem
                          key={team.name}
                          onClick={() => handleReclassificar(team.name)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                            os.equipe === team.name && "bg-accent text-accent-foreground",
                          )}
                        >
                          <div className={cn("rounded-md bg-muted p-1.5", team.color)}>
                            <team.icon className="h-4 w-4" />
                          </div>
                          {team.name}
                          {os.equipe === team.name && (
                            <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/70 pt-2.5 text-[9px] text-muted-foreground sm:text-[10px]">
                <span className="min-w-0 truncate">Solicitante: {os.solicitante || "-"}</span>
                {os.data_criacao && (
                  <span className="shrink-0">
                    Abertura: {new Date(os.data_criacao).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                )}
              </div>
            </SilverField>

            <SilverField className="space-y-2.5 p-3 sm:space-y-3 sm:p-4">
              <div>
                <Label className="text-xs font-semibold text-foreground sm:text-sm">Solicitar peças / materiais</Label>
                <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
                  Descreva o material necessário e, se quiser, anexe fotos do pedido.
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Lâmpada LED 9W..."
                  value={pecas}
                  onChange={(event) => setPecas(event.target.value)}
                  className="h-10 bg-background text-xs sm:h-11 sm:text-sm"
                />
                <Button
                  variant={hasMaterialDraft ? "default" : "outline"}
                  size="icon"
                  className="h-10 w-10 shrink-0 sm:h-11 sm:w-11"
                  onClick={async () => {
                    const success = await handleSolicitarPeca();
                    if (success) clearMaterialDraft();
                  }}
                  disabled={loading || !hasMaterialDraft}
                  aria-label={
                    hasMaterialDraft
                      ? "Anexar pedido de material"
                      : "Descreva o material para habilitar o pedido"
                  }
                  title={
                    hasMaterialDraft
                      ? "Anexar pedido de material"
                      : "Descreva o material necessário"
                  }
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : hasMaterialDraft ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Package className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-2.5 sm:space-y-3 sm:p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground sm:text-xs">Fotos do pedido</p>
                    <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground sm:text-[10px]">
                      Até {MAX_MATERIAL_PHOTOS} imagens, com no máximo 10 MB por foto.
                    </p>
                  </div>
                  <label
                    className={cn(
                      "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[9px] font-medium text-foreground transition-colors hover:bg-muted sm:h-9 sm:gap-2 sm:px-3 sm:text-[10px]",
                      loading && "pointer-events-none opacity-50",
                    )}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      disabled={loading}
                      onChange={(event) => {
                        handleMaterialPhotosSelected(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                    <ImagePlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    Galeria
                  </label>
                </div>

                {materialPhotos.length > 0 ? (
                  <>
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      {materialPhotos.map((photo, index) => (
                        <div
                          key={photo.id}
                          className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                        >
                          <img
                            src={photo.previewUrl}
                            alt={`Foto ${index + 1} do pedido de material`}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeMaterialPhoto(photo.id)}
                            disabled={loading}
                            className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                            aria-label={`Remover foto ${index + 1}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground sm:text-[10px]">
                      {materialPhotos.length} foto(s) pronta(s) para anexar ao pedido.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/60 px-2.5 py-2 sm:px-3 sm:py-2.5">
                    <ImagePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:h-4 sm:w-4" />
                    <p className="text-[9px] text-muted-foreground sm:text-[10px]">
                      Nenhuma foto selecionada. O pedido pode ser enviado sem imagens.
                    </p>
                  </div>
                )}
              </div>
            </SilverField>

            <SilverField className="space-y-2.5 p-3 sm:space-y-3 sm:p-4">
              <div>
                <Label className="text-xs font-semibold text-foreground sm:text-sm">Observações de campo</Label>
                <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
                  Registre de forma objetiva o serviço executado no local.
                </p>
              </div>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Relate o que foi feito no local..."
                  value={observacao}
                  onChange={(event) => setObservacao(event.target.value)}
                  className="min-h-[76px] flex-1 resize-none bg-background text-xs sm:min-h-[96px] sm:text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-[76px] w-10 shrink-0 sm:h-[96px] sm:w-11"
                  onClick={() => void saveObservation()}
                  disabled={loading}
                  aria-label="Salvar observação"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </SilverField>

            <SilverField className="space-y-3 p-3 sm:space-y-4 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="text-xs font-semibold text-foreground sm:text-sm">Evidência fotográfica</Label>
                  <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
                    Registre o estado antes e depois da execução.
                  </p>
                </div>
                <Badge variant="outline" className="gap-1.5 text-[9px] font-medium sm:text-[10px]">
                  <Zap className="h-3 w-3" />
                  {offlineMode ? "Modo offline" : "Sincronização ativa"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {renderEvidence("antes", photoBefore)}
                {renderEvidence("depois", photoAfter)}
              </div>
            </SilverField>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-border bg-background p-3 sm:gap-3 sm:p-6">
            {canFinishWithoutPhoto && (
              <Button
                variant="outline"
                className="col-span-1 h-10 rounded-lg px-2 text-[10px] font-semibold sm:h-11 sm:px-4 sm:text-xs"
                disabled={loading}
                onClick={() => handleFinish(false)}
              >
                Concluir s/ foto {os?.isAdmin ? "(Admin)" : ""}
              </Button>
            )}
            <Button
              variant="default"
              className={cn(
                "h-10 rounded-lg px-2 text-[10px] font-semibold sm:h-11 sm:px-4 sm:text-xs",
                canFinishWithoutPhoto ? "col-span-1" : "col-span-2",
              )}
              disabled={loading || !canFinishWithPhoto}
              onClick={() => handleFinish(true)}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Finalizar c/ foto
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
