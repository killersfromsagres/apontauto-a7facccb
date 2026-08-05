import React from 'react';
import { motion } from 'framer-motion';
import { Camera, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  role: string;
  photo_url?: string;
  level: number;
  color: string;
  parentId?: string;
}

const MEMBERS: Member[] = [
  // Nível 0 - Top (ADM/RH)
  { id: "1", name: "Anne H. Cavalcante", role: "ADM/RH", level: 0, color: "#ec4899" }, // Rosa
  
  // Nível 1 - Coordenação/Supervisão
  { id: "2", name: "Adriana Gergye", role: "TST", level: 1, color: "#f59e0b" }, // Laranja
  { id: "3", name: "Carlos G. Marrese", role: "Coordenador de operações IFM", level: 1, color: "#10b981" }, // Verde
  
  // Nível 2 - Supervisão
  { id: "4", name: "Risomar P. Costa", role: "Supervisora Soft", level: 2, color: "#06b6d4" }, // Ciano
  { id: "5", name: "Reynaldo Carpinetti", role: "Supervisor de manutenção", level: 2, color: "#8b5cf6" }, // Roxo
  
  // Nível 3 - Supervisão/Encarregados
  { id: "6", name: "Thalita T. Correa", role: "Mensageria", level: 3, color: "#ec4899" },
  { id: "7", name: "Debora Keiko", role: "Supervisora Uniformes", level: 3, color: "#f59e0b" },
  { id: "8", name: "Edimacio Messias", role: "Encarregado Manutenção", level: 3, color: "#8b5cf6" },
  { id: "10", name: "Jessica C. Barone", role: "Supervisora Serviços", level: 3, color: "#06b6d4" },
  { id: "11", name: "Felipe França", role: "Encarregado Manutenção", level: 3, color: "#8b5cf6" },
  
  // Nível 4 - Líderes/Planejamento
  { id: "9", name: "Zilda F. de Souza", role: "Líder Limpeza", level: 4, color: "#06b6d4" },
  { id: "12", name: "Gabriel V. Lemos", role: "Planejador/Programador", level: 4, color: "#6366f1" },
  { id: "13", name: "José Erisvaldo", role: "Líder Jardinagem", level: 4, color: "#10b981" },
  { id: "14", name: "Solange Maria", role: "Líder Limpeza", level: 4, color: "#06b6d4" }
];

export default function OrganizationalChart({ isAdmin }: { isAdmin: boolean }) {
  const handleUploadPhoto = (memberId: string) => {
    if (!isAdmin) return;
    toast.info("Upload de foto para " + MEMBERS.find(m => m.id === memberId)?.name);
  };

  const levels = [0, 1, 2, 3, 4];

  return (
    <div className="w-full overflow-x-auto pb-20 custom-scrollbar">
      <div className="flex flex-col items-center gap-16 min-w-[1100px] p-12 relative">
        
        {levels.map((level) => (
          <div key={level} className="flex flex-wrap justify-center gap-12 relative w-full">
            {/* Linhas de conexão vertical entre níveis */}
            {level < 4 && (
               <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-px h-16 bg-white/10 -z-10" />
            )}
            
            {MEMBERS.filter(m => m.level === level).map((member) => (
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
                  <div className="w-28 h-28 rounded-full overflow-hidden bg-white/5 backdrop-blur-md relative group">
                    {member.photo_url ? (
                      <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10">
                        <Camera size={36} />
                      </div>
                    )}
                    
                    {isAdmin && (
                      <button 
                        onClick={() => handleUploadPhoto(member.id)}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                      >
                        <Plus className="text-white" size={28} />
                      </button>
                    )}
                  </div>
                  
                  {/* Pontos de conexão lateral (estilo a foto) */}
                  <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2" style={{ borderColor: member.color }} />
                  <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2" style={{ borderColor: member.color }} />
                </div>

                {/* Info Card */}
                <div className="text-center group">
                  <h3 className="font-black text-white text-base tracking-tight mb-0.5 uppercase">{member.name}</h3>
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-[0.2em] leading-tight max-w-[180px] mx-auto">
                    {member.role}
                  </p>
                  <div className="mt-3 w-8 h-0.5 mx-auto rounded-full opacity-30" style={{ backgroundColor: member.color }} />
                </div>
              </motion.div>
            ))}
          </div>
        ))}

        {/* SVG para linhas complexas se necessário, mas o layout de grid/flex resolve bem a maioria */}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}} />
    </div>
  );
}
