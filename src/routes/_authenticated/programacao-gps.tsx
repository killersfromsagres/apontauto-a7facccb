import { useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Upload, Download, FileSpreadsheet, CheckCircle2, Loader2, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { processPcmAtivosFile, generateGpsFiles, type GpsRecord } from "@/lib/programacao-gps/processor";
import { GlassCard } from "@/components/glass-card";
import { Reveal } from "@/components/ui/reveal";
import { Progress } from "@/components/ui/progress";
import sherwinLogo from "@/assets/sherwin-williams.png.asset.json";
import gpsLogo from "@/assets/grupo-gps.png.asset.json";
import templateAsset from "@/assets/template-gps.xlsx.asset.json";


export const Route = createFileRoute("/_authenticated/programacao-gps")({
  component: ProgramacaoGpsPage,
});

function ProgramacaoGpsPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [records, setRecords] = useState<GpsRecord[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<Map<string, Blob> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const playSound = (type: "success" | "processing") => {
    try {
      const audio = new Audio(
        type === "success" 
          ? "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b18a8d05.mp3?filename=success-1-6297.mp3" 
          : "https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c36727.mp3?filename=processing-1-6298.mp3"
      );
      audio.volume = 0.3;
      audio.play();
    } catch (e) {
      console.warn("Audio playback failed", e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(10);
    playSound("processing");

    try {
      const data = await processPcmAtivosFile(file);
      setRecords(data);
      setProgress(50);
      
      const files = await generateGpsFiles(data);
      setGeneratedFiles(files);
      
      setProgress(100);
      playSound("success");
      toast.success("Processamento concluído com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao processar arquivo. Verifique o formato.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFile = (team: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Programacao_${team}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    if (!generatedFiles) return;
    generatedFiles.forEach((blob, team) => downloadFile(team, blob));
  };

  return (
    <div className="container mx-auto p-4 md:p-8 min-h-screen app-bg grain">
      <Reveal direction="down">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-glow">
              <FileSpreadsheet className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                Centro de Programação GPS
              </h1>
              <p className="text-muted-foreground">Otimização e Distribuição de Corretivas</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6 p-4 glass-surface rounded-2xl border border-white/10">
            <img src={sherwinLogo.url} alt="Sherwin Williams" className="h-10 object-contain brightness-0 invert opacity-80" />
            <div className="w-px h-8 bg-white/10" />
            <img src={gpsLogo.url} alt="Grupo GPS" className="h-10 object-contain brightness-0 invert opacity-80" />
          </div>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5">
          <Reveal delay={100}>
            <GlassCard className="p-8 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all duration-500 group overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Sparkles className="w-24 h-24 text-primary" />
              </div>
              
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5" /> Importar Backorder
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Anexe a planilha "PCM ATIVOS PREENCHIDO" para gerar automaticamente a programação no modelo Grupo GPS.
              </p>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-white/5 transition-all duration-300 group/drop"
              >
                <input 
                  type="file" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls"
                />
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4 group-hover/drop:scale-110 transition-transform duration-500 shadow-glow">
                  {isProcessing ? (
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8 text-primary" />
                  )}
                </div>
                <p className="font-medium text-lg">Clique ou arraste o arquivo</p>
                <p className="text-xs text-muted-foreground mt-2">Suporta .xlsx de até 50MB</p>
              </div>

              {isProcessing && (
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Processando dados...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </GlassCard>
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <Reveal delay={200}>
            <GlassCard className="p-8 h-full min-h-[400px] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Download className="w-5 h-5" /> Arquivos Gerados
                </h2>
                {generatedFiles && (
                  <Button 
                    onClick={downloadAll}
                    variant="outline" 
                    className="glass-pill gap-2 border-primary/30 text-primary hover:bg-primary/20"
                  >
                    <Download className="w-4 h-4" /> Baixar Todos
                  </Button>
                )}
              </div>

              {!generatedFiles && !isProcessing && (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50 border border-white/5 rounded-2xl bg-black/20">
                  <FileSpreadsheet className="w-12 h-12 mb-4" />
                  <p>Nenhum arquivo gerado ainda.</p>
                </div>
              )}

              {isProcessing && (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 mb-4 text-primary animate-spin" />
                  <p className="text-primary font-medium animate-pulse">Inteligência GPS processando...</p>
                </div>
              )}

              {generatedFiles && !isProcessing && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from(generatedFiles.entries()).map(([team, blob]) => (
                    <div 
                      key={team}
                      className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/30 transition-all group animate-card-rise"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2 bg-primary/20 rounded-lg">
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                        </div>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 rounded-full hover:bg-primary/20 text-primary"
                          onClick={() => downloadFile(team, blob)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                      <h3 className="font-medium text-lg">{team}</h3>
                      <p className="text-xs text-muted-foreground">Planilha de Programação pronta</p>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </Reveal>
        </div>
      </div>

      <Reveal delay={300}>
        <div className="mt-8 flex justify-center">
          <div className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/5 text-[10px] text-muted-foreground uppercase tracking-widest font-mono">
            <Volume2 className="w-3 h-3" /> Efeitos Sonoros Ativos · Glass UI v18.4
          </div>
        </div>
      </Reveal>
    </div>
  );
}
