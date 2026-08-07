import { createFileRoute } from '@tanstack/react-router';
import OrganizationalChart from '@/components/ui/organizational-chart';
import { PageShell } from '@/components/page-shell';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/organograma')({
  component: OrganogramaPage,
});

function OrganogramaPage() {
  const queryClient = useQueryClient();
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    }
  });

  const isAdmin = session?.user?.user_metadata?.role === 'admin' || 
                  session?.user?.email === 'admin@admin.com';

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('organizational_members')
        .insert({
          name: 'Novo Colaborador',
          role: 'Definir Cargo',
          level: 4,
          color: '#3B82F6',
          display_order: 99
        });
      if (error) throw error;
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
          className="w-full max-w-[1200px] rounded-[2.5rem] bg-white/5 backdrop-blur-md border border-white/10 p-4 sm:p-8 shadow-2xl overflow-hidden"
          style={{
            background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.05), transparent), radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.03), transparent)'
          }}
        >
          <div className="mb-12 flex flex-col items-center">
            <h2 className="text-4xl font-black text-white mb-3 tracking-tighter uppercase">Organograma Demarchi</h2>
            <div className="w-24 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mb-6" />
            
            {isAdmin && (
              <Button 
                onClick={() => addMemberMutation.mutate()}
                className="bg-white/10 hover:bg-white/20 text-white border-white/10"
              >
                <Plus className="mr-2 h-4 w-4" /> Adicionar Membro
              </Button>
            )}
          </div>

          <OrganizationalChart isAdmin={isAdmin} />
        </motion.div>
      </div>
    </PageShell>
  );
}
