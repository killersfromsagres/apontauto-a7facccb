import { createFileRoute } from '@tanstack/react-router';
import OrbitCarousel from '@/components/ui/orbiting-carousel-with-animated-icons';
import { PageShell } from '@/components/page-shell';
import { Users } from 'lucide-react';
import { motion } from 'framer-motion';

export const Route = createFileRoute('/_authenticated/organograma')({
  component: OrganogramaPage,
});

function OrganogramaPage() {
  return (
    <PageShell 
      title="Antes de realizar qualquer ação, entenda o contexto e instrução recente do usuário, comando mais recente enviado por ele: não esta igual ao código esta tudo bugado , bagunçado refaça tudo novamente de forma que fique perfeitamente alinhado e organizado no meu sistema."
      description="Estrutura organizacional e colaboradores"
    >
      <div className="flex flex-col items-center justify-center py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-5xl rounded-[2.5rem] bg-white/5 backdrop-blur-md border border-white/10 p-8 shadow-2xl overflow-hidden"
          style={{
            background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.1), transparent), radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.05), transparent)'
          }}
        >
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Nosso Time</h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Conheça os especialistas que movem a Apont Auto. Use as setas ou clique nas fotos para navegar entre os colaboradores.
            </p>
          </div>

          <div className="relative z-10">
            <OrbitCarousel />
          </div>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h4 className="text-indigo-400 font-bold mb-2">Administração e RH</h4>
            <p className="text-white/70 text-sm">Coordenação de pessoas e processos administrativos fundamentais para a operação.</p>
          </div>
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h4 className="text-purple-400 font-bold mb-2">Manutenção e Serviços</h4>
            <p className="text-white/70 text-sm">Equipe técnica especializada garantindo a continuidade e qualidade das instalações.</p>
          </div>
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h4 className="text-emerald-400 font-bold mb-2">Planejamento e Controle</h4>
            <p className="text-white/70 text-sm">Gestão estratégica de ordens de serviço e otimização de recursos através de dados.</p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
