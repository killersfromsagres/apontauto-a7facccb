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
import { useRef, useState } from 'react';

export const Route = createFileRoute('/_authenticated/organograma')({
  component: OrganogramaPage,
});

function OrganogramaPage() {
  const queryClient = useQueryClient();
  const { isAdmin, loading: checkingAdmin } = useIsAdmin();
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const downloadImage = async () => {
    if (!chartRef.current) return;
    
    setIsExporting(true);
    // Pequeno delay para garantir que o estado de exportação foi aplicado (muda logos para escuros)
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#FFFFFF',
        scale: 2,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 60000, // Aumentado para lidar com muitas imagens
        logging: true,
        scrollX: 0,
        scrollY: 0, // Removido ajuste de scroll para evitar corte
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        x: chartRef.current.getBoundingClientRect().left + window.scrollX,
        y: chartRef.current.getBoundingClientRect().top + window.scrollY,
        width: chartRef.current.scrollWidth,
        height: chartRef.current.scrollHeight,
      });
      
      const link = document.createElement('a');
      link.download = `organograma-demarchi-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success("Imagem baixada com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar imagem do organograma.");
    } finally {
      setIsExporting(false);
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
          className={`w-full max-w-[1200px] rounded-[2.5rem] ${isExporting ? 'bg-white' : 'bg-white/5 backdrop-blur-md border border-white/10'} p-4 sm:p-8 shadow-2xl overflow-hidden relative`}
          style={isExporting ? {} : {
            background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.05), transparent), radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.03), transparent)'
          }}
        >
          <div 
            ref={chartRef} 
            className={`p-4 sm:p-8 transition-colors duration-300 ${isExporting ? 'bg-white' : ''}`}
          >
            <div className="mb-12 flex flex-col items-center relative">
              <h2 className={`text-4xl font-black mb-3 tracking-tighter uppercase transition-colors ${isExporting ? 'text-slate-900' : 'text-white'}`}>
                Organograma Demarchi
              </h2>
              <div className="w-24 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mb-6" />
            </div>

            <OrganizationalChart isAdmin={isAdmin} isExporting={isExporting} />
          </div>

          {!isExporting && (
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
          )}
        </motion.div>
      </div>
    </PageShell>
  );
}
