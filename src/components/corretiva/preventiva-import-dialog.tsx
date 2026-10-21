import { useRef, useState } from "react";
import { Upload, Loader2, FileSpreadsheet, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { equipeStyles } from "@/lib/corretiva/equipe";
import { useIsOwner } from "@/hooks/use-is-owner";
import { useIsAdmin } from "@/hooks/use-is-admin";

import {
  lerPreventivaFile,
  lerCorretivaFile,
  EQUIPES_PREVENTIVA,
  refineImportedCorrectiveRowsWithAi,
  type PreventivaRow,
  type CorretivaRow,
} from "@/lib/corretiva/preventiva-import";

type Row = PreventivaRow | CorretivaRow;
type Mode = "backorder" | "corretiva" | "backorder-mensal";

const EXISTING_LOOKUP_BATCH_SIZE = 250;
const INSERT_BATCH_SIZE = 150;

/**
 * Estados finais do enum `corretiva_os_status` que a limpeza nunca apaga.
 * Remover um chamado concluído ou cancelado eliminaria em cascata as linhas de
 * `public.corretiva_historico_verificacoes`, destruindo a trilha de conferência.
 */
const CLEANUP_PROTECTED_STATUSES = "(concluida,cancelada)";

function contar(rows: Row[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.equipe, (map.get(r.equipe) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

async function loadExistingCorrectiveNumbers(rows: Row[]) {
  const numeroOs = Array.from(
    new Set(rows.map((row) => String(row.numero_os ?? "").trim()).filter(Boolean)),
  );
  const existing = new Set<string>();

  for (let index = 0; index < numeroOs.length; index += EXISTING_LOOKUP_BATCH_SIZE) {
    const batch = numeroOs.slice(index, index + EXISTING_LOOKUP_BATCH_SIZE);
    const { data, error } = await supabase
      .from("corretiva_os")
      .select("numero_os")
      .in("numero_os", batch);

    if (error) throw error;

    for (const item of data ?? []) {
      const numero = String(item.numero_os ?? "").trim();
      if (numero) existing.add(numero);
    }
  }

  return existing;
}

function buildImportPayload(row: Row, mode: Mode) {
  return {
    ...row,
    updated_at: new Date().toISOString(),
    tipo_importacao: mode === "backorder-mensal" ? "backorder_mensal" : "padrao",
    data_criacao: row.data_criacao || null,
    predio: (row as any).predio || (row as any).localizacao || "",
    andar: (row as any).andar || "",
    local: (row as any).local || (row as any).ambiente || "",
    solicitante: (row as any).solicitante || (row as any).nome_solicitante || "",
  };
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
  const [sheetCount, setSheetCount] = useState(0);
  const [existingCount, setExistingCount] = useState(0);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [clearing, setClearing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Importação em massa é restrita ao proprietário e a administradores.
  if (!isOwner && !isAdmin) return null;

  const label =
    mode === "backorder-mensal"
      ? "backorder mensal"
      : mode === "corretiva"
        ? "corretivas/backorder"
        : "backorder";

  const resetImport = () => {
    setRows([]);
    setFileName("");
    setSheetCount(0);
    setExistingCount(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = async (f: File | null) => {
    setRows([]);
    setFileName(f?.name ?? "");
    setSheetCount(0);
    setExistingCount(0);
    if (!f) return;
    setParsing(true);

    try {
      const parsedBase =
        mode === "corretiva" || mode === "backorder-mensal"
          ? await lerCorretivaFile(f)
          : await lerPreventivaFile(f);

      setSheetCount(parsedBase.length);

      if (mode === "corretiva") {
        // Atualizar preservando histórico é deliberadamente insert-only:
        // primeiro compara a planilha com o banco e ignora tudo que já existe.
        // Só as OS ausentes passam pela classificação e podem ser gravadas.
        const existing = await loadExistingCorrectiveNumbers(parsedBase);
        const onlyNew = (parsedBase as CorretivaRow[]).filter(
          (row) => !existing.has(String(row.numero_os ?? "").trim()),
        );
        const skipped = parsedBase.length - onlyNew.length;
        setExistingCount(skipped);

        if (onlyNew.length === 0) {
          setRows([]);
          toast.success(
            `Planilha analisada: ${parsedBase.length} OS já existem. Nenhum chamado do sistema será modificado.`,
          );
          return;
        }

        // A leitura inteligente fica muito mais rápida porque a IA recebe somente
        // os chamados realmente novos, não centenas de OS já cadastradas.
        const classified = await refineImportedCorrectiveRowsWithAi(onlyNew);
        setRows(classified);
        toast.success(
          `Planilha analisada: ${classified.length} OS nova(s) pronta(s) para incluir; ${skipped} já existente(s) ignorada(s).`,
        );
        return;
      }

      const parsed = parsedBase;
      if (parsed.length === 0) toast.warning("Nenhuma linha válida encontrada.");
      else
        toast.success(
          `${parsed.length} ${label} classificadas por descrição, equipamento e contexto.`,
        );
      setRows(parsed);
    } catch (e: any) {
      console.error("[Import] Falha ao analisar planilha:", e);
      toast.error(e?.message ?? "Falha ao ler planilha");
    } finally {
      setParsing(false);
    }
  };

  const importar = async () => {
    if (rows.length === 0) {
      return toast.warning(
        mode === "corretiva"
          ? "Não há OS nova para incluir. Os chamados já existentes foram preservados."
          : "Escolha uma planilha válida.",
      );
    }
    setSaving(true);

    try {
      if (mode === "corretiva") {
        // Revalida imediatamente antes da gravação para cobrir concorrência entre
        // usuários. Mesmo nesse caso, `ignoreDuplicates` faz INSERT ... ON CONFLICT
        // DO NOTHING; nenhuma coluna de uma OS existente é alterada.
        const nowExisting = await loadExistingCorrectiveNumbers(rows);
        const newRows = rows.filter(
          (row) => !nowExisting.has(String(row.numero_os ?? "").trim()),
        );

        if (newRows.length === 0) {
          toast.success("Nenhuma OS nova para incluir. O banco permaneceu sem alterações.");
          setOpen(false);
          resetImport();
          onDone();
          return;
        }

        let inserted = 0;
        for (let index = 0; index < newRows.length; index += INSERT_BATCH_SIZE) {
          const batch = newRows.slice(index, index + INSERT_BATCH_SIZE).map((row) => ({
            ...buildImportPayload(row, mode),
            // `status` é obrigatório no banco. Defini-lo em todas as novas linhas
            // elimina o erro de NOT NULL do antigo upsert misto.
            status: "aberta",
            tipo_importacao: "padrao",
          }));

          const { error, count } = await supabase.from("corretiva_os").upsert(batch as any, {
            onConflict: "numero_os",
            ignoreDuplicates: true,
            count: "exact",
          });

          if (error) throw error;
          inserted += count ?? batch.length;
        }

        const skippedDuringSave = rows.length - newRows.length;
        toast.success(
          `${inserted} OS nova(s) incluída(s). ${existingCount + skippedDuringSave} OS já existente(s) ficaram totalmente intactas.`,
        );
        setOpen(false);
        resetImport();
        onDone();
        return;
      }

      const payload = rows.map((row) => buildImportPayload(row, mode));
      const { error, count } = await supabase.from("corretiva_os").upsert(payload as any, {
        onConflict: "numero_os",
        count: "exact",
      });

      if (error) throw error;

      toast.success(`${count ?? rows.length} ${label} processadas sem duplicidade.`);
      setOpen(false);
      resetImport();
      onDone();
    } catch (error: any) {
      console.error("[Import] Erro ao importar:", error);
      const detail = String(error?.message ?? error?.details ?? "").trim();
      toast.error(
        detail
          ? `Não foi possível incluir as novas OS: ${detail}`
          : "Não foi possível incluir as novas OS. Nenhum chamado já existente foi alterado.",
      );
    } finally {
      setSaving(false);
    }
  };

  const limparCorretivas = async () => {
    if (!isAdmin || clearing || clearConfirmation !== "LIMPAR") return;

    setClearing(true);
    try {
      // A limpeza alcança somente chamados ainda abertos ou em andamento.
      // Conclusões e cancelamentos permanecem no banco para proteger o histórico.
      const { data, error } = await supabase
        .from("corretiva_os")
        .delete()
        .or("tipo_importacao.is.null,tipo_importacao.neq.backorder_mensal")
        .not("status", "in", CLEANUP_PROTECTED_STATUSES)
        .select("id");

      if (error) throw error;

      const deletedCount = data?.length ?? 0;

      try {
        const { cacheOsList } = await import("@/lib/corretiva/db");
        await cacheOsList([]);
      } catch (cacheError) {
        console.warn(
          "[CorretivaNovo] OS apagadas, mas não foi possível limpar o cache local:",
          cacheError,
        );
      }

      try {
        const { pruneCorrectiveProgramReservations } = await import(
          "@/lib/preventiva/corrective-program-reservations"
        );
        pruneCorrectiveProgramReservations([]);
      } catch (reservationError) {
        console.warn(
          "[CorretivaNovo] OS apagadas, mas não foi possível limpar reservas locais:",
          reservationError,
        );
      }

      setClearOpen(false);
      setClearConfirmation("");
      onDone();
      toast.success(
        deletedCount === 1
          ? "1 corretiva aberta foi apagada. Chamados concluídos, cancelados e suas verificações foram preservados."
          : `${deletedCount} corretivas abertas foram apagadas. Chamados concluídos, cancelados e suas verificações foram preservados.`,
      );
    } catch (error: any) {
      console.error("[CorretivaNovo] Erro ao limpar corretivas:", error);
      toast.error(
        error?.message ||
          "Não foi possível limpar as corretivas. Nenhum dado local foi alterado.",
      );
    } finally {
      setClearing(false);
    }
  };

  const counts = contar(rows);
  const hasCorrectiveAnalysis = mode === "corretiva" && Boolean(fileName) && sheetCount > 0;

  return (
    <>
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
                Atualizar preservando histórico
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
                  <strong>Atualização somente de novos chamados.</strong> A planilha é comparada com
                  o banco primeiro. Toda OS que já existe é ignorada e não tem status, equipe,
                  descrição, datas ou histórico modificados. Somente as OS ausentes passam pela
                  leitura inteligente e ficam disponíveis para inclusão.
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
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === "corretiva"
                  ? "Comparando a planilha com os chamados existentes…"
                  : "Lendo planilha…"}
              </div>
            )}

            {hasCorrectiveAnalysis && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{sheetCount} na planilha</Badge>
                  <Badge variant="outline">{existingCount} já existentes — ignoradas</Badge>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                    {rows.length} novas para incluir
                  </Badge>
                </div>
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
              {mode === "corretiva"
                ? rows.length > 0
                  ? `Incluir ${rows.length} OS nova(s)`
                  : "Nenhuma OS nova para incluir"
                : `Importar ${rows.length > 0 ? `${rows.length} ${label}` : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {mode === "corretiva" && isAdmin && (
        <AlertDialog
          open={clearOpen}
          onOpenChange={(nextOpen) => {
            if (clearing) return;
            setClearOpen(nextOpen);
            if (!nextOpen) setClearConfirmation("");
          }}
        >
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 border-red-500/35 bg-red-500/[0.07] px-3 text-red-300 hover:border-red-400/55 hover:bg-red-500/15 hover:text-red-200"
              title="Apagar somente corretivas abertas ou em andamento; concluídas, canceladas e suas verificações permanecem no histórico"
            >
              <Trash2 className="h-4 w-4" />
              Limpar abertas
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-red-500/20 bg-background/95 shadow-2xl backdrop-blur-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-200">
                <Trash2 className="h-5 w-5" />
                Limpar somente as corretivas abertas?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-left leading-6">
                <span className="block">
                  Esta ação apaga permanentemente apenas as OS ainda abertas ou em andamento do
                  módulo Corretiva Novo e os registros vinculados a elas, incluindo fotos, peças,
                  verificações e problemas.
                </span>
                <span className="block font-medium text-foreground/80">
                  Chamados concluídos ou cancelados não são apagados, e as verificações já
                  registradas neles continuam preservadas.
                </span>
                <span className="block font-medium text-foreground/80">
                  Os registros do Backorder Mensal serão preservados.
                </span>
                <span className="block">
                  Para confirmar, digite <strong className="text-red-300">LIMPAR</strong> abaixo.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Input
              value={clearConfirmation}
              onChange={(event) => setClearConfirmation(event.target.value)}
              placeholder="Digite LIMPAR"
              disabled={clearing}
              autoComplete="off"
              spellCheck={false}
              className="border-red-500/25 bg-red-500/[0.04] focus-visible:ring-red-500/35"
              onKeyDown={(event) => {
                if (event.key === "Enter" && clearConfirmation === "LIMPAR" && !clearing) {
                  event.preventDefault();
                  void limparCorretivas();
                }
              }}
            />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={clearConfirmation !== "LIMPAR" || clearing}
                onClick={() => void limparCorretivas()}
                className="gap-2"
              >
                {clearing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {clearing ? "Limpando..." : "Apagar abertas"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
