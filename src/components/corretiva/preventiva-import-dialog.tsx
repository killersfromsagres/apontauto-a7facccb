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
import { equipeStyles } from "@/lib/corretiva/equipe";
import {
  lerPreventivaFile,
  contarPorEquipe,
  EQUIPES_PREVENTIVA,
  type PreventivaRow,
} from "@/lib/corretiva/preventiva-import";

export function PreventivaImportDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PreventivaRow[]>([]);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | null) => {
    setRows([]);
    setFileName(f?.name ?? "");
    if (!f) return;
    setParsing(true);
    try {
      const parsed = await lerPreventivaFile(f);
      if (parsed.length === 0) toast.warning("Nenhuma linha válida encontrada.");
      else toast.success(`${parsed.length} preventivas separadas automaticamente por equipe.`);
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
    const { error, count } = await supabase
      .from("corretiva_os")
      .upsert(rows as any, { onConflict: "numero_os", count: "exact" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${count ?? rows.length} preventivas importadas.`);
    setOpen(false);
    setRows([]);
    setFileName("");
    onDone();
  };

  const counts = contarPorEquipe(rows);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Importar preventivas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar planilha de preventivas (.xlsx)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            O sistema separa automaticamente cada OS entre <strong>Chaveiro</strong>,{" "}
            <strong>Civil</strong>, <strong>Hidráulica</strong> e <strong>Elétrica</strong>. Depois
            de importar, o colaborador conclui a preventiva anexando a foto de evidência.
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
                {EQUIPES_PREVENTIVA.map((e) => (
                  <Badge key={e} variant="outline" className={equipeStyles(e).badge}>
                    {e}: {counts[e]}
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
            Importar {rows.length > 0 ? `${rows.length} preventivas` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
