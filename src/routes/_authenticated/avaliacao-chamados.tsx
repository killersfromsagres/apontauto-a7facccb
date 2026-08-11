import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  MessageSquareCheck, 
  Search, 
  Mail, 
  Users, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  ChevronRight,
  Send,
  Copy,
  Layout
} from "lucide-react";
import { 
  getOsConcluidasParaAvaliacao, 
  getHistoricoAvaliacoes,
  gerarTextoIA,
  salvarAvaliacao
} from "@/features/avaliacao-chamados/api/avaliacao.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/avaliacao-chamados")({
  component: AvaliacaoChamadosPage,
});

function AvaliacaoChamadosPage() {
  const queryClient = useQueryClient();
  const getOsFn = useServerFn(getOsConcluidasParaAvaliacao);
  const getHistoricoFn = useServerFn(getHistoricoAvaliacoes);
  const gerarIAFn = useServerFn(gerarTextoIA);
  const salvarFn = useServerFn(salvarAvaliacao);

  const [search, setSearch] = useState("");
  const [selectedSolicitante, setSelectedSolicitante] = useState<string | null>(null);
  const [selectedOsIds, setSelectedOsIds] = useState<string[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const [emailData, setEmailData] = useState<{ assunt: string; corpo: string; destinatario: string } | null>(null);

  const { data: osList, isLoading: loadingOs } = useQuery({
    queryKey: ["os-concluidas-avaliacao"],
    queryFn: () => getOsFn()
  });

  const { data: historico } = useQuery({
    queryKey: ["historico-avaliacoes"],
    queryFn: () => getHistoricoFn()
  });

  // Agrupar por solicitante
  const solicitantesGrouped = useMemo(() => {
    if (!osList) return [];
    const groups: Record<string, any[]> = {};
    osList.forEach(os => {
      const s = os.solicitante || "Não informado";
      if (!groups[s]) groups[s] = [];
      groups[s].push(os);
    });

    return Object.entries(groups).map(([nome, items]) => ({
      nome,
      email: items[0].email_solicitante || "N/A",
      osCount: items.length,
      items,
      lastDate: items[0].data_criacao
    })).filter(s => 
      s.nome.toLowerCase().includes(search.toLowerCase())
    );
  }, [osList, search]);

  const kpis = useMemo(() => {
    return [
      { label: "OS Concluídas", value: osList?.length || 0, icon: CheckCircle2, color: "text-emerald-400" },
      { label: "Solicitantes Únicos", value: solicitantesGrouped.length, icon: Users, color: "text-blue-400" },
      { label: "Avaliações Pendentes", value: solicitantesGrouped.length, icon: Clock, color: "text-amber-400" },
      { label: "E-mails Enviados", value: historico?.filter((h:any) => h.status === 'Enviado').length || 0, icon: Send, color: "text-primary" },
      { label: "Taxa de Avaliação", value: "0%", icon: TrendingUp, color: "text-purple-400" },
    ];
  }, [osList, solicitantesGrouped, historico]);

  const handleGenerateEmail = async (nome: string, items: any[]) => {
    const selectedItems = items.filter(i => selectedOsIds.includes(i.id));
    if (selectedItems.length === 0) {
      toast.error("Selecione pelo menos uma OS para gerar o e-mail.");
      return;
    }

    const tid = toast.loading("IA compondo e-mail corporativo...");
    try {
      const res = await gerarIAFn({ data: { solicitante: nome, osList: selectedItems } });
      setEmailData({
        assunt: res.assunto,
        corpo: res.corpo,
        destinatario: selectedItems[0].email_solicitante || ""
      });
      setIsComposing(true);
      toast.success("E-mail gerado com sucesso!", { id: tid });
    } catch (error) {
      toast.error("Erro ao gerar e-mail via IA.", { id: tid });
    }
  };

  const handleSend = async () => {
    if (!emailData) return;
    const tid = toast.loading("Registrando e-mail no histórico...");
    try {
      await salvarFn({ 
        data: {
          os_ids: selectedOsIds,
          solicitante: selectedSolicitante,
          email_destinatario: emailData.destinatario,
          assunto: emailData.assunt,
          corpo_email: emailData.corpo,
          status: "Enviado",
          enviado_em: new Date().toISOString()
        }
      });
      toast.success("E-mail registrado como enviado!", { id: tid });
      setIsComposing(false);
      setSelectedOsIds([]);
      queryClient.invalidateQueries({ queryKey: ["historico-avaliacoes"] });
    } catch (error) {
      toast.error("Erro ao salvar no histórico.", { id: tid });
    }
  };

  return (
    <PageShell
      title="Avaliação de Chamados"
      description="Gestão de satisfação e feedback de serviços concluídos."
    >
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {kpis.map((kpi, i) => (
            <GlassCard key={i} className="p-4 flex flex-col items-center justify-center text-center border-white/5">
              <kpi.icon className={cn("h-5 w-5 mb-2", kpi.color)} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{kpi.label}</div>
            </GlassCard>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Listagem de Solicitantes */}
          <div className="lg:col-span-4 space-y-4">
            <GlassCard className="p-4 space-y-4 border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Solicitantes
                </h3>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  {solicitantesGrouped.length}
                </Badge>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar solicitante..." 
                  className="pl-9 bg-white/5 border-white/10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                {loadingOs ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-16 w-full rounded-xl bg-white/5 animate-pulse" />
                  ))
                ) : solicitantesGrouped.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedSolicitante(s.nome);
                      setSelectedOsIds([]);
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl flex items-center gap-3 transition-all text-left group",
                      selectedSolicitante === s.nome 
                        ? "bg-primary/20 border border-primary/30" 
                        : "bg-white/5 border border-transparent hover:border-white/10 hover:bg-white/10"
                    )}
                  >
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center font-bold text-primary border border-primary/20">
                      {s.nome.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{s.nome}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{s.email}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary" className="text-[10px]">{s.osCount} OS</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Detalhes e Ações */}
          <div className="lg:col-span-8 space-y-6">
            {!selectedSolicitante ? (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-white/5 rounded-3xl bg-white/2">
                <Layout className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-white/60">Selecione um solicitante</h3>
                <p className="text-sm text-muted-foreground max-w-xs">Escolha um solicitante na lista ao lado para gerenciar suas Ordens de Serviço e avaliações.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <GlassCard className="p-6 border-white/10">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        {selectedSolicitante}
                      </h2>
                      <p className="text-sm text-muted-foreground">Selecione as OS concluídas para compor a solicitação de avaliação.</p>
                    </div>
                    <Button 
                      onClick={() => handleGenerateEmail(selectedSolicitante!, solicitantesGrouped.find(s => s.nome === selectedSolicitante)!.items)}
                      disabled={selectedOsIds.length === 0}
                      className="rounded-full gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 h-11 px-6 font-bold"
                    >
                      <Send className="h-4 w-4" />
                      Gerar Solicitação com IA
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {solicitantesGrouped.find(s => s.nome === selectedSolicitante)?.items.map((os: any) => (
                      <div 
                        key={os.id}
                        className={cn(
                          "p-4 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer",
                          selectedOsIds.includes(os.id)
                            ? "bg-primary/5 border-primary/30"
                            : "bg-white/2 border-white/5 hover:border-white/10"
                        )}
                        onClick={() => {
                          setSelectedOsIds(prev => 
                            prev.includes(os.id) ? prev.filter(id => id !== os.id) : [...prev, os.id]
                          );
                        }}
                      >
                        <Checkbox 
                          checked={selectedOsIds.includes(os.id)}
                          onCheckedChange={() => {}} // Handle on parent div click
                          className="rounded-md border-white/20"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px] font-mono border-white/10">#{os.numero_os}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {os.data_criacao && format(new Date(os.data_criacao), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <div className="font-semibold text-sm line-clamp-1">{os.nome_os}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {os.predio} • {os.andar} • {os.local}
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 uppercase text-[9px] font-bold">
                          Concluída
                        </Badge>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                {isComposing && emailData && (
                  <GlassCard className="p-6 border-primary/20 bg-primary/2 shadow-2xl animate-in zoom-in-95 duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <Mail className="h-5 w-5 text-primary" />
                        Composição do E-mail
                      </h3>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-2 border-white/10" onClick={() => {
                          navigator.clipboard.writeText(emailData.corpo);
                          toast.success("Corpo do e-mail copiado!");
                        }}>
                          <Copy className="h-3.5 w-3.5" /> Copiar Texto
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setIsComposing(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4 mb-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Destinatário</label>
                        <Input 
                          value={emailData.destinatario} 
                          onChange={e => setEmailData({...emailData, destinatario: e.target.value})}
                          className="bg-white/5 border-white/10 font-medium"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Assunto</label>
                        <Input 
                          value={emailData.assunt} 
                          onChange={e => setEmailData({...emailData, assunt: e.target.value})}
                          className="bg-white/5 border-white/10 font-bold text-primary-glow"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Mensagem (Corpo)</label>
                        <textarea 
                          value={emailData.corpo} 
                          onChange={e => setEmailData({...emailData, corpo: e.target.value})}
                          rows={8}
                          className="w-full rounded-xl bg-white/5 border border-white/10 p-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans leading-relaxed custom-scrollbar"
                        />
                      </div>
                    </div>

                    <div className="bg-black/40 rounded-2xl p-6 border border-white/5 space-y-6">
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mb-2 uppercase tracking-widest font-bold">
                        <Layout className="h-3 w-3" /> Preview do Template Corporativo
                      </div>
                      
                      {/* E-mail Template Preview */}
                      <div className="bg-white text-slate-900 rounded-lg p-8 shadow-inner overflow-hidden max-w-2xl mx-auto font-sans">
                        <div className="border-b pb-6 mb-6 flex justify-between items-center">
                          <div className="font-bold text-xl tracking-tighter">APONTAUTO <span className="text-primary font-black">PREMIUM</span></div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Relatório de Atendimento</div>
                        </div>
                        
                        <div className="space-y-4">
                          <h2 className="text-lg font-bold">Solicitação de Avaliação de Serviço</h2>
                          <p className="text-sm leading-relaxed text-slate-600">
                            Prezado(a) <strong>{selectedSolicitante}</strong>,
                          </p>
                          <p className="text-sm leading-relaxed text-slate-600">
                            Gostaríamos de informar que as Ordens de Serviço listadas abaixo foram concluídas com sucesso por nossa equipe técnica.
                          </p>
                          
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 my-6">
                            {selectedOsIds.map(id => {
                              const os = osList?.find(o => o.id === id);
                              return (
                                <div key={id} className="flex justify-between items-center py-2 border-b border-slate-200 last:border-0">
                                  <div>
                                    <div className="text-[11px] font-bold text-primary">#{os?.numero_os}</div>
                                    <div className="text-xs font-semibold">{os?.nome_os}</div>
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    Concluído em {os?.fim ? format(new Date(os.fim), "dd/MM/yy") : "--/--/--"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <p className="text-sm leading-relaxed text-slate-600 italic">
                            Sua opinião é fundamental para mantermos a excelência em nossos atendimentos.
                          </p>

                          <div className="text-center py-6">
                            <button className="bg-slate-900 text-white px-8 py-3 rounded-full font-bold text-sm shadow-xl shadow-slate-200 hover:scale-105 transition-transform">
                              AVALIAR ATENDIMENTO
                            </button>
                          </div>

                          <div className="border-t pt-6 mt-8 text-center space-y-2">
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest">ApontAuto Premium • Gestão Inteligente de Infraestrutura</p>
                            <p className="text-[9px] text-slate-300">Este é um e-mail automático. Por favor, não responda a este endereço.</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-4">
                        <Button 
                          onClick={handleSend}
                          className="rounded-full gap-2 bg-primary px-10 h-12 font-black text-base shadow-xl shadow-primary/30"
                        >
                          CONFIRMAR E REGISTRAR ENVIO
                        </Button>
                      </div>
                    </div>
                  </GlassCard>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
