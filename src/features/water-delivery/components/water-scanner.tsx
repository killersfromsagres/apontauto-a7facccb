import { useState, useRef, useEffect } from 'react';
import { QrCode, Camera, X, Check, AlertCircle, RefreshCw, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WaterScannerProps {
  expectedCode: string;
  onSuccess: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function WaterScanner({ expectedCode, onSuccess, onOpenChange }: WaterScannerProps) {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null);

  const validate = (code: string) => {
    if (code.trim().toUpperCase() === expectedCode.toUpperCase()) {
      setFeedback('success');
      toast.success("Ponto validado com sucesso!");
      setTimeout(() => {
        onSuccess();
      }, 800);
      return true;
    } else {
      setFeedback('error');
      toast.error("QR Code não confere com este ponto.");
      setTimeout(() => setFeedback(null), 2000);
      return false;
    }
  };

  return (
    <Drawer onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button size="sm" variant="secondary" className="min-h-[44px] w-full sm:w-auto">
          <QrCode className="mr-2 h-4 w-4" />
          Validar Ponto
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="text-center">Validação do Ponto</DrawerTitle>
        </DrawerHeader>
        
        <div className="p-4 space-y-4">
          <div className="flex justify-center p-1 bg-muted/30 rounded-xl">
            <Button 
              variant={mode === 'camera' ? 'default' : 'ghost'} 
              className="flex-1 rounded-lg"
              onClick={() => setMode('camera')}
            >
              <Camera className="mr-2 h-4 w-4" /> Câmera
            </Button>
            <Button 
              variant={mode === 'manual' ? 'default' : 'ghost'} 
              className="flex-1 rounded-lg"
              onClick={() => setMode('manual')}
            >
              <Keyboard className="mr-2 h-4 w-4" /> Manual
            </Button>
          </div>

          {mode === 'camera' ? (
            <div className="aspect-square w-full max-w-[300px] mx-auto bg-black rounded-2xl relative overflow-hidden border-2 border-border/40">
              {/* Mock camera view */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40">
                <QrCode className="h-16 w-16 mb-2 opacity-20" />
                <p className="text-xs uppercase tracking-widest font-bold">Scanner Ativo</p>
              </div>
              
              {/* Scanning Overlay */}
              <div className="absolute inset-0 border-[40px] border-black/60 pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-primary/50 rounded-xl" />
              
              {/* Feedback Overlay */}
              {feedback && (
                <div className={cn(
                  "absolute inset-0 flex items-center justify-center animate-in fade-in zoom-in duration-300",
                  feedback === 'success' ? "bg-emerald-500/80" : "bg-rose-500/80"
                )}>
                  {feedback === 'success' ? <Check className="h-20 w-20 text-white" /> : <X className="h-20 w-20 text-white" />}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Código do Ponto
                </label>
                <div className="relative">
                  <Input 
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    placeholder="Digite o código..."
                    className={cn(
                      "h-14 text-lg font-mono tracking-widest text-center uppercase",
                      feedback === 'error' && "border-rose-500 bg-rose-500/5",
                      feedback === 'success' && "border-emerald-500 bg-emerald-500/5"
                    )}
                  />
                  {feedback === 'error' && <AlertCircle className="absolute right-4 top-4 h-6 w-6 text-rose-500" />}
                  {feedback === 'success' && <Check className="absolute right-4 top-4 h-6 w-6 text-emerald-500" />}
                </div>
              </div>
              
              <Button 
                className="w-full h-14 text-base font-bold"
                onClick={() => validate(manualCode)}
                disabled={!manualCode || feedback === 'success'}
              >
                Validar Agora
              </Button>
            </div>
          )}
          
          <p className="text-center text-xs text-muted-foreground px-6 leading-relaxed">
            {mode === 'camera' 
              ? "Aproxime o QR Code do ponto à moldura central para validação automática."
              : "Caso o QR Code esteja danificado, digite o código de 6 dígitos presente na etiqueta."}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
