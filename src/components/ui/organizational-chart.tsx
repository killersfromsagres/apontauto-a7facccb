import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Plus, Edit2, Save, X, Trash2, Palette, GripVertical, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { updateMemberOrder, updateOrganizationalMember } from '@/lib/users.functions';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Member {
  id: string;
  name: string;
  role: string;
  photo_url?: string | null;
  level: number;
  color: string;
  display_order: number;
}

export default function OrganizationalChart({ isAdmin, isExporting }: { isAdmin: boolean, isExporting?: boolean }) {
  const queryClient = useQueryClient();
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['organizational_members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizational_members')
        .select('*');
      
      if (error) throw error;
      
      const getPriority = (role: string) => {
        const r = role.toLowerCase();
        if (r.includes('adm') || r.includes('rh') || r.includes('gerente')) return 1;
        if (r.includes('tst') || r.includes('segurança')) return 2;
        if (r.includes('coord')) return 3;
        if (r.includes('superv')) return 4;
        if (r.includes('encarreg')) return 5;
        if (r.includes('líder') || r.includes('lider')) return 6;
        return 10;
      };

      return (data as Member[]).sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        const prioA = getPriority(a.role);
        const prioB = getPriority(b.role);
        if (prioA !== prioB) return prioA - prioB;
        return a.display_order - b.display_order;
      });
    }
  });

  const updateMemberMutation = useMutation({
    mutationFn: async (updatedMember: Partial<Member> & { id: string }) => {
      const { id, ...updates } = updatedMember;
      return updateOrganizationalMember({ data: { id, ...updates } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizational_members'] });
      toast.success("Membro atualizado com sucesso!");
      setIsDialogOpen(false);
      setEditingMember(null);
    },
    onError: (error) => {
      console.error(error);
      toast.error("Erro ao atualizar membro.");
    }
  });

  const updateOrderMutation = useMutation({
    mutationFn: updateMemberOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizational_members'] });
    },
    onError: () => {
      toast.error("Erro ao atualizar ordem.");
    }
  });

  const handleMove = (member: Member, direction: 'left' | 'right' | 'up' | 'down') => {
    const levelMembers = members.filter(m => m.level === member.level);
    const currentIndex = levelMembers.findIndex(m => m.id === member.id);
    
    if (direction === 'left' || direction === 'right') {
      const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= levelMembers.length) return;
      const targetMember = levelMembers[targetIndex];
      const updates = [
        { id: member.id, display_order: targetMember.display_order },
        { id: targetMember.id, display_order: member.display_order }
      ];
      updateOrderMutation.mutate({ data: updates });
    } else {
      // Mover entre níveis (up/down)
      const currentLevel = member.level;
      const targetLevel = direction === 'up' ? currentLevel - 1 : currentLevel + 1;
      if (targetLevel < 0 || targetLevel > 10) return; // Limite arbitrário de níveis

      // Quando muda de nível, ele vai para o final da fila daquele nível
      const targetLevelMembers = members.filter(m => m.level === targetLevel);
      const maxOrder = targetLevelMembers.length > 0 
        ? Math.max(...targetLevelMembers.map(m => m.display_order))
        : 0;

      updateMemberMutation.mutate({ 
        id: member.id, 
        level: targetLevel,
        display_order: maxOrder + 1
      });
    }
  };

  const handleUploadPhoto = async (memberId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isAdmin) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${memberId}-${Math.random()}.${fileExt}`;
      const filePath = `org-chart/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('backorder_blobs') // Using existing bucket or we should ensure one exists. Let's try to use public URL if possible or just ImgBB
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('backorder_blobs')
        .getPublicUrl(filePath);

      updateMemberMutation.mutate({ id: memberId, photo_url: publicUrl });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao fazer upload da imagem.");
    }
  };

  const handleSaveEdit = () => {
    if (editingMember) {
      updateMemberMutation.mutate(editingMember);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  const levels = Array.from(new Set(members.map(m => m.level))).sort((a, b) => a - b);

  return (
    <div className="w-full overflow-x-auto pb-20 custom-scrollbar">
      <div className={`flex flex-col items-center gap-16 min-w-[1100px] p-12 relative transition-colors duration-300 ${isExporting ? 'bg-white' : ''}`}>
        
        {levels.map((level) => (
          <div key={level} className="flex flex-wrap justify-center gap-12 relative w-full">
            {/* Linhas de conexão vertical entre níveis */}
            {level < levels[levels.length - 1] && (
               <div className={`absolute -bottom-16 left-1/2 -translate-x-1/2 w-px h-16 transition-colors ${isExporting ? 'bg-slate-200' : 'bg-white/10'} -z-10`} />
            )}
            
            {members.filter(m => m.level === level).map((member) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative flex flex-col items-center"
              >
                {/* Avatar Circle */}
                <div 
                  className="relative p-1.5 rounded-full border-[3px] shadow-2xl mb-5 transition-all duration-300 hover:scale-110 z-10"
                  style={{ borderColor: member.color, boxShadow: `0 0 20px ${member.color}33` }}
                >
                  <div className={`w-28 h-28 rounded-full overflow-hidden transition-all duration-300 relative group cursor-pointer ${isExporting ? 'bg-slate-100 border border-slate-200' : 'bg-white/5 backdrop-blur-md'}`}
                    onClick={() => {
                      if (isAdmin) {
                        setEditingMember(member);
                        setIsDialogOpen(true);
                      }
                    }}
                  >
                    {member.photo_url ? (
                      <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10">
                        <Camera size={36} />
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 gap-2">
                      <div className="flex flex-col items-center gap-2">
                        <Camera className="text-white" size={24} />
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">Alterar Foto</span>
                      </div>
                    </div>
                  </div>
                  
                  {isAdmin && (
                    <label className="absolute -top-2 -right-2 bg-indigo-600 p-1.5 rounded-full cursor-pointer hover:bg-indigo-700 transition-colors shadow-lg z-20" title="Adicionar/Alterar Foto">
                      <Camera size={14} className="text-white" />
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => handleUploadPhoto(member.id, e)}
                      />
                    </label>
                  )}
                  
                  {/* Pontos de conexão lateral */}
                  <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2" style={{ borderColor: member.color }} />
                  <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2" style={{ borderColor: member.color }} />
                </div>

                {/* Info Card */}
                <div className="text-center group w-full relative">
                  {/* Vertical Move Controls (Up/Down) */}
                  {isAdmin && (
                    <div className="absolute -top-36 left-1/2 -translate-x-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                      <button 
                        onClick={() => handleMove(member, 'up')}
                        className="bg-indigo-600/80 p-1.5 rounded-full hover:bg-indigo-600 text-white shadow-lg backdrop-blur-sm"
                        title="Subir nível"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button 
                        onClick={() => handleMove(member, 'down')}
                        className="bg-indigo-600/80 p-1.5 rounded-full hover:bg-indigo-600 text-white shadow-lg backdrop-blur-sm"
                        title="Descer nível"
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-2 mb-1">
                    {isAdmin && (
                      <button 
                        onClick={() => handleMove(member, 'left')}
                        className="p-2 hover:bg-indigo-600/20 rounded-full opacity-0 group-hover:opacity-100 transition-all bg-white/5 border border-white/10"
                        title="Mover para esquerda"
                      >
                        <ChevronLeft size={16} className="text-indigo-400" />
                      </button>
                    )}
                    <h3 className="font-black text-white text-base tracking-tight uppercase truncate max-w-[150px]">{member.name}</h3>
                    {isAdmin && (
                      <button 
                        onClick={() => handleMove(member, 'right')}
                        className="p-2 hover:bg-indigo-600/20 rounded-full opacity-0 group-hover:opacity-100 transition-all bg-white/5 border border-white/10"
                        title="Mover para direita"
                      >
                        <ChevronRight size={16} className="text-indigo-400" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-[0.2em] leading-tight max-w-[180px] mx-auto">
                    {member.role}
                  </p>
                  <div className="mt-3 w-8 h-0.5 mx-auto rounded-full opacity-30" style={{ backgroundColor: member.color }} />
                </div>
              </motion.div>
            ))}
          </div>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-[#1A1F2C] border-white/10 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Membro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col items-center justify-center mb-4">
              <div 
                className="w-24 h-24 rounded-full border-4 overflow-hidden bg-white/5 relative group cursor-pointer mb-2"
                style={{ borderColor: editingMember?.color || '#6366f1' }}
              >
                {editingMember?.photo_url ? (
                  <img src={editingMember.photo_url} alt={editingMember.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/10">
                    <Camera size={24} />
                  </div>
                )}
                <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <div className="flex flex-col items-center gap-1">
                    <Camera className="text-white" size={24} />
                    <span className="text-[10px] text-white font-bold uppercase">Alterar</span>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => editingMember && handleUploadPhoto(editingMember.id, e)}
                  />
                </label>
              </div>
              <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Clique para alterar foto</p>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4 border-white/10 text-white bg-white/5 hover:bg-white/10"
                onClick={() => document.getElementById('dialog-photo-input')?.click()}
              >
                <Camera size={14} className="mr-2" /> Selecionar da Galeria
              </Button>
              <input 
                id="dialog-photo-input"
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={(e) => editingMember && handleUploadPhoto(editingMember.id, e)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={editingMember?.name || ''}
                onChange={(e) => setEditingMember(prev => prev ? { ...prev, name: e.target.value } : null)}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Cargo</Label>
              <Input
                id="role"
                value={editingMember?.role || ''}
                onChange={(e) => setEditingMember(prev => prev ? { ...prev, role: e.target.value } : null)}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="color">Cor da Borda</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="color"
                  type="color"
                  value={editingMember?.color || '#6366f1'}
                  onChange={(e) => setEditingMember(prev => prev ? { ...prev, color: e.target.value } : null)}
                  className="w-12 h-10 p-1 bg-white/5 border-white/10"
                />
                <Input
                  value={editingMember?.color || ''}
                  onChange={(e) => setEditingMember(prev => prev ? { ...prev, color: e.target.value } : null)}
                  className="flex-1 bg-white/5 border-white/10"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="border-white/10 text-white hover:bg-white/5">
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} className="bg-indigo-600 hover:bg-indigo-700">
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />
    </div>
  );
}