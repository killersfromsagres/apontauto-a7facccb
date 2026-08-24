import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { processarDescricaoPecaIA } from "@/lib/materiais/ia.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Package, CheckCircle2, X, Loader2, ArrowRightLeft, LayoutGrid, Zap, Droplets, Hammer, Key, Paintbrush, Snowflake, Trash2, ImagePlus } from "lucide-react";
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

const MAX_MATERIAL_PHOTOS = 8;
const MAX_MATERIAL_PHOTO_SIZE = 10 * 1024 * 1024;

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

  useEffect(() => {
    const handleStatus = () => setOfflineMode(!navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
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
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;

      // Se estiver offline ou se a conexão cair, usamos o sistema de outbox
      if (!navigator.onLine) {
        const { outboxAdd } = await import("@/lib/corretiva/db");
        await outboxAdd({
          id: crypto.randomUUID(),
          kind: "status",
          osId: os.id,
          numeroOs: os.numero_os,
          payload: { status: "concluida" },
          createdAt: Date.now(),
          attempts: 0
        });

        // Atualizar cache local para refletir a mudança imediata na UI
        try {
          const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
          const cached = await getCachedOsList();
          const updated = cached.map(o => o.id === os.id ? { ...o, status: 'concluida' } : o);
          await cacheOsList(updated);
        } catch (e) {
          console.warn("Erro ao atualizar cache local:", e);
        }

        toast.success("Modo Offline: OS marcada para conclusão e será sincronizada automaticamente.");
        onUpdate();
        onClose();
        return;
      }

      // Fluxo Online
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
    } catch (err: any) {
      console.error("[CorretivaAudit] Erro fatal ao finalizar OS:", err);
      toast.error(err.message || "Erro ao concluir OS no servidor.");
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
    const attachmentSummary = materialPhotos.length > 0
      ? `${materialPhotos.length} foto(s) vinculada(s)`
      : "sem fotos";
    
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      const userName = sess.session?.user?.user_metadata?.nome || 
                      sess.session?.user?.user_metadata?.full_name || 
                      sess.session?.user?.email?.split('@')[0] || 
                      "Colaborador";

      // AGENTE IA: Processar descrição para extrair quantidade e itens
      const { items } = await processIA({ data: { descricao: pecaTexto } });

      // Registro para cada item extraído pela IA (ou o texto original se falhar)
      const logs = items.length > 0 ? items : [{ item: pecaTexto, qtd: 1 }];

      // 1. Registro em corretiva_pecas para o módulo de status (Registro instantâneo)
      if (navigator.onLine) {
        for (const log of logs) {
          await supabase
            .from("corretiva_pecas")
            .insert({
              os_id: os.id,
              descricao: log.item,
              quantidade: log.qtd,
              urgencia: "Media",
              status_gestor: "pendente",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            } as any);
        }
      }

      // 2. Integração com Controle de Materiais (Requisito: Registro automático em Controle-Materiais)
      if (!navigator.onLine) {
        const { outboxAdd } = await import("@/lib/corretiva/db");
        
        // Adicionamos um item específico para a sincronização com o módulo de materiais
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
            observacao: `Solicitação automática via Execução de Campo • Ref. ${requestRef} • ${attachmentSummary}`
          },
          createdAt: Date.now(),
          attempts: 0
        });

        // Também mantemos o histórico textual da OS localmente
        const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
        const cached = await getCachedOsList();
        const updated = cached.map(o => {
          if (o.id === os.id) {
            const hist = o.pecas_solicitadas ? `${o.pecas_solicitadas}\n${pecaTexto}` : pecaTexto;
            return { ...o, pecas_solicitadas: hist };
          }
          return o;
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
        // Online: Insere diretamente no módulo de materiais
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
            justificativa: `Referente à OS ${os.numero_os} • Ref. ${requestRef}`
          } as any);
          
          if (itemError) {
            console.error("[CorretivaPecas] Erro ao criar item da solicitação:", itemError);
          }
        }

        // Atualiza o histórico textual da OS
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
            updated_at: new Date().toISOString()
          } as any)
          .eq("id", os.id);
        
        try {
          const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
          const cached = await getCachedOsList();
          const updated = cached.map(o => o.id === os.id ? { ...o, pecas_solicitadas: novoHistorico } : o);
          await cacheOsList(updated);
        } catch (e) {
          console.warn("Erro ao atualizar cache local:", e);
        }

        let queuedPhotos = 0;
        if (materialPhotos.length > 0) {
          try {
            queuedPhotos = await queueMaterialPhotos(requestRef, pecaTexto);
            const { syncPending } = await import("@/lib/corretiva/sync");
            const syncResult = await syncPending();
            if (syncResult.failed > 0) {
              toast.warning(`Pedido ${requestRef} salvo. Algumas fotos permaneceram na fila para nova sincronização.`);
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
    } catch (err: any) {
      console.error("[CorretivaPecas] Erro:", err);
      toast.error("Erro ao processar solicitação: " + (err.message || "Tente novamente"));
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
          updated_at: new Date().toISOString()
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
        const updated = cached.map(o => o.id === os.id ? { ...o, equipe: novaEquipe } : o);
        await cacheOsList(updated);
      } catch (e) {
        console.warn("[CorretivaReclassificar] Erro cache local:", e);
      }

      toast.success(`OS reclassificada para ${novaEquipe}`, { id: toastId });
      
      if (onUpdate) onUpdate();
      
      setTimeout(() => {
        onClose();
      }, 500);
      
    } catch (err: any) {
      console.error("[CorretivaReclassificar] Erro fatal:", err);
      toast.error(`Erro ao reclassificar: ${err.message || "Tente novamente"}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-lg w-[calc(100%-1.5rem)] md:w-full h-auto max-h-[90vh] rounded-3xl overflow-hidden p-0 gap-0 border-white/10 bg-[#0A0A0A] shadow-2xl z-[9999]" 
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-radix-dropdown-menu-content]')) {
            e.preventDefault();
          }
        }}
      >
        <div className="flex flex-col h-full max-h-[90vh] overflow-hidden bg-[#0A0A0A]">
          <div className="p-6 pb-32 space-y-6 flex-1 overflow-y-auto custom-scrollbar bg-[#0A0A0A] relative">
            <DialogHeader className="text-left">
              <div className="flex items-center justify-between mb-3">
                <Badge variant="outline" className={cn("font-mono text-[10px]", equipeStyles(os.equipe).badge)}>
                  OS {os.numero_os}
                </Badge>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  {os.status}
                </Badge>
              </div>
              <DialogTitle className="text-xl font-bold leading-tight text-white">
                {os.nome_os || "Sem descrição"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 text-sm bg-white/5 p-4 rounded-2xl border border-white/5">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase opacity-50 font-bold tracking-tighter">Localização</Label>
                <p className="font-semibold text-white">{os.predio} - {os.andar}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{os.local}</p>
              </div>
              <div className="space-y-1 text-right">
                <Label className="text-[10px] uppercase opacity-50 font-bold tracking-tighter">Equipe</Label>
                <div className="flex items-center justify-end mt-1">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild disabled={!os?.isAdmin && !os?.allowedMenus?.includes("reclassificar-equipe")}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className={cn(
                          "h-9 px-3 text-xs font-bold rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all group pointer-events-auto",
                          equipeStyles(os.equipe).badge
                        )}
                      >
                        <LayoutGrid className="h-3.5 w-3.5 mr-2 opacity-70 group-hover:rotate-90 transition-transform" />
                        {os.equipe || "Não definida"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="bottom" sideOffset={5} className="w-56 p-2 bg-[#0A0A0A] border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200 z-[10000]">
                      <div className="px-2 py-1.5 mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-50">Reclassificar Equipe</p>
                      </div>
                      {[
                        { name: "Elétrica", icon: Zap, color: "text-yellow-400" },
                        { name: "Hidráulica", icon: Droplets, color: "text-blue-400" },
                        { name: "Civil", icon: Hammer, color: "text-emerald-400" },
                        { name: "Chaveiro", icon: Key, color: "text-purple-400" },
                        { name: "Pintura", icon: Paintbrush, color: "text-pink-400" },
                        { name: "Refrigeração", icon: Snowflake, color: "text-cyan-400" },
                        { name: "Limpeza", icon: Trash2, color: "text-cyan-300" }
                      ].map((team) => (
                        <DropdownMenuItem
                          key={team.name}
                          onClick={() => handleReclassificar(team.name)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl cursor-pointer transition-colors focus:bg-white/5",
                            os.equipe === team.name ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
                          )}
                        >
                          <div className={cn("p-1.5 rounded-lg bg-white/5", team.color)}>
                            <team.icon className="h-4 w-4" />
                          </div>
                          {team.name}
                          {os.equipe === team.name && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-[10px] text-muted-foreground italic">Solicitante: {os.solicitante || "-"}</p>
                {os.data_criacao && (
                  <p className="text-[10px] text-primary font-medium mt-1">
                    Abertura: {new Date(os.data_criacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs font-bold text-white/70">Solicitar Peças / Materiais</Label>
                  {hasMaterialDraft && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 animate-pulse">
                      Clique no ✓ verde para anexar
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Ex: Lâmpada LED 9W..." 
                    value={pecas}
                    onChange={(e) => setPecas(e.target.value)}
                    className={cn(
                      "bg-white/5 border-white/10 h-11 text-sm focus:ring-primary/50 text-white transition-all",
                      hasMaterialDraft && "border-emerald-500/40 focus-visible:ring-emerald-500/30"
                    )}
                  />
                  <Button 
                    variant="glass" 
                    size="icon" 
                    className={cn(
                      "h-11 w-11 shrink-0 transition-all duration-300",
                      hasMaterialDraft && !loading && "border-emerald-400/70 bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.35)] animate-pulse hover:bg-emerald-500/30"
                    )}
                    onClick={async () => {
                      const success = await handleSolicitarPeca();
                      if (success) clearMaterialDraft();
                    }}
                    disabled={loading || !hasMaterialDraft}
                    aria-label={hasMaterialDraft ? "Anexar pedido de material" : "Descreva o material para habilitar o pedido"}
                    title={hasMaterialDraft ? "Clique para anexar o pedido de material" : "Descreva o material necessário"}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : hasMaterialDraft ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-300 animate-pulse" />
                    ) : (
                      <Package className="h-4 w-4 text-white/60" />
                    )}
                  </Button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white">Fotos do pedido</p>
                      <p className="text-[9px] text-white/45">
                        Selecione várias imagens da galeria. Elas serão vinculadas automaticamente ao pedido.
                      </p>
                    </div>
                    <label
                      className={cn(
                        "shrink-0 inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 text-[10px] font-bold text-blue-300 transition-all hover:border-blue-400/50 hover:bg-blue-500/15",
                        loading && "pointer-events-none opacity-50"
                      )}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        disabled={loading}
                        onChange={(e) => {
                          handleMaterialPhotosSelected(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                      <ImagePlus className="h-4 w-4" />
                      Galeria
                    </label>
                  </div>

                  {materialPhotos.length > 0 ? (
                    <>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {materialPhotos.map((photo, index) => (
                          <div
                            key={photo.id}
                            className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/20"
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
                              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/75 text-white transition-all hover:bg-red-500 disabled:opacity-50"
                              aria-label={`Remover foto ${index + 1}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[9px]">
                        <span className="font-semibold text-emerald-400">
                          {materialPhotos.length} foto(s) pronta(s) para anexar
                        </span>
                        <span className="text-white/35">Máx. {MAX_MATERIAL_PHOTOS} • 10 MB por foto</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-2.5">
                      <LayoutGrid className="h-4 w-4 shrink-0 text-blue-400/70" />
                      <p className="text-[9px] text-white/40">
                        Nenhuma foto selecionada. O pedido também pode ser enviado sem imagens.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/70">Observações de Campo</Label>
                <div className="flex gap-2">
                  <Textarea 
                    placeholder="Relate o que foi feito no local..."
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="bg-white/5 border-white/10 min-h-[90px] text-sm focus:ring-primary/50 resize-none text-white flex-1"
                  />
                  <Button 
                    variant="glass" 
                    size="icon" 
                    className="h-[90px] w-11 shrink-0" 
                    onClick={async () => {
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
                            kind: "status", // Reuse status sync or create new kind
                            osId: os.id,
                            numeroOs: os.numero_os,
                            payload: { observacao_conclusao: observacao.trim() },
                            createdAt: Date.now(),
                            attempts: 0
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
                      } catch (err) {
                        toast.error("Erro ao salvar observação.");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-white/70">Evidência Fotográfica</Label>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-emerald-500/5 text-emerald-500 border-emerald-500/20 text-[10px] gap-1.5 py-1">
                      <Zap className="h-3 w-3" />
                      Modo Offline Ativo
                    </Badge>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Foto de ANTES */}
                  <div className="space-y-2">
                    <Label className="text-[9px] uppercase opacity-60 font-bold tracking-wider text-center block">Antes</Label>
                    {photoBefore ? (
                      <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 group">
                        <img 
                          src={photoBefore} 
                          alt="Antes" 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button 
                            variant="destructive" 
                            size="icon" 
                            className="rounded-full h-8 w-8"
                            onClick={() => setPhotoBefore(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-rows-2 gap-2 h-full aspect-square">
                        <div className="relative overflow-hidden rounded-xl">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            disabled={loading}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              
                              try {
                                const { outboxAdd, blobPut } = await import("@/lib/corretiva/db");
                                const blobKey = `os-${os.id}-antes-${Date.now()}`;
                                await blobPut(blobKey, file);
                                await outboxAdd({
                                  id: crypto.randomUUID(),
                                  kind: "foto",
                                  osId: os.id,
                                  numeroOs: os.numero_os,
                                  payload: { blobKey, legenda: "Evidência: Antes" },
                                  createdAt: Date.now(),
                                  attempts: 0
                                });
                                
                                setPhotoBefore(URL.createObjectURL(file));
                                toast.success("Foto (Câmera) salva e aguardando sincronização.");
                              } catch (err) {
                                toast.error("Erro ao salvar foto localmente.");
                              }
                            }}
                          />
                          <div className="w-full h-full border-dashed border-2 border-white/10 hover:border-primary/50 flex flex-col items-center justify-center bg-white/5 transition-all">
                            <Camera className="h-5 w-5 text-primary mb-1" />
                            <span className="text-[8px] font-bold text-white uppercase tracking-tighter">Câmera</span>
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-xl">
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            disabled={loading}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              
                              try {
                                const { outboxAdd, blobPut } = await import("@/lib/corretiva/db");
                                const blobKey = `os-${os.id}-antes-galeria-${Date.now()}`;
                                await blobPut(blobKey, file);
                                await outboxAdd({
                                  id: crypto.randomUUID(),
                                  kind: "foto",
                                  osId: os.id,
                                  numeroOs: os.numero_os,
                                  payload: { blobKey, legenda: "Evidência: Antes (Galeria)" },
                                  createdAt: Date.now(),
                                  attempts: 0
                                });
                                
                                setPhotoBefore(URL.createObjectURL(file));
                                toast.success("Foto (Galeria) salva e aguardando sincronização.");
                              } catch (err) {
                                toast.error("Erro ao salvar foto localmente.");
                              }
                            }}
                          />
                          <div className="w-full h-full border-dashed border-2 border-white/10 hover:border-blue-400/50 flex flex-col items-center justify-center bg-white/5 transition-all">
                            <LayoutGrid className="h-4 w-4 text-blue-400 mb-1" />
                            <span className="text-[8px] font-bold text-white uppercase tracking-tighter">Galeria</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Foto de DEPOIS */}
                  <div className="space-y-2">
                    <Label className="text-[9px] uppercase opacity-60 font-bold tracking-wider text-center block">Depois</Label>
                    {photoAfter ? (
                      <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 group">
                        <img 
                          src={photoAfter} 
                          alt="Depois" 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button 
                            variant="destructive" 
                            size="icon" 
                            className="rounded-full h-8 w-8"
                            onClick={() => setPhotoAfter(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-rows-2 gap-2 h-full aspect-square">
                        <div className="relative overflow-hidden rounded-xl">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            disabled={loading}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              
                              try {
                                const { outboxAdd, blobPut } = await import("@/lib/corretiva/db");
                                const blobKey = `os-${os.id}-depois-${Date.now()}`;
                                await blobPut(blobKey, file);
                                await outboxAdd({
                                  id: crypto.randomUUID(),
                                  kind: "foto",
                                  osId: os.id,
                                  numeroOs: os.numero_os,
                                  payload: { blobKey, legenda: "Evidência: Depois" },
                                  createdAt: Date.now(),
                                  attempts: 0
                                });
                                
                                setPhotoAfter(URL.createObjectURL(file));
                                toast.success("Foto (Câmera) salva e aguardando sincronização.");
                              } catch (err) {
                                toast.error("Erro ao salvar foto localmente.");
                              }
                            }}
                          />
                          <div className="w-full h-full border-dashed border-2 border-white/10 hover:border-emerald-500/50 flex flex-col items-center justify-center bg-white/5 transition-all">
                            <Camera className="h-5 w-5 text-emerald-400 mb-1" />
                            <span className="text-[8px] font-bold text-white uppercase tracking-tighter">Câmera</span>
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-xl">
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            disabled={loading}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              
                              try {
                                const { outboxAdd, blobPut } = await import("@/lib/corretiva/db");
                                const blobKey = `os-${os.id}-depois-galeria-${Date.now()}`;
                                await blobPut(blobKey, file);
                                await outboxAdd({
                                  id: crypto.randomUUID(),
                                  kind: "foto",
                                  osId: os.id,
                                  numeroOs: os.numero_os,
                                  payload: { blobKey, legenda: "Evidência: Depois (Galeria)" },
                                  createdAt: Date.now(),
                                  attempts: 0
                                });
                                
                                setPhotoAfter(URL.createObjectURL(file));
                                toast.success("Foto (Galeria) salva e aguardando sincronização.");
                              } catch (err) {
                                toast.error("Erro ao salvar foto localmente.");
                              }
                            }}
                          />
                          <div className="w-full h-full border-dashed border-2 border-white/10 hover:border-blue-400/50 flex flex-col items-center justify-center bg-white/5 transition-all">
                            <LayoutGrid className="h-4 w-4 text-blue-400 mb-1" />
                            <span className="text-[8px] font-bold text-white uppercase tracking-tighter">Galeria</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-6 border-t border-white/10 bg-[#0A0A0A] sticky bottom-0 left-0 right-0 z-[10000]">
            {(os?.isAdmin || os?.allowedMenus?.includes("corretiva-concluir-sem-foto-especial")) && (
              <Button 
                variant="outline" 
                className={cn(
                  "h-12 rounded-xl text-xs font-bold border-white/10 bg-white/5 hover:bg-white/10 text-white",
                  "col-span-1"
                )} 
                disabled={loading}
                onClick={() => handleFinish(false)}
              >
                Concluir s/ Foto {os?.isAdmin ? "(Admin)" : ""}
              </Button>
            )}
            <Button 
              variant="default" 
              className={cn(
                "h-12 rounded-xl text-xs font-bold gap-2 shadow-lg shadow-primary/20",
                (os?.isAdmin || os?.allowedMenus?.includes("corretiva-concluir-sem-foto-especial")) ? "col-span-1" : "col-span-2",
                !(photoBefore && photoAfter) && !os?.isAdmin && !os?.allowedMenus?.includes("corretiva-concluir-sem-foto-especial") && "opacity-50"
              )} 
              disabled={loading || (!(photoBefore && photoAfter) && !os?.isAdmin && !os?.allowedMenus?.includes("corretiva-concluir-sem-foto-especial"))}
              onClick={() => handleFinish(true)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Finalizar c/ Foto
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}