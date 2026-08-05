import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Star, 
  MessageSquareCheck, 
  ClipboardCheck, 
  Search, 
  Filter, 
  Mail, 
  Send, 
  FileSpreadsheet,
  Users as UsersIcon,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
  Calendar,
  Info,
  ArrowRight
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/avaliacao-chamados")({
  component: AvaliacaoChamadosPage,
});

type ConcluidoOS = {
  id: string;
  numero_os: string;
  nome_os: string | null;
  solicitante: string | null;
  fim: string | null;
  equipe: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  ativo: string | null;
  status: string;
  origem: 'corretiva' | 'backorder';
};

type SolicitanteGroup = {
  nome: string;
  email: string;
  chamados: ConcluidoOS[];
  statusAvaliacao: "pendente" | "enviado" | "avaliado";
};

function AvaliacaoChamadosPage() {
  const [mes, setMes] = useState<string>(new Date().getMonth().toString());
  const [ano, setAno] = useState<string>(new Date().getFullYear().toString());
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const { data: chamados = [], isLoading } = useQuery({
    queryKey: ["chamados-concluidos-unificado", mes, ano],
    queryFn: async () => {
      const firstDay = new Date(parseInt(ano), parseInt(mes), 1);
      const lastDay = new Date(parseInt(ano), parseInt(mes) + 1, 0, 23, 59, 59);

      // Busca OS de Corretiva Finalizadas
      const { data: corretivas, error: errCorretiva } = await supabase
        .from("corretiva_os")
        .select("*")
        .eq("status", "concluida")
        .gte("fim", firstDay.toISOString())
        .lte("fim", lastDay.toISOString());

      if (errCorretiva) throw errCorretiva;

      // Busca OS de Backorder Finalizadas
      // Nota: No backorder, consideramos status_cat in (concluido, fechado, validado, aguardando_aprovacao)
      // Usamos a coluna data_conclusao para o filtro de tempo
      const { data: backorders, error: errBackorder } = await supabase
        .from("backorder_os")
        .select("os,nome,outros,data_conclusao,equipe,predio,andar,espaco,ativo,status_cat")
        .in("status_cat", ["concluido", "fechado", "validado", "aguardando_aprovacao"])
        .gte("data_conclusao", firstDay.toISOString())
        .lte("data_conclusao", lastDay.toISOString());

      if (errBackorder) throw errBackorder;

      const unificado: ConcluidoOS[] = [
        ...(corretivas ?? []).map(c => ({
          id: c.id,
          numero_os: c.numero_os,
          nome_os: c.nome_os,
          solicitante: c.solicitante,
          fim: c.fim,
          equipe: c.equipe,
          predio: c.predio,
          andar: c.andar,
          local: c.local,
          ativo: c.ativo,
          status: c.status,
          origem: 'corretiva' as const
        })),
        ...(backorders ?? []).map(b => ({
          id: b.os,
          numero_os: b.os,
          nome_os: b.nome,
          solicitante: b.outros,
          fim: b.data_conclusao,
          equipe: b.equipe,
          predio: b.predio,
          andar: b.andar,
          local: b.espaco,
          ativo: b.ativo,
          status: b.status_cat,
          origem: 'backorder' as const
        }))
      ];

      return unificado.sort((a, b) => new Date(b.fim!).getTime() - new Date(a.fim!).getTime());
    }
  });

  const groupedSolicitantes = useMemo(() => {
    const groups: Record<string, SolicitanteGroup> = {};
    
    chamados.forEach(os => {
      const nome = os.solicitante || "Não Identificado";
      if (!groups[nome]) {
        groups[nome] = {
          nome,
          email: "",
          chamados: [],
          statusAvaliacao: "pendente"
        };
      }
      groups[nome].chamados.push(os);
    });

    return Object.values(groups).sort((a, b) => b.chamados.length - a.chamados.length);
  }, [chamados]);

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    return groupedSolicitantes.filter(g => {
      const matchesSearch = !q || g.nome.toLowerCase().includes(q) || g.chamados.some(os => os.numero_os.includes(q));
      const matchesStatus = filtroStatus === "todos" || g.statusAvaliacao === filtroStatus;
      return matchesSearch && matchesStatus;
    });
  }, [groupedSolicitantes, search, filtroStatus]);

  const stats = useMemo(() => {
    const totalChamados = chamados.length;
    const totalSolicitantes = groupedSolicitantes.length;
    const backorderCount = chamados.filter(c => c.origem === 'backorder').length;
    
    return [
      { label: "Total Concluídos", value: totalChamados, icon: CheckCircle2, color: "text-emerald-500" },
      { label: "Vindos de Backorder", value: backorderCount, icon: Clock, color: "text-red-500" },
      { label: "Solicitantes", value: totalSolicitantes, icon: UsersIcon, color: "text-blue-500" },
      { label: "Avaliados", value: 0, icon: Star, color: "text-purple-500" },
    ];
  }, [chamados, groupedSolicitantes]);

  return (
    <PageShell 
      title="Satisfação e Qualidade" 
      description="Gerenciamento unificado de chamados concluídos (Corretiva e Backorder) para avaliação de performance e feedback dos solicitantes."
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, idx) => (
          <GlassCard key={idx} className="p-4 flex items-center gap-4">
            <div className={cn("p-2 rounded-xl bg-white/5 border border-white/10", s.color)}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">{s.label}</p>
              <p className="text-xl font-mono font-bold">{s.value}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-4 mb-6 border-primary/20 bg-primary/5">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por solicitante ou OS..." 
                className="pl-10 h-11 bg-white/10 border-white/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="w-[140px] h-11 bg-white/10 border-white/20">
                  <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((m, i) => (
                    <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="w-[100px] h-11 bg-white/10 border-white/20">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium uppercase tracking-widest">Sincronizando bases unificadas...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-white/5 rounded-3xl bg-white/2">
            <Info className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Nenhum chamado concluído encontrado.</p>
          </div>
        ) : (
          filteredGroups.map((group, idx) => (
            <SolicitanteCard key={idx} group={group} />
          ))
        )}
      </div>
    </PageShell>
  );
}

function SolicitanteCard({ group }: { group: SolicitanteGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <GlassCard className="overflow-hidden border-white/10 hover:border-primary/30 transition-all group">
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shrink-0 shadow-inner">
            <span className="text-xl font-black text-primary drop-shadow-sm">{group.nome[0].toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-lg truncate text-foreground/90 tracking-tight group-hover:text-primary transition-colors">{group.nome}</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium uppercase tracking-tighter">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                <ClipboardCheck className="w-3 h-3 text-emerald-500" />
                {group.chamados.length} chamados
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="w-3 h-3" />
                {group.email || "Sem e-mail"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex -space-x-2">
            {group.chamados.slice(0, 3).map((os, i) => (
               <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold" title={os.numero_os}>
                  {os.origem === 'backorder' ? <Clock className="w-3 h-3 text-red-500" /> : <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
               </div>
            ))}
            {group.chamados.length > 3 && (
               <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold">
                  +{group.chamados.length - 3}
               </div>
            )}
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("rounded-xl transition-all hover:bg-primary/10", expanded && "rotate-90 bg-primary/10")}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          
          <Button size="sm" className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 h-10 px-4 font-bold uppercase tracking-widest text-[10px]">
            <MessageSquareCheck className="w-4 h-4 mr-2" />
            Gerar Avaliação
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="pt-4 border-t border-white/10 space-y-2">
            <p className="text-[10px] uppercase font-black text-primary tracking-widest mb-3 flex items-center gap-2">
               <ArrowRight className="w-3 h-3" /> Detalhes dos Atendimentos
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {group.chamados.map(os => (
                <div key={os.id} className="flex flex-col p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/20 transition-all">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("font-mono text-[10px] px-1.5 py-0 border-white/20", os.origem === 'backorder' ? "text-red-400" : "text-emerald-400")}>
                        {os.origem === 'backorder' ? 'BO' : 'OS'} {os.numero_os}
                      </Badge>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">{os.equipe}</span>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">{new Date(os.fim!).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <p className="text-sm font-bold line-clamp-1 mb-1">{os.nome_os || "Sem descrição"}</p>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                    {os.predio} · {os.andar} · {os.local}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
