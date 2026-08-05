import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  role: string;
  photo_url?: string;
  level: number;
  parent_id?: string;
  color?: string;
}

const DEFAULT_MEMBERS: Partial<Member>[] = [
  { name: "Anne H. Cavalcante", role: "ADM/RH", level: 0, color: "#f43f5e" },
  { name: "Adriana Gergye", role: "TST", level: 1, color: "#f59e0b" },
  { name: "Carlos G. Marrese", role: "Coordenador de operações IFM", level: 1, color: "#10b981" },
  { name: "Risomar P. Costa", role: "Supervisora Soft", level: 2, color: "#06b6d4" },
  { name: "Reynaldo Carpinetti", role: "Supervisor de manutenção", level: 2, color: "#8b5cf6" },
  { name: "Thalita T. Correa", role: "Mensageria", level: 3, color: "#d946ef" },
  { name: "Debora Keiko", role: "Supervisora Uniformes", level: 3, color: "#ec4899" },
  { name: "Edimacio Messias", role: "Encarregado Manutenção", level: 3, color: "#8b5cf6" },
  { name: "Zilda F. de Souza", role: "Líder Limpeza", level: 4, color: "#06b6d4" },
  { name: "Jessica C. Barone", role: "Supervisora Serviços", level: 3, color: "#06b6d4" },
  { name: "Felipe França", role: "Encarregado Manutenção", level: 3, color: "#8b5cf6" },
  { name: "Gabriel V. Lemos", role: "Planejador/Programador", level: 4, color: "#6366f1" },
  { name: "José Erisvaldo", role: "Líder Jardinagem", level: 4, color: "#10b981" },
  { name: "Solange Maria", role: "Líder Limpeza", level: 4, color: "#06b6d4" }
];

export default function OrganizationalChart({ isAdmin }: { isAdmin: boolean }) {
  const { data: members = [], refetch } = useQuery({
    queryKey: ['org-chart-members'],
    queryFn: async () => {
      // In a real app, this would come from a table. 
      // For now, we use the requested data and simulate persistence via local state/storage or just show the requested ones.
      return DEFAULT_MEMBERS.map((m, i) => ({ ...m, id: String(i) })) as Member[];
    }
  });

  const handleUploadPhoto = (memberId: string) => {
    if (!isAdmin) return;
    toast.info("Funcionalidade de upload para o colaborador " + memberId + " em breve.");
  };

  // Group by levels for a vertical/hierarchical layout
  const levels = Array.from(new Set(members.map(m => m.level))).sort((a, b) => a - b);

  return (
    <div className="w-full overflow-x-auto pb-20">
      <div className="flex flex-col items-center gap-12 min-w-[1000px] p-8">
        {levels.map((level) => (
          <div key={level} className="flex flex-wrap justify-center gap-8 relative w-full">
            {/* Horizontal connection line for siblings (visual only) */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-white/10 -z-10" />
            
            {members.filter(m => m.level === level).map((member) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative flex flex-col items-center group"
              >
                {/* Vertical connection line (top) */}
                {level > 0 && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-px h-12 bg-white/20" />
                )}

                <div 
                  className="relative p-1 rounded-full border-4 shadow-xl mb-4 transition-transform group-hover:scale-105"
                  style={{ borderColor: member.color || '#fff' }}
                >
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-white/10 backdrop-blur-sm relative">
                    {member.photo_url ? (
                      <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20">
                        <Camera size={32} />
                      </div>
                    )}
                    
                    {isAdmin && (
                      <button 
                        onClick={() => handleUploadPhoto(member.id)}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                      >
                        <Plus className="text-white" size={24} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-center bg-white/5 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl shadow-lg min-w-[180px]">
                  <h3 className="font-bold text-white text-sm whitespace-nowrap">{member.name}</h3>
                  <p className="text-xs text-white/60 font-medium uppercase tracking-wider">{member.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
