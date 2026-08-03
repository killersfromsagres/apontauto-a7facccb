import { useRef, useState } from "react";
import { Upload, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useIsOwner } from "@/hooks/use-is-owner";
import { readRefrigOsFile } from "@/lib/refrigeracao/reader";
import { readRefrigOsUpdateFile } from "@/lib/refrigeracao/bulk-update-reader";

export function RefrigImportDialog({ onDone }: { onDone: () => void }) {
  const { isOwner } = useIsOwner();
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [mode, setMode] = useState<"import" | "update">("import");
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOwner) return null;

  const onFile = async (f: File | null) => {
    setRows([]);
    setFileName(f?.name ?? "");
    if (!f) return;
    setParsing(true);
    try {
      const parsed = mode === "import" ? await readRefrigOsFile(f) : await readRefrigOsUpdateFile(f);
      if (parsed.length === 0) toast.warning("Nenhuma linha válida encontrada.");
      else toast.success(`${parsed.length} OS processadas.`);
      setRows(parsed);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler planilha");
    } finally {
      setParsing(false);
    }
  };

  const executar = async () => {
    if (rows.length === 0) return toast.warning("Escolha uma planilha válida.");
    setSaving(true);
    try {
      if (mode === "import") {
        const { error, count } = await supabase
          .from("refrigeracao_os")
          .upsert(rows, { onConflict: "numero_os", count: "exact" });
        if (error) throw error;
        toast.success(`${count ?? rows.length} OS importadas.`);
      } else {
        // Atualização em massa
        let successCount = 0;
        for (const item of rows) {
          const { error } = await supabase
            .from("refrigeracao_os")
            .update(item.patch)
            .eq("numero_os", item.numero_os);
          if (!error) successCount++;
        }
        toast.success(`${successCount} OS atualizadas.`);
      }
      setOpen(false);
      setRows([]);
      setFileName("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro na operação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Importar Planilha
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar/Atualizar Refrigeração (.xlsx)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant={mode === "import" ? "default" : "outline"} 
              onClick={() => { setMode("import"); setRows([]); }}
            >
              Nova Programação
            </Button>
            <Button 
              size="sm" 
              variant={mode === "update" ? "default" : "outline"} 
              onClick={() => { setMode("update"); setRows([]); }}
            >
              Atualização em Massa
            </Button>
          </div>

          <Input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo planilha…
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span className="truncate">{fileName}</span>
                <Badge variant="secondary">{rows.length} registros</Badge>
              </div>
              {mode === "import" && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(
                    rows.reduce<Record<string, number>>((acc, r) => {
                      const k = r.equipe ?? "Sem equipe";
                      acc[k] = (acc[k] ?? 0) + 1;
                      return acc;
                    }, {}),
                  )
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([equipe, qtd]) => (
                      <Badge key={equipe} variant="outline">
                        {equipe}: {qtd}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          )}

          <Button className="w-full" onClick={executar} disabled={saving || rows.length === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "import" ? "Importar" : "Atualizar"} {rows.length > 0 ? rows.length : ""} OS
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
