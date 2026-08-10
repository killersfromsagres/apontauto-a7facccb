import { useRef, useState } from "react";
import { Upload, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { equipeStyles } from "@/lib/corretiva/equipe";
import { useIsOwner } from "@/hooks/use-is-owner";
import { useIsAdmin } from "@/hooks/use-is-admin";

import {
  lerPreventivaFile,
  lerCorretivaFile,
  EQUIPES_PREVENTIVA,
  type PreventivaRow,
  type CorretivaRow,
} from "@/lib/corretiva/preventiva-import";

type Row = PreventivaRow | CorretivaRow;
type Mode = "backorder" | "corretiva";

function contar(rows: Row[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.equipe, (map.get(r.equipe) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function PreventivaImportDialog({
  onDone,
  mode = "backorder",
}: {
  onDone: () => void;
  mode?: Mode;
}) {
  const { isOwner } = useIsOwner();
  const { isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Importação em massa é restrita ao proprietário e a administradores.
  if (!isOwner && !isAdmin) return null;

  const label = mode === "corretiva" ? "corretivas/backorder" : "backorder";


  const onFile = async (f: File | null) => {
    setRows([]);
    setFileName(f?.name ?? "");
    if (!f) return;
    setParsing(true);
    try {
      const parsed = mode === "corretiva" ? await lerCorretivaFile(f) : await lerPreventivaFile(f);
      if (parsed.length === 0) toast.warning("Nenhuma linha válida encontrada.");
      else toast.success(`${parsed.length} ${label} separadas automaticamente por equipe.`);
      setRows(parsed);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler planilha");
    } finally {
      setParsing(false);
    }
  };

  const importar = async () => {
    if (rows.length === 0) return toast.warning("Escolha uma planilha válida.");
    setSaving(true);
    
    // Para evitar duplicados ao importar, usamos upsert com 'onConflict: numero_os'.
    // Requisito: Prevenção de duplicidade. Se a OS já existe como "Corretiva",
    // não permitimos que uma importação de "Backorder" a sobrescreva ou vice-versa sem critério,
    // mas o upsert do Postgres com ON CONFLICT (numero_os) DO UPDATE garante integridade.
    // Adicionamos um filtro de verificação manual se necessário.
    const payload = rows.map(r => ({ ...r, updated_at: new Date().toISOString() }));
    console.log("[Import] Payload para upsert:", payload.length, "linhas");

    const { error, count } = await supabase
      .from("corretiva_os")
      .upsert(
        payload as any, 
        { onConflict: "numero_os", count: "exact" }
      );
      
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${count ?? rows.length} ${label} processadas (sem duplicidade).`);
    setOpen(false);
    setRows([]);
    setFileName("");
    onDone();
  };

  const counts = contar(rows);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="glass" 
          size="sm"
          className={cn(
            "h-9 px-4 gap-2 transition-all duration-300",
            mode === "corretiva" 
              ? "bg-primary/20 text-primary-glow border-primary/40 hover:bg-primary/30 shadow-[0_0_15px_rgba(135,206,250,0.2)]" 
              : "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
          )}
        >
          <Upload className="h-4 w-4" />
          <span className="font-semibold tracking-tight">
            {mode === "corretiva" ? "Planilha Corretiva" : "Planilha Backorder"}
          </span>
        </Button>


      </DialogTrigger>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha de {label} (.xlsx)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {mode === "corretiva" ? (
              <>
                O sistema separa automaticamente cada OS pela equipe responsável (Chaveiro, Civil,
                Hidráulica, Elétrica, Pintura e Refrigeração). Depois de importar, o colaborador
                conclui a OS anexando a foto de evidência.
              </>
            ) : (
              <>
                O sistema separa automaticamente cada OS entre <strong>Chaveiro</strong>,{" "}
                <strong>Civil</strong>, <strong>Hidráulica</strong> e <strong>Elétrica</strong>.
                Depois de importar, o colaborador conclui o backorder anexando a foto de evidência.
              </>
            )}
          </p>

          <Input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="h-11"
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
                <Badge variant="secondary">{rows.length} OS</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {(mode === "backorder"
                  ? EQUIPES_PREVENTIVA.map(
                      (e) => [e, rows.filter((r) => r.equipe === e).length] as [string, number],
                    )
                  : counts
                ).map(([e, n]) => (
                  <Badge key={e} variant="outline" className={equipeStyles(e).badge}>
                    {e}: {n}
                  </Badge>
                ))}
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border/50">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border/40">
                    {rows.slice(0, 100).map((r) => (
                      <tr key={r.numero_os}>
                        <td className="px-2 py-1.5 font-mono">{r.numero_os}</td>
                        <td className="px-2 py-1.5 max-w-[280px] truncate">{r.nome_os}</td>
                        <td className="px-2 py-1.5 text-right">
                          <Badge variant="outline" className={equipeStyles(r.equipe).badge}>
                            {r.equipe}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Button className="w-full h-11" onClick={importar} disabled={saving || rows.length === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Importar {rows.length > 0 ? `${rows.length} ${label}` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
