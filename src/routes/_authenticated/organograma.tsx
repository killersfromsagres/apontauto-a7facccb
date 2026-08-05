import { createFileRoute } from '@tanstack/react-router';
import OrganizationalChart from '@/components/ui/organizational-chart';
import { PageShell } from '@/components/page-shell';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_authenticated/organograma')({
  component: OrganogramaPage,
});

function OrganogramaPage() {
  // Check admin status for the "Add photo" buttons
  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    }
  });

  const isAdmin = session?.user?.user_metadata?.role === 'admin' || 
                  session?.user?.email === 'admin@admin.com' ||
                  session?.user?.id === 'e48a7b45-1c3a-4416-8c43-238497676646'; // Example admin ID check if needed

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
          <div className="mb-12 text-center">
            <h2 className="text-4xl font-black text-white mb-3 tracking-tighter uppercase">ORGANIZATIONAL CHART</h2>
            <div className="w-24 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto rounded-full" />
          </div>

          <OrganizationalChart isAdmin={isAdmin} />
        </motion.div>
      </div>
    </PageShell>
  );
}
