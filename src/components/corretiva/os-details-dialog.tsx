import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Package, CheckCircle2, X, Loader2, ArrowRightLeft } from "lucide-react";
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

export function OsDetailsDialog({ os, isOpen, onClose, onUpdate }: OsDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [photoBefore, setPhotoBefore] = useState<string | null>(null);
  const [photoAfter, setPhotoAfter] = useState<string | null>(null);
  const [pecas, setPecas] = useState(os.pecas_solicitadas || "");
  const [observacao, setObservacao] = useState(os.observacao_conclusao || "");

  const handleFinish = async (withPhoto: boolean) => {
    // Audit: useMyAccess hook provides access object, but here we receive os.allowedMenus injected in the route
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

      // 1. Atualizar status na tabela principal (corretiva_os)
      const { error: statusError } = await supabase
        .from("corretiva_os")
        .update({
          status: "concluida",
          updated_at: new Date().toISOString(),
          // Se houver observação ou peças, poderíamos tentar salvar aqui se a tabela permitisse,
          // mas como estamos em auditoria e a tabela pode estar bloqueada, usamos as auxiliares.
        } as any)
        .eq("id", os.id);

      if (statusError) throw statusError;

      // 2. Persistir evidências fotográficas (tabela corretiva_fotos)
      if (photoBefore) {
        const { error: photoBeforeErr } = await supabase.from("corretiva_fotos").insert({
          os_id: os.id,
          image_url: photoBefore,
          legenda: "Evidência: Antes",
          enviado_por: userId
        } as any);
        if (photoBeforeErr) {
          console.error("[CorretivaAudit] Erro ao salvar foto Antes no banco:", photoBeforeErr);
          throw new Error("Erro ao salvar foto de evidência (Antes).");
        }
      }
      if (photoAfter) {
        const { error: photoAfterErr } = await supabase.from("corretiva_fotos").insert({
          os_id: os.id,
          image_url: photoAfter,
          legenda: "Evidência: Depois",
          enviado_por: userId
        } as any);
        if (photoAfterErr) {
          console.error("[CorretivaAudit] Erro ao salvar foto Depois no banco:", photoAfterErr);
          throw new Error("Erro ao salvar foto de evidência (Depois).");
        }
      }

      // 3. Persistir peças solicitadas (tabela corretiva_pecas)
      if (pecas) {
        const { error: pecasErr } = await supabase.from("corretiva_pecas").insert({
          os_id: os.id,
          descricao: pecas,
          quantidade: 1,
          enviado_por: userId
        } as any);
        if (pecasErr) console.warn("Erro ao salvar peças:", pecasErr);
      }

      // 4. Sincronizar com cache local (opcional, mas bom para UX offline)
      try {
        const { getCachedOsList, cacheOsList } = await import("@/lib/corretiva/db");
        const cached = await getCachedOsList();
        const updated = cached.map(o => o.id === os.id ? { ...o, status: 'concluida' } : o);
        await cacheOsList(updated);
      } catch (e) {
        console.warn("Erro ao atualizar cache local:", e);
      }

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

  const handleSolicitarPeca = async () => {
    if (!pecas) {
      toast.error("Descreva as peças necessárias.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("corretiva_os")
        .update({ pecas_solicitadas: pecas } as any)
        .eq("id", os.id);

      if (error) throw error;
      toast.success("Solicitação de peça registrada.");
    } catch (err) {
      toast.error("Erro ao solicitar peças.");
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
      <DialogContent className="max-w-lg w-[calc(100%-1.5rem)] md:w-full h-auto max-h-[90vh] rounded-3xl overflow-hidden p-0 gap-0 border-white/10 bg-[#0A0A0A] shadow-2xl z-[9999]">
        <div className="flex flex-col h-full max-h-[90vh] overflow-hidden bg-[#0A0A0A]">
          <div className="p-6 pb-32 space-y-6 flex-1 overflow-y-auto custom-scrollbar bg-[#0A0A0A]">
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
                <div className="flex items-center justify-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className={cn("h-7 px-2 text-xs font-bold rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-primary gap-1")}>
                        {os.equipe || "Não definida"}
                        <ArrowRightLeft className="h-3 w-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#0A0A0A]/95 border-white/10 backdrop-blur-xl rounded-xl">
                      {["Elétrica", "Hidráulica", "Civil", "Chaveiro", "Pintura", "Refrigeração"].map((e) => (
                        <DropdownMenuItem
                          key={e}
                          onClick={() => handleReclassificar(e)}
                          className="text-xs focus:bg-white/10 cursor-pointer text-white"
                        >
                          {e}
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
                <Label className="text-xs font-bold text-white/70">Solicitar Peças / Materiais</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Ex: Lâmpada LED 9W..." 
                    value={pecas}
                    onChange={(e) => setPecas(e.target.value)}
                    className="bg-white/5 border-white/10 h-11 text-sm focus:ring-primary/50 text-white"
                  />
                  <Button 
                    variant="glass" 
                    size="icon" 
                    className="h-11 w-11 shrink-0" 
                    onClick={handleSolicitarPeca}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4 text-white" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/70">Observações de Campo</Label>
                <Textarea 
                  placeholder="Relate o que foi feito no local..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="bg-white/5 border-white/10 min-h-[90px] text-sm focus:ring-primary/50 resize-none text-white"
                />
              </div>

              <div className="space-y-4">
                <Label className="text-xs font-bold text-white/70">Evidência Fotográfica</Label>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Foto de ANTES */}
                  <div className="space-y-2">
                    <Label className="text-[9px] uppercase opacity-60 font-bold tracking-wider text-center block">Antes</Label>
                    {photoBefore ? (
                      <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 group">
                        <img src={photoBefore} alt="Antes" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
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
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          disabled={loading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            setLoading(true);
                            try {
                              const formData = new FormData();
                              formData.append("image", file);
                              formData.append("module", "corretiva-novo");
                              formData.append("name", `os-${os.numero_os}-antes-${Date.now()}`);

                              const res = await fetch("/api/imgbb-upload", {
                                method: "POST",
                                headers: {
                                  "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`
                                },
                                body: formData,
                              });
                              
                              if (!res.ok) {
                                const errorData = await res.json().catch(() => ({}));
                                throw new Error(errorData.error || `Erro HTTP ${res.status}`);
                              }
                              
                              const data = await res.json();
                              if (!data.url) throw new Error("URL da imagem não retornada");
                              
                              setPhotoBefore(data.url);
                              toast.success("Foto 'Antes' carregada!");
                            } catch (err: any) {
                              console.error("[CorretivaPhoto] Erro upload Antes:", err);
                              toast.error(`Falha no upload: ${err.message}`);
                            } finally {
                              setLoading(false);
                            }
                          }}
                        />
                        <div className={cn(
                          "w-full aspect-square border-dashed border-2 border-white/10 hover:border-primary/50 flex flex-col items-center justify-center rounded-2xl bg-white/5 transition-all",
                          loading && "opacity-50"
                        )}>
                          {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Camera className="h-6 w-6 text-primary mb-1" />}
                          <span className="text-[9px] font-bold text-white uppercase tracking-tighter text-center px-1">Tirar Foto Antes</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Foto de DEPOIS */}
                  <div className="space-y-2">
                    <Label className="text-[9px] uppercase opacity-60 font-bold tracking-wider text-center block">Depois</Label>
                    {photoAfter ? (
                      <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 group">
                        <img src={photoAfter} alt="Depois" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
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
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          disabled={loading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            setLoading(true);
                            try {
                              const formData = new FormData();
                              formData.append("image", file);
                              formData.append("module", "corretiva-novo");
                              formData.append("name", `os-${os.numero_os}-depois-${Date.now()}`);

                              const res = await fetch("/api/imgbb-upload", {
                                method: "POST",
                                headers: {
                                  "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`
                                },
                                body: formData,
                              });
                              
                              if (!res.ok) {
                                const errorData = await res.json().catch(() => ({}));
                                throw new Error(errorData.error || `Erro HTTP ${res.status}`);
                              }

                              const data = await res.json();
                              if (!data.url) throw new Error("URL da imagem não retornada");
                              
                              setPhotoAfter(data.url);
                              toast.success("Foto 'Depois' carregada!");
                            } catch (err: any) {
                              console.error("[CorretivaPhoto] Erro upload Depois:", err);
                              toast.error(`Falha no upload: ${err.message}`);
                            } finally {
                              setLoading(false);
                            }
                          }}
                        />
                        <div className={cn(
                          "w-full aspect-square border-dashed border-2 border-white/10 hover:border-emerald-500/50 flex flex-col items-center justify-center rounded-2xl bg-white/5 transition-all",
                          loading && "opacity-50"
                        )}>
                          {loading ? <Loader2 className="h-5 w-5 animate-spin text-emerald-400" /> : <Camera className="h-6 w-6 text-emerald-400 mb-1" />}
                          <span className="text-[9px] font-bold text-white uppercase tracking-tighter text-center px-1">Tirar Foto Depois</span>
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
