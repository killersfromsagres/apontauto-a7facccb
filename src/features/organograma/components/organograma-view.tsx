import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Plus, 
  Trash2, 
  Pencil, 
  UserPlus, 
  Camera,
  ChevronDown,
  ChevronRight,
  ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getOrgData, addOrgMember, updateOrgMember, deleteOrgMember } from "@/lib/organograma/org.functions";
import { checkOrgEditPermission } from "@/lib/organograma/auth.functions";
import { type OrgNode } from "@/features/organograma/types";
import { cn } from "@/lib/utils";
import { InteractiveOrgCard } from "./interactive-org-card";


export function OrganogramaView() {
  const qc = useQueryClient();
  const fetchOrg = useServerFn(getOrgData);
  const checkPerm = useServerFn(checkOrgEditPermission);
  
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [formData, setFormData] = useState({ nome: "", cargo: "", email: "", foto_url: "" });

  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ["organograma"],
    queryFn: () => fetchOrg(),
  });

  const { data: perm } = useQuery({
    queryKey: ["organograma-perm"],
    queryFn: () => checkPerm(),
  });

  const canEdit = perm?.allowed || false;

  const addMutation = useMutation({
    mutationFn: useServerFn(addOrgMember),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organograma"] });
      setIsDialogOpen(false);
      toast.success("Membro adicionado");
    }
  });

  const editMutation = useMutation({
    mutationFn: useServerFn(updateOrgMember),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organograma"] });
      setIsDialogOpen(false);
      toast.success("Membro atualizado");
    }
  });


  const handleOpenAdd = (parentId: string | null = null) => {
    if (!canEdit) return;
    setDialogMode("add");
    setFormData({ nome: "", cargo: "", email: "", foto_url: "" });
    setSelectedNode(parentId ? { id: parentId } as OrgNode : null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (node: OrgNode) => {
    if (!canEdit) return;
    setDialogMode("edit");
    setFormData({ 
      nome: node.nome, 
      cargo: node.cargo, 
      email: node.email || "", 
      foto_url: node.foto_url || "" 
    });
    setSelectedNode(node);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dialogMode === "add") {
      addMutation.mutate({ data: { ...formData, parent_id: selectedNode?.id || null } });
    } else if (selectedNode) {
      editMutation.mutate({ data: { id: selectedNode.id, patch: formData } });
    }
  };

  // Removido deleteMutation duplicado que causava erro de build


  const deleteMutation = useMutation({
    mutationFn: useServerFn(deleteOrgMember),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organograma"] });
      toast.success("Membro removido");
    }
  });

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ data: { id } });
  };

  const renderTree = (parentId: string | null = null, level = 0) => {
    const children = nodes.filter(n => n.parent_id === parentId);
    if (children.length === 0) return null;

    return (
      <div className={cn("flex flex-col gap-4", level > 0 && "ml-8 border-l border-white/10 pl-8 py-2")}>
        {children.map(node => (
          <div key={node.id} className="space-y-4">
            <InteractiveOrgCard 
              node={node} 
              canEdit={canEdit} 
              onEdit={() => handleOpenEdit(node)}
              onAdd={() => handleOpenAdd(node.id)}
              onDelete={() => handleDelete(node.id)}
            />
            {renderTree(node.id, level + 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <PageShell 
      title="Organograma" 
      eyebrow="Gestão Organizacional"
      description="Visualize e gerencie a hierarquia da equipe."
      actions={canEdit && (
        <Button onClick={() => handleOpenAdd(null)} className="gap-2 bg-primary-glow hover:bg-primary-glow/90 text-white border-none">
          <UserPlus className="h-4 w-4" /> Novo Líder
        </Button>
      )}
    >
      {!canEdit && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5" />
          <p className="text-sm">Apenas usuários autorizados podem editar o organograma.</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : nodes.length > 0 ? (
        <div className="pb-20">
          {renderTree(null)}
        </div>
      ) : (
        <GlassCard className="py-20 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Nenhum membro cadastrado</h3>
          <p className="text-sm text-muted-foreground mb-6">Comece adicionando o primeiro nível da hierarquia.</p>
          {canEdit && (
            <Button onClick={() => handleOpenAdd(null)} variant="outline">
              Adicionar Membro
            </Button>
          )}
        </GlassCard>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="glass-surface border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>{dialogMode === "add" ? "Adicionar Membro" : "Editar Membro"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo</Label>
              <Input 
                id="nome" 
                value={formData.nome} 
                onChange={e => setFormData(d => ({ ...d, nome: e.target.value }))}
                className="bg-white/5 border-white/10"
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cargo">Cargo / Função</Label>
              <Input 
                id="cargo" 
                value={formData.cargo} 
                onChange={e => setFormData(d => ({ ...d, cargo: e.target.value }))}
                className="bg-white/5 border-white/10"
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail (Opcional)</Label>
              <Input 
                id="email" 
                type="email"
                value={formData.email} 
                onChange={e => setFormData(d => ({ ...d, email: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="foto">URL da Foto de Perfil</Label>
              <Input 
                id="foto" 
                value={formData.foto_url} 
                onChange={e => setFormData(d => ({ ...d, foto_url: e.target.value }))}
                className="bg-white/5 border-white/10"
                placeholder="https://..."
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary-glow text-white border-none">
                {dialogMode === "add" ? "Salvar Membro" : "Atualizar Dados"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}


function Users({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
