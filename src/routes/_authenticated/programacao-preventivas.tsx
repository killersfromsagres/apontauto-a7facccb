import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { readPreventivaFiles, type RawRow } from "@/lib/preventiva/reader";
import { triage, type Equipe, type TriagedOS, EQUIPE_COLOR } from "@/lib/preventiva/triage";
import { weeksToCoverAll, distributeAcrossMonth, MINUTOS_UTEIS_DIA, type WeekBucket } from "@/lib/preventiva/capacity";
import { generateWeeklyProgramacao } from "@/lib/preventiva/weekly-exporter";
import { downloadBlob } from "@/lib/download";
import { getLatestCorretivas } from "@/lib/preventiva/corretivas.functions";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/programacao-preventivas")({
  component: ProgramacaoPreventivasPage,
});

type EquipeKey = "Chaveiro" | "Civil" | "Hidráulica" | "Elétrica" | "Refrigeração";

const EQUIPES_CONFIG: Record<EquipeKey, { label: string; triageEquipes: Equipe[]; minutes: number; group?: string }> = {
  Chaveiro: { label: "Chaveiro", triageEquipes: ["CHAVEIRO"], minutes: 60, group: "CCH" },
  Civil: { label: "Civil", triageEquipes: ["CIVIL"], minutes: 60, group: "CCH" },
  Hidráulica: { label: "Hidráulica", triageEquipes: ["HIDRÁULICA"], minutes: 60, group: "CCH" },
  Elétrica: { label: "Elétrica", triageEquipes: ["ELÉTRICA"], minutes: 30 },
  Refrigeração: { label: "Refrigeração", triageEquipes: ["CLIMATIZAÇÃO E REFRIGERAÇÃO 1", "CLIMATIZAÇÃO E REFRIGERAÇÃO 2", "CLIMATIZAÇÃO E REFRIGERAÇÃO 3"], minutes: 60 },
};

function ProgramacaoPreventivasPage() {
  const [files, setFiles] = useState<Record<EquipeKey, File | null>>({
    Chaveiro: null,
    Civil: null,
    Hidráulica: null,
    Elétrica: null,
    Refrigeração: null,
  });
  const [processing, setProcessing] = useState(false);
  const [startDate, setStartDate] = useState<Date>(() => new Date());

  const handleFileChange = (equipe: EquipeKey, file: File | null) => {
    if (file && !file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Por favor, anexe um arquivo .xlsx");
      return;
    }
    setFiles(prev => ({ ...prev, [equipe]: file }));
    if (file) toast.success(`${equipe} anexado: ${file.name}`);
  };

  const generate = async () => {
    const activeEquipes = (Object.keys(files) as EquipeKey[]).filter(k => !!files[k]);
    if (activeEquipes.length === 0) {
      toast.error("Anexe pelo menos uma planilha de equipe.");
      return;
    }

    setProcessing(true);
    try {
      // 1. Buscar corretivas recentes para injetar no final de cada dia
      const corretivas = await getLatestCorretivas();
      const corretivasTriaged: TriagedOS[] = (corretivas || []).map(c => ({
        os: c.numero_os,
        chamado: c.numero_os,
        tipo: "Corretiva",
        nomeOS: c.nome_os || "Corretiva em Campo",
        descricao: c.nome_os || "",
        categoria: "OUTROS",
        criticidade: "Média",
        unidadeNegocio: "",
        ativo: c.ativo || "—",
        solicitante: c.solicitante || "Sistema",
        inicioSLA: "",
        dataLimite: c.data_sla || "",
        dataPrevistaMaxima: "",
        status: c.status,
        dataStatus: "",
        site: "DEMARCHI",
        predio: c.predio || "Geral",
        andar: c.andar || "—",
        local: c.local || "—",
        equipamento: c.equipamento || "—",
        terminoSLA: c.data_sla || "",
        terminoSLATs: c.data_sla ? new Date(c.data_sla).getTime() : Date.now(),
        dataConclusao: "",
        raw: {},
        equipe: "CORRETIVA" as const,
        arquivo: "Database",
      }));

      const allTriagedOS: TriagedOS[] = [];
      const ativoIndex = new Map<string, AtivoIndexEntry>();

      // 1. Ler todas as planilhas anexadas e consolidar dados
      for (const key of activeEquipes) {
        const file = files[key]!;
        const read = await readPreventivaFiles([file]);
        allTriagedOS.push(...triage(read.rows));
        // Consolidar índice de ativos
        for (const [k, v] of read.ativoIndex.entries()) {
          ativoIndex.set(k, v);
        }
      }

      if (allTriagedOS.length === 0) {
        toast.error("Nenhuma OS válida encontrada nas planilhas.");
        setProcessing(false);
        return;
      }

      // 2. Processar cada equipe individualmente (gerar um arquivo por equipe selecionada)
      for (const key of activeEquipes) {
        const config = EQUIPES_CONFIG[key];
        
        // Filtra as OSs que realmente pertencem a este grupo de triagem
        const filtered = allTriagedOS.filter(o => config.triageEquipes.includes(o.equipe));
        
        if (filtered.length === 0) {
          toast.warning(`Nenhuma OS de ${key} encontrada no arquivo processado.`);
          continue;
        }

        // Calcula semanas e distribuição
        const capPerDay = Math.floor(MINUTOS_UTEIS_DIA / config.minutes);
        
        // Maior fila entre as sub-equipes do grupo (ex: Clima 1, 2 e 3)
        const maiorFila = config.triageEquipes.reduce((max, eq) => {
          const n = filtered.filter(o => o.equipe === eq).length;
          return n > max ? n : max;
        }, 0);
        
        const diasNecessarios = Math.ceil(maiorFila / capPerDay);
        const { weeks, until } = weeksToCoverAll(startDate, diasNecessarios);

        // Distribui cada sub-equipe nos mesmos dias para o cronograma
        const bucketsPorEquipe = new Map<Equipe, WeekBucket>();
        
        // Criar uma cópia local das corretivas para esta equipe específica
        let localCorretivas = [...corretivasTriaged];

        for (const eq of config.triageEquipes) {
          const osEq = filtered.filter(o => o.equipe === eq);
          if (osEq.length > 0) {
            const result = distributeAcrossMonth(osEq, weeks, {
              from: startDate,
              until,
              minutosPorOS: config.minutes
            });
            
            // Injetar uma Corretiva ao final de cada dia útil que tenha preventivas
            // Apenas para a primeira sub-equipe do grupo para não duplicar corretivas no mesmo arquivo
            // ou injetamos em todas se preferir, mas geralmente o técnico é o mesmo.
            result.buckets.forEach(bucket => {
              bucket.porDia.forEach((diaList, dow) => {
                if (diaList.length > 0) {
                  const corr = localCorretivas.shift();
                  if (corr) {
                    const correctedCorr = { ...corr, equipe: "CORRETIVA" as const };
                    diaList.push(correctedCorr);
                    bucket.os.push(correctedCorr);
                  }
                }
              });
            });
            
            bucketsPorEquipe.set(eq, result.buckets[0]);
          }
        }

        const blob = await generateWeeklyProgramacao({
          titulo: "SHERWIN WILLIAMS / DEMARCHI",
          week: weeks[0],
          bucketsPorEquipe,
          ativoIndex,
          atividadePadrao: "Preventiva"
        });

        const fileName = files[key]?.name.split('.')[0] || key.toUpperCase();
        downloadBlob(blob, `PROGRAMACAO_${fileName}.xlsx`);
        toast.success(`Programação de ${key} gerada!`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao processar planilhas.");
    } finally {
      setProcessing(false);
    }
  };

  const handleAutoClassifyCCH = async () => {
    const cchFile = files.Civil || files.Chaveiro || files.Hidráulica;
    if (!cchFile) {
      toast.error("Anexe uma planilha em Civil, Chaveiro ou Hidráulica primeiro.");
      return;
    }

    setProcessing(true);
    try {
      const read = await readPreventivaFiles([cchFile]);
      const triaged = triage(read.rows);
      
      // Separar as triagens
      const chaveiroOS = triaged.filter(o => o.equipe === "CHAVEIRO");
      const civilOS = triaged.filter(o => o.equipe === "CIVIL");
      const hidraulicaOS = triaged.filter(o => o.equipe === "HIDRÁULICA");

      toast.success(
        `Classificação concluída: ${chaveiroOS.length} Chaveiro, ${civilOS.length} Civil, ${hidraulicaOS.length} Hidráulica.`,
        { duration: 5000 }
      );
      
      // Como o usuário quer um botão para classificar, podemos mostrar o resultado.
      // A lógica de "generate" já faz a triagem por equipe filtrando as OSs triaged.
      // O que o usuário quer é que se ele colocar uma planilha que tem tudo misturado, 
      // o sistema "saiba" o que é o que. A função triage() já faz isso.
      
      // Se ele clicar em Gerar agora, as 3 planilhas (se forem o mesmo arquivo) 
      // iriam gerar 3 arquivos separados contendo cada um sua parte.
      
      // Vamos facilitar preenchendo as outras slots se estiverem vazias com o mesmo arquivo
      setFiles(prev => ({
        ...prev,
        Civil: prev.Civil || cchFile,
        Chaveiro: prev.Chaveiro || cchFile,
        Hidráulica: prev.Hidráulica || cchFile,
      }));

    } catch (e) {
      console.error(e);
      toast.error("Erro ao classificar planilha.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <PageShell
      title="Programação Semanal de Preventivas"
      description="Reformulado: anexe planilhas por equipe. O sistema classifica e insere uma corretiva ao final de cada dia."
    >
      <div className="space-y-6">
        <GlassCard className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  Data de Início
                </h2>
                <p className="text-sm text-muted-foreground">Define quando a programação semanal começa.</p>
              </div>
              
              <Button 
                variant="glass" 
                size="sm" 
                onClick={handleAutoClassifyCCH}
                className="hidden md:flex gap-2 border-primary/20 hover:bg-primary/10"
                disabled={processing || !(files.Civil || files.Chaveiro || files.Hidráulica)}
              >
                <div className="flex -space-x-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#4F4FD9] border border-white/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#00863D] border border-white/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#DB8E03] border border-white/20" />
                </div>
                Classificar CCH Automaticamente
              </Button>
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full md:w-[280px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "PPP", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) => d && setStartDate(d)}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.keys(EQUIPES_CONFIG) as EquipeKey[]).map((key) => {
              const file = files[key];
              const config = EQUIPES_CONFIG[key];
              return (
                <GlassCard key={key} className={cn(
                  "p-5 border transition-all duration-300 relative overflow-hidden group",
                  file ? "border-primary/40 bg-primary/5" : "border-white/10 hover:border-white/20"
                )}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: EQUIPE_COLOR[config.triageEquipes[0]] || '#3B82F6' }} />
                      {key}
                    </h3>
                    {file ? (
                      <CheckCircle2 className="h-5 w-5 text-primary animate-in zoom-in" />
                    ) : (
                      <FileSpreadsheet className="h-5 w-5 text-muted-foreground/50" />
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Anexe a planilha de {key.toLowerCase()} para processar as OSs desta equipe.
                    </p>
                    
                    <div className="relative">
                      <input
                        type="file"
                        accept=".xlsx"
                        onChange={(e) => handleFileChange(key, e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <Button 
                        variant={file ? "secondary" : "glass"} 
                        size="sm"
                        className="w-full gap-2 text-xs font-semibold"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {file ? "Substituir Arquivo" : "Selecionar Planilha"}
                      </Button>
                    </div>
                  </div>

                  {file && (
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {file.name}
                      </span>
                      <button 
                        onClick={() => handleFileChange(key, null)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10">
            <Button 
              size="lg" 
              className="w-full h-12 text-base font-bold shadow-lg shadow-primary/20 group relative overflow-hidden"
              disabled={processing || !Object.values(files).some(Boolean)}
              onClick={generate}
            >
              {processing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processando Equipes...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 group-hover:scale-110 transition-transform" />
                  Gerar Programação Semanal
                </div>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground mt-3">
              * O sistema irá gerar um arquivo separado para cada planilha anexada, colorindo a Coluna A e inserindo corretivas diárias.
              <br />
              Dica: O botão "Classificar CCH" tria automaticamente planilhas que contêm Civil, Chaveiro e Hidráulica misturados.
            </p>
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}

