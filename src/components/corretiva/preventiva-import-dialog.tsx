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
type Mode = "backorder" | "corretiva" | "backorder-mensal";

const EXISTING_ASSIGNMENT_BATCH_SIZE = 200;

function contar(rows: Row[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.equipe, (map.get(r.equipe) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function normalizeTeam(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function loadExistingAssignments(rows: Row[]) {
  const numeroOs = Array.from(new Set(rows.map((row) => row.numero_os).filter(Boolean)));
  const assignments = new Map<string, string>();

  for (let index = 0; index < numeroOs.length; index += EXISTING_ASSIGNMENT_BATCH_SIZE) {
    const batch = numeroOs.slice(index, index + EXISTING_ASSIGNMENT_BATCH_SIZE);
    const { data, error } = await supabase
      .from("corretiva_os")
      .select("numero_os, equipe")
      .in("numero_os", batch);

    if (error) throw error;

    for (const item of data ?? []) {
      const numero = String(item.numero_os ?? "").trim();
      const equipe = String(item.equipe ?? "").trim();
      if (numero && equipe) assignments.set(numero, equipe);
    }
  }

  return assignments;
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

  const label =
    mode === "backorder-mensal"
      ? "backorder mensal"
      : mode === "corretiva"
        ? "corretivas/backorder"
        : "backorder";

  const onFile = async (f: File | null) => {
    setRows([]);
    setFileName(f?.name ?? "");
    if (!f) return;
    setParsing(true);
    try {
      const parsed =
        mode === "corretiva" || mode === "backorder-mensal"
          ? await lerCorretivaFile(f)
          : await lerPreventivaFile(f);
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

    try {
      // Em Corretivas, a equipe atual do banco é a fonte da verdade durante reimportações.
      // Se a consulta falhar, a importação é interrompida para não correr o risco de
      // sobrescrever uma correção manual já realizada pelo usuário.
      const existingAssignments =
        mode === "corretiva" ? await loadExistingAssignments(rows) : new Map<string, string>();

      let protectedAssignments = 0;
      let preventedOverwrites = 0;

      const payload = rows.map((row) => {
        const existingTeam = existingAssignments.get(row.numero_os);
        const incomingTeam = String(row.equipe ?? "").trim();

        if (existingTeam) {
          protectedAssignments++;
          if (normalizeTeam(existingTeam) !== normalizeTeam(incomingTeam)) {
            preventedOverwrites++;
          }
        }

        return {
          ...row,
          equipe: existingTeam || row.equipe,
          updated_at: new Date().toISOString(),
          tipo_importacao: mode === "backorder-mensal" ? "backorder_mensal" : "padrao",
          data_criacao: row.data_criacao || null,
          predio: (row as any).predio || (row as any).localizacao || "",
          andar: (row as any).andar || "",
          local: (row as any).local || (row as any).ambiente || "",
          solicitante: (row as any).solicitante || (row as any).nome_solicitante || "",
        };
      });

      console.log("[Import] Payload para upsert:", payload.length, "linhas", {
        protectedAssignments,
        preventedOverwrites,
      });

      const { error, count } = await supabase.from("corretiva_os").upsert(payload as any, {
        onConflict: "numero_os",
        count: "exact",
      });

      if (error) {
        console.error("[Import] Erro ao importar:", error);
        return toast.error(
          "Não foi possível salvar as OS no banco de dados. Verifique a conexão e permissões.",
        );
      }

      const protectionMessage =
        mode === "corretiva" && protectedAssignments > 0
          ? ` ${protectedAssignments} designação(ões) existente(s) foram preservadas${
              preventedOverwrites > 0
                ? ` e ${preventedOverwrites} sobrescrita(s) incorreta(s) foram evitadas`
                : ""
            }.`
          : "";

      toast.success(
        `${count ?? rows.length} ${label} processadas sem duplicidade.${protectionMessage}`,
      );
      setOpen(false);
      setRows([]);
      setFileName("");
      onDone();
    } catch (error) {
      console.error("[Import] Falha ao proteger designações existentes:", error);
      toast.error(
        "Atualização cancelada por segurança: não foi possível confirmar as equipes já designadas. Nenhuma designação foi sobrescrita.",
      );
    } finally {
      setSaving(false);
    }
  };

  const counts = contar(rows);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex flex-col gap-2">
          <Button
            variant="glass"
            size="sm"
            className={cn(
              "h-9 px-4 gap-2 transition-all duration-300",
              mode === "corretiva" || mode === "backorder-mensal"
                ? "bg-primary/20 text-primary-glow border-primary/40 hover:bg-primary/30 shadow-[0_0_15px_rgba(135,206,250,0.2)]"
                : "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]",
            )}
          >
            <Upload className="h-4 w-4" />
            <span className="font-semibold tracking-tight">
              {mode === "corretiva"
                ? "Planilha Corretiva"
                : mode === "backorder-mensal"
                  ? "Planilha Backorder Mensal"
                  : "Planilha Backorder"}
            </span>
          </Button>

          {mode === "corretiva" && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] opacity-70 hover:opacity-100 border-white/10 bg-white/5 px-2"
            >
              <FileSpreadsheet className="h-3 w-3 mr-1" />
              Atualizar preservando equipes
            </Button>
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha de {label} (.xlsx)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {mode === "corretiva" ? (
              <>
                Novas OS são separadas automaticamente por equipe. Ao atualizar uma planilha já
                importada, a equipe atualmente designada no sistema é preservada para cada OS,
                evitando perder correções e realocações feitas anteriormente.
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
