import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Talude, TaludeStatus } from "@/lib/taludes";
import { STATUS_META, addDaysISO, todayISO, validateDates } from "@/lib/taludes";

type Props = {
  talude: Talude | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<Talude>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  defaultPeriodicidade: number;
};

export function TaludeDetailPanel({
  talude,
  open,
  onOpenChange,
  onSave,
  onDelete,
  defaultPeriodicidade,
}: Props) {
  const [nome, setNome] = useState("");
  const [status, setStatus] = useState<TaludeStatus>("programado");
  const [dataProg, setDataProg] = useState("");
  const [dataExec, setDataExec] = useState("");
  const [dataConcl, setDataConcl] = useState("");
  const [proxima, setProxima] = useState("");
  const [periodicidade, setPeriodicidade] = useState<number>(defaultPeriodicidade);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!talude) return;
    setNome(talude.nome ?? "");
    setStatus(talude.status);
    setDataProg(talude.data_programada ?? "");
    setDataExec(talude.data_execucao ?? "");
    setDataConcl(talude.data_conclusao ?? "");
    setProxima(talude.proxima_data ?? "");
    setPeriodicidade(talude.periodicidade_dias ?? defaultPeriodicidade);
    setObs(talude.observacoes ?? "");
  }, [talude, defaultPeriodicidade]);

  if (!talude) return null;

  const handleStatusChange = (next: TaludeStatus) => {
    setStatus(next);
    const today = todayISO();
    if (next === "em_execucao" && !dataExec) setDataExec(today);
    if (next === "finalizado") {
      const c = dataConcl || today;
      setDataConcl(c);
      if (!proxima) setProxima(addDaysISO(c, periodicidade));
    }
  };

  const submit = async () => {
    const err = validateDates({
      data_programada: dataProg || null,
      data_execucao: dataExec || null,
      data_conclusao: dataConcl || null,
    });
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        nome: nome.trim() || null,
        status,
        data_programada: dataProg || null,
        data_execucao: dataExec || null,
        data_conclusao: dataConcl || null,
        proxima_data: proxima || null,
        periodicidade_dias: periodicidade || null,
        observacoes: obs.trim() || null,
      });
      toast.success("Talude atualizado.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Excluir Talude ${String(talude.numero).padStart(2, "0")}?`)) return;
    setSaving(true);
    try {
      await onDelete(talude.id);
      toast.success("Talude excluído.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir.");
    } finally {
      setSaving(false);
    }
  };

  const meta = STATUS_META[status];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: meta.hex }}
            />
            Talude {String(talude.numero).padStart(2, "0")}
          </SheetTitle>
          <SheetDescription>Edite status, datas e observações.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-nome">Nome (opcional)</Label>
            <Input
              id="t-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Setor Norte"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => handleStatusChange(v as TaludeStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="programado">Programado</SelectItem>
                <SelectItem value="em_execucao">Em Execução</SelectItem>
                <SelectItem value="finalizado">Finalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp">Data programada</Label>
              <Input id="dp" type="date" value={dataProg} onChange={(e) => setDataProg(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="de">Data execução</Label>
              <Input id="de" type="date" value={dataExec} onChange={(e) => setDataExec(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dc">Data conclusão</Label>
              <Input id="dc" type="date" value={dataConcl} onChange={(e) => setDataConcl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr">Próxima data</Label>
              <Input id="pr" type="date" value={proxima} onChange={(e) => setProxima(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="per">Periodicidade (dias)</Label>
            <Input
              id="per"
              type="number"
              min={1}
              value={periodicidade}
              onChange={(e) => setPeriodicidade(Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Usada para calcular a próxima data ao finalizar.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={saving}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={saving}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
