import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Star, 
  MessageSquareCheck, 
  ClipboardCheck, 
  Search, 
  Filter, 
  Mail, 
  Send, 
  Download, 
  FileSpreadsheet,
  Users as UsersIcon,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
  Calendar,
  MoreVertical,
  History,
  Info
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
};

type SolicitanteGroup = {
  nome: string;
  email: string;
  chamados: ConcluidoOS[];
  statusAvaliacao: "pendente" | "enviado" | "avaliado";
  ultimaDataEnvio?: string;
  notaMedia?: number;
};

function AvaliacaoChamadosPage() {
  const [mes, setMes] = useState<string>(new Date().getMonth().toString());
  const [ano, setAno] = useState<string>(new Date().getFullYear().toString());
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const { data: chamados = [], isLoading } = useQuery({
    queryKey: ["chamados-concluidos", mes, ano],
    queryFn: async () => {
      const firstDay = new Date(parseInt(ano), parseInt(mes), 1);
      const lastDay = new Date(parseInt(ano), parseInt(mes) + 1, 0, 23, 59, 59);

      const { data, error } = await supabase
        .from("corretiva_os")
        .select("*")
        .eq("status", "concluida")
        .gte("fim", firstDay.toISOString())
        .lte("fim", lastDay.toISOString())
        .order("fim", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ConcluidoOS[];
    }
  });

  const groupedSolicitantes = useMemo(() => {
    const groups: Record<string, SolicitanteGroup> = {};
    
    chamados.forEach(os => {
      const nome = os.solicitante || "Não Identificado";
      if (!groups[nome]) {
        groups[nome] = {
          nome,
          email: "", // Será preenchido por uma heurística de busca
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
    const enviados = groupedSolicitantes.filter(g => g.statusAvaliacao === "enviado").length;
    const avaliados = groupedSolicitantes.filter(g => g.statusAvaliacao === "avaliado").length;
    
    return [
      { label: "Concluídos", value: totalChamados, icon: CheckCircle2, color: "text-emerald-500" },
      { label: "Solicitantes", value: totalSolicitantes, icon: UsersIcon, color: "text-blue-500" },
      { label: "Enviados", value: enviados, icon: Mail, color: "text-amber-500" },
      { label: "Avaliados", value: avaliados, icon: Star, color: "text-purple-500" },
    ];
  }, [chamados, groupedSolicitantes]);

  return (
    <PageShell 
      title="Avaliação de Chamados" 
      description="Consulte os chamados concluídos, organize os serviços por solicitante e envie solicitações de avaliação de forma rápida e profissional."
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, idx) => (
          <GlassCard key={idx} className="p-4 flex items-center gap-4">
            <div className={cn("p-2 rounded-xl bg-white/5 border border-white/10", s.color)}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{s.label}</p>
              <p className="text-xl font-mono font-bold">{s.value}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Filters Section */}
      <GlassCard className="p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por solicitante ou OS..." 
                className="pl-10 h-11 bg-white/5 border-white/10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="w-[140px] h-11 bg-white/5 border-white/10">
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
                <SelectTrigger className="w-[100px] h-11 bg-white/5 border-white/10">
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
          <div className="flex items-center gap-2">
             <Button variant="outline" className="h-11 border-white/10 bg-white/5">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar
             </Button>
             <Button className="h-11 shadow-lg shadow-primary/20">
                <Send className="w-4 h-4 mr-2" />
                Enviar em Lote
             </Button>
          </div>
        </div>
      </GlassCard>

      {/* Content List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Buscando chamados concluídos...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-white/5 rounded-3xl">
            <Info className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nenhum chamado concluído encontrado para este período.</p>
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
    <GlassCard className="overflow-hidden border-white/5">
      <div className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shrink-0">
            <span className="text-lg font-bold text-primary">{group.nome[0].toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base truncate">{group.nome}</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ClipboardCheck className="w-3 h-3" />
                {group.chamados.length} chamados
              </span>
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {group.email || "E-mail não cadastrado"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 py-1">
            Concluídos
          </Badge>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("rounded-full transition-transform", expanded && "rotate-90")}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" className="bg-primary/90 hover:bg-primary shadow-sm h-9">
            <MessageSquareCheck className="w-4 h-4 mr-2" />
            Gerar Avaliação
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="pt-2 border-t border-white/5 space-y-2">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-2">Chamados do Período</p>
            {group.chamados.map(os => (
              <div key={os.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">OS {os.numero_os}</Badge>
                  <div className="text-sm">
                    <p className="font-medium line-clamp-1">{os.nome_os || "Sem descrição"}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-tight">
                      {os.local} · {new Date(os.fim!).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Finalizada
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
