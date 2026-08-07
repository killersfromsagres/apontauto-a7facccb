import { createFileRoute } from '@tanstack/react-router';
import OrganizationalChart from '@/components/ui/organizational-chart';
import { PageShell } from '@/components/page-shell';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addOrganizationalMember } from '@/lib/users.functions';
import { Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useIsAdmin } from '@/hooks/use-is-admin';
import html2canvas from 'html2canvas';
import { useRef } from 'react';

export const Route = createFileRoute('/_authenticated/organograma')({
  component: OrganogramaPage,
});

function OrganogramaPage() {
  const queryClient = useQueryClient();
  const { isAdmin, loading: checkingAdmin } = useIsAdmin();
  const chartRef = useRef<HTMLDivElement>(null);

  const downloadImage = async () => {
    if (!chartRef.current) return;
    
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#0F172A', // Match dashboard background
        scale: 2, // Higher quality
        logging: false,
        useCORS: true, // Needed for remote photos
      });
      
      const link = document.createElement('a');
      link.download = `organograma-demarchi-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success("Imagem baixada com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar imagem do organograma.");
    }
  };

  if (checkingAdmin) {
    return (
      <PageShell title="Estrutura Organizacional" description="Carregando...">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </PageShell>
    );
  }

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      return addOrganizationalMember({
        data: {
          name: 'Novo Colaborador',
          role: 'Definir Cargo',
          level: 4,
          color: '#3B82F6',
          display_order: 99
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizational_members'] });
      toast.success("Novo membro adicionado!");
    }
  });

  return (
    <PageShell 
      title="Estrutura Organizacional"
      description="Hierarquia e cargos da equipe Apont Auto"
    >
      <div className="flex flex-col items-center justify-center py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[1200px] rounded-[2.5rem] bg-white/5 backdrop-blur-md border border-white/10 p-4 sm:p-8 shadow-2xl overflow-hidden relative"
          style={{
            background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.05), transparent), radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.03), transparent)'
          }}
        >
          <div ref={chartRef} className="p-4 sm:p-8">
            <div className="mb-12 flex flex-col items-center relative">
              {/* Logos Section */}
              <div className="flex items-center justify-between w-full mb-8 px-4 sm:px-12">
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10 flex items-center justify-center">
                  <img 
                    src="https://id-preview--bc1896fa-22ee-4484-b349-09c5645d9b9d.lovable.app/lovable-uploads/27170817-062e-4b44-a639-698f1f1d191a.png" 
                    alt="Grupo GPS" 
                    className="h-10 object-contain filter brightness-0 invert" 
                  />
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-3 rounded-2xl border border-white/10 flex items-center justify-center">
                  <img 
                    src="https://id-preview--bc1896fa-22ee-4484-b349-09c5645d9b9d.lovable.app/lovable-uploads/7c7d1e8d-7a7d-4b5a-9d9d-1b1d1d1d1d1d.png" 
                    alt="Sherwin Williams" 
                    className="h-10 object-contain filter brightness-0 invert" 
                    onError={(e) => {
                      // Fallback if the above placeholder is invalid, using a public one for now
                      (e.target as HTMLImageElement).src = "https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sherwin-Williams_logo.svg/1200px-Sherwin-Williams_logo.svg.png";
                    }}
                  />
                </div>
              </div>

              <h2 className="text-4xl font-black text-white mb-3 tracking-tighter uppercase">Organograma Demarchi</h2>
              <div className="w-24 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mb-6" />
            </div>

            <OrganizationalChart isAdmin={isAdmin} />
          </div>

          <div className="flex items-center justify-center gap-4 mt-8 pb-4">
            {isAdmin && (
              <Button 
                onClick={() => addMemberMutation.mutate()}
                className="bg-white/10 hover:bg-white/20 text-white border-white/10"
              >
                <Plus className="mr-2 h-4 w-4" /> Adicionar Membro
              </Button>
            )}
            <Button 
              onClick={downloadImage}
              className="bg-indigo-600 hover:bg-indigo-700 text-white border-none shadow-lg shadow-indigo-500/20"
            >
              <Download className="mr-2 h-4 w-4" /> Baixar PNG
            </Button>
          </div>
        </motion.div>
      </div>
    </PageShell>
  );
}
